export function isRealtimeModel(model: string) {
  return /^(?:openai\/)?(?:gpt-realtime(?:-|$)|gpt-4o(?:-mini)?-realtime(?:-|$))/i.test(model);
}

export function encodeMonoWav(channels: Float32Array[], sampleRate: number): ArrayBuffer {
  if (!channels.length || !channels[0].length) throw new Error('The recording is empty. Please try again.');
  const frames = channels[0].length;
  const buffer = new ArrayBuffer(44 + frames * 2);
  const view = new DataView(buffer);
  const label = (offset: number, text: string) => [...text].forEach((char, i) => view.setUint8(offset + i, char.charCodeAt(0)));
  label(0, 'RIFF'); view.setUint32(4, buffer.byteLength - 8, true); label(8, 'WAVE');
  label(12, 'fmt '); view.setUint32(16, 16, true); view.setUint16(20, 1, true);
  view.setUint16(22, 1, true); view.setUint32(24, sampleRate, true); view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true); view.setUint16(34, 16, true); label(36, 'data'); view.setUint32(40, frames * 2, true);
  for (let i = 0; i < frames; i++) {
    const value = Math.max(-1, Math.min(1, channels.reduce((sum, channel) => sum + channel[i], 0) / channels.length));
    view.setInt16(44 + i * 2, Math.round(value * (value < 0 ? 32768 : 32767)), true);
  }
  return buffer;
}

export async function audioToWav(blob: Blob) {
  const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
  if (!AudioContextClass) throw new Error('This browser cannot prepare voice clips. Try a current Safari or Chrome browser.');
  const context = new AudioContextClass();
  try {
    const decoded = await context.decodeAudioData(await blob.arrayBuffer());
    if (decoded.duration > 600) throw new Error('Please use an audio clip shorter than 10 minutes.');
    // Downmix and resample for compact, portable PCM WAV input.
    const offline = new OfflineAudioContext(1, Math.ceil(decoded.duration * 24000), 24000);
    const source = offline.createBufferSource(); source.buffer = decoded; source.connect(offline.destination); source.start();
    const rendered = await offline.startRendering();
    const wav = encodeMonoWav([rendered.getChannelData(0)], 24000);
    let binary = ''; const bytes = new Uint8Array(wav);
    for (let i = 0; i < bytes.length; i += 8192) binary += String.fromCharCode(...bytes.subarray(i, i + 8192));
    return { data: btoa(binary), format: 'wav', sample_rate: 24000, num_frames: rendered.length };
  } finally { await context.close(); }
}

export function microphoneError(error: unknown) {
  const name = error instanceof Error ? error.name : '';
  if (name === 'NotAllowedError') return 'Microphone access was denied. Allow it in your browser’s site settings, then try again.';
  if (name === 'NotFoundError') return 'No microphone was found. Connect one and try again.';
  if (name === 'NotReadableError') return 'The microphone is busy or unavailable. Close other recording apps and try again.';
  return error instanceof Error ? error.message : 'Could not access the microphone.';
}

export function requireMicrophone() {
  if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) {
    throw new Error('Microphone access needs HTTPS (or localhost). Open the secure version of this app on your phone.');
  }
}
