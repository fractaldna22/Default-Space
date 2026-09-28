import React, { useState } from 'react';
import { Copy, Check, Terminal, Code2 } from 'lucide-react';

interface CodeBlockProps {
  inline?: boolean;
  className?: string;
  children?: React.ReactNode;
  [key: string]: any;
}

export const CodeBlock: React.FC<CodeBlockProps> = ({
  inline,
  className,
  children,
  node,
  ...props
}) => {
  const [copied, setCopied] = useState(false);

  // Extract language from className (e.g. "language-typescript" -> "typescript")
  const match = /language-(\w+)/.exec(className || '');
  const rawCode = String(children || '').replace(/\n$/, '');
  const isMultiLine = rawCode.includes('\n');
  const isInlineCode = inline ?? (!match && !isMultiLine);

  if (isInlineCode) {
    return (
      <code
        className="font-mono text-[11.5px] bg-[#18181b] text-[#fbbf24] px-1.5 py-0.5 rounded border border-[#27272a]/70 break-words select-text"
        {...props}
      >
        {children}
      </code>
    );
  }

  const language = match ? match[1].toLowerCase() : 'text';

  const handleCopy = () => {
    if (!rawCode) return;
    navigator.clipboard.writeText(rawCode);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="w-full min-w-0 max-w-full my-3.5 rounded-md border border-[#27272a] bg-[#09090b] shadow-md overflow-hidden text-left font-mono">
      {/* Code Block Top Header */}
      <div className="flex items-center justify-between px-3.5 py-1.5 bg-[#111114] border-b border-[#222226] select-none">
        <div className="flex items-center gap-2 text-[10px] font-mono text-zinc-400 font-bold uppercase tracking-wider">
          {language === 'bash' || language === 'sh' || language === 'shell' || language === 'zsh' ? (
            <Terminal className="w-3.5 h-3.5 text-[#c2a472]" />
          ) : (
            <Code2 className="w-3.5 h-3.5 text-[#c2a472]" />
          )}
          <span className="text-[#c2a472]">{language}</span>
        </div>

        <button
          type="button"
          onClick={handleCopy}
          className="flex items-center gap-1 px-2 py-1 rounded text-[10px] font-mono font-bold text-zinc-400 hover:text-white bg-[#18181c] hover:bg-[#222228] border border-[#27272a] transition-all cursor-pointer active:scale-95"
          title="Copy code to clipboard"
        >
          {copied ? (
            <>
              <Check className="w-3 h-3 text-emerald-400" />
              <span className="text-emerald-400">COPIED</span>
            </>
          ) : (
            <>
              <Copy className="w-3 h-3 text-zinc-400" />
              <span>COPY</span>
            </>
          )}
        </button>
      </div>

      {/* Code Scrollable Area */}
      <pre className="w-full min-w-0 max-w-full overflow-x-auto p-3.5 text-[11.5px] font-mono leading-relaxed text-[#e4e4e7] bg-[#09090b] selection:bg-[#c2a472]/30 selection:text-white">
        <code className="block min-w-0 font-mono whitespace-pre break-normal" {...props}>
          {children}
        </code>
      </pre>
    </div>
  );
};

export const PreBlock: React.FC<{ children?: React.ReactNode; [key: string]: any }> = ({
  children,
}) => {
  // If react-markdown wraps CodeBlock inside PreBlock, we flatten to avoid redundant double cards
  return <div className="w-full min-w-0 max-w-full my-1 overflow-hidden">{children}</div>;
};
