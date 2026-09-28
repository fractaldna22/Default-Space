import React, { useState } from 'react';
import { ChatAppearanceSettings } from '../types';
import { AVAILABLE_FONTS, BUBBLE_THEME_PRESETS, QUICK_COLOR_SWATCHES } from '../utils/fontConstants';
import {
  Type,
  Maximize2,
  Minimize2,
  Sliders,
  RotateCcw,
  X,
  Check,
  Columns,
  Sparkles,
  AlignLeft,
  ChevronDown,
  Palette,
  User,
  Cpu,
  Paintbrush,
  Eye
} from 'lucide-react';

interface ChatSettingsToolbarProps {
  settings: ChatAppearanceSettings;
  onUpdateSettings: (newSettings: Partial<ChatAppearanceSettings>) => void;
  onResetSettings: () => void;
  leftSidebarWidth: number;
  rightSidebarWidth: number;
  onUpdateLeftSidebarWidth: (w: number) => void;
  onUpdateRightSidebarWidth: (w: number) => void;
  onResetSidebars: () => void;
  onClose: () => void;
}

interface ColorPickerRowProps {
  label: string;
  value: string;
  defaultVal: string;
  onChange: (val: string) => void;
  swatches?: string[];
}

const ColorPickerRow: React.FC<ColorPickerRowProps> = ({
  label,
  value,
  defaultVal,
  onChange,
  swatches = ['#3d0981', '#1e1b4b', '#0f2b48', '#062e1d', '#362410', '#3b0d1e', '#27272a', '#090a0e', '#5d1fa2', '#c2a472', '#10b981', '#ffffff']
}) => {
  const [inputValue, setInputValue] = useState(value);

  // Keep internal text state in sync if prop changes
  React.useEffect(() => {
    setInputValue(value);
  }, [value]);

  const handleTextBlur = () => {
    let formatted = inputValue.trim();
    if (!formatted.startsWith('#') && /^[0-9A-Fa-f]{6}$/.test(formatted)) {
      formatted = '#' + formatted;
    }
    if (/^#[0-9A-Fa-f]{6}$/.test(formatted) || /^#[0-9A-Fa-f]{3}$/.test(formatted)) {
      onChange(formatted);
    } else {
      setInputValue(value);
    }
  };

  return (
    <div className="space-y-1.5 bg-[#0b0b0d] p-2 rounded border border-[#1e1e22]">
      <div className="flex items-center justify-between">
        <span className="text-[10px] font-mono text-zinc-400 font-semibold uppercase">{label}</span>
        <div className="flex items-center gap-1.5">
          <div
            className="w-4 h-4 rounded-sm border border-zinc-700 shadow-sm shrink-0"
            style={{ backgroundColor: value }}
          />
          <input
            type="text"
            value={inputValue}
            onChange={(e) => {
              setInputValue(e.target.value);
              if (/^#[0-9A-Fa-f]{6}$/.test(e.target.value)) {
                onChange(e.target.value);
              }
            }}
            onBlur={handleTextBlur}
            placeholder="#000000"
            className="w-18 bg-[#141416] border border-[#27272a] focus:border-[#c2a472] rounded px-1.5 py-0.5 text-[10px] font-mono text-zinc-200 uppercase outline-none"
          />
          <label className="relative cursor-pointer p-1 rounded bg-[#18181b] border border-[#2b2b30] hover:border-[#c2a472] text-zinc-400 hover:text-white" title="Open visual color picker">
            <Paintbrush className="w-3 h-3 text-[#c2a472]" />
            <input
              type="color"
              value={value.startsWith('#') && value.length === 7 ? value : defaultVal}
              onChange={(e) => {
                setInputValue(e.target.value);
                onChange(e.target.value);
              }}
              className="sr-only"
            />
          </label>
        </div>
      </div>

      {/* Mini quick swatches */}
      <div className="flex flex-wrap gap-1 pt-0.5">
        {swatches.map((color, idx) => (
          <button
            key={idx}
            type="button"
            onClick={() => {
              setInputValue(color);
              onChange(color);
            }}
            className={`w-3.5 h-3.5 rounded-xs border cursor-pointer transition-transform hover:scale-110 ${
              value.toLowerCase() === color.toLowerCase()
                ? 'border-white ring-1 ring-white/50 scale-105'
                : 'border-black/50 hover:border-zinc-400'
            }`}
            style={{ backgroundColor: color }}
            title={color}
          />
        ))}
      </div>
    </div>
  );
};

export const ChatSettingsToolbar: React.FC<ChatSettingsToolbarProps> = ({
  settings,
  onUpdateSettings,
  onResetSettings,
  leftSidebarWidth,
  rightSidebarWidth,
  onUpdateLeftSidebarWidth,
  onUpdateRightSidebarWidth,
  onResetSidebars,
  onClose
}) => {
  const [activeTab, setActiveTab] = useState<'colors' | 'typography'>('colors');

  const fontSizes = [11, 12, 13, 14, 15, 16, 18, 20, 22];
  const chatModes = [
    { id: 'fluid', label: 'Fluid (100%)', desc: 'Fills entire stage' },
    { id: 'square', label: 'Square (680px)', desc: 'Compact centered' },
    { id: 'standard', label: 'Standard (860px)', desc: 'Balanced cockpit' },
    { id: 'wide', label: 'Wide (1100px)', desc: 'Spacious reading' }
  ] as const;

  const userBg = settings.userBubbleBg || '#3d0981';
  const userBorder = settings.userBubbleBorder || '#5d1fa2';
  const userText = settings.userBubbleText || '#e4e4e7';

  const assistantBg = settings.assistantBubbleBg || '#090a0e';
  const assistantBorder = settings.assistantBubbleBorder || '#1e2029';
  const assistantText = settings.assistantBubbleText || '#f4f4f5';

  const handleApplyTheme = (theme: typeof BUBBLE_THEME_PRESETS[0]) => {
    onUpdateSettings({
      userBubbleBg: theme.userBg,
      userBubbleBorder: theme.userBorder,
      userBubbleText: theme.userText,
      assistantBubbleBg: theme.assistantBg,
      assistantBubbleBorder: theme.assistantBorder,
      assistantBubbleText: theme.assistantText
    });
  };

  const handleResetColors = () => {
    onUpdateSettings({
      userBubbleBg: '#3d0981',
      userBubbleBorder: '#5d1fa2',
      userBubbleText: '#e4e4e7',
      assistantBubbleBg: '#090a0e',
      assistantBubbleBorder: '#1e2029',
      assistantBubbleText: '#f4f4f5'
    });
  };

  return (
    <div className="w-full bg-[#0e0e10] border-b border-[#1f1f23] p-4 lg:p-5 text-zinc-300 animate-slide-down shadow-2xl relative z-20">
      <div className="max-w-7xl mx-auto space-y-4">
        {/* Top bar with Tabs, title and close button */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-[#1b1b1e]">
          <div className="flex items-center gap-3">
            <div className="p-1.5 rounded bg-[#18181b] border border-[#27272a] text-[#c2a472]">
              <Palette className="w-4 h-4" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-xs font-bold text-white font-mono uppercase tracking-wider">
                  CHAT APPEARANCE & BUBBLE CUSTOMIZATION
                </h2>
                <span className="text-[10px] text-[#c2a472] px-1.5 py-0.5 rounded bg-[#c2a472]/10 border border-[#c2a472]/25 font-sans lowercase">
                  live preview
                </span>
              </div>
              <p className="text-[10px] text-zinc-500 font-sans">
                Customize bubble background, border & text colors for Pilot and AI messages, or choose curated theme palettes.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 self-end sm:self-auto">
            {/* Tab navigation switch */}
            <div className="flex items-center bg-[#141416] border border-[#27272a] rounded p-0.5">
              <button
                type="button"
                onClick={() => setActiveTab('colors')}
                className={`flex items-center gap-1.5 px-2.5 py-1 text-[10px] font-mono font-bold rounded transition-colors cursor-pointer ${
                  activeTab === 'colors'
                    ? 'bg-[#c2a472] text-black shadow-sm'
                    : 'text-zinc-400 hover:text-zinc-200'
                }`}
              >
                <Palette className="w-3 h-3" />
                <span>BUBBLE COLORS</span>
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('typography')}
                className={`flex items-center gap-1.5 px-2.5 py-1 text-[10px] font-mono font-bold rounded transition-colors cursor-pointer ${
                  activeTab === 'typography'
                    ? 'bg-[#c2a472] text-black shadow-sm'
                    : 'text-zinc-400 hover:text-zinc-200'
                }`}
              >
                <Type className="w-3 h-3" />
                <span>FONTS & STAGE</span>
              </button>
            </div>

            {activeTab === 'colors' ? (
              <button
                onClick={handleResetColors}
                className="flex items-center gap-1 px-2.5 py-1 text-[10px] font-mono font-bold text-zinc-400 hover:text-zinc-200 bg-[#161618] hover:bg-[#1f1f22] border border-[#27272a] rounded cursor-pointer transition-colors"
                title="Reset bubble colors to default (Violet & Onyx)"
              >
                <RotateCcw className="w-3 h-3 text-[#c2a472]" />
                <span className="hidden sm:inline">RESET COLORS</span>
              </button>
            ) : (
              <button
                onClick={onResetSettings}
                className="flex items-center gap-1 px-2.5 py-1 text-[10px] font-mono font-bold text-zinc-400 hover:text-zinc-200 bg-[#161618] hover:bg-[#1f1f22] border border-[#27272a] rounded cursor-pointer transition-colors"
                title="Reset typography to default (Inter 14px, 1.6 leading)"
              >
                <RotateCcw className="w-3 h-3 text-[#c2a472]" />
                <span className="hidden sm:inline">RESET FONTS</span>
              </button>
            )}

            <button
              onClick={onClose}
              className="p-1 text-zinc-400 hover:text-white rounded bg-[#161618] hover:bg-[#222] border border-[#27272a] transition-colors cursor-pointer"
              title="Close settings toolbar"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* TAB 1: BUBBLE COLORS & THEMES */}
        {activeTab === 'colors' && (
          <div className="space-y-4">
            {/* Curated Theme Palettes */}
            <div className="bg-[#121214] p-3.5 rounded-sm border border-[#1e1e22] space-y-2">
              <div className="flex items-center justify-between">
                <label className="text-[10px] font-mono font-bold text-zinc-300 uppercase tracking-wider flex items-center gap-1.5">
                  <Sparkles className="w-3.5 h-3.5 text-[#c2a472]" />
                  <span>CURATED COLOR THEMES</span>
                </label>
                <span className="text-[9px] font-mono text-zinc-500">1-CLICK PRESETS</span>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-2">
                {BUBBLE_THEME_PRESETS.map((theme) => {
                  const isActive =
                    userBg.toLowerCase() === theme.userBg.toLowerCase() &&
                    assistantBg.toLowerCase() === theme.assistantBg.toLowerCase();

                  return (
                    <button
                      key={theme.id}
                      type="button"
                      onClick={() => handleApplyTheme(theme)}
                      className={`p-2 rounded text-left transition-all border flex flex-col gap-1.5 cursor-pointer ${
                        isActive
                          ? 'bg-[#c2a472]/15 border-[#c2a472] ring-1 ring-[#c2a472]/30 text-white'
                          : 'bg-[#0b0b0c] border-[#1f1f22] text-zinc-400 hover:text-zinc-200 hover:border-zinc-700'
                      }`}
                    >
                      <div className="flex items-center justify-between w-full">
                        <span className="text-[10px] font-mono font-bold truncate">{theme.name.split('(')[0]}</span>
                        {isActive && <Check className="w-3 h-3 text-[#c2a472] shrink-0" />}
                      </div>

                      {/* Mini visual split pill showing User & Assistant colors */}
                      <div className="flex items-center h-4 w-full rounded-xs overflow-hidden border border-zinc-700">
                        <div
                          className="h-full flex-1"
                          style={{ backgroundColor: theme.userBg }}
                          title={`User: ${theme.userBg}`}
                        />
                        <div
                          className="h-full flex-1"
                          style={{ backgroundColor: theme.assistantBg }}
                          title={`AI: ${theme.assistantBg}`}
                        />
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* 3-Column Detailed Customization: User Bubble, Assistant Bubble, Live Preview */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-left">
              {/* User Bubble Customizer */}
              <div className="bg-[#121214] p-3.5 rounded-sm border border-[#1e1e22] space-y-3">
                <div className="flex items-center justify-between border-b border-[#1f1f23] pb-2">
                  <label className="text-[10px] font-mono font-bold text-zinc-300 uppercase tracking-wider flex items-center gap-1.5">
                    <User className="w-3.5 h-3.5 text-[#c2a472]" />
                    <span>USER (PILOT) BUBBLE</span>
                  </label>
                  <span
                    className="w-3 h-3 rounded-full border border-zinc-600"
                    style={{ backgroundColor: userBg }}
                  />
                </div>

                <ColorPickerRow
                  label="Background Color"
                  value={userBg}
                  defaultVal="#3d0981"
                  onChange={(val) => onUpdateSettings({ userBubbleBg: val })}
                  swatches={['#3d0981', '#1e1b4b', '#0f2b48', '#062e1d', '#362410', '#3b0d1e', '#27272a', '#18181b', '#000000', '#2d3748']}
                />

                <ColorPickerRow
                  label="Border Color"
                  value={userBorder}
                  defaultVal="#5d1fa2"
                  onChange={(val) => onUpdateSettings({ userBubbleBorder: val })}
                  swatches={['#5d1fa2', '#3730a3', '#1b497a', '#0d5f3c', '#66441e', '#6d1a37', '#3f3f46', '#c2a472', '#10b981', '#4b5563']}
                />

                <ColorPickerRow
                  label="Text Color"
                  value={userText}
                  defaultVal="#e4e4e7"
                  onChange={(val) => onUpdateSettings({ userBubbleText: val })}
                  swatches={['#ffffff', '#f4f4f5', '#e4e4e7', '#fce7cf', '#d1fae5', '#e0f2fe', '#ffe4e6', '#e0e7ff', '#a1a1aa', '#71717a']}
                />
              </div>

              {/* Assistant Bubble Customizer */}
              <div className="bg-[#121214] p-3.5 rounded-sm border border-[#1e1e22] space-y-3">
                <div className="flex items-center justify-between border-b border-[#1f1f23] pb-2">
                  <label className="text-[10px] font-mono font-bold text-zinc-300 uppercase tracking-wider flex items-center gap-1.5">
                    <Cpu className="w-3.5 h-3.5 text-emerald-400" />
                    <span>ASSISTANT (AI) BUBBLE</span>
                  </label>
                  <span
                    className="w-3 h-3 rounded-full border border-zinc-600"
                    style={{ backgroundColor: assistantBg }}
                  />
                </div>

                <ColorPickerRow
                  label="Background Color"
                  value={assistantBg}
                  defaultVal="#090a0e"
                  onChange={(val) => onUpdateSettings({ assistantBubbleBg: val })}
                  swatches={['#090a0e', '#111113', '#080811', '#090d14', '#090d0b', '#121214', '#0e090b', '#18181b', '#000000', '#1a202c']}
                />

                <ColorPickerRow
                  label="Border Color"
                  value={assistantBorder}
                  defaultVal="#1e2029"
                  onChange={(val) => onUpdateSettings({ assistantBubbleBorder: val })}
                  swatches={['#1e2029', '#27272a', '#19192c', '#172233', '#13241a', '#272522', '#281720', '#3f3f46', '#c2a472', '#2d3748']}
                />

                <ColorPickerRow
                  label="Text Color"
                  value={assistantText}
                  defaultVal="#f4f4f5"
                  onChange={(val) => onUpdateSettings({ assistantBubbleText: val })}
                  swatches={['#ffffff', '#f4f4f5', '#e4e4e7', '#ede8df', '#ecfdf5', '#f0f9ff', '#fff1f2', '#eef2ff', '#d4d4d8', '#a1a1aa']}
                />
              </div>

              {/* Live Preview Box */}
              <div className="bg-[#121214] p-3.5 rounded-sm border border-[#1e1e22] flex flex-col justify-between space-y-2.5">
                <div className="flex items-center justify-between border-b border-[#1f1f23] pb-2">
                  <label className="text-[10px] font-mono font-bold text-zinc-300 uppercase tracking-wider flex items-center gap-1.5">
                    <Eye className="w-3.5 h-3.5 text-[#c2a472]" />
                    <span>REAL-TIME BUBBLE PREVIEW</span>
                  </label>
                  <span className="text-[9px] font-mono text-[#c2a472]">SIMULATION</span>
                </div>

                <div className="space-y-2.5 p-3 rounded bg-[#09090b] border border-[#1b1b1e] flex-1 flex flex-col justify-center">
                  {/* Mock User Message */}
                  <div className="flex flex-col items-end gap-1">
                    <span className="text-[8px] font-mono text-zinc-500 uppercase flex items-center gap-1">
                      <span>PILOT</span>
                      <User className="w-2 h-2" />
                    </span>
                    <div
                      className="rounded-sm p-2.5 text-xs border shadow-sm max-w-[90%] transition-colors"
                      style={{
                        backgroundColor: userBg,
                        borderColor: userBorder,
                        color: userText,
                        fontSize: `${Math.max(11, settings.fontSize - 1)}px`,
                        lineHeight: settings.lineHeight
                      }}
                    >
                      How do the custom bubble colors look in the thread?
                    </div>
                  </div>

                  {/* Mock Assistant Message */}
                  <div className="flex flex-col items-start gap-1">
                    <span className="text-[8px] font-mono text-emerald-500 uppercase flex items-center gap-1">
                      <Cpu className="w-2 h-2" />
                      <span>ASSISTANT</span>
                    </span>
                    <div
                      className="rounded-sm p-2.5 text-xs border shadow-sm max-w-[90%] transition-colors"
                      style={{
                        backgroundColor: assistantBg,
                        borderColor: assistantBorder,
                        color: assistantText,
                        fontSize: `${Math.max(11, settings.fontSize - 1)}px`,
                        lineHeight: settings.lineHeight
                      }}
                    >
                      Crystal clear! All background, border, and typography colors update seamlessly in real time.
                    </div>
                  </div>
                </div>

                <div className="text-[9px] font-mono text-zinc-500 text-center">
                  Changes persist automatically to your local browser storage.
                </div>
              </div>
            </div>
          </div>
        )}

        {/* TAB 2: TYPOGRAPHY, GEOMETRY & SIDEBARS */}
        {activeTab === 'typography' && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 lg:gap-6 text-left">
            {/* Column 1: Font Family Selector */}
            <div className="space-y-2 bg-[#121214] p-3.5 rounded-sm border border-[#1e1e22]">
              <div className="flex items-center justify-between">
                <label className="text-[10px] font-mono font-bold text-zinc-300 uppercase tracking-wider flex items-center gap-1.5">
                  <Type className="w-3.5 h-3.5 text-[#c2a472]" />
                  <span>TYPEFACE / FONT FAMILY</span>
                </label>
                <span className="text-[9px] font-mono text-zinc-500 uppercase">
                  {AVAILABLE_FONTS.find(f => f.id === settings.fontFamily)?.category || 'Sans'}
                </span>
              </div>

              <div className="grid grid-cols-2 gap-1.5 max-h-[160px] overflow-y-auto pr-1">
                {AVAILABLE_FONTS.map(font => {
                  const isSelected = settings.fontFamily === font.id;
                  return (
                    <button
                      key={font.id}
                      onClick={() => onUpdateSettings({ fontFamily: font.id })}
                      style={{ fontFamily: font.family }}
                      className={`flex flex-col items-start p-2 rounded text-left transition-all border cursor-pointer ${
                        isSelected
                          ? 'bg-[#c2a472]/15 border-[#c2a472] text-white shadow-sm'
                          : 'bg-[#0b0b0c] border-[#1f1f22] text-zinc-400 hover:text-zinc-200 hover:border-zinc-700'
                      }`}
                    >
                      <div className="flex items-center justify-between w-full">
                        <span className="text-xs font-semibold truncate">{font.name}</span>
                        {isSelected && <Check className="w-3 h-3 text-[#c2a472] shrink-0" />}
                      </div>
                      <span className="text-[9px] text-zinc-500 truncate w-full mt-0.5 opacity-80 font-sans">
                        {font.previewText}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Column 2: Font Size & Leading */}
            <div className="space-y-3.5 bg-[#121214] p-3.5 rounded-sm border border-[#1e1e22]">
              {/* Font Size */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <label className="text-[10px] font-mono font-bold text-zinc-300 uppercase tracking-wider flex items-center gap-1.5">
                    <span>FONT SIZE</span>
                  </label>
                  <span className="text-xs font-mono font-bold text-[#c2a472] bg-[#c2a472]/10 px-2 py-0.5 rounded border border-[#c2a472]/30">
                    {settings.fontSize}px
                  </span>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    onClick={() => onUpdateSettings({ fontSize: Math.max(11, settings.fontSize - 1) })}
                    disabled={settings.fontSize <= 11}
                    className="w-8 h-7 flex items-center justify-center rounded bg-[#18181b] border border-[#27272a] text-zinc-300 hover:text-white hover:border-[#c2a472] font-mono text-xs disabled:opacity-40 cursor-pointer"
                    title="Decrease font size"
                  >
                    A-
                  </button>

                  <input
                    type="range"
                    min="11"
                    max="24"
                    step="1"
                    value={settings.fontSize}
                    onChange={(e) => onUpdateSettings({ fontSize: Number(e.target.value) })}
                    className="flex-1 accent-[#c2a472] cursor-pointer h-1.5 bg-[#1f1f23] rounded-lg"
                  />

                  <button
                    onClick={() => onUpdateSettings({ fontSize: Math.min(24, settings.fontSize + 1) })}
                    disabled={settings.fontSize >= 24}
                    className="w-8 h-7 flex items-center justify-center rounded bg-[#18181b] border border-[#27272a] text-zinc-300 hover:text-white hover:border-[#c2a472] font-mono text-xs disabled:opacity-40 cursor-pointer"
                    title="Increase font size"
                  >
                    A+
                  </button>
                </div>

                {/* Quick preset buttons */}
                <div className="flex flex-wrap gap-1 pt-1">
                  {fontSizes.map(sz => (
                    <button
                      key={sz}
                      onClick={() => onUpdateSettings({ fontSize: sz })}
                      className={`px-2 py-0.5 rounded text-[10px] font-mono transition-all cursor-pointer ${
                        settings.fontSize === sz
                          ? 'bg-[#c2a472] text-black font-extrabold shadow-sm'
                          : 'bg-[#18181b] text-zinc-400 hover:text-zinc-200 border border-[#27272a]'
                      }`}
                    >
                      {sz}px
                    </button>
                  ))}
                </div>
              </div>

              {/* Line Height Multiplier */}
              <div className="space-y-1.5 pt-2 border-t border-[#1b1b1e]">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-mono font-bold text-zinc-400 uppercase tracking-wider">
                    LINE SPACING (LEADING)
                  </span>
                  <span className="text-[10px] font-mono text-[#c2a472]">
                    {settings.lineHeight}x
                  </span>
                </div>
                <div className="grid grid-cols-3 gap-1.5">
                  {[
                    { label: 'Compact', value: 1.4 },
                    { label: 'Standard', value: 1.6 },
                    { label: 'Spacious', value: 1.85 }
                  ].map(lh => (
                    <button
                      key={lh.value}
                      onClick={() => onUpdateSettings({ lineHeight: lh.value })}
                      className={`py-1 px-1.5 rounded text-[10px] font-mono text-center transition-all cursor-pointer ${
                        settings.lineHeight === lh.value
                          ? 'bg-[#c2a472]/20 border border-[#c2a472] text-[#c2a472] font-bold'
                          : 'bg-[#18181b] text-zinc-400 hover:text-zinc-200 border border-[#27272a]'
                      }`}
                    >
                      {lh.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Column 3: Chat Framing, Widths & Sidebars Flex Controls */}
            <div className="space-y-3.5 bg-[#121214] p-3.5 rounded-sm border border-[#1e1e22]">
              {/* Chat Max Width Constraint */}
              <div className="space-y-1.5">
                <label className="text-[10px] font-mono font-bold text-zinc-300 uppercase tracking-wider flex items-center justify-between">
                  <span className="flex items-center gap-1.5">
                    <Columns className="w-3.5 h-3.5 text-[#c2a472]" />
                    <span>CHAT STAGE FRAMING</span>
                  </span>
                  <span className="text-[9px] font-mono text-[#c2a472] uppercase">
                    {settings.chatWidthMode}
                  </span>
                </label>

                <div className="grid grid-cols-2 gap-1.5">
                  {chatModes.map(mode => (
                    <button
                      key={mode.id}
                      onClick={() => onUpdateSettings({ chatWidthMode: mode.id })}
                      className={`p-1.5 rounded text-left transition-all border cursor-pointer ${
                        settings.chatWidthMode === mode.id
                          ? 'bg-[#c2a472]/15 border-[#c2a472] text-white font-bold'
                          : 'bg-[#0b0b0c] border-[#1f1f22] text-zinc-400 hover:text-zinc-200'
                      }`}
                    >
                      <div className="text-[10px] font-mono font-bold truncate">{mode.label}</div>
                      <div className="text-[8px] text-zinc-500 truncate">{mode.desc}</div>
                    </button>
                  ))}
                </div>
              </div>

              {/* Sidebar Width Sliders */}
              <div className="space-y-2 pt-2 border-t border-[#1b1b1e]">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-mono font-bold text-zinc-400 uppercase tracking-wider">
                    SIDEBAR FLEX WIDTHS
                  </span>
                  <button
                    onClick={onResetSidebars}
                    className="text-[9px] font-mono text-[#c2a472] hover:underline cursor-pointer"
                    title="Reset both sidebars to default widths"
                  >
                    Reset (320 / 340px)
                  </button>
                </div>

                {/* Left Sidebar Slider */}
                <div className="space-y-1">
                  <div className="flex justify-between text-[9px] font-mono text-zinc-400">
                    <span>Left Navigator:</span>
                    <span className="text-[#c2a472] font-bold">{leftSidebarWidth}px</span>
                  </div>
                  <input
                    type="range"
                    min="220"
                    max="650"
                    step="5"
                    value={leftSidebarWidth}
                    onChange={(e) => onUpdateLeftSidebarWidth(Number(e.target.value))}
                    className="w-full accent-[#c2a472] cursor-pointer h-1 bg-[#1f1f23] rounded-lg"
                  />
                </div>

                {/* Right Sidebar Slider */}
                <div className="space-y-1">
                  <div className="flex justify-between text-[9px] font-mono text-zinc-400">
                    <span>Right Utilities:</span>
                    <span className="text-[#c2a472] font-bold">{rightSidebarWidth}px</span>
                  </div>
                  <input
                    type="range"
                    min="240"
                    max="650"
                    step="5"
                    value={rightSidebarWidth}
                    onChange={(e) => onUpdateRightSidebarWidth(Number(e.target.value))}
                    className="w-full accent-[#c2a472] cursor-pointer h-1 bg-[#1f1f23] rounded-lg"
                  />
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

