import { BubbleColorThemePreset } from '../types';

export interface FontFamilyOption {
  id: string;
  name: string;
  family: string;
  category: 'Sans' | 'Mono' | 'Serif';
  previewText: string;
}

export const AVAILABLE_FONTS: FontFamilyOption[] = [
  {
    id: 'inter',
    name: 'Inter',
    family: '"Inter", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
    category: 'Sans',
    previewText: 'Aa The quick brown fox'
  },
  {
    id: 'jetbrains',
    name: 'JetBrains Mono',
    family: '"JetBrains Mono", ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
    category: 'Mono',
    previewText: '01 const result = fn();'
  },
  {
    id: 'fira',
    name: 'Fira Code',
    family: '"Fira Code", ui-monospace, Monaco, Consolas, monospace',
    category: 'Mono',
    previewText: '=> !== === => |>'
  },
  {
    id: 'plusjakarta',
    name: 'Plus Jakarta Sans',
    family: '"Plus Jakarta Sans", "Inter", sans-serif',
    category: 'Sans',
    previewText: 'Modern refined geometric'
  },
  {
    id: 'playfair',
    name: 'Playfair Display',
    family: '"Playfair Display", Georgia, Cambria, serif',
    category: 'Serif',
    previewText: 'Literary classical editorial'
  },
  {
    id: 'lora',
    name: 'Lora',
    family: '"Lora", Georgia, Cambria, serif',
    category: 'Serif',
    previewText: 'Contemporary reading serif'
  },
  {
    id: 'verdana',
    name: 'Verdana',
    family: 'Verdana, Geneva, sans-serif',
    category: 'Sans',
    previewText: 'Clear high-legibility sans'
  },
  {
    id: 'georgia',
    name: 'Georgia',
    family: 'Georgia, "Times New Roman", serif',
    category: 'Serif',
    previewText: 'Traditional warm serif'
  },
  {
    id: 'system',
    name: 'System UI',
    family: 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
    category: 'Sans',
    previewText: 'Native platform typeface'
  }
];

export const getFontFamilyCss = (fontId: string): string => {
  const font = AVAILABLE_FONTS.find(f => f.id === fontId);
  return font ? font.family : AVAILABLE_FONTS[0].family;
};

export const BUBBLE_THEME_PRESETS: BubbleColorThemePreset[] = [
  {
    id: 'violet_onyx',
    name: 'Violet & Onyx (Default)',
    userBg: '#3d0981',
    userBorder: '#5d1fa2',
    userText: '#e4e4e7',
    assistantBg: '#090a0e',
    assistantBorder: '#1e2029',
    assistantText: '#f4f4f5'
  },
  {
    id: 'bronze_charcoal',
    name: 'Bronze & Charcoal',
    userBg: '#362410',
    userBorder: '#66441e',
    userText: '#fce7cf',
    assistantBg: '#121214',
    assistantBorder: '#272522',
    assistantText: '#ede8df'
  },
  {
    id: 'emerald_cyber',
    name: 'Emerald Cyber',
    userBg: '#062e1d',
    userBorder: '#0d5f3c',
    userText: '#d1fae5',
    assistantBg: '#090d0b',
    assistantBorder: '#13241a',
    assistantText: '#ecfdf5'
  },
  {
    id: 'sapphire_slate',
    name: 'Sapphire & Slate',
    userBg: '#0f2b48',
    userBorder: '#1b497a',
    userText: '#e0f2fe',
    assistantBg: '#090d14',
    assistantBorder: '#172233',
    assistantText: '#f0f9ff'
  },
  {
    id: 'ruby_wine',
    name: 'Ruby Wine',
    userBg: '#3b0d1e',
    userBorder: '#6d1a37',
    userText: '#ffe4e6',
    assistantBg: '#0e090b',
    assistantBorder: '#281720',
    assistantText: '#fff1f2'
  },
  {
    id: 'minimal_graphite',
    name: 'Minimal Graphite',
    userBg: '#27272a',
    userBorder: '#3f3f46',
    userText: '#f4f4f5',
    assistantBg: '#111113',
    assistantBorder: '#222225',
    assistantText: '#e4e4e7'
  },
  {
    id: 'midnight_indigo',
    name: 'Midnight Indigo',
    userBg: '#1e1b4b',
    userBorder: '#3730a3',
    userText: '#e0e7ff',
    assistantBg: '#080811',
    assistantBorder: '#19192c',
    assistantText: '#eef2ff'
  },
  {
    id: 'forest_sage',
    name: 'Forest & Sage',
    userBg: '#1c2b20',
    userBorder: '#2e4735',
    userText: '#dcfce7',
    assistantBg: '#0a0d0a',
    assistantBorder: '#1c261e',
    assistantText: '#f0fdf4'
  }
];

export const QUICK_COLOR_SWATCHES = [
  // Deep/Rich Tones for Backgrounds
  '#3d0981', '#1e1b4b', '#0f2b48', '#062e1d', '#362410', '#3b0d1e', '#27272a', '#18181b', '#090a0e', '#000000',
  // Accent & Border Tones
  '#5d1fa2', '#3730a3', '#1b497a', '#0d5f3c', '#66441e', '#6d1a37', '#3f3f46', '#c2a472', '#10b981', '#38bdf8',
  // Light Text Tones
  '#ffffff', '#f4f4f5', '#e4e4e7', '#d4d4d8', '#fce7cf', '#d1fae5', '#e0f2fe', '#ffe4e6', '#e0e7ff', '#a1a1aa'
];

export const DEFAULT_CHAT_APPEARANCE = {
  fontFamily: 'inter',
  fontSize: 14,
  lineHeight: 1.6,
  bubbleMaxWidth: '88%',
  chatWidthMode: 'fluid' as const,
  userBubbleBg: '#3d0981',
  userBubbleBorder: '#5d1fa2',
  userBubbleText: '#e4e4e7',
  assistantBubbleBg: '#090a0e',
  assistantBubbleBorder: '#1e2029',
  assistantBubbleText: '#f4f4f5'
};

