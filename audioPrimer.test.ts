import { test } from 'node:test';
import assert from 'node:assert/strict';
import { AUDIO_PRIMER_WAV_BASE64, prependAudioPrimer } from './audioPrimer';

test('primer is a 100 ms mono PCM WAV containing an audible tone', () => {
  const wav = Buffer.from(AUDIO_PRIMER_WAV_BASE64, 'base64');
  assert.equal(wav.toString('ascii', 0, 4), 'RIFF');
  assert.equal(wav.toString('ascii', 8, 12), 'WAVE');
  assert.equal(wav.readUInt16LE(20), 1);
  assert.equal(wav.readUInt16LE(22), 1);
  assert.equal(wav.readUInt32LE(24), 16000);
  assert.equal(wav.readUInt16LE(34), 16);
  assert.equal(wav.readUInt32LE(40), 3200);
  assert.equal(wav.length, 3244);
  assert.ok(wav.subarray(44).some(byte => byte !== 0));
});

test('primer is the first block in the first user turn, before text and later turns', () => {
  const messages = [
    { role: 'system', content: 'Instructions' },
    { role: 'user', content: 'Hello' },
    { role: 'assistant', content: 'Hi' },
    { role: 'user', content: 'Again' },
  ];
  const primed = prependAudioPrimer(messages);
  assert.deepEqual(primed[1].content[0], {
    type: 'input_audio', input_audio: { data: AUDIO_PRIMER_WAV_BASE64, format: 'wav' },
  });
  assert.deepEqual(primed[1].content[1], { type: 'text', text: 'Hello' });
  assert.equal(primed[3], messages[3]);
  assert.equal(messages[1].content, 'Hello');
});

test('primer preserves an existing audio attachment and is idempotent', () => {
  const existingAudio = { type: 'input_audio', input_audio: { data: 'existing', format: 'wav' } };
  const messages = [{ role: 'user', content: [existingAudio, { type: 'text', text: 'Listen' }] }];
  const primed = prependAudioPrimer(messages);
  assert.equal(primed[0].content[1], existingAudio);
  assert.equal(prependAudioPrimer(primed), primed);
});
