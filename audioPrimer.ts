// A short, quiet tone gives GPT Audio an audio input before any text in the chat.
const SAMPLE_RATE = 16000;
const DURATION_MS = 100;
const SAMPLE_COUNT = SAMPLE_RATE * DURATION_MS / 1000;

export function createAudioPrimerWavBase64(): string {
  const pcmBytes = SAMPLE_COUNT * 2;
  const wav = Buffer.alloc(44 + pcmBytes);
  wav.write('RIFF', 0, 'ascii');
  wav.writeUInt32LE(36 + pcmBytes, 4);
  wav.write('WAVE', 8, 'ascii');
  wav.write('fmt ', 12, 'ascii');
  wav.writeUInt32LE(16, 16);
  wav.writeUInt16LE(1, 20); // PCM
  wav.writeUInt16LE(1, 22); // mono
  wav.writeUInt32LE(SAMPLE_RATE, 24);
  wav.writeUInt32LE(SAMPLE_RATE * 2, 28);
  wav.writeUInt16LE(2, 32);
  wav.writeUInt16LE(16, 34);
  wav.write('data', 36, 'ascii');
  wav.writeUInt32LE(pcmBytes, 40);

  const fadeSamples = SAMPLE_RATE * 0.005;
  for (let index = 0; index < SAMPLE_COUNT; index++) {
    const fade = Math.min(1, index / fadeSamples, (SAMPLE_COUNT - 1 - index) / fadeSamples);
    const sample = Math.round(Math.sin(2 * Math.PI * 880 * index / SAMPLE_RATE) * 0.12 * fade * 32767);
    wav.writeInt16LE(sample, 44 + index * 2);
  }
  return wav.toString('base64');
}

export const AUDIO_PRIMER_WAV_BASE64 = createAudioPrimerWavBase64();

export function prependAudioPrimer(messages: any[]): any[] {
  const firstUserIndex = messages.findIndex(message => message?.role === 'user');
  if (firstUserIndex === -1) return messages;
  const firstUser = messages[firstUserIndex];
  const originalContent = Array.isArray(firstUser.content)
    ? firstUser.content
    : [{ type: 'text', text: String(firstUser.content || '') }];
  if (originalContent[0]?.type === 'input_audio' && originalContent[0]?.input_audio?.data === AUDIO_PRIMER_WAV_BASE64) {
    return messages;
  }
  const content = [
    { type: 'input_audio', input_audio: { data: AUDIO_PRIMER_WAV_BASE64, format: 'wav' } },
    ...originalContent,
  ];
  return messages.map((message, index) => index === firstUserIndex ? { ...firstUser, content } : message);
}
