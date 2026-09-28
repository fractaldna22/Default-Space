// Keep these as static asset URLs so Vite emits small, cacheable image files.
const modelIcons: Record<string, string> = {
  'chatgpt-4o-latest': new URL('../icons/chatgpt-4o-latest.png', import.meta.url).href,
  'gpt-4.1': new URL('../icons/gpt-4.1.png', import.meta.url).href,
  'gpt-4o': new URL('../icons/gpt-4o.png', import.meta.url).href,
  'gpt-4o-audio-preview': new URL('../icons/gpt-4o-audio-preview.png', import.meta.url).href,
  'gpt-4o-realtime-preview': new URL('../icons/gpt-4o-realtime-preview.png', import.meta.url).href,
  'gpt-audio': new URL('../icons/gpt-audio.png', import.meta.url).href,
  'gpt-audio-1.5': new URL('../icons/gpt-audio-1.5.png', import.meta.url).href,
  'gpt-image-1': new URL('../icons/gpt-image-1.png', import.meta.url).href,
  'gpt-image-2': new URL('../icons/gpt-image-2.png', import.meta.url).href,
  'gpt-live-1': new URL('../icons/gpt-live-1.png', import.meta.url).href,
  'gpt-realtime': new URL('../icons/gpt-realtime.png', import.meta.url).href,
  'gpt-realtime-2': new URL('../icons/gpt-realtime-2.png', import.meta.url).href,
  'gpt-realtime-2.1': new URL('../icons/gpt-realtime-2.1.png', import.meta.url).href,
};

export function getModelIcon(id: string): string | undefined {
  const slug = id.split('/').pop()?.toLowerCase() || '';
  // Dated snapshots share their base model's icon; mini variants keep their own badge.
  return modelIcons[slug] || modelIcons[slug.replace(/-20\d{2}-\d{2}-\d{2}$/, '')];
}
