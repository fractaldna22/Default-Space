"""Regression checks; never connect to Discord or send messages to real people."""
import asyncio
import base64
from datetime import datetime, timezone, timedelta
import json
import io
import struct
import wave
from pathlib import Path
import tempfile
from types import SimpleNamespace
import unittest
from unittest.mock import AsyncMock, MagicMock, patch

import discord
import bot as app
from astro_tools import ToolCall, extract_tools, discord_user_id

BOT_ID = 1554782787570114570
JOSH_ID = 749554072389943307
START = 1555000000000000000


def person(uid=JOSH_ID, name="Josh", bot=False):
    return SimpleNamespace(id=uid, display_name=name, bot=bot)


def message(mid, channel, text="hello", author=None, attachments=None, reference=None):
    item = MagicMock(spec=discord.Message)
    item.id = mid
    item.channel = channel
    item.guild = channel.guild
    item.author = author or person()
    item.content = item.clean_content = text
    item.mentions = [person(BOT_ID, "AstroOo", True)]
    item.attachments = attachments or []
    item.reference = reference
    item.reactions = []
    item.created_at = datetime.now(timezone.utc)
    return item


def channel(cid=22, *, dm=False):
    item = MagicMock(spec=discord.DMChannel if dm else discord.TextChannel)
    item.id, item.name = cid, "chatbots"
    item.guild = None if dm else SimpleNamespace(id=33, name="Our server")
    item.items, item.sent = [], []
    async def history(**kwargs):
        rows = [m for m in item.items if m.id < kwargs["before"].id] if "before" in kwargs else item.items
        if "after" in kwargs:
            rows = [m for m in rows if m.id > kwargs["after"].id]
        for row in sorted(rows, key=lambda m: m.id, reverse=True)[:kwargs["limit"]]:
            yield row
    item.history = history
    async def send(text, **kwargs):
        reference = kwargs.get("reference")
        reply = message(START + 1000 + len(item.sent), item, text, person(BOT_ID, "AstroOo", True),
                        reference=SimpleNamespace(message_id=reference.id, resolved=reference) if reference else None)
        item.sent.append(reply)
        item.items.append(reply)
        return reply
    item.send = AsyncMock(side_effect=send)
    item.typing = MagicMock(return_value=MagicMock(__aenter__=AsyncMock(), __aexit__=AsyncMock(return_value=False)))
    async def fetch(mid):
        return next(m for m in item.items if m.id == mid)
    item.fetch_message = AsyncMock(side_effect=fetch)
    return item


class AstroTests(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        root = Path(self.tmp.name)
        (root / "prompt.md").write_text("You are AstroOo. Be natural.", encoding="utf-8")
        self.patches = [patch.object(app, "MESSAGE_LOG_PATH", root / "log.sqlite"),
                        patch.object(app, "PROMPT_PATH", root / "prompt.md"),
                        patch.object(app, "AUDIO_SETTINGS_PATH", root / "audio.json"),
                        patch.object(app, "HISTORY_FLOORS_PATH", root / "floor.json"),
                        patch.dict("os.environ", {"API_KEY": "test-only", "APPLICATION_ID": str(BOT_ID),
                                                  "USER_ID": str(JOSH_ID), "SERVER_ID": "33"})]
        for p in self.patches:
            p.start()
        self.bot = app.AstroOoBot()
        self.bot._connection.user = person(BOT_ID, "AstroOo", True)
        self.bot.dm_backfilled = True
        self.bot.wait_until_ready = AsyncMock()

    async def asyncTearDown(self):
        self.bot.message_log.connection.close()
        for p in reversed(self.patches):
            p.stop()
        self.tmp.cleanup()

    async def test_incoming_fifo_waits_through_delivery_and_sees_previous_reply(self):
        ch = channel()
        first, second = message(START + 1, ch, "first"), message(START + 2, ch, "second", person(JOSH_ID+1, "Friend"))
        started, release, delivering, delivered = asyncio.Event(), asyncio.Event(), asyncio.Event(), asyncio.Event()
        requests = []
        async def complete(messages, *, audio_enabled=False):
            requests.append(messages)
            if len(requests) == 1:
                started.set()
                await release.wait()
            return app.Completion(f"answer {len(requests)}")
        self.bot.complete = complete
        original_send = ch.send.side_effect
        async def send(text, **kwargs):
            if text == "answer 1":
                delivering.set()
                await delivered.wait()
            return await original_send(text, **kwargs)
        ch.send.side_effect = send
        worker = asyncio.create_task(self.bot.process_incoming_messages())
        try:
            await self.bot.on_message(first)
            await asyncio.wait_for(started.wait(), 2)
            await self.bot.on_message(second)
            await self.bot.on_message(second)  # Duplicate event must not duplicate a request.
            self.assertEqual(len(requests), 1)
            self.assertEqual(self.bot.incoming_messages.qsize(), 1)
            release.set()
            await asyncio.wait_for(delivering.wait(), 2)
            self.assertEqual(len(requests), 1)  # The next API call waits for Discord delivery too.
            delivered.set()
            await asyncio.wait_for(self.bot.incoming_messages.join(), 3)
            self.assertEqual([m.clean_content for m in ch.sent], ["answer 1", "answer 2"])
            self.assertIn("answer 1", str(requests[1]))  # Its Discord ID is later than the queued user input.
            self.assertNotIn("second", str(requests[0]))
            self.assertFalse(self.bot.pending_message_ids)
        finally:
            worker.cancel()
            await asyncio.gather(worker, return_exceptions=True)

    async def test_failure_does_not_lose_the_next_person_in_another_channel(self):
        a, b = channel(22), channel(23)
        self.bot.complete = AsyncMock(side_effect=[RuntimeError("synthetic API failure"), app.Completion("second delivered")])
        await self.bot.on_message(message(START+1, a))
        await self.bot.on_message(message(START+2, b, author=person(JOSH_ID+1, "Friend")))
        worker = asyncio.create_task(self.bot.process_incoming_messages())
        try:
            with self.assertLogs("astrooo", level="ERROR"):
                await asyncio.wait_for(self.bot.incoming_messages.join(), 3)
            self.assertEqual(b.sent[0].clean_content, "second delivered")
            self.assertEqual(self.bot.complete.await_count, 2)
        finally:
            worker.cancel()
            await asyncio.gather(worker, return_exceptions=True)

    async def test_session_boundary_dm_priority_and_reset(self):
        ch, dm = channel(), channel(44, dm=True)
        for n in range(20):
            self.bot.message_log.save(message(START-100+n, dm, f"private {n}",
                                              person(BOT_ID, "AstroOo", True) if n % 2 else person()), BOT_ID)
        for n in range(10):
            previous = message(START-10+n, ch, f"old {n}")
            ch.items.append(previous)
            self.bot.message_log.save(previous, BOT_ID)
        current = message(START+1, ch, "ping")
        request = await self.bot.get_messages(current)
        self.assertIn("old 8", str(request))
        self.assertIn("old 9", str(request))
        self.assertNotIn("old 7", str(request))
        for n in range(10,20):
            self.assertIn(f"private {n}", str(request))
        self.assertNotIn("private 9", str(request))
        self.assertIn(str(JOSH_ID), str(request))
        self.assertIn("Our server", str(request))
        self.assertLess(len(self.bot.tokenizer.encode(str(request))), 10000)
        self.bot.reset_history(ch.id, START+1)
        self.assertIsNone(self.bot.message_log.session(ch.id))
        new = await self.bot.get_messages(message(START+2, ch, "fresh"))
        self.assertNotIn("old 9", str(new))
        self.assertNotIn("ping", str(new))

    async def test_image_three_turns_then_visual_description_audio_primer(self):
        ch = channel()
        attachment = SimpleNamespace(id=77, filename="picture.png", url="https://cdn.discordapp.com/attachments/22/77/picture.png",
                                     content_type="image/png", size=4, read=AsyncMock(return_value=b"fake"))
        for turn in range(4):
            current = message(START+turn+1, ch, f"image turn {turn}", attachments=[attachment] if turn == 0 else [])
            request = await self.bot.get_messages(current)
            if turn < 3:
                self.assertTrue(app.contains_image(request))
                self.assertNotIn("input_audio", str(request))
                self.bot.message_log.describe_image(self.bot.active_image_ids[0], "A red square on a white background.")
            else:
                self.assertFalse(app.contains_image(request))
                self.assertIn("input_audio", str(request))
                self.assertIn("A red square", str(request))
                self.assertIsNone(self.bot.message_log.images(self.bot.turn_window)[0]["raw"])
            self.bot.message_log.finish_turn(self.bot.turn_window, current.created_at.timestamp())
        attachment.read.assert_awaited_once()

    async def test_hidden_tools_executed_once_and_never_leak_into_audio(self):
        ch = channel()
        current = message(START+1, ch)
        self.bot.active_image_ids = []
        self.bot.execute_tool = AsyncMock(return_value="DM sent")
        directive = f'/tool[dm: "{JOSH_ID}":"yooo [help]"]'
        self.bot.complete = AsyncMock(side_effect=[app.Completion(directive, b"speech-with-tools"),
                                                  app.Completion("Sent. 🔥", b"clean-speech")])
        result = await self.bot.complete_with_tools([], current, audio_enabled=True)
        self.assertEqual(result.text, "Sent. 🔥")
        self.assertEqual(result.audio_wav, b"clean-speech")
        self.bot.execute_tool.assert_awaited_once()
        self.bot.complete = AsyncMock(return_value=app.Completion("hi " + directive, b"never-post"))
        result = await self.bot.complete_with_tools([], current, audio_enabled=True)
        self.assertEqual(result.text, "hi")
        self.assertIsNone(result.audio_wav)
        self.assertEqual(self.bot.execute_tool.await_count, 2)  # One execution for each distinct input turn.

    async def test_dm_tool_name_resolution_and_permissions(self):
        ch = channel()
        self.bot.turn_directory = {JOSH_ID: "Josh", JOSH_ID+1: "Friend"}
        dm = channel(44, dm=True)
        target = person(JOSH_ID+1, "Friend")
        target.send = dm.send
        self.bot.fetch_user = AsyncMock(return_value=target)
        text = await self.bot.execute_tool(ToolCall("dm", {"user_id": "Friend", "message": "yooo i need help"}), message(START+1, ch))
        self.assertIn("DM sent", text)
        self.assertEqual(dm.sent[0].clean_content, "yooo i need help")
        self.assertNotIn("/tool", dm.sent[0].clean_content)
        denied = await self.bot.execute_tool(ToolCall("dm", {"user_id": str(JOSH_ID), "message": "hello"}),
                                             message(START+2, ch, author=person(JOSH_ID+2, "Stranger")))
        self.assertIn("only Josh", denied)

    async def test_reactions_and_reply_quote(self):
        ch = channel()
        target = message(START+1, ch, "our original point", person(BOT_ID, "AstroOo", True))
        ch.items.append(target)
        self.bot.message_log.save(target, BOT_ID)
        self.bot.message_log.reaction(target.id, ch.id, JOSH_ID, "Josh", "🔥", True)
        self.bot.message_log.reaction(target.id, ch.id, JOSH_ID, "Josh", "🔥", True)
        target.reactions = [SimpleNamespace(emoji="🔥", count=1)]
        self.assertIn("🔥 ×1", self.bot.message_log.reaction_text(target.id))
        reply = message(START+2, ch, "exactly", reference=SimpleNamespace(message_id=target.id, resolved=target))
        request = await self.bot.get_messages(reply)
        self.assertIn("Replying to AstroOo: our original point", str(request))
        self.assertIn("Josh added 🔥", str(request))
        self.bot.message_log.reaction(target.id, ch.id, JOSH_ID, "Josh", "🔥", False)
        self.assertEqual(self.bot.message_log.reaction_text(target.id), "")
        target.reactions = [SimpleNamespace(emoji="❤️", count=1)]
        self.bot.message_log.save(target, BOT_ID)
        self.bot.message_log.reaction(target.id, ch.id, JOSH_ID, "Josh", "❤️", True, snapshot=True)
        self.assertIn("❤️ ×1", self.bot.message_log.reaction_text(target.id))

    async def test_command_rebuild_and_actual_model_payloads(self):
        names = {command.name for command in self.bot.tree.get_commands()}
        self.assertIn("Edit AstroOo message", names)
        self.assertIn("sync_astrooo", names)
        self.bot.tree.sync = AsyncMock(return_value=[1]*6)
        count = await self.bot.sync_commands(reset=True)
        self.assertEqual(count, 6)
        self.assertEqual(names, {command.name for command in self.bot.tree.get_commands()})
        payloads = []
        def post(url, **kwargs):
            payloads.append(kwargs["json"])
            content = json.dumps({"reply": "red", "image_notes": [{"asset_id": "asset", "description": "red square"}]}) if kwargs["json"]["model"] == "gpt-4.1" else "ok"
            response = SimpleNamespace(status=200, json=AsyncMock(return_value={"choices": [{"message": {"content": content}}]}))
            return MagicMock(__aenter__=AsyncMock(return_value=response), __aexit__=AsyncMock(return_value=False))
        self.bot.session = SimpleNamespace(post=post)
        self.bot.active_image_ids = ["asset"]
        vision = await self.bot.complete([{"role":"user","content":[{"type":"image_url","image_url":{"url":"test"}}]}], audio_enabled=True)
        self.assertEqual(vision.image_notes, {"asset":"red square"})
        self.assertNotIn("modalities", payloads[0])
        self.assertNotIn("input_audio", str(payloads[0]))
        await self.bot.complete(app.prepend_audio_primer([{"role":"user","content":"hello"}]))
        self.assertEqual(payloads[1]["model"], "gpt-audio")
        self.assertEqual(payloads[1]["modalities"], ["text"])
        self.assertEqual(payloads[1]["messages"][0]["content"][0]["type"], "input_audio")
        self.assertEqual(payloads[1]["max_completion_tokens"], 900)
        self.assertIs(payloads[1]["stream"], False)
        await self.bot.complete(app.prepend_audio_primer([{"role":"user","content":"hello"}]), audio_enabled=True)
        self.assertIs(payloads[2]["stream"], False)
        self.assertEqual(payloads[2]["modalities"], ["text", "audio"])
        self.assertEqual(payloads[2]["audio"], {"voice":"verse", "format":"wav"})

    async def test_token_ceiling_preserves_private_priority_current_and_primer(self):
        messages = [{"role":"system", "content":"Josh's last ten DMs stay here"},
                    {"role":"user", "content":"old detail " * 80000},
                    {"role":"user", "content":"current message"}]
        result = self.bot.fit_request_budget(app.prepend_audio_primer(messages))
        self.assertNotIn("old detail", str(result))
        self.assertIn("last ten DMs", str(result))
        self.assertIn("current message", str(result))
        self.assertEqual(result[1]["content"][0]["type"], "input_audio")


class ParserTests(unittest.TestCase):
    def test_streaming_wav_header_has_real_length(self):
        stream = io.BytesIO()
        with wave.open(stream, "wb") as wav:
            wav.setnchannels(1)
            wav.setsampwidth(2)
            wav.setframerate(24000)
            wav.writeframes(b"\x00\x00" * 2400)
        raw = bytearray(stream.getvalue())
        struct.pack_into("<I", raw, 4, 0xffffffff)
        struct.pack_into("<I", raw, 40, 0xffffffff)
        fixed = app.decode_output_audio(base64.b64encode(raw).decode())
        with wave.open(io.BytesIO(fixed)) as wav:
            self.assertEqual(wav.getnframes(), 2400)
            self.assertEqual(len(wav.readframes(2400)), 4800)

    def test_commands_always_hidden_including_malformed(self):
        for text in ['before /tool[dm: "1":"x"] after', 'before /tool[dm: "1":"x"', 'before /tool']:
            clean, calls = extract_tools(text)
            self.assertNotIn("/tool", clean)
            self.assertTrue(calls)
        clean, calls = extract_tools('/tool[dm: "749554072389943307":"hello [world] \\"friend\\""]🔥')
        self.assertEqual(clean, "🔥")
        self.assertEqual(calls[0].arguments["message"], 'hello [world] "friend"')
        self.assertEqual(discord_user_id(f"<@!{JOSH_ID}>"), JOSH_ID)
        self.assertIsNone(discord_user_id(f"{JOSH_ID}>"))


if __name__ == "__main__":
    unittest.main()
