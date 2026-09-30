"""Persistent Discord logs, small session windows, images, and reaction context."""

from dataclasses import dataclass
import json
from pathlib import Path
import sqlite3
import time

import discord


@dataclass
class SessionWindow:
    channel_id: int
    start_id: int
    floor: int
    last_activity: float
    turn: int


class MessageLog:
    def __init__(self, path: Path) -> None:
        self.connection = sqlite3.connect(path)
        self.connection.row_factory = sqlite3.Row
        self.connection.executescript("""
            CREATE TABLE IF NOT EXISTS messages (
                message_id INTEGER PRIMARY KEY, channel_id INTEGER NOT NULL, is_dm INTEGER NOT NULL,
                author_id INTEGER NOT NULL, display_name TEXT NOT NULL, is_astrooo INTEGER NOT NULL,
                content TEXT NOT NULL, attachment_names TEXT NOT NULL
            );
            CREATE INDEX IF NOT EXISTS messages_channel ON messages(channel_id, message_id);
            CREATE TABLE IF NOT EXISTS sessions (
                channel_id INTEGER PRIMARY KEY, start_id INTEGER NOT NULL, floor INTEGER NOT NULL,
                last_activity REAL NOT NULL, turn INTEGER NOT NULL DEFAULT 0
            );
            CREATE TABLE IF NOT EXISTS image_assets (
                asset_id TEXT PRIMARY KEY, message_id INTEGER NOT NULL, channel_id INTEGER NOT NULL,
                session_id INTEGER NOT NULL, filename TEXT NOT NULL, mime TEXT NOT NULL,
                raw BLOB, active_until INTEGER NOT NULL, description TEXT NOT NULL DEFAULT ''
            );
            CREATE TABLE IF NOT EXISTS reaction_people (
                message_id INTEGER NOT NULL, user_id INTEGER NOT NULL, emoji TEXT NOT NULL,
                display_name TEXT NOT NULL, PRIMARY KEY (message_id, user_id, emoji)
            );
            CREATE TABLE IF NOT EXISTS reaction_events (
                event_id INTEGER PRIMARY KEY AUTOINCREMENT, message_id INTEGER NOT NULL,
                channel_id INTEGER NOT NULL, user_id INTEGER NOT NULL, display_name TEXT NOT NULL,
                emoji TEXT NOT NULL, added INTEGER NOT NULL, happened_at REAL NOT NULL
            );
        """)
        columns = {row[1] for row in self.connection.execute("PRAGMA table_info(messages)")}
        for name, definition in {
            "attachments": "TEXT NOT NULL DEFAULT '[]'",
            "reply_to_id": "INTEGER",
            "reactions": "TEXT NOT NULL DEFAULT '{}'",
        }.items():
            if name not in columns:
                self.connection.execute(f"ALTER TABLE messages ADD COLUMN {name} {definition}")
        self.connection.commit()

    def save(self, message: discord.Message, bot_id: int, *, reply_to_id: int | None = None) -> None:
        attachments = [{"id": a.id, "filename": a.filename, "url": a.url,
                        "content_type": a.content_type, "size": a.size} for a in message.attachments]
        reference = getattr(message, "reference", None)
        reactions = {str(r.emoji): r.count for r in getattr(message, "reactions", [])}
        self.connection.execute("""
            INSERT INTO messages (message_id, channel_id, is_dm, author_id, display_name,
                is_astrooo, content, attachment_names, attachments, reply_to_id, reactions)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(message_id) DO UPDATE SET display_name=excluded.display_name,
                content=excluded.content, attachment_names=excluded.attachment_names,
                attachments=excluded.attachments, reply_to_id=COALESCE(excluded.reply_to_id,messages.reply_to_id), reactions=excluded.reactions
        """, (message.id, message.channel.id, int(isinstance(message.channel, discord.DMChannel)),
              message.author.id, message.author.display_name, int(message.author.id == bot_id),
              message.clean_content, json.dumps([a.filename for a in message.attachments]),
              json.dumps(attachments), reply_to_id or (reference.message_id if reference else None), json.dumps(reactions)))
        self.connection.commit()

    def delete(self, message_id: int) -> None:
        with self.connection:
            for table in ("messages", "image_assets", "reaction_people", "reaction_events"):
                self.connection.execute(f"DELETE FROM {table} WHERE message_id = ?", (message_id,))

    def get(self, message_id: int) -> tuple[str, str, list[str]] | None:
        row = self.connection.execute("SELECT * FROM messages WHERE message_id = ?", (message_id,)).fetchone()
        return (row["display_name"], row["content"], json.loads(row["attachment_names"])) if row else None

    def owner_dm_channel(self, owner_id: int) -> int | None:
        row = self.connection.execute("SELECT channel_id FROM messages WHERE is_dm=1 AND author_id=? ORDER BY message_id DESC LIMIT 1", (owner_id,)).fetchone()
        return row[0] if row else None

    def session(self, channel_id: int) -> SessionWindow | None:
        row = self.connection.execute("SELECT * FROM sessions WHERE channel_id=?", (channel_id,)).fetchone()
        return SessionWindow(**dict(row)) if row else None

    def begin_session(self, channel_id: int, start_id: int, floor: int, at: float) -> SessionWindow:
        with self.connection:
            self.connection.execute("INSERT OR REPLACE INTO sessions VALUES (?, ?, ?, ?, 0)", (channel_id, start_id, floor, at))
            self.connection.execute("UPDATE image_assets SET raw=NULL WHERE channel_id=? AND session_id!=?", (channel_id, start_id))
        return self.session(channel_id)

    def reset_session(self, channel_id: int) -> None:
        with self.connection:
            self.connection.execute("DELETE FROM sessions WHERE channel_id=?", (channel_id,))
            self.connection.execute("UPDATE image_assets SET raw=NULL WHERE channel_id=?", (channel_id,))

    def finish_turn(self, window: SessionWindow, at: float) -> None:
        with self.connection:
            self.connection.execute("UPDATE sessions SET turn=turn+1,last_activity=? WHERE channel_id=? AND start_id=?", (at, window.channel_id, window.start_id))
            self.connection.execute("UPDATE image_assets SET raw=NULL WHERE session_id=? AND channel_id=? AND active_until<? AND description!=''", (window.start_id, window.channel_id, window.turn + 1))

    def prior_ids(self, channel_id: int, before: int, floor: int) -> list[int]:
        return [r[0] for r in self.connection.execute("SELECT message_id FROM messages WHERE channel_id=? AND message_id<? AND message_id>? ORDER BY message_id DESC LIMIT 2", (channel_id, before, floor))]

    def recent(self, window: SessionWindow, through_id: int) -> list[sqlite3.Row]:
        return self.connection.execute("""
            SELECT * FROM messages WHERE channel_id=? AND message_id>?
                AND (message_id<=? OR (is_astrooo=1 AND reply_to_id<=?))
                AND (is_astrooo=0 OR reply_to_id IS NULL OR reply_to_id>?)
            ORDER BY CASE WHEN is_astrooo=1 AND reply_to_id IS NOT NULL THEN reply_to_id ELSE message_id END DESC,
                is_astrooo DESC, message_id DESC LIMIT 10000
        """, (window.channel_id, window.floor, through_id, through_id, window.floor)).fetchall()

    def dm_context(self, owner_id: int, through_id: int, query: str = "", limit: int = 4) -> list[sqlite3.Row]:
        channel_id = self.owner_dm_channel(owner_id)
        if not channel_id:
            return []
        if query:
            return self.connection.execute("SELECT * FROM messages WHERE channel_id=? AND message_id<=? AND instr(lower(content), lower(?))>0 ORDER BY message_id DESC LIMIT ?", (channel_id, through_id, query, limit)).fetchall()
        return self.connection.execute("""SELECT * FROM messages WHERE channel_id=?
            AND (message_id<=? OR (is_astrooo=1 AND reply_to_id<=?))
            ORDER BY CASE WHEN is_astrooo=1 AND reply_to_id IS NOT NULL THEN reply_to_id ELSE message_id END DESC,
                is_astrooo DESC,message_id DESC LIMIT ?""", (channel_id, through_id, through_id, limit)).fetchall()

    def identities(self, channel_id: int, limit: int = 30) -> list[sqlite3.Row]:
        return self.connection.execute("SELECT author_id, display_name FROM messages WHERE channel_id=? GROUP BY author_id ORDER BY MAX(message_id) DESC LIMIT ?", (channel_id, limit)).fetchall()

    def lookup_name(self, name: str) -> list[sqlite3.Row]:
        return self.connection.execute("SELECT author_id, display_name FROM messages WHERE lower(display_name)=lower(?) GROUP BY author_id ORDER BY MAX(message_id) DESC LIMIT 10", (name.lstrip("@"),)).fetchall()

    def image_exists(self, asset_id: str) -> bool:
        return self.connection.execute("SELECT 1 FROM image_assets WHERE asset_id=?", (asset_id,)).fetchone() is not None

    def add_image(self, asset_id: str, message_id: int, window: SessionWindow, filename: str, mime: str, raw: bytes) -> None:
        with self.connection:
            self.connection.execute("INSERT OR IGNORE INTO image_assets(asset_id,message_id,channel_id,session_id,filename,mime,raw,active_until) VALUES (?,?,?,?,?,?,?,?)", (asset_id, message_id, window.channel_id, window.start_id, filename, mime, raw, window.turn + 2))

    def images(self, window: SessionWindow) -> list[sqlite3.Row]:
        return self.connection.execute("SELECT * FROM image_assets WHERE channel_id=? AND session_id=? ORDER BY message_id,asset_id", (window.channel_id, window.start_id)).fetchall()

    def describe_image(self, asset_id: str, description: str) -> None:
        with self.connection:
            self.connection.execute("UPDATE image_assets SET description=? WHERE asset_id=?", (description[:6000], asset_id))

    def reaction(self, message_id: int, channel_id: int, user_id: int, name: str, emoji: str, added: bool, *, snapshot: bool = False) -> None:
        row = self.connection.execute("SELECT reactions FROM messages WHERE message_id=?", (message_id,)).fetchone()
        counts = json.loads(row[0]) if row else {}
        with self.connection:
            if added:
                changed = self.connection.execute("INSERT OR IGNORE INTO reaction_people VALUES (?,?,?,?)", (message_id, user_id, emoji, name)).rowcount
                if not changed:
                    return
                if not snapshot:
                    counts[emoji] = counts.get(emoji, 0) + 1
            else:
                self.connection.execute("DELETE FROM reaction_people WHERE message_id=? AND user_id=? AND emoji=?", (message_id, user_id, emoji))
                if not snapshot:
                    counts[emoji] = max(0, counts.get(emoji, 0) - 1)
            self.connection.execute("UPDATE messages SET reactions=? WHERE message_id=?", (json.dumps(counts), message_id))
            self.connection.execute("INSERT INTO reaction_events(message_id,channel_id,user_id,display_name,emoji,added,happened_at) VALUES (?,?,?,?,?,?,?)", (message_id, channel_id, user_id, name, emoji, int(added), time.time()))

    def clear_reactions(self, message_id: int, emoji: str | None = None) -> None:
        with self.connection:
            if emoji is None:
                self.connection.execute("DELETE FROM reaction_people WHERE message_id=?", (message_id,))
                self.connection.execute("UPDATE messages SET reactions='{}' WHERE message_id=?", (message_id,))
            else:
                self.connection.execute("DELETE FROM reaction_people WHERE message_id=? AND emoji=?", (message_id, emoji))
                row = self.connection.execute("SELECT reactions FROM messages WHERE message_id=?", (message_id,)).fetchone()
                if row:
                    counts = json.loads(row[0]); counts.pop(emoji, None)
                    self.connection.execute("UPDATE messages SET reactions=? WHERE message_id=?", (json.dumps(counts), message_id))

    def reaction_text(self, message_id: int) -> str:
        row = self.connection.execute("SELECT reactions FROM messages WHERE message_id=?", (message_id,)).fetchone()
        counts = json.loads(row[0]) if row else {}
        actors = self.connection.execute("SELECT display_name,emoji FROM reaction_people WHERE message_id=?", (message_id,)).fetchall()
        labels = [f"{emoji} ×{count}" for emoji, count in counts.items() if count]
        if actors:
            labels.append("people: " + ", ".join(f"{r[0]} {r[1]}" for r in actors))
        return "; ".join(labels)

    def recent_reactions(self, channel_id: int, since: float) -> list[sqlite3.Row]:
        return self.connection.execute("""
            SELECT e.*,m.display_name AS message_author,substr(m.content,1,160) AS excerpt
            FROM reaction_events e LEFT JOIN messages m ON m.message_id=e.message_id
            WHERE e.channel_id=? AND e.happened_at>=? ORDER BY event_id DESC LIMIT 12
        """, (channel_id, since)).fetchall()
