/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Converts raw PCM16 base64 audio into a valid RIFF/WAV base64 data string.
 * OpenAI audio streaming returns raw 16-bit PCM little-endian at 24000 Hz (mono).
 */
export function convertPcm16Base64ToWavBase64(
  pcm16Base64: string,
  sampleRate = 24000,
  numChannels = 1
): string {
  if (!pcm16Base64 || typeof pcm16Base64 !== 'string') return '';

  try {
    // Strip any data URI prefix if present
    let cleanBase64 = pcm16Base64.replace(/^data:audio\/[a-zA-Z0-9]+;base64,/, '').trim();
    if (!cleanBase64) return '';

    // Pad to multiple of 4 if needed to prevent atob crashes on streaming chunk boundaries
    while (cleanBase64.length % 4 !== 0) {
      cleanBase64 += '=';
    }

    const binaryString = atob(cleanBase64);
    const pcmLength = binaryString.length;

    // Check if it already has a "RIFF" or "ID3" container header
    if (pcmLength >= 4) {
      const magic = binaryString.substring(0, 4);
      if (
        magic === 'RIFF' ||
        magic.startsWith('ID3') ||
        (binaryString.charCodeAt(0) === 0xff && (binaryString.charCodeAt(1) & 0xe0) === 0xe0)
      ) {
        // Already packaged in a container (WAV or MP3)
        return cleanBase64;
      }
    }

    const pcmBytes = new Uint8Array(pcmLength);
    for (let i = 0; i < pcmLength; i++) {
      pcmBytes[i] = binaryString.charCodeAt(i);
    }

    const headerLength = 44;
    const wavBuffer = new ArrayBuffer(headerLength + pcmLength);
    const view = new DataView(wavBuffer);

    // "RIFF"
    view.setUint32(0, 0x52494646, false);
    // Total file size - 8
    view.setUint32(4, 36 + pcmLength, true);
    // "WAVE"
    view.setUint32(8, 0x57415645, false);
    // "fmt "
    view.setUint32(12, 0x666d7420, false);
    // Subchunk1Size (16 for PCM)
    view.setUint32(16, 16, true);
    // AudioFormat (1 for PCM)
    view.setUint16(20, 1, true);
    // NumChannels
    view.setUint16(22, numChannels, true);
    // SampleRate
    view.setUint32(24, sampleRate, true);
    // ByteRate (SampleRate * NumChannels * BitsPerSample/8)
    view.setUint32(28, sampleRate * numChannels * 2, true);
    // BlockAlign (NumChannels * BitsPerSample/8)
    view.setUint16(32, numChannels * 2, true);
    // BitsPerSample
    view.setUint16(34, 16, true);
    // "data"
    view.setUint32(36, 0x64617461, false);
    // Subchunk2Size (data size)
    view.setUint32(40, pcmLength, true);

    // Copy PCM bytes after the 44-byte header
    new Uint8Array(wavBuffer, headerLength).set(pcmBytes);

    // Convert back to base64 in chunks to avoid call stack limits with large audio
    const wavBytes = new Uint8Array(wavBuffer);
    let binary = '';
    const chunkSize = 8192;
    for (let i = 0; i < wavBytes.length; i += chunkSize) {
      binary += String.fromCharCode.apply(null, Array.from(wavBytes.subarray(i, i + chunkSize)));
    }

    return btoa(binary);
  } catch (err) {
    console.warn('Failed to convert PCM16 to WAV:', err);
    return pcm16Base64;
  }
}
