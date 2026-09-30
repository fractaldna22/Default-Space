"""AstroOo Discord bot, powered by OpenAI GPT Audio with text replies."""

from __future__ import annotations

import asyncio
import argparse
import base64
from dataclasses import dataclass
import io
import json
import logging
import math
import os
from pathlib import Path
import re
import struct
import wave

import aiohttp
import discord
import tiktoken
from discord import app_commands
from astro_store import MessageLog, SessionWindow
from astro_tools import TOOL_INSTRUCTIONS, ToolCall, discord_user_id, extract_tools

ROOT = Path(__file__).resolve().parent
LOG = logging.getLogger("astrooo")
MODEL = "openai/gpt-audio"
API_MODEL = MODEL.removeprefix("openai/")
IMAGE_MODEL = "gpt-4.1"
PROMPT_PATH = ROOT / "astrooo_system_prompt.md"
HISTORY_BACKFILL_LIMIT = 300
DM_BACKFILL_LIMIT = 10
SESSION_IDLE_SECONDS = 60 * 60
MAX_INPUT_TOKENS = 90000
MESSAGE_LOG_PATH = ROOT / ".message_log.sqlite3"
AUDIO_SETTINGS_PATH = ROOT / ".audio_settings.json"
HISTORY_FLOORS_PATH = ROOT / ".history_floors.json"
MAX_IMAGE_BYTES = 50 * 1024 * 1024
IMAGE_TYPES = {"image/png", "image/jpeg", "image/webp", "image/gif"}


def load_local_env(path: Path = ROOT / ".env") -> None:
    """Load the existing local credentials without printing them."""
    if not path.exists():
        return
    for line in path.read_text(encoding="utf-8-sig").splitlines():
        key, sep, value = line.partition("=")
        if sep and key.strip() in {
            "OPENAI_API_KEY", "API_KEY", "DISCORD_BOT_TOKEN", "APPLICATION_ID",
            "OWNER", "SERVER_ID", "MENTION_CHANNEL_ID", "USER_ID",
        }:
            os.environ.setdefault(key.strip(), value.strip().strip('"\''))


def create_audio_primer() -> str:
    """Match Default Space: 100 ms, 16 kHz mono PCM WAV, 880 Hz fade-in/out."""
    rate, count = 16000, 1600
    fade_samples = rate * 0.005
    pcm = bytearray()
    for index in range(count):
        fade = min(1.0, index / fade_samples, (count - 1 - index) / fade_samples)
        sample = round(math.sin(2 * math.pi * 880 * index / rate) * 0.12 * fade * 32767)
        pcm.extend(struct.pack("<h", sample))
    output = io.BytesIO()
    with wave.open(output, "wb") as wav:
        wav.setnchannels(1)
        wav.setsampwidth(2)
        wav.setframerate(rate)
        wav.writeframes(pcm)
    return base64.b64encode(output.getvalue()).decode("ascii")


AUDIO_PRIMER_WAV_BASE64 = create_audio_primer()


def decode_output_audio(data: str) -> bytes:
    """Return a playable WAV; handle either WAV or raw 24 kHz PCM16 output."""
    raw = base64.b64decode(data)
    if raw.startswith(b"RIFF") and raw[8:12] == b"WAVE":
        # Streaming WAVs can advertise 0xffffffff bytes. Discord needs real lengths.
        fixed = bytearray(raw)
        struct.pack_into("<I", fixed, 4, len(fixed) - 8)
        offset = 12
        while offset + 8 <= len(fixed):
            size = struct.unpack_from("<I", fixed, offset + 4)[0]
            if fixed[offset:offset + 4] == b"data":
                if size > len(fixed) - offset - 8:
                    struct.pack_into("<I", fixed, offset + 4, len(fixed) - offset - 8)
                break
            offset += 8 + size + size % 2
        return bytes(fixed)
    output = io.BytesIO()
    with wave.open(output, "wb") as wav:
        wav.setnchannels(1)
        wav.setsampwidth(2)
        wav.setframerate(24000)
        wav.writeframes(raw)
    return output.getvalue()


@dataclass
class Completion:
    text: str
    audio_wav: bytes | None = None
    image_notes: dict[str, str] | None = None


def prepend_audio_primer(messages: list[dict]) -> list[dict]:
    """Insert the primer as the first content block of the first user turn."""
    result = [dict(message) for message in messages]
    for message in result:
        if message.get("role") != "user":
            continue
        content = message.get("content", "")
        parts = content if isinstance(content, list) else [{"type": "text", "text": str(content)}]
        if parts and parts[0].get("type") == "input_audio" and parts[0].get("input_audio", {}).get("data") == AUDIO_PRIMER_WAV_BASE64:
            return result
        message["content"] = [
            {"type": "input_audio", "input_audio": {"data": AUDIO_PRIMER_WAV_BASE64, "format": "wav"}},
            *parts,
        ]
        break
    return result


def is_image_attachment(attachment: discord.Attachment) -> bool:
    mime = (attachment.content_type or "").split(";", 1)[0].lower()
    return mime in IMAGE_TYPES or Path(attachment.filename).suffix.lower() in {".png", ".jpg", ".jpeg", ".webp", ".gif"}


def contains_image(messages: list[dict]) -> bool:
    return any(
        isinstance(message.get("content"), list)
        and any(isinstance(part, dict) and part.get("type") == "image_url" for part in message["content"])
        for message in messages
    )


def split_discord_text(text: str, limit: int = 1900) -> list[str]:
    chunks = []
    remaining = text.strip()
    while remaining:
        if len(remaining) <= limit:
            chunks.append(remaining)
            break
        cut = remaining.rfind("\n", 0, limit + 1)
        if cut < limit // 2:
            cut = remaining.rfind(" ", 0, limit + 1)
        if cut < limit // 2:
            cut = limit
        chunks.append(remaining[:cut].rstrip())
        remaining = remaining[cut:].lstrip()
    return chunks


class EditAstroOoModal(discord.ui.Modal, title="Edit AstroOo message"):
    revised_text = discord.ui.TextInput(
        label="Message",
        style=discord.TextStyle.paragraph,
        max_length=2000,
        required=True,
    )

    def __init__(self, bot: AstroOoBot, target: discord.Message) -> None:
        super().__init__()
        self.bot = bot
        self.target = target
        self.revised_text.default = target.content

    async def on_submit(self, interaction: discord.Interaction) -> None:
        if not self.bot.can_manage_messages(interaction):
            await interaction.response.send_message("Only Josh or a server moderator can edit AstroOo's messages here.", ephemeral=True)
            return
        if self.bot.user is None:
            await interaction.response.send_message("AstroOo is unavailable.", ephemeral=True)
            return
        try:
            current = await self.target.channel.fetch_message(self.target.id)
            if current.author.id != self.bot.user.id:
                await interaction.response.send_message("That message isn't from AstroOo.", ephemeral=True)
                return
            edited = await current.edit(content=str(self.revised_text).strip(), allowed_mentions=discord.AllowedMentions.none())
            self.bot.message_log.save(edited, self.bot.user.id)
        except discord.HTTPException:
            await interaction.response.send_message("I couldn't edit that message. It may have been deleted.", ephemeral=True)
            return
        await interaction.response.send_message("AstroOo message updated.", ephemeral=True)


class AstroOoBot(discord.Client):
    def __init__(self) -> None:
        intents = discord.Intents.default()
        intents.message_content = True
        application_id = os.getenv("APPLICATION_ID") or os.getenv("OWNER")
        super().__init__(intents=intents, application_id=int(application_id) if application_id else None)
        self.tree = app_commands.CommandTree(self)
        self.incoming_messages: asyncio.Queue[discord.Message] = asyncio.Queue()
        self.incoming_worker: asyncio.Task | None = None
        self.processing_message = False
        self.pending_message_ids: set[int] = set()
        self.intake_lock = asyncio.Lock()
        self.message_log = MessageLog(MESSAGE_LOG_PATH)
        self.tokenizer = tiktoken.get_encoding("o200k_base")
        self.dm_backfilled = False
        self.dm_backfill_lock = asyncio.Lock()
        try:
            self.audio_enabled_channels: set[int] = set(map(int, json.loads(AUDIO_SETTINGS_PATH.read_text(encoding="utf-8"))))
        except (FileNotFoundError, ValueError, OSError):
            self.audio_enabled_channels = set()
        try:
            self.history_floor: dict[int, int] = {
                int(channel_id): int(message_id)
                for channel_id, message_id in json.loads(HISTORY_FLOORS_PATH.read_text(encoding="utf-8")).items()
            }
        except (FileNotFoundError, ValueError, OSError):
            self.history_floor = {}
        self.session: aiohttp.ClientSession | None = None
        prompt_file = PROMPT_PATH if PROMPT_PATH.exists() else ROOT / "astrooo_system_prompt.example.md"
        self.system_prompt = prompt_file.read_text(encoding="utf-8")
        self.api_key = os.getenv("OPENAI_API_KEY") or os.getenv("API_KEY")
        self.mention_channel_id = int(os.getenv("MENTION_CHANNEL_ID", "0"))
        self.guild_id = int(os.getenv("SERVER_ID", "0"))
        self.owner_id = int(os.getenv("USER_ID", "0"))
        if not self.api_key:
            raise RuntimeError("Set OPENAI_API_KEY or API_KEY in src/discord/.env")

        @self.tree.command(name="reset_astrooo", description="Start a fresh AstroOo conversation in this channel")
        async def reset_astrooo(interaction: discord.Interaction) -> None:
            if interaction.channel_id is None:
                await interaction.response.send_message("This command needs a channel.", ephemeral=True)
                return
            self.reset_history(interaction.channel_id, interaction.id)
            await interaction.response.send_message("Fresh conversation. What’s up? 💿", ephemeral=True)

        @self.tree.command(name="sync_astrooo", description="Refresh AstroOo's slash commands and message menu actions")
        @app_commands.describe(reset="Remove stale registrations and rebuild the command tree")
        async def sync_astrooo(interaction: discord.Interaction, reset: bool = False) -> None:
            if interaction.user.id != self.owner_id:
                await interaction.response.send_message("Josh can rebuild AstroOo's app commands.", ephemeral=True)
                return
            await interaction.response.defer(ephemeral=True, thinking=True)
            try:
                count = await self.sync_commands(reset=reset)
            except discord.HTTPException:
                LOG.exception("Command synchronization failed")
                await interaction.followup.send("Discord couldn't refresh the commands. Check the terminal log.", ephemeral=True)
                return
            await interaction.followup.send(f"Synced {count} commands, including Edit AstroOo message.", ephemeral=True)

        @self.tree.command(name="audio_astrooo", description="Turn AstroOo's Verse audio replies on or off in this channel")
        @app_commands.describe(enabled="Turn audio replies on or off; omit to check the current setting")
        async def audio_astrooo(interaction: discord.Interaction, enabled: bool | None = None) -> None:
            if interaction.channel_id is None:
                await interaction.response.send_message("This command needs a channel.", ephemeral=True)
                return
            if enabled is not None:
                if not self.can_manage_messages(interaction):
                    await interaction.response.send_message("Only Josh or a server moderator can change audio replies here.", ephemeral=True)
                    return
                if enabled:
                    self.audio_enabled_channels.add(interaction.channel_id)
                else:
                    self.audio_enabled_channels.discard(interaction.channel_id)
                AUDIO_SETTINGS_PATH.write_text(json.dumps(sorted(self.audio_enabled_channels)), encoding="utf-8")
            status = "on" if interaction.channel_id in self.audio_enabled_channels else "off"
            await interaction.response.send_message(f"AstroOo's Verse audio replies are {status} in this channel.", ephemeral=True)

        @self.tree.context_menu(name="Delete AstroOo message")
        async def delete_astrooo_message(interaction: discord.Interaction, target: discord.Message) -> None:
            if not self.can_manage_messages(interaction):
                await interaction.response.send_message("Only Josh or a server moderator can delete AstroOo's messages here.", ephemeral=True)
                return
            if self.user is None or target.author.id != self.user.id:
                await interaction.response.send_message("That message isn't from AstroOo.", ephemeral=True)
                return
            try:
                await target.delete()
                self.message_log.delete(target.id)
            except discord.HTTPException:
                await interaction.response.send_message("I couldn't delete that message. Check my channel permissions.", ephemeral=True)
                return
            await interaction.response.send_message("AstroOo message deleted.", ephemeral=True)

        @self.tree.context_menu(name="Edit AstroOo message")
        async def edit_astrooo_message(interaction: discord.Interaction, target: discord.Message) -> None:
            if not self.can_manage_messages(interaction):
                await interaction.response.send_message("Only Josh or a server moderator can edit AstroOo's messages here.", ephemeral=True)
                return
            if self.user is None or target.author.id != self.user.id:
                await interaction.response.send_message("That message isn't from AstroOo.", ephemeral=True)
                return
            if not target.content or len(target.content) > 2000:
                await interaction.response.send_message("That message has no editable text.", ephemeral=True)
                return
            await interaction.response.send_modal(EditAstroOoModal(self, target))

        @self.tree.command(name="purge_astrooo", description="Delete AstroOo's recent messages in this channel")
        async def purge_astrooo(interaction: discord.Interaction, count: app_commands.Range[int, 1, 30] = 5) -> None:
            if not self.can_manage_messages(interaction):
                await interaction.response.send_message("Only Josh or a server moderator can clear AstroOo's messages here.", ephemeral=True)
                return
            if interaction.channel is None or self.user is None:
                await interaction.response.send_message("This command needs a channel.", ephemeral=True)
                return
            await interaction.response.defer(ephemeral=True, thinking=True)
            deleted = 0
            try:
                async for item in interaction.channel.history(limit=300):
                    if item.author.id == self.user.id:
                        await item.delete()
                        self.message_log.delete(item.id)
                        deleted += 1
                        if deleted >= count:
                            break
            except discord.HTTPException:
                await interaction.followup.send(f"Deleted {deleted} message(s). I couldn't read or delete the rest; check my channel permissions.", ephemeral=True)
                return
            await interaction.followup.send(f"Deleted {deleted} AstroOo message(s).", ephemeral=True)

    def can_manage_messages(self, interaction: discord.Interaction) -> bool:
        return (
            interaction.guild is None
            or interaction.user.id == self.owner_id
            or interaction.permissions.manage_messages
        )

    def reset_history(self, channel_id: int, after_message_id: int) -> None:
        self.history_floor[channel_id] = after_message_id
        self.message_log.reset_session(channel_id)
        HISTORY_FLOORS_PATH.write_text(json.dumps(self.history_floor), encoding="utf-8")

    async def sync_commands(self, *, reset: bool = False) -> int:
        global_commands = self.tree.get_commands()
        if reset:
            self.tree.clear_commands(guild=None)
            try:
                await self.tree.sync()
            finally:
                for command in global_commands:
                    self.tree.add_command(command)
        synced = await self.tree.sync()
        guild_ids = {guild.id for guild in self.guilds}
        if self.guild_id:
            guild_ids.add(self.guild_id)
        for guild_id in guild_ids:
            guild = discord.Object(id=guild_id)
            if reset:
                self.tree.clear_commands(guild=guild)
                await self.tree.sync(guild=guild)
            self.tree.copy_global_to(guild=guild)
            await self.tree.sync(guild=guild)
        LOG.info("Synced %s app commands globally and in %s guild(s)", len(synced), len(guild_ids))
        return len(synced)

    async def setup_hook(self) -> None:
        self.session = aiohttp.ClientSession(timeout=aiohttp.ClientTimeout(total=120))
        await self.sync_commands()
        self.incoming_worker = asyncio.create_task(self.process_incoming_messages(), name="astrooo-incoming-messages")

    async def close(self) -> None:
        if self.incoming_worker:
            self.incoming_worker.cancel()
            try:
                await self.incoming_worker
            except asyncio.CancelledError:
                pass
        if self.session:
            await self.session.close()
        self.message_log.connection.close()
        await super().close()

    async def on_ready(self) -> None:
        LOG.info("AstroOo online as %s; model %s; guild IDs: %s", self.user, MODEL, [guild.id for guild in self.guilds])
        await self.ensure_owner_dm_history()
        await self.sync_commands()

    async def ensure_owner_dm_history(self) -> None:
        if not self.owner_id or self.dm_backfilled or self.user is None:
            return
        async with self.dm_backfill_lock:
            if self.dm_backfilled:
                return
            try:
                owner = await self.fetch_user(self.owner_id)
                dm = await owner.create_dm()
                async for item in dm.history(limit=DM_BACKFILL_LIMIT):
                    if not item.author.bot or item.author.id == self.user.id:
                        self.message_log.save(item, self.user.id)
                self.dm_backfilled = True
            except discord.HTTPException:
                LOG.exception("Could not backfill Josh's DM history")

    async def on_message_edit(self, before: discord.Message, after: discord.Message) -> None:
        if self.user and (not after.author.bot or after.author.id == self.user.id):
            self.message_log.save(after, self.user.id)

    async def on_raw_message_delete(self, payload: discord.RawMessageDeleteEvent) -> None:
        self.message_log.delete(payload.message_id)

    async def record_reaction(self, payload, *, added: bool) -> None:
        if self.user is None or payload.user_id == self.user.id:
            return
        channel = self.get_channel(payload.channel_id) or await self.fetch_channel(payload.channel_id)
        # Fetch the authoritative count: a cached snapshot may already include this event.
        target = await channel.fetch_message(payload.message_id)
        if target.author.bot and target.author.id != self.user.id:
            return
        self.message_log.save(target, self.user.id)
        person = getattr(payload, "member", None)
        if person is None:
            guild = self.get_guild(payload.guild_id) if payload.guild_id else None
            person = (guild.get_member(payload.user_id) if guild else None) or self.get_user(payload.user_id)
            if guild and (person is None or not isinstance(person, discord.Member)):
                try:
                    person = await guild.fetch_member(payload.user_id)
                except discord.HTTPException:
                    pass
        if person is None:
            person = await self.fetch_user(payload.user_id)
        self.message_log.reaction(target.id, channel.id, payload.user_id, person.display_name,
                                  str(payload.emoji), added, snapshot=True)

    async def on_raw_reaction_add(self, payload: discord.RawReactionActionEvent) -> None:
        try:
            await self.record_reaction(payload, added=True)
        except discord.HTTPException:
            LOG.warning("Could not read a Discord reaction")

    async def on_raw_reaction_remove(self, payload: discord.RawReactionActionEvent) -> None:
        try:
            await self.record_reaction(payload, added=False)
        except discord.HTTPException:
            LOG.warning("Could not read a removed Discord reaction")

    async def on_raw_reaction_clear(self, payload: discord.RawReactionClearEvent) -> None:
        self.message_log.clear_reactions(payload.message_id)

    async def on_raw_reaction_clear_emoji(self, payload: discord.RawReactionClearEmojiEvent) -> None:
        self.message_log.clear_reactions(payload.message_id, str(payload.emoji))

    async def should_respond(self, message: discord.Message) -> bool:
        if message.author.bot or self.user is None:
            return False
        if isinstance(message.channel, discord.DMChannel) or any(person.id == self.user.id for person in message.mentions):
            return True
        if message.reference and message.reference.message_id:
            replied_to = message.reference.resolved
            if not isinstance(replied_to, discord.Message):
                try:
                    replied_to = await message.channel.fetch_message(message.reference.message_id)
                except (discord.NotFound, discord.Forbidden, discord.HTTPException):
                    return False
            return replied_to.author.id == self.user.id
        return False

    async def get_messages(self, message: discord.Message) -> list[dict]:
        window = await self.ensure_channel_session(message)
        self.turn_window = window
        current_text = await self.user_content(message, message.author.display_name, include_images=False)
        rows = self.message_log.recent(window, message.id)
        await self.retain_session_images(message, window, rows)
        server_name = message.guild.name if message.guild else "Direct message"
        channel_name = getattr(message.channel, "name", None) or "Direct message"
        directory = {r["author_id"]: r["display_name"] for r in self.message_log.identities(message.channel.id)}
        directory.update({person.id: person.display_name for person in message.mentions})
        directory[message.author.id] = message.author.display_name
        if self.owner_id:
            directory.setdefault(self.owner_id, "Josh / Avant_Garde_1917 / z0zz0194")
        self.turn_directory = directory
        location = f"Discord server: {server_name}; channel: {channel_name}; current message_id: {message.id}."
        identities = "\n".join(f"{name}: user_id={user_id}; mention=<@{user_id}>" for user_id, name in directory.items())
        extra = [location, f"Known Discord identities:\n{identities}", TOOL_INSTRUCTIONS]
        if message.guild and self.owner_id:
            await self.ensure_owner_dm_history()
            private = self.message_log.dm_context(self.owner_id, message.id, limit=10)
            if private:
                extra.append("Josh's last 10 private DM messages, retained for coordination:\n" + "\n".join(
                    f"{r['display_name']}: {r['content']}" for r in reversed(private)
                ))
        reactions = self.message_log.recent_reactions(
            message.channel.id, window.last_activity - (SESSION_IDLE_SECONDS if window.turn == 0 else 0))
        if reactions:
            extra.append("Recent Discord reaction feedback:\n" + "\n".join(
                f"{r['display_name']} {'added' if r['added'] else 'removed'} {r['emoji']} on message {r['message_id']} by {r['message_author']}: {r['excerpt']}"
                for r in reversed(reactions)
            ))
        assets = self.message_log.images(window)
        active = [asset for asset in assets if asset["raw"] is not None and window.turn <= asset["active_until"]]
        self.active_image_ids = [asset["asset_id"] for asset in active]
        notes = [f"{a['asset_id']} ({a['filename']}): {a['description']}" for a in assets
                 if a['description'] and a not in active]
        if notes:
            extra.append("Retained visual descriptions from earlier images:\n" + "\n".join(notes))
        if active:
            extra.append("For this image turn, reply in the requested JSON format. image_notes must contain a factual visual description (at most 100 words) for each asset_id: " + ", ".join(self.active_image_ids))
        system = {"role": "system", "content": self.system_prompt + "\n\n" + "\n\n".join(extra)}
        selected: list[dict] = []
        tokens_used = len(self.tokenizer.encode(system["content"])) + len(self.tokenizer.encode(current_text)) + 5000 + 7000 * len(active)
        for row in rows:
            if row["message_id"] == message.id:
                continue
            text = self.history_text(row)
            cost = len(self.tokenizer.encode(text)) + 16
            if tokens_used + cost > MAX_INPUT_TOKENS:
                break
            tokens_used += cost
            selected.append({"role": "assistant" if row["is_astrooo"] else "user", "content": text})
        if tokens_used > MAX_INPUT_TOKENS:
            raise ValueError("Current images and required context exceed the 90,000-token ceiling")
        messages: list[dict] = [system, *reversed(selected)]
        if active:
            parts = [{"type": "text", "text": "Images retained for this conversation turn:"}]
            for asset in active:
                parts.extend([
                    {"type": "text", "text": f"asset_id={asset['asset_id']}; message_id={asset['message_id']}; file={asset['filename']}"},
                    {"type": "image_url", "image_url": {"url": f"data:{asset['mime']};base64,{base64.b64encode(asset['raw']).decode('ascii')}"}},
                ])
            messages.append({"role": "user", "content": parts})
        messages.append({"role": "user", "content": f"[message_id={message.id}; user_id={message.author.id}]\n{current_text}"})
        LOG.info("Request context: channel=%s session=%s messages=%s estimated_input=%s images=%s", message.channel.id, window.start_id, len(messages), tokens_used, len(active))
        return messages if contains_image(messages) else prepend_audio_primer(messages)

    def history_text(self, row) -> str:
        text = f"[message_id={row['message_id']}; user_id={row['author_id']}] {row['display_name']}: {row['content']}"
        if row["reply_to_id"]:
            saved = self.message_log.get(row["reply_to_id"])
            if saved:
                text = f"[Replying to {saved[0]}: {saved[1]}]\n" + text
        files = json.loads(row["attachment_names"])
        if files:
            text += " [attached: " + ", ".join(files) + "]"
        reactions = self.message_log.reaction_text(row["message_id"])
        if reactions:
            text += f"\n[Discord reactions: {reactions}]"
        return text

    async def ensure_channel_session(self, message: discord.Message) -> SessionWindow:
        at = message.created_at.timestamp()
        window = self.message_log.session(message.channel.id)
        existing = window is not None and at - window.last_activity < SESSION_IDLE_SECONDS
        try:
            args = {"limit": HISTORY_BACKFILL_LIMIT if existing else 2,
                    "before": discord.Object(id=message.id), "oldest_first": False}
            if existing:
                args["after"] = discord.Object(id=window.floor)
            async for item in message.channel.history(**args):
                if not item.author.bot or item.author.id == self.user.id:
                    self.message_log.save(item, self.user.id)
        except discord.HTTPException:
            LOG.warning("Could not backfill this channel's recent session messages")
        self.message_log.save(message, self.user.id)
        if not existing:
            reset_floor = self.history_floor.get(message.channel.id, 0)
            prior = self.message_log.prior_ids(message.channel.id, message.id, reset_floor)
            floor = max(reset_floor, min(prior) - 1 if prior else message.id - 1)
            if isinstance(message.channel, discord.DMChannel) and message.author.id == self.owner_id:
                # Josh's last ten DMs remain priority even at the start of a new session.
                prior_dm = self.message_log.dm_context(self.owner_id, message.id - 1, limit=10)
                if prior_dm:
                    floor = max(reset_floor, min(r["message_id"] for r in prior_dm) - 1)
            window = self.message_log.begin_session(message.channel.id, message.id, floor, at)
        return window

    async def retain_session_images(self, message: discord.Message, window: SessionWindow, rows) -> None:
        attachments = [(row["message_id"], json.loads(row["attachments"])) for row in rows if not row["is_astrooo"]]
        # A reply can explicitly refer to an image older than the session's history window.
        if message.reference and message.reference.message_id:
            row = self.message_log.connection.execute("SELECT * FROM messages WHERE message_id=?", (message.reference.message_id,)).fetchone()
            if row and row["channel_id"] == message.channel.id:
                attachments.append((row["message_id"], json.loads(row["attachments"])))
        current = {a.id: a for a in message.attachments}
        for source_id, files in attachments:
            for item in files:
                mime = (item.get("content_type") or "").split(";", 1)[0].lower()
                extension = Path(item["filename"]).suffix.lower()
                if mime not in IMAGE_TYPES and extension not in {".png", ".jpg", ".jpeg", ".gif", ".webp"}:
                    continue
                asset_id = f"{window.start_id}:{source_id}:{item['id']}"
                if self.message_log.image_exists(asset_id):
                    continue
                if item["size"] > MAX_IMAGE_BYTES:
                    raise ValueError("Image exceeds the configured upload size")
                if item["id"] in current:
                    raw = await current[item["id"]].read()
                else:
                    if not item["url"].startswith(("https://cdn.discordapp.com/attachments/", "https://media.discordapp.net/attachments/")):
                        continue
                    assert self.session is not None
                    async with self.session.get(item["url"]) as response:
                        if response.status != 200:
                            LOG.warning("Past image unavailable: %s", item['filename'])
                            continue
                        buffer = bytearray()
                        async for chunk in response.content.iter_chunked(65536):
                            buffer.extend(chunk)
                            if len(buffer) > MAX_IMAGE_BYTES:
                                raise ValueError("Image exceeds the configured upload size")
                        raw = bytes(buffer)
                if len(raw) > MAX_IMAGE_BYTES:
                    raise ValueError("Image exceeds the configured upload size")
                if mime not in IMAGE_TYPES:
                    mime = {".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".gif": "image/gif", ".webp": "image/webp"}[extension]
                self.message_log.add_image(asset_id, source_id, window, item["filename"], mime, raw)

    async def user_content(self, message: discord.Message, name: str, *, include_images: bool) -> str | list[dict]:
        text = f"{name}: {message.clean_content.strip()}"
        if message.reference and message.reference.message_id:
            replied_to = message.reference.resolved
            if not isinstance(replied_to, discord.Message):
                try:
                    replied_to = await message.channel.fetch_message(message.reference.message_id)
                except (discord.NotFound, discord.Forbidden, discord.HTTPException):
                    replied_to = None
            if isinstance(replied_to, discord.Message):
                quoted_name = replied_to.author.display_name
                quoted_text = replied_to.clean_content
                quoted_files = [attachment.filename for attachment in replied_to.attachments]
                if self.user and (not replied_to.author.bot or replied_to.author.id == self.user.id):
                    self.message_log.save(replied_to, self.user.id)
            else:
                saved = self.message_log.get(message.reference.message_id)
                quoted_name, quoted_text, quoted_files = saved if saved else ("unknown", "message unavailable", [])
            if quoted_files:
                quoted_text += " [attached: " + ", ".join(quoted_files) + "]"
            text = f"[Replying to {quoted_name}: {quoted_text.strip()}]\n{text}"
        reactions = self.message_log.reaction_text(message.id)
        if reactions:
            text += f"\n[Discord reactions: {reactions}]"
        if not include_images:
            if any(map(is_image_attachment, message.attachments)):
                text += " [sent an image]"
            return text
        parts: list[dict] = [{"type": "text", "text": text}]
        for attachment in message.attachments:
            if not is_image_attachment(attachment):
                continue
            if attachment.size > MAX_IMAGE_BYTES:
                raise ValueError(f"Image {attachment.filename} exceeds the configured upload limit")
            image = await attachment.read()
            if len(image) > MAX_IMAGE_BYTES:
                raise ValueError(f"Image {attachment.filename} exceeds the configured upload limit")
            mime = (attachment.content_type or "").split(";", 1)[0].lower()
            if mime not in IMAGE_TYPES:
                mime = {".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".webp": "image/webp", ".gif": "image/gif"}[Path(attachment.filename).suffix.lower()]
            parts.append({"type": "image_url", "image_url": {"url": f"data:{mime};base64,{base64.b64encode(image).decode('ascii')}"}})
        return parts if len(parts) > 1 else text

    async def complete(self, messages: list[dict], *, audio_enabled: bool = False) -> Completion:
        assert self.session is not None
        has_image = contains_image(messages)
        messages = self.fit_request_budget(messages)
        request_audio = audio_enabled and not has_image
        payload = {
            "model": IMAGE_MODEL if has_image else API_MODEL,
            "messages": messages,
            "temperature": 1.2,
            "top_p": 0.95,
            "presence_penalty": 0.3,
            "max_completion_tokens": 900,
            "stream": False,
        }
        if not has_image:
            payload["modalities"] = ["text", "audio"] if request_audio else ["text"]
            if request_audio:
                payload["audio"] = {"voice": "verse", "format": "wav"}
        else:
            payload["response_format"] = {"type": "json_schema", "json_schema": {
                "name": "visual_reply", "strict": True,
                "schema": {"type": "object", "properties": {
                    "reply": {"type": "string"},
                    "image_notes": {"type": "array", "items": {
                        "type": "object", "properties": {
                            "asset_id": {"type": "string"}, "description": {"type": "string"}},
                        "required": ["asset_id", "description"], "additionalProperties": False}}},
                    "required": ["reply", "image_notes"], "additionalProperties": False}}}
        async with self.session.post(
            "https://api.openai.com/v1/chat/completions",
            headers={"Authorization": f"Bearer {self.api_key}"},
            json=payload,
        ) as response:
            data = await response.json(content_type=None)
            if response.status >= 400:
                detail = data.get("error", {}).get("message", "Request failed") if isinstance(data, dict) else "Request failed"
                raise RuntimeError(f"OpenAI HTTP {response.status}: {detail}")
        choice = data["choices"][0]["message"]
        audio_response = choice.get("audio") or {}
        content = choice.get("content") or audio_response.get("transcript") or ""
        if isinstance(content, list):
            content = "\n".join(part.get("text", "") for part in content if isinstance(part, dict))
        notes = None
        if has_image:
            try:
                parsed = json.loads(content)
                content = parsed["reply"]
                notes = {item["asset_id"]: item["description"] for item in parsed["image_notes"]
                         if item["asset_id"] in getattr(self, "active_image_ids", [])}
            except (ValueError, KeyError, TypeError):
                raise RuntimeError("Image reply was incomplete; no internal JSON was posted")
        audio_data = audio_response.get("data") if request_audio else None
        return Completion(str(content).strip(), decode_output_audio(audio_data) if audio_data else None, notes)

    def fit_request_budget(self, messages: list[dict]) -> list[dict]:
        """Recheck each tool follow-up too, without counting base64 as text tokens."""
        messages = list(messages)
        def cost(message):
            content = message.get("content", "")
            if isinstance(content, str):
                return len(self.tokenizer.encode(content)) + 16
            return 16 + sum(7000 if part.get("type") == "image_url" else
                            100 if part.get("type") == "input_audio" else
                            len(self.tokenizer.encode(part.get("text", ""))) for part in content)
        # Reserve room for chat framing and the 100 ms primer's audio tokens.
        size = 1000 + sum(cost(item) for item in messages)
        current_user = max((i for i, item in enumerate(messages) if item["role"] == "user"), default=0)
        while size > MAX_INPUT_TOKENS:
            removable = next((i for i in range(1, current_user)
                              if not contains_image([messages[i]])
                              and messages[i]["role"] in {"user", "assistant"}), None)
            if removable is None:
                raise ValueError("Required context exceeds the 90,000-token ceiling")
            size -= cost(messages.pop(removable))
            current_user -= 1
        if not contains_image(messages):
            # Trimming can remove the original user turn that carried the primer.
            messages = prepend_audio_primer(messages)
        return messages

    async def resolve_user_id(self, value: object) -> int:
        found = discord_user_id(value)
        if found:
            return found
        name = str(value).strip().lstrip("@").casefold()
        candidates = {uid for uid, label in self.turn_directory.items() if label.casefold() == name}
        candidates.update(row["author_id"] for row in self.message_log.lookup_name(name))
        if name in {"josh", "joshy", "avant_garde_1917", "z0zz0194"} and self.owner_id:
            candidates.add(self.owner_id)
        if len(candidates) != 1:
            raise ValueError("Name is unknown or ambiguous; use a supplied Discord user ID")
        return candidates.pop()

    async def execute_tool(self, call: ToolCall, message: discord.Message) -> str:
        if call.error:
            return f"{call.name} failed: {call.error}"
        args = call.arguments
        try:
            if call.name == "lookup_user":
                uid = await self.resolve_user_id(args.get("name", args.get("user_id", "")))
                person = self.get_user(uid) or await self.fetch_user(uid)
                self.turn_directory[uid] = person.display_name
                return f"Resolved {person.display_name}: user_id={uid}; mention=<@{uid}>"
            if call.name == "recall_dm":
                if message.author.id != self.owner_id:
                    return "recall_dm failed: Josh's private recall tool is for Josh"
                rows = self.message_log.dm_context(self.owner_id, message.id, str(args.get("query", "")), limit=10)
                return "Private DM log:\n" + "\n".join(self.history_text(row) for row in reversed(rows))
            if call.name == "dm":
                uid = await self.resolve_user_id(args.get("user_id", ""))
                if message.author.id != self.owner_id and uid != message.author.id:
                    return "dm failed: only Josh can request DMs to other people"
                text, nested = extract_tools(str(args.get("message", "")))
                if not text or nested or len(text) > 8000:
                    return "dm failed: provide a plain message of 1–8000 characters"
                person = self.get_user(uid) or await self.fetch_user(uid)
                if person.bot:
                    return "dm failed: target is a bot"
                for chunk in split_discord_text(text):
                    sent = await person.send(chunk, allowed_mentions=discord.AllowedMentions.none())
                    self.message_log.save(sent, self.user.id)
                self.turn_directory[uid] = person.display_name
                return f"DM sent to {person.display_name} (user_id={uid})"
            if call.name == "react":
                target_id = int(args.get("message_id") or message.id)
                emoji = str(args.get("emoji", "")).strip()
                if not emoji or len(emoji) > 100:
                    return "react failed: supply one emoji"
                target = message if target_id == message.id else await message.channel.fetch_message(target_id)
                await target.add_reaction(emoji)
                # Refresh so the local snapshot includes the bot's own reaction too.
                refreshed = await message.channel.fetch_message(target_id)
                self.message_log.save(refreshed, self.user.id)
                return f"Reacted {emoji} to message_id={target_id}"
            return f"Unknown tool: {call.name}"
        except (ValueError, TypeError, discord.HTTPException) as error:
            return f"{call.name} failed: {type(error).__name__}: {error}"

    async def complete_with_tools(self, messages: list[dict], message: discord.Message,
                                  *, audio_enabled: bool) -> Completion:
        executed: dict[str, str] = {}
        for turn in range(3):
            result = await self.complete(messages, audio_enabled=audio_enabled)
            for asset_id, description in (result.image_notes or {}).items():
                self.message_log.describe_image(asset_id, description)
            clean, calls = extract_tools(result.text)
            if not calls:
                return Completion(clean, result.audio_wav, result.image_notes)
            # An audio response containing a directive is withheld in its entirety.
            if turn == 2:
                return Completion(clean or "I couldn't complete that tool request.")
            reports = []
            for call in calls[:3]:
                signature = json.dumps([call.name, call.arguments], sort_keys=True)
                if signature not in executed:
                    executed[signature] = await self.execute_tool(call, message)
                reports.append(executed[signature])
            if len(calls) > 3:
                reports.append("Only three tool actions per step are allowed")
            messages = [*messages, {"role": "assistant", "content": result.text},
                        {"role": "system", "content": "Actual tool results:\n" + "\n".join(reports)
                         + "\nUse these results. Reply naturally without repeating tool directives."
                         + (" No more tools; give the final reply." if turn == 1 else "")}]

    async def process_incoming_messages(self) -> None:
        await self.wait_until_ready()
        while True:
            message = await self.incoming_messages.get()
            self.processing_message = True
            try:
                await self.process_message(message)
            except asyncio.CancelledError:
                raise
            except Exception:
                # A failed send/API/tool must never terminate the queue worker.
                LOG.exception("Failed to answer Discord message %s", message.id)
                try:
                    sent = await message.channel.send(
                        "I hit an error while replying. Check the bot log for details.",
                        reference=message, allowed_mentions=discord.AllowedMentions.none())
                    self.message_log.save(sent, self.user.id)
                except discord.HTTPException:
                    LOG.warning("Could not deliver the error reply to message %s", message.id)
            finally:
                self.pending_message_ids.discard(message.id)
                self.processing_message = False
                self.incoming_messages.task_done()

    async def process_message(self, message: discord.Message) -> None:
        reset_text = re.sub(rf"<@!?{self.user.id}>", "", message.content).strip().casefold()
        if reset_text in {"reset", "start over"}:
            confirmation = await message.channel.send(
                "Conversation reset. Fresh page. 💿", reference=message,
                allowed_mentions=discord.AllowedMentions.none())
            self.reset_history(message.channel.id, confirmation.id)
            return
        async with message.channel.typing():
            audio_enabled = message.channel.id in self.audio_enabled_channels
            messages = await self.get_messages(message)
            result = await self.complete_with_tools(messages, message, audio_enabled=audio_enabled)
            answer = result.text or ("🔊" if result.audio_wav else "The model returned an empty reply. Try sending that again.")
            for index, chunk in enumerate(split_discord_text(answer)):
                mentions = {int(uid) for uid in re.findall(r"<@!?(\d+)>", chunk)
                            if int(uid) in self.turn_directory}
                send_args = {"reference": message if index == 0 else None,
                             "allowed_mentions": discord.AllowedMentions(
                                 everyone=False, roles=False, replied_user=False,
                                 users=[discord.Object(id=uid) for uid in mentions])}
                if index == 0 and result.audio_wav:
                    send_args["file"] = discord.File(io.BytesIO(result.audio_wav), filename="astrooo-verse.wav")
                try:
                    sent = await message.channel.send(chunk, **send_args)
                except discord.HTTPException:
                    if "file" not in send_args:
                        raise
                    send_args.pop("file")
                    sent = await message.channel.send(
                        chunk + "\n(Audio couldn't be attached; check AstroOo's Attach Files permission or upload limit.)",
                        **send_args)
                self.message_log.save(sent, self.user.id, reply_to_id=message.id)
            self.message_log.finish_turn(self.turn_window, message.created_at.timestamp())

    async def on_message(self, message: discord.Message) -> None:
        if self.user and (not message.author.bot or message.author.id == self.user.id):
            self.message_log.save(message, self.user.id)
        async with self.intake_lock:
            if message.id in self.pending_message_ids or not await self.should_respond(message):
                return
            self.pending_message_ids.add(message.id)
            self.incoming_messages.put_nowait(message)
            LOG.info("Queued message %s; waiting=%s", message.id, self.incoming_messages.qsize())


def main() -> None:
    parser = argparse.ArgumentParser(description="Run AstroOo or refresh Discord commands")
    parser.add_argument("--sync-commands", action="store_true")
    parser.add_argument("--reset-commands", action="store_true")
    args = parser.parse_args()
    load_local_env()
    logging.basicConfig(level=logging.INFO)
    token = os.getenv("DISCORD_BOT_TOKEN")
    if not token or len(token) < 30:
        raise RuntimeError("DISCORD_BOT_TOKEN in src/discord/.env is missing or incomplete")
    if args.sync_commands or args.reset_commands:
        async def sync_only() -> None:
            async with AstroOoBot() as bot:
                await bot.login(token)
                await bot.sync_commands(reset=args.reset_commands)
                commands = await bot.tree.fetch_commands()
                print("Registered app commands: " + ", ".join(command.name for command in commands))
        asyncio.run(sync_only())
    else:
        AstroOoBot().run(token, log_handler=None)


if __name__ == "__main__":
    main()
