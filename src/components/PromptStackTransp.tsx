import React, { memo, useState, useEffect, useRef, useCallback } from 'react';
import { PromptStackLayer } from '../types';
import { Eye, EyeOff, Layers, ShieldCheck, Cpu, Database, FileText, Copy, Check } from 'lucide-react';
import { copyToClipboard, escapeHtml } from '../utils/clipboardUtils';

interface PromptStackTranspProps {
  layers: PromptStackLayer[];
  onToggleLayer: (index: number) => void;
  onEditLayerContent?: (index: number, newContent: string) => void;
  totalCharacters: number;
  modelName: string;
  temperature: number;
  top_p: number;
}

const EditableLayerTextarea: React.FC<{
  content: string;
  onSave: (val: string) => void;
  placeholder?: string;
}> = ({ content, onSave, placeholder }) => {
  const [localText, setLocalText] = useState(content);
  const isFocusedRef = useRef(false);
  const debounceTimerRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    if (!isFocusedRef.current) {
      setLocalText(content);
    }
  }, [content]);

  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const val = e.target.value;
    setLocalText(val);
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }
    debounceTimerRef.current = setTimeout(() => {
      onSave(val);
    }, 400);
  };

  const handleBlur = () => {
    isFocusedRef.current = false;
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }
    if (localText !== content) {
      onSave(localText);
    }
  };

  return (
    <textarea
      value={localText}
      onFocus={() => { isFocusedRef.current = true; }}
      onChange={handleChange}
      onBlur={handleBlur}
      className="w-full bg-[#151517] border border-[#222] rounded-sm p-2 text-zinc-300 font-mono text-[11px] min-h-[96px] max-h-[240px] focus:outline-none focus:border-[#c2a472] resize-y overflow-y-auto custom-scrollbar"
      placeholder={placeholder || "Enter layer layout..."}
    />
  );
};

export const PromptStackTransp: React.FC<PromptStackTranspProps> = memo(({
  layers,
  onToggleLayer,
  onEditLayerContent,
  totalCharacters,
  modelName,
  temperature,
  top_p,
}) => {
  const [copiedLayerIdx, setCopiedLayerIdx] = useState<number | null>(null);
  const [copiedAll, setCopiedAll] = useState(false);

  const getIcon = (type: string) => {
    switch (type) {
      case 'system':
        return <Cpu className="w-4 h-4 text-[#c2a472]" />;
      case 'space':
        return <FileText className="w-4 h-4 text-[#c2a472]/85" />;
      case 'memory':
        return <Database className="w-4 h-4 text-[#c2a472]/65" />;
      case 'history':
        return <Layers className="w-4 h-4 text-[#c2a472]/45" />;
      default:
        return <ShieldCheck className="w-4 h-4 text-[#c2a472]/80" />;
    }
  };

  const getTypeLabel = (type: string) => {
    switch (type) {
      case 'system': return 'SYS-COGNITIVE';
      case 'space': return 'SPACE-CONTEXT';
      case 'memory': return 'MEMORIES';
      case 'history': return 'THREAD-CONTINUITY';
      default: return 'USER-INPUT';
    }
  };

  // Intercept any manual selection copy inside the Prompt Stack so that 100% of line breaks and empty lines are preserved
  const handleContainerCopy = useCallback((e: React.ClipboardEvent<HTMLDivElement>) => {
    const selection = window.getSelection();
    if (!selection || selection.isCollapsed || selection.rangeCount === 0) return;

    const rawSelectedText = selection.toString();
    if (!rawSelectedText) return;

    // Strictly preserve all line breaks, empty lines, and indentation untouched
    const cleanPlainText = rawSelectedText.replace(/\r\n/g, '\n');
    const richHtml = `<div style="font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace; font-size: 11px; line-height: 1.5; color: inherit;">${escapeHtml(cleanPlainText).replace(/\n/g, '<br>')}</div>`;

    e.preventDefault();
    if (e.clipboardData) {
      e.clipboardData.setData('text/html', richHtml);
      e.clipboardData.setData('text/plain', cleanPlainText);
    }
  }, []);

  const handleCopyLayer = useCallback(async (idx: number, layer: PromptStackLayer) => {
    const content = layer.content || '';
    if (!content) return;
    const cleanText = content.replace(/\r\n/g, '\n');
    const richHtml = `<div style="font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace; font-size: 11px; line-height: 1.5; color: inherit;">${escapeHtml(cleanText).replace(/\n/g, '<br>')}</div>`;
    const success = await copyToClipboard(richHtml, cleanText);
    if (success) {
      setCopiedLayerIdx(idx);
      setTimeout(() => setCopiedLayerIdx(null), 2000);
    }
  }, []);

  const handleCopyAllLayers = useCallback(async () => {
    const activeLayers = layers.filter(l => l.active && l.content);
    if (activeLayers.length === 0) return;

    const textParts = activeLayers.map(l => {
      const typeLabel = getTypeLabel(l.type);
      return `=== [${typeLabel}] ${l.name} ===\n${l.content.replace(/\r\n/g, '\n')}`;
    });

    const fullPlainText = textParts.join('\n\n');
    const fullRichHtml = `<div style="font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace; font-size: 11px; line-height: 1.5; color: inherit;">${escapeHtml(fullPlainText).replace(/\n/g, '<br>')}</div>`;

    const success = await copyToClipboard(fullRichHtml, fullPlainText);
    if (success) {
      setCopiedAll(true);
      setTimeout(() => setCopiedAll(false), 2000);
    }
  }, [layers]);

  return (
    <div 
      onCopy={handleContainerCopy}
      className="bg-transparent flex flex-col h-full min-h-0 font-mono text-xs text-zinc-400 text-left"
    >
      <div className="flex flex-col sm:flex-row sm:items-center justify-between border-b border-[#1a1a1c] pb-3 mb-4 gap-2">
        <div className="flex items-center gap-2">
          <Layers className="w-4 h-4 text-[#c2a472] animate-pulse" />
          <span className="font-sans font-bold text-zinc-200 tracking-tight text-sm">PROMPT STACK DETECTOR</span>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleCopyAllLayers}
            className="flex items-center gap-1 text-[10px] font-mono font-bold text-[#c2a472] hover:text-[#d3b684] bg-[#151517] hover:bg-[#1c1c1f] px-2 py-1 rounded-sm border border-[#27272a] transition-all cursor-pointer shadow-sm active:scale-95"
            title="Copy entire active prompt stack with all line breaks and empty lines strictly preserved"
          >
            {copiedAll ? (
              <>
                <Check className="w-3 h-3 text-emerald-400" />
                <span className="text-emerald-400">STACK COPIED</span>
              </>
            ) : (
              <>
                <Copy className="w-3 h-3 text-[#c2a472]" />
                <span>COPY FULL STACK</span>
              </>
            )}
          </button>
          <div className="flex items-center gap-1.5 text-[10px] text-zinc-500 bg-[#0a0a0b] px-2.5 py-1 rounded-sm border border-[#222]">
            <span>LEN: <span className="text-[#c2a472] font-bold">{totalCharacters}</span></span>
            <span className="text-zinc-800">|</span>
            <span>TEMP: <span className="text-[#c2a472] font-bold">{temperature}</span></span>
            <span className="text-zinc-800">|</span>
            <span>TOP_P: <span className="text-[#c2a472] font-bold">{top_p}</span></span>
          </div>
        </div>
      </div>

      <p className="text-[11px] font-sans text-zinc-500 mb-4 leading-normal text-left">
        Raw structural context prior to server execution. Exclude individual compilers manually using the monitor switch controls.
      </p>

      <div className="flex-1 min-h-0 overflow-y-auto space-y-3 pr-2 custom-scrollbar">
        {layers.map((layer, idx) => (
          <div
            key={idx}
            className={`border rounded-sm transition-all ${
              layer.active
                ? 'border-[#222] bg-[#151517]'
                : 'border-[#1a1a1c]/60 bg-transparent opacity-40'
            }`}
          >
            {/* Header */}
            <div className="flex items-center justify-between px-3 py-2 bg-[#0c0c0d] border-b border-[#222]/60 select-none text-left">
              <div className="flex items-center gap-2">
                {getIcon(layer.type)}
                <span className="font-bold text-[9px] tracking-wider text-zinc-300">{getTypeLabel(layer.type)}</span>
                <span className="text-zinc-700">::</span>
                <span className="text-[11px] font-sans text-zinc-450 font-semibold">{layer.name}</span>
              </div>
              <div className="flex items-center gap-1.5">
                {layer.active && layer.content && (
                  <button
                    type="button"
                    onClick={() => handleCopyLayer(idx, layer)}
                    className="text-zinc-400 hover:text-[#c2a472] px-2 py-0.5 rounded hover:bg-[#1c1c1f] transition-all flex items-center gap-1 text-[9px] font-mono cursor-pointer border border-[#27272a] bg-[#111113]"
                    title="Copy this layer's content with all line breaks and empty lines strictly preserved"
                  >
                    {copiedLayerIdx === idx ? (
                      <>
                        <Check className="w-2.5 h-2.5 text-emerald-400" />
                        <span className="text-emerald-400 font-bold">COPIED</span>
                      </>
                    ) : (
                      <>
                        <Copy className="w-2.5 h-2.5 text-zinc-400" />
                        <span>COPY</span>
                      </>
                    )}
                  </button>
                )}
                <button
                  onClick={() => onToggleLayer(idx)}
                  className="text-zinc-500 hover:text-zinc-200 p-1 rounded hover:bg-[#0a0a0b] transition-colors"
                  title={layer.active ? "Exclude this element from generation" : "Include this element in generation"}
                >
                  {layer.active ? <Eye className="w-3.5 h-3.5 text-[#c2a472]" /> : <EyeOff className="w-3.5 h-3.5 text-zinc-650" />}
                </button>
              </div>
            </div>

            {/* Content preview */}
            {layer.active && (
              <div className="p-3 bg-[#0a0a0b]/40 text-left">
                {onEditLayerContent && (layer.type === 'system' || layer.type === 'space') ? (
                  <div>
                    <div className="flex items-center justify-between mb-1.5 text-[9px] text-[#c2a472] font-mono">
                      <span>EDIT DIRECTIVES IN REAL-TIME:</span>
                      <span className="text-zinc-600">LIVE SYNCED</span>
                    </div>
                    <EditableLayerTextarea
                      content={layer.content}
                      onSave={(newVal) => onEditLayerContent(idx, newVal)}
                      placeholder="Enter layer layout..."
                    />
                  </div>
                ) : (
                  <pre className="whitespace-pre-wrap max-h-36 overflow-y-auto text-[11px] text-zinc-300 leading-relaxed font-mono select-text selection:bg-[#c2a472]/30 selection:text-white p-2 bg-[#0a0a0b]/60 rounded-sm border border-[#1a1a1c] m-0 font-normal">
                    {layer.content || <span className="text-zinc-650 italic">[Layer is empty]</span>}
                  </pre>
                )}
                <div className="flex justify-end mt-1.5 text-[9px] text-zinc-600">
                  <span>{layer.content.length} characters</span>
                </div>
              </div>
            )}
          </div>
        ))}
      </div>

      <div className="mt-4 pt-3 border-t border-[#1a1a1c] flex items-center justify-between text-[10px] text-zinc-550 text-left">
        <div className="flex items-center gap-1.5">
          <Cpu className="w-3 h-3 text-zinc-600" />
          <span>Active Pipeline: {modelName}</span>
        </div>
        <span>{layers.filter(l => l.active).length}/{layers.length} Layers Loaded</span>
      </div>
    </div>
  );
});
