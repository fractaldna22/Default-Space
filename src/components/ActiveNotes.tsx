import React, { useState, useEffect, useRef } from 'react';
import { Check, Copy, FileText } from 'lucide-react';

interface ActiveNotesProps {
  notes: string;
  onUpdateNotes: (newNotes: string) => void;
  spaceName: string;
}

export const ActiveNotes: React.FC<ActiveNotesProps> = ({ notes, onUpdateNotes, spaceName }) => {
  const [copied, setCopied] = useState(false);
  const [localNotes, setLocalNotes] = useState(notes);
  const debounceTimerRef = useRef<NodeJS.Timeout | null>(null);

  // Sync if external notes prop changes (e.g. space switched)
  useEffect(() => {
    setLocalNotes(notes);
  }, [notes]);

  const handleChange = (val: string) => {
    setLocalNotes(val);
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }
    debounceTimerRef.current = setTimeout(() => {
      onUpdateNotes(val);
    }, 400);
  };

  const handleBlur = () => {
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }
    if (localNotes !== notes) {
      onUpdateNotes(localNotes);
    }
  };

  const handleCopy = () => {
    navigator.clipboard.writeText(localNotes);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleInsertQuickTemplate = () => {
    const template = `// --- CONSTRUCT SCHEMATIC ---
// Target Framework: React 18 / Vite
// Technical Directives:
// - Keep components highly modular in /src/components
// - Prioritize pure visual style over multi-page navigation
// - Ensure state handles standard localStorage backups
`;
    const updated = localNotes + (localNotes ? '\n' : '') + template;
    setLocalNotes(updated);
    onUpdateNotes(updated);
  };

  return (
    <div className="bg-transparent flex flex-col h-full font-mono text-xs text-zinc-400 text-left">
      <div className="flex items-center justify-between border-b border-[#1a1a1c] pb-3 mb-4">
        <div className="flex items-center gap-2">
          <FileText className="w-4 h-4 text-[#c2a472] animate-pulse" />
          <span className="font-sans font-bold text-zinc-200 tracking-tight text-sm">ACTIVE SPACE NOTEBOOK</span>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={handleCopy}
            className="hover:text-zinc-200 p-1 rounded-sm bg-[#151517] border border-[#222] hover:bg-[#1a1a1c] transition-all font-bold text-[9px] px-2 flex items-center gap-1 cursor-pointer"
            title="Copy notes"
          >
            {copied ? <Check className="w-3 h-3 text-[#c2a472]" /> : <Copy className="w-3 h-3 text-zinc-500" />}
            <span>COPY</span>
          </button>
          <button
            onClick={handleInsertQuickTemplate}
            className="bg-[#c2a472]/10 text-[#c2a472] border border-[#c2a472]/30 hover:bg-[#c2a472]/25 focus:outline-none transition-colors px-2 py-1 rounded-sm text-[9px] font-bold cursor-pointer"
            title="Insert technical scaffold"
          >
            + SCAFFOLD
          </button>
        </div>
      </div>

      <p className="text-[11px] font-sans text-zinc-500 mb-4 leading-normal text-left">
        Specific instructions, directories, model-tuning targets, or API structures for the <span className="text-[#c2a472] font-semibold">"{spaceName}"</span> space. Automatically injected as high-priority context layer.
      </p>

      <div className="flex-1 min-h-0 flex flex-col relative">
        <textarea
          value={localNotes}
          onChange={(e) => handleChange(e.target.value)}
          onBlur={handleBlur}
          placeholder={`// SPACE MEMORY SCRATCHPAD
// Dump files, logs, or reference sheets here.
// e.g., 
// - Port rules: ONLY route to 3000
// - Target styling: Tailwind slate-neutral
`}
          className="w-full h-full flex-1 bg-[#0a0a0b] border border-[#222] rounded-sm p-4 text-zinc-300 font-mono text-[11px] focus:outline-none focus:border-[#c2a472] resize-none leading-relaxed selection:bg-[#c2a472]/20 overflow-y-auto custom-scrollbar"
        />
        <div className="absolute bottom-2.5 right-3 text-[9px] text-zinc-650 bg-[#151517] px-2 py-0.5 rounded-sm border border-[#222] pointer-events-none select-none">
          {localNotes.length} characters | {localNotes.split('\n').filter(Boolean).length} lines
        </div>
      </div>
    </div>
  );
};
