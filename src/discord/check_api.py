"""Small live API smoke check; does not connect to Discord or message anyone."""
import asyncio
import base64
import io
import struct
import wave
import zlib

import aiohttp
import bot


def red_square_png():
    def chunk(kind, body):
        return struct.pack(">I", len(body)) + kind + body + struct.pack(">I", zlib.crc32(kind + body))
    pixels = b"".join(b"\x00" + b"\xff\x00\x00" * 16 for _ in range(16))
    return (b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", struct.pack(">IIBBBBB",16,16,8,2,0,0,0))
            + chunk(b"IDAT", zlib.compress(pixels)) + chunk(b"IEND", b""))


async def main():
    bot.load_local_env()
    client = bot.AstroOoBot()
    client.active_image_ids = ["smoke-image"]
    try:
        async with aiohttp.ClientSession(timeout=aiohttp.ClientTimeout(total=90)) as session:
            client.session = session
            visual = await client.complete([
                {"role":"system","content":"Reply briefly. Provide a factual visual description for asset_id=smoke-image."},
                {"role":"user","content":[{"type":"text","text":"What color is this square?"},
                 {"type":"image_url","image_url":{"url":"data:image/png;base64," + base64.b64encode(red_square_png()).decode()}}]}])
            assert visual.image_notes and "smoke-image" in visual.image_notes
            assert "red" in visual.image_notes["smoke-image"].lower()
            assert visual.audio_wav is None
            print("GPT-4.1: image request and private visual description passed; no audio primer/output.")
            voice = await client.complete(bot.prepend_audio_primer([
                {"role":"system","content":"Briefly answer using this earlier visual description: " + visual.image_notes["smoke-image"]},
                {"role":"user","content":"What color was the square? Answer in one short sentence."}]), audio_enabled=True)
            assert voice.audio_wav and len(voice.audio_wav) > 44
            assert "red" in voice.text.lower()
            with wave.open(io.BytesIO(voice.audio_wav)) as audio:
                print(f"GPT Audio: retained description, 100 ms primer and Verse WAV passed ({audio.getnframes()} frames).")
    finally:
        client.message_log.connection.close()


if __name__ == "__main__":
    asyncio.run(main())
