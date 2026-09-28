import React, { useState, useRef, useEffect, useMemo } from 'react';
import { Space, Thread, PersonaPreset, APIConfig } from '../types';
import { DEFAULT_MODELS, DEFAULT_PERSONAS } from '../defaultData';
import { estimateTokenCount, formatTokenEstimate } from '../utils/tokenUtils';
import { shouldApplyReasoningLogic, isInklingModel } from '../utils/modelUtils';
import {
  Folder,
  Plus,
  Trash,
  Settings,
  MessageSquare,
  Sparkles,
  Layers,
  Sliders,
  Database,
  Download,
  Upload,
  Key,
  HelpCircle,
  Eye,
  EyeOff,
  Shrink,
  Image as ImageIcon,
  Search,
  Pencil,
  Check,
  X,
  RotateCw
} from 'lucide-react';

interface SpaceSidebarProps {
  spaces?: Space[];
  activeSpaceId?: string;
  onSelectSpace?: (id: string) => void;
  onAddSpace?: (name: string, description: string) => void;
  onDeleteSpace?: (id: string) => void;
  
  threads: Thread[];
  activeThreadId: string;
  onSelectThread: (id: string) => void;
  onAddThread: (title?: string) => void;
  onDeleteThread: (id: string) => void;
  onRenameThread?: (id: string, newTitle: string) => void;
  onBatchNameThreads?: () => Promise<void> | void;
  isBatchNaming?: boolean;

  // Space tuning props
  activeSpace: Space;
  onUpdateSpaceParams: (params: Partial<Space>) => void;
  
  personaPresets: PersonaPreset[];
  onSavePersonaPreset?: (name: string, promptText: string) => void;
  apiConfig: APIConfig;
  onUpdateClientToken: (token: string) => void;
  onUpdateTinkerKey?: (key: string) => void;
  onUpdateOpenRouterKey?: (key: string) => void;
  userName?: string;
  onUpdateUserName?: (name: string) => void;

  onClearAllCompactChunks?: () => void;
  onOpenCompactSummariesModal?: () => void;

  onBackupData: () => void;
  onRestoreData: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onResetData?: () => void;
  onClearAllImages?: () => void;
  storedImagesCount?: number;
  modelsList?: { id: string; name: string; desc?: string }[];
}

export const SpaceSidebar: React.FC<SpaceSidebarProps> = ({
  spaces,
  activeSpaceId,
  onSelectSpace,
  onAddSpace,
  onDeleteSpace,

  threads,
  activeThreadId,
  onSelectThread,
  onAddThread,
  onDeleteThread,
  onRenameThread,
  onBatchNameThreads,
  isBatchNaming = false,

  activeSpace,
  onUpdateSpaceParams,
  
  personaPresets,
  onSavePersonaPreset,
  apiConfig,
  onUpdateClientToken,
  onUpdateTinkerKey,
  onUpdateOpenRouterKey,
  userName,
  onUpdateUserName,

  onClearAllCompactChunks,
  onOpenCompactSummariesModal,

  onBackupData,
  onRestoreData,
  onResetData,
  onClearAllImages,
  storedImagesCount,
  modelsList,
}) => {
  const [showConfig, setShowConfig] = useState(false);
  const [editingToken, setEditingToken] = useState(apiConfig.clientToken || '');
  const [revealToken, setRevealToken] = useState(false);
  const [editingTinkerKey, setEditingTinkerKey] = useState(apiConfig.tinkerKey || '');
  const [revealTinkerKey, setRevealTinkerKey] = useState(false);
  const [editingOpenRouterKey, setEditingOpenRouterKey] = useState(apiConfig.openRouterKey || '');
  const [revealOpenRouterKey, setRevealOpenRouterKey] = useState(false);
  const [showResetConfirm, setShowResetConfirm] = useState(false);
  
  // Conversation search & inline rename states
  const [searchQuery, setSearchQuery] = useState('');
  const [editingThreadId, setEditingThreadId] = useState<string | null>(null);
  const [editingTitleText, setEditingTitleText] = useState('');
  const renameInputRef = useRef<HTMLInputElement>(null);

  const [newPresetName, setNewPresetName] = useState('');
  const [presetSaveSuccess, setPresetSaveSuccess] = useState(false);

  // Available inference models & custom model ID states
  const availableModels = useMemo(() => modelsList || DEFAULT_MODELS, [modelsList]);
  
  const isCurrentModelInList = useMemo(() => {
    if (!activeSpace.model) return false;
    return availableModels.some(m => m.id.toLowerCase() === activeSpace.model.toLowerCase());
  }, [availableModels, activeSpace.model]);

  // Collect custom models used across spaces so they can be conveniently picked
  const spaceCustomModels = useMemo(() => {
    if (!spaces) return [];
    const customSet = new Set<string>();
    spaces.forEach(s => {
      if (s.model && !availableModels.some(m => m.id.toLowerCase() === s.model.toLowerCase())) {
        customSet.add(s.model);
      }
    });
    return Array.from(customSet);
  }, [spaces, availableModels]);

  const [isCustomModelMode, setIsCustomModelMode] = useState(() => !isCurrentModelInList && Boolean(activeSpace.model));
  const [customModelInput, setCustomModelInput] = useState(activeSpace.model || '');
  const customModelInputRef = useRef<HTMLInputElement>(null);

  // Synchronize custom input whenever active space or its model changes
  useEffect(() => {
    setCustomModelInput(activeSpace.model || '');
    if (activeSpace.model && !availableModels.some(m => m.id.toLowerCase() === activeSpace.model.toLowerCase())) {
      setIsCustomModelMode(true);
    }
  }, [activeSpace.id, activeSpace.model, availableModels]);

  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const promptDebounceRef = useRef<NodeJS.Timeout | null>(null);
  const isPromptFocusedRef = useRef(false);

  const systemPromptVal = activeSpace.systemPromptCustom !== undefined && activeSpace.systemPromptCustom !== "" 
    ? activeSpace.systemPromptCustom 
    : (personaPresets.find(p => p.id === activeSpace.systemPromptPresetId)?.prompt || "");

  const [localSystemPrompt, setLocalSystemPrompt] = useState(systemPromptVal);

  useEffect(() => {
    if (!isPromptFocusedRef.current) {
      setLocalSystemPrompt(systemPromptVal);
    }
  }, [systemPromptVal]);

  const handleSystemPromptChange = (val: string) => {
    setLocalSystemPrompt(val);
    if (promptDebounceRef.current) {
      clearTimeout(promptDebounceRef.current);
    }
    promptDebounceRef.current = setTimeout(() => {
      onUpdateSpaceParams({
        systemPromptCustom: val
      });
    }, 400);
  };

  const handleSystemPromptBlur = () => {
    isPromptFocusedRef.current = false;
    if (promptDebounceRef.current) {
      clearTimeout(promptDebounceRef.current);
    }
    if (localSystemPrompt !== activeSpace.systemPromptCustom) {
      onUpdateSpaceParams({
        systemPromptCustom: localSystemPrompt
      });
    }
  };

  useEffect(() => {
    setEditingToken(apiConfig.clientToken || '');
    setEditingTinkerKey(apiConfig.tinkerKey || '');
    setEditingOpenRouterKey(apiConfig.openRouterKey || '');
  }, [apiConfig]);

  // Auto-focus when inline renaming begins
  useEffect(() => {
    if (editingThreadId && renameInputRef.current) {
      renameInputRef.current.focus();
      renameInputRef.current.select();
    }
  }, [editingThreadId]);

  const handleSaveToken = () => {
    const cleaned = editingToken.trim().replace(/^['"]|['"]$/g, '').trim();
    onUpdateClientToken(cleaned);
    setEditingToken(cleaned);
  };

  const handleSaveTinkerKey = () => {
    const cleaned = editingTinkerKey.trim().replace(/^['"]|['"]$/g, '').trim();
    onUpdateTinkerKey?.(cleaned);
    setEditingTinkerKey(cleaned);
  };

  const handleSaveOpenRouterKey = () => {
    const cleaned = editingOpenRouterKey.trim().replace(/^['"]|['"]$/g, '').trim();
    onUpdateOpenRouterKey?.(cleaned);
    setEditingOpenRouterKey(cleaned);
  };

  const handleStartRename = (thread: Thread) => {
    setEditingThreadId(thread.id);
    setEditingTitleText(thread.title);
  };

  const handleConfirmRename = () => {
    if (editingThreadId && editingTitleText.trim()) {
      onRenameThread?.(editingThreadId, editingTitleText.trim());
    }
    setEditingThreadId(null);
    setEditingTitleText('');
  };

  const handleCancelRename = () => {
    setEditingThreadId(null);
    setEditingTitleText('');
  };

  // Filtered threads with search query matching both title and content
  const filteredThreadsWithMatches = useMemo(() => {
    const q = searchQuery.toLowerCase().trim();
    if (!q) {
      return threads.map(t => ({ thread: t, matchSnippet: null as string | null }));
    }

    return threads
      .map(t => {
        const titleMatches = t.title.toLowerCase().includes(q);
        let matchSnippet: string | null = null;

        if (!titleMatches) {
          for (const m of t.messages) {
            const content = typeof m.content === 'string' ? m.content : JSON.stringify(m.content);
            const lowerContent = content.toLowerCase();
            const matchIndex = lowerContent.indexOf(q);
            if (matchIndex !== -1) {
              const start = Math.max(0, matchIndex - 20);
              const end = Math.min(content.length, matchIndex + q.length + 30);
              matchSnippet = (start > 0 ? "..." : "") + content.substring(start, end).trim() + (end < content.length ? "..." : "");
              break;
            }
          }
        }

        if (titleMatches || matchSnippet) {
          return { thread: t, matchSnippet };
        }
        return null;
      })
      .filter((item): item is { thread: Thread; matchSnippet: string | null } => item !== null);
  }, [threads, searchQuery]);

  return (
    <div className="w-full flex-shrink-0 min-w-0 bg-[#0c0c0d] border-r border-[#1a1a1c] flex flex-col h-full font-sans text-zinc-400 text-xs text-left overflow-y-auto">
      
      {/* 1. Header Branded Area */}
      <div className="p-6 border-b border-[#1a1a1c] bg-[#0c0c0d] flex flex-col gap-2.5">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="font-serif italic text-2xl text-white tracking-tighter">Custom Playground</h1>
            <p className="text-[10px] uppercase tracking-[0.2em] text-zinc-550 mt-1 font-bold">Multi-Model Shell</p>
          </div>
          
          {/* API connection status indicator */}
          <button 
            onClick={() => setShowConfig(!showConfig)}
            className={`flex items-center gap-1.5 px-2.5 py-1 rounded border text-[9px] font-black transition-all cursor-pointer ${
              apiConfig.hasTokenEnv || apiConfig.clientToken || apiConfig.openRouterKey || apiConfig.tinkerKey
                ? 'bg-[#c2a472]/10 text-[#c2a472] border-[#c2a472]/30 hover:bg-[#c2a472]/20'
                : 'bg-red-950/25 text-red-400 border-red-900 animate-pulse'
            }`}
            title="API Key & Provider Settings"
          >
            <Key className="w-3 h-3 text-[#c2a472]" />
            <span>API KEY</span>
            <span className={`w-1.5 h-1.5 rounded-full ${apiConfig.hasTokenEnv || apiConfig.clientToken || apiConfig.openRouterKey || apiConfig.tinkerKey ? 'bg-[#c2a472]' : 'bg-red-500 animate-pulse'}`} />
          </button>
        </div>
        <p className="text-[10px] text-zinc-500 leading-normal font-mono border-t border-[#161617] pt-2">
          Click <span className="text-[#c2a472] font-bold">API KEY</span> above to configure OpenRouter, Thinking Machines, or general provider keys. Requests automatically route based on your selected model.
        </p>
      </div>

      {/* Advanced Multi-Provider API Key Panel */}
      {(showConfig || (!apiConfig.hasTokenEnv && !apiConfig.clientToken && !apiConfig.openRouterKey && !apiConfig.tinkerKey)) && (
        <div className="p-4 bg-[#151517] border-b border-[#1a1a1c] space-y-3.5 text-left font-sans">
          <div className="flex justify-between items-center text-[9px] font-bold text-zinc-400 font-mono tracking-wider">
            <span className="flex items-center gap-1 text-[#c2a472]">
              <Key className="w-3 h-3" />
              API KEYS & USER SETTINGS
            </span>
            <button onClick={() => setShowConfig(false)} className="hover:text-zinc-200 cursor-pointer">CLOSE</button>
          </div>
          
          <p className="text-[10px] text-zinc-400 leading-relaxed">
            Enter your provider API keys. Calls automatically route to OpenRouter, Thinking Machines (Tinker), or OpenAI based on model prefix.
          </p>

          {/* User Display Name */}
          <div className="space-y-1">
            <label className="block text-[9px] font-bold text-zinc-400 uppercase tracking-wider font-mono">
              YOUR NAME
            </label>
            <input
              type="text"
              placeholder="Enter your name (e.g. Alex, Sam)..."
              value={userName || ''}
              onChange={(e) => onUpdateUserName?.(e.target.value)}
              className="w-full bg-[#0a0a0b] border border-[#222] rounded px-2.5 py-1 text-[11px] text-zinc-200 focus:outline-none focus:border-[#c2a472]"
            />
            <p className="text-[8px] text-zinc-500">Replaces 'the user' in model reasoning thought logs.</p>
          </div>

          {/* Primary / General API Key */}
          <div className="space-y-1">
            <label className="block text-[9px] font-bold text-zinc-400 uppercase tracking-wider font-mono">
              PRIMARY / GENERAL API KEY
            </label>
            <div className="flex gap-1.5 font-mono">
              <div className="relative flex-1">
                <input
                  type={revealToken ? "text" : "password"}
                  placeholder={apiConfig.hasTokenEnv ? "Override server token..." : "Enter Primary / General Key..."}
                  value={editingToken}
                  onChange={(e) => setEditingToken(e.target.value)}
                  className="w-full bg-[#0a0a0b] border border-[#222] rounded px-2.5 py-1 text-[11px] text-zinc-250 focus:outline-none focus:border-[#c2a472]"
                />
                <button
                  onClick={() => setRevealToken(!revealToken)}
                  className="absolute right-2 top-1.5 text-zinc-500 hover:text-zinc-300"
                  type="button"
                >
                  {revealToken ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                </button>
              </div>
              <button
                onClick={handleSaveToken}
                className="bg-[#c2a472] hover:bg-[#b09363] text-black font-extrabold px-2.5 py-1 rounded-sm text-[10px] cursor-pointer"
              >
                SAVE
              </button>
              {apiConfig.clientToken && (
                <button
                  onClick={() => {
                    setEditingToken('');
                    onUpdateClientToken('');
                  }}
                  className="bg-red-950/40 text-red-400 border border-red-900/40 hover:bg-red-900/20 font-extrabold px-2 py-1 rounded-sm text-[10px] cursor-pointer"
                  title="Clear key"
                >
                  CLEAR
                </button>
              )}
            </div>
          </div>

          {/* Thinking Machines / Tinker API Key */}
          <div className="space-y-1">
            <label className="block text-[9px] font-bold text-zinc-400 uppercase tracking-wider font-mono">
              THINKING MACHINES / TINKER API KEY
            </label>
            <div className="flex gap-1.5 font-mono">
              <div className="relative flex-1">
                <input
                  type={revealTinkerKey ? "text" : "password"}
                  placeholder="Enter Tinker API key (for Inkling models)..."
                  value={editingTinkerKey}
                  onChange={(e) => setEditingTinkerKey(e.target.value)}
                  className="w-full bg-[#0a0a0b] border border-[#222] rounded px-2.5 py-1 text-[11px] text-zinc-250 focus:outline-none focus:border-[#c2a472]"
                />
                <button
                  onClick={() => setRevealTinkerKey(!revealTinkerKey)}
                  className="absolute right-2 top-1.5 text-zinc-500 hover:text-zinc-300"
                  type="button"
                >
                  {revealTinkerKey ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                </button>
              </div>
              <button
                onClick={handleSaveTinkerKey}
                className="bg-[#c2a472] hover:bg-[#b09363] text-black font-extrabold px-2.5 py-1 rounded-sm text-[10px] cursor-pointer"
              >
                SAVE
              </button>
              {apiConfig.tinkerKey && (
                <button
                  onClick={() => {
                    setEditingTinkerKey('');
                    onUpdateTinkerKey?.('');
                  }}
                  className="bg-red-950/40 text-red-400 border border-red-900/40 hover:bg-red-900/20 font-extrabold px-2 py-1 rounded-sm text-[10px] cursor-pointer"
                  title="Clear key"
                >
                  CLEAR
                </button>
              )}
            </div>
          </div>

          {/* OpenRouter API Key */}
          <div className="space-y-1">
            <label className="block text-[9px] font-bold text-zinc-400 uppercase tracking-wider font-mono">
              OPENROUTER API KEY (OPTIONAL)
            </label>
            <div className="flex gap-1.5 font-mono">
              <div className="relative flex-1">
                <input
                  type={revealOpenRouterKey ? "text" : "password"}
                  placeholder="Enter OpenRouter Key (sk-or-v1-...)..."
                  value={editingOpenRouterKey}
                  onChange={(e) => setEditingOpenRouterKey(e.target.value)}
                  className="w-full bg-[#0a0a0b] border border-[#222] rounded px-2.5 py-1 text-[11px] text-zinc-250 focus:outline-none focus:border-[#c2a472]"
                />
                <button
                  onClick={() => setRevealOpenRouterKey(!revealOpenRouterKey)}
                  className="absolute right-2 top-1.5 text-zinc-500 hover:text-zinc-300"
                  type="button"
                >
                  {revealOpenRouterKey ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                </button>
              </div>
              <button
                onClick={handleSaveOpenRouterKey}
                className="bg-[#c2a472] hover:bg-[#b09363] text-black font-extrabold px-2.5 py-1 rounded-sm text-[10px] cursor-pointer"
              >
                SAVE
              </button>
              {apiConfig.openRouterKey && (
                <button
                  onClick={() => {
                    setEditingOpenRouterKey('');
                    onUpdateOpenRouterKey?.('');
                  }}
                  className="bg-red-950/40 text-red-400 border border-red-900/40 hover:bg-red-900/20 font-extrabold px-2 py-1 rounded-sm text-[10px] cursor-pointer"
                  title="Clear key"
                >
                  CLEAR
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      <div className="flex-1 min-h-0 overflow-y-auto p-4 space-y-6 custom-scrollbar text-left">

        {/* 2. UNIFIED CONVERSATIONS SECTION (replaces Project Spaces vs Active Threads) */}
        <div className="space-y-2.5 text-left">
          <div className="flex justify-between items-center">
            <span className="text-[10px] font-bold tracking-widest text-zinc-400 flex items-center gap-1.5 uppercase font-sans">
              <MessageSquare className="w-3.5 h-3.5 text-[#c2a472]" />
              <span>CONVERSATIONS</span>
              <span className="text-zinc-600 font-mono text-[9px] font-normal">({threads.length})</span>
            </span>
            
            <div className="flex items-center gap-1.5">
              {/* Batch AI Titling Button */}
              {onBatchNameThreads && (
                <button
                  onClick={() => onBatchNameThreads()}
                  disabled={isBatchNaming || threads.length === 0}
                  className={`flex items-center gap-1 px-2 py-0.5 rounded border text-[9px] font-bold transition-all ${
                    isBatchNaming
                      ? 'bg-[#c2a472]/20 text-[#c2a472] border-[#c2a472]/40 animate-pulse cursor-wait'
                      : 'bg-[#151517] text-zinc-400 border-[#222] hover:text-[#c2a472] hover:border-[#c2a472]/40 cursor-pointer'
                  }`}
                  title="Batch auto-name all conversations based on conversation context with selected model"
                >
                  {isBatchNaming ? (
                    <RotateCw className="w-3 h-3 animate-spin text-[#c2a472]" />
                  ) : (
                    <Sparkles className="w-3 h-3 text-[#c2a472]" />
                  )}
                  <span className="font-mono">{isBatchNaming ? "NAMING..." : "BATCH AI"}</span>
                </button>
              )}

              {/* Spawn New Conversation Thread */}
              <button
                onClick={() => onAddThread("New Conversation")}
                className="flex items-center gap-1 bg-[#c2a472]/15 text-[#c2a472] border border-[#c2a472]/30 hover:bg-[#c2a472]/25 px-2 py-0.5 rounded text-[9px] font-bold transition-colors cursor-pointer"
                title="Start a new conversation thread"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>NEW</span>
              </button>
            </div>
          </div>

          {/* Search Box */}
          <div className="relative">
            <Search className="w-3.5 h-3.5 text-zinc-600 absolute left-2.5 top-2 pointer-events-none" />
            <input
              type="text"
              placeholder="Search conversations & messages..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-[#121214] border border-[#222] rounded px-2.5 py-1.5 pl-8 pr-7 text-[11px] text-zinc-200 placeholder-zinc-600 focus:outline-none focus:border-[#c2a472] transition-colors"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="absolute right-2 top-1.5 text-zinc-600 hover:text-zinc-300 p-0.5 cursor-pointer"
                title="Clear search"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          {/* Search Results / Status Info */}
          {searchQuery && (
            <div className="flex justify-between items-center text-[9px] text-zinc-500 px-1 font-mono">
              <span>{filteredThreadsWithMatches.length} matching conversation{filteredThreadsWithMatches.length === 1 ? '' : 's'}</span>
              <button onClick={() => setSearchQuery('')} className="text-[#c2a472] hover:underline cursor-pointer">Clear filter</button>
            </div>
          )}

          {/* Batch Naming Progress Banner */}
          {isBatchNaming && (
            <div className="bg-[#c2a472]/10 border border-[#c2a472]/30 p-2 rounded text-[10px] text-[#c2a472] flex items-center gap-2 animate-pulse">
              <RotateCw className="w-3.5 h-3.5 animate-spin flex-shrink-0" />
              <span>Analyzing conversations & generating descriptive titles with model...</span>
            </div>
          )}

          {/* Conversations List */}
          <div className="space-y-1.5 max-h-[380px] overflow-y-auto custom-scrollbar pr-0.5">
            {filteredThreadsWithMatches.length === 0 ? (
              <div className="text-zinc-600 italic text-[10px] p-3 text-center border border-dashed border-[#1f1f22] rounded bg-[#101012] font-mono">
                {searchQuery ? "No conversations match your search." : "No conversations yet. Click '+ NEW' to start."}
              </div>
            ) : (
              filteredThreadsWithMatches.map(({ thread: t, matchSnippet }) => {
                const active = t.id === activeThreadId;
                const isEditing = editingThreadId === t.id;

                if (isEditing) {
                  return (
                    <div
                      key={t.id}
                      className="bg-[#18181b] border border-[#c2a472] p-2 rounded shadow-md space-y-1.5 animate-fade-in"
                    >
                      <div className="text-[9px] text-[#c2a472] font-bold uppercase font-mono">RENAME CONVERSATION</div>
                      <div className="flex gap-1.5">
                        <input
                          ref={renameInputRef}
                          type="text"
                          value={editingTitleText}
                          onChange={(e) => setEditingTitleText(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') handleConfirmRename();
                            if (e.key === 'Escape') handleCancelRename();
                          }}
                          className="flex-1 bg-[#0a0a0b] border border-[#333] rounded px-2 py-1 text-[11px] text-white focus:outline-none focus:border-[#c2a472]"
                          placeholder="Conversation title..."
                        />
                        <button
                          type="button"
                          onClick={handleConfirmRename}
                          className="bg-[#c2a472] hover:bg-[#b09363] text-black font-bold p-1 rounded cursor-pointer"
                          title="Save title (Enter)"
                        >
                          <Check className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={handleCancelRename}
                          className="bg-[#27272a] hover:bg-[#3f3f46] text-zinc-300 font-bold p-1 rounded cursor-pointer"
                          title="Cancel (Esc)"
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  );
                }

                return (
                  <div
                    key={t.id}
                    className={`group relative flex flex-col p-2.5 rounded text-left transition-all cursor-pointer border ${
                      active
                        ? 'bg-[#151518] text-[#f4f4f5] border-l-2 border-l-[#c2a472] border-t-[#27272a] border-r-[#27272a] border-b-[#27272a] shadow-sm'
                        : 'bg-[#0f0f11] border-[#18181b] text-zinc-400 hover:text-zinc-200 hover:bg-[#141416] hover:border-[#222]'
                    }`}
                    onClick={() => onSelectThread(t.id)}
                  >
                    {/* Top Row: Title + Action buttons */}
                    <div className="flex items-center justify-between gap-2 min-w-0">
                      <span
                        className={`truncate font-semibold text-[11.5px] tracking-tight ${
                          active ? 'text-white' : 'text-zinc-300'
                        }`}
                        title={`${t.title} (Double-click to rename)`}
                        onDoubleClick={(e) => {
                          e.stopPropagation();
                          handleStartRename(t);
                        }}
                      >
                        {t.title}
                      </span>

                      {/* Hover Action Buttons */}
                      <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0">
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleStartRename(t);
                          }}
                          className="p-1 text-zinc-500 hover:text-[#c2a472] hover:bg-[#222] rounded transition-colors cursor-pointer"
                          title="Rename conversation"
                        >
                          <Pencil className="w-3 h-3" />
                        </button>
                        {threads.length > 1 && (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              onDeleteThread(t.id);
                            }}
                            className="p-1 text-zinc-500 hover:text-red-400 hover:bg-red-950/30 rounded transition-colors cursor-pointer"
                            title="Delete conversation"
                          >
                            <Trash className="w-3 h-3" />
                          </button>
                        )}
                      </div>
                    </div>

                    {/* Bottom Row: Message count & preview/match snippet */}
                    <div className="flex items-center justify-between mt-1 text-[9.5px] text-zinc-500 font-mono">
                      <span>{t.messages.length} message{t.messages.length === 1 ? '' : 's'}</span>
                      {t.createdAt && (
                        <span className="text-[8.5px] text-zinc-600">
                          {new Date(t.createdAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
                        </span>
                      )}
                    </div>

                    {/* Search match snippet if message body matched query */}
                    {matchSnippet && (
                      <div className="mt-1 text-[9px] text-[#c2a472]/80 bg-[#c2a472]/5 px-1.5 py-0.5 rounded border border-[#c2a472]/15 font-mono truncate">
                        {matchSnippet}
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* 3. DIAL CONTROLS / MICRO-TUNING PANEL */}
        <div className="space-y-4 pt-4 border-t border-[#1a1a1c] text-left">
          <span className="text-[10px] font-bold tracking-widest text-zinc-500 flex items-center gap-1.5 uppercase font-sans">
            <Sliders className="w-3.5 h-3.5 text-zinc-650" />
            <span>EXPOSED HARNESS DIALS</span>
          </span>

          <div className="space-y-3 bg-[#0a0a0b] p-3 rounded-sm border border-[#222]">
            {/* Model switch & custom model ID entry */}
            <div>
              <div className="flex justify-between items-center mb-1.5">
                <label className="block text-[9px] text-zinc-500 font-bold tracking-wider font-sans">
                  INFERENCE ENGINE
                </label>
                <button
                  type="button"
                  onClick={() => {
                    if (isCustomModelMode) {
                      setIsCustomModelMode(false);
                      if (!isCurrentModelInList && availableModels.length > 0 && !activeSpace.model) {
                        onUpdateSpaceParams({ model: availableModels[0].id });
                      }
                    } else {
                      setIsCustomModelMode(true);
                      setTimeout(() => customModelInputRef.current?.focus(), 50);
                    }
                  }}
                  className="text-[9px] font-mono text-[#c2a472] hover:text-[#d8ba88] hover:underline flex items-center gap-1 cursor-pointer transition-colors"
                  title={isCustomModelMode ? "Switch to curated model list" : "Type custom inference engine ID"}
                >
                  {isCustomModelMode ? (
                    <span>Pick from list</span>
                  ) : (
                    <>
                      <Pencil className="w-2.5 h-2.5" />
                      <span>Type custom ID</span>
                    </>
                  )}
                </button>
              </div>

              {isCustomModelMode ? (
                <div className="space-y-1.5 animate-fade-in">
                  <div className="relative flex items-center">
                    <input
                      ref={customModelInputRef}
                      type="text"
                      value={customModelInput}
                      onChange={(e) => {
                        const val = e.target.value;
                        setCustomModelInput(val);
                        onUpdateSpaceParams({ model: val.trim() });
                      }}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.currentTarget.blur();
                        }
                      }}
                      placeholder="e.g. mistralai/codestral-2501, x-ai/grok-2..."
                      list="custom-inference-engine-suggestions"
                      className="w-full bg-[#151517] border border-[#222] focus:border-[#c2a472] rounded px-2.5 py-1.5 text-zinc-200 focus:outline-none font-mono text-[11px] placeholder:text-zinc-650 pr-7 shadow-inner"
                    />
                    {customModelInput ? (
                      <button
                        type="button"
                        onClick={() => {
                          setCustomModelInput('');
                          onUpdateSpaceParams({ model: '' });
                          customModelInputRef.current?.focus();
                        }}
                        className="absolute right-2 text-zinc-500 hover:text-zinc-300 p-0.5 cursor-pointer"
                        title="Clear custom ID"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    ) : null}
                  </div>

                  <datalist id="custom-inference-engine-suggestions">
                    {spaceCustomModels.map(id => (
                      <option key={id} value={id} label="Recent custom model" />
                    ))}
                    {availableModels.map(m => (
                      <option key={m.id} value={m.id} label={m.name || m.id} />
                    ))}
                  </datalist>

                  <div className="flex items-center justify-between text-[8px] text-zinc-500 font-sans">
                    <span className="truncate mr-2">OpenRouter, Tinker, or OpenAI ID</span>
                    <button
                      type="button"
                      onClick={() => {
                        setIsCustomModelMode(false);
                        if (!isCurrentModelInList && availableModels.length > 0 && !activeSpace.model) {
                          onUpdateSpaceParams({ model: availableModels[0].id });
                        }
                      }}
                      className="text-[#c2a472] hover:underline cursor-pointer font-mono shrink-0"
                    >
                      Preset list
                    </button>
                  </div>
                </div>
              ) : (
                <select
                  value={isCurrentModelInList ? activeSpace.model : (activeSpace.model ? activeSpace.model : '__custom__')}
                  onChange={(e) => {
                    const val = e.target.value;
                    if (val === '__custom__') {
                      setIsCustomModelMode(true);
                      setTimeout(() => customModelInputRef.current?.focus(), 50);
                    } else {
                      onUpdateSpaceParams({ model: val });
                    }
                  }}
                  className="w-full bg-[#151517] border border-[#222] rounded px-2.5 py-1.5 text-zinc-300 focus:outline-none focus:border-[#c2a472] font-mono text-[11px]"
                >
                  {/* If the current activeSpace.model is custom and not in availableModels, display it clearly */}
                  {!isCurrentModelInList && activeSpace.model && (
                    <option value={activeSpace.model}>
                      Custom: {activeSpace.model}
                    </option>
                  )}

                  {/* Any other custom models from other spaces */}
                  {spaceCustomModels
                    .filter(id => id !== activeSpace.model)
                    .map(id => (
                      <option key={id} value={id}>
                        Custom: {id}
                      </option>
                    ))
                  }

                  {availableModels.map(m => (
                    <option key={m.id} value={m.id} title={m.desc}>
                      {m.name ? `${m.name} (${m.id.split('/').pop()})` : m.id.replace('openai/', '').replace('meta/', '').replace('mistralai/', '').replace('microsoft/', '').replace('cohere/', '')}
                    </option>
                  ))}

                  <option value="__custom__" className="text-[#c2a472] font-bold">
                    + Type custom model ID...
                  </option>
                </select>
              )}
            </div>

            {/* Unified Persona Entry with Direct Editing / Save Ability */}
            <div className="space-y-3 pt-2.5 border-t border-[#1a1a1c]/60">
              <div className="flex justify-between items-center text-[9px] font-bold font-sans">
                <span className="text-zinc-550 uppercase tracking-widest">ACTIVE COGNITIVE PERSONA</span>
                <span className="text-[#c2a472] uppercase">{activeSpace.systemPromptCustom ? "Customised" : "Default Preset"}</span>
              </div>

              {/* Load preset dropdown */}
              <div className="space-y-1">
                <select
                  value={activeSpace.systemPromptPresetId}
                  onChange={(e) => {
                    const presetId = e.target.value;
                    const preset = personaPresets.find(p => p.id === presetId);
                    onUpdateSpaceParams({
                      systemPromptPresetId: presetId,
                      systemPromptCustom: preset ? preset.prompt : activeSpace.systemPromptCustom
                    });
                  }}
                  className="w-full bg-[#151517] border border-[#222] rounded px-2.5 py-1.5 text-zinc-350 focus:outline-none focus:border-[#c2a472] font-mono text-[10px]"
                >
                  {personaPresets.map(p => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
              </div>

              {/* Raw edit prompt area */}
              <div className="space-y-1">
                <span className="block text-[8px] text-zinc-650 font-bold uppercase font-sans">EDIT CUSTOM SYSTEM PROMPT</span>
                <textarea
                  ref={textareaRef}
                  value={localSystemPrompt}
                  onFocus={() => { isPromptFocusedRef.current = true; }}
                  onChange={(e) => handleSystemPromptChange(e.target.value)}
                  onBlur={handleSystemPromptBlur}
                  rows={5}
                  className="w-full bg-[#151517] border border-[#222] rounded p-2 text-zinc-200 font-mono text-[10px] focus:outline-none focus:border-[#c2a472] resize-y leading-normal min-h-[96px] max-h-[260px] overflow-y-auto custom-scrollbar"
                  placeholder="Paste or design system directives here..."
                />
              </div>

              {/* Save Persona Preset Trigger */}
              <div className="space-y-1.5 bg-[#121214] border border-[#1a1a1c] p-2.5 rounded-sm">
                <span className="block text-[8px] text-zinc-600 font-bold uppercase font-sans">SAVE TO COGNITIVE PRESETS</span>
                <div className="flex gap-1.5">
                  <input
                    type="text"
                    placeholder="New preset name..."
                    value={newPresetName}
                    onChange={(e) => {
                      setNewPresetName(e.target.value);
                      if (presetSaveSuccess) setPresetSaveSuccess(false);
                    }}
                    className="flex-1 bg-[#0a0a0b] border border-[#222]/80 rounded px-2 py-1 text-[10px] text-zinc-300 focus:outline-none focus:border-[#c2a472]"
                  />
                  <button
                    type="button"
                    onClick={() => {
                      if (!newPresetName.trim()) return;
                      const promptText = localSystemPrompt;
                      if (onSavePersonaPreset) {
                        onSavePersonaPreset(newPresetName.trim(), promptText);
                        setPresetSaveSuccess(true);
                        setNewPresetName('');
                        setTimeout(() => setPresetSaveSuccess(false), 2500);
                      }
                    }}
                    className="bg-[#c2a472]/15 text-[#c2a472] border border-[#c2a472]/30 hover:bg-[#c2a472]/25 px-2.5 py-1 rounded-sm text-[9px] font-bold cursor-pointer transition-colors"
                  >
                    SAVE
                  </button>
                </div>
                {presetSaveSuccess && (
                  <span className="block text-[8px] text-[#c2a472] font-semibold font-sans mt-1">✓ Saved successfully as dynamic preset!</span>
                )}
              </div>
            </div>

            {/* Temperature Slider */}
            <div className="space-y-1.5">
              <div className="flex justify-between items-center text-[9px] font-bold font-sans">
                <span className="text-zinc-550 uppercase tracking-normal">CREATIVE TEMPERATURE</span>
                <span className="text-[#c2a472] font-bold font-mono">{activeSpace.temperature}</span>
              </div>
              <div className="relative pt-1">
                <input
                  type="range"
                  min="0.0"
                  max="2.0"
                  step="0.05"
                  value={activeSpace.temperature}
                  onChange={(e) => onUpdateSpaceParams({ temperature: Number(e.target.value) })}
                  className="w-full accent-[#c2a472] h-1 bg-[#1a1a1c] rounded-full appearance-none cursor-pointer text-[#c2a472]"
                />
              </div>
              <div className="flex justify-between text-[8px] text-zinc-650 font-sans">
                <span>Predictive</span>
                <span>Warm</span>
                <span>Hallucinatory</span>
              </div>
            </div>

            {/* Top_P Slider */}
            <div className="space-y-1.5">
              <div className="flex justify-between items-center text-[9px] font-bold font-sans">
                <span className="text-zinc-555 uppercase tracking-normal">NUCLEUS TOP_P</span>
                <span className="text-[#c2a472] font-bold font-mono">{activeSpace.top_p}</span>
              </div>
              <div className="relative pt-1">
                <input
                  type="range"
                  min="0.0"
                  max="1.0"
                  step="0.02"
                  value={activeSpace.top_p}
                  onChange={(e) => onUpdateSpaceParams({ top_p: Number(e.target.value) })}
                  className="w-full accent-[#c2a472] h-1 bg-[#1a1a1c] rounded-full appearance-none cursor-pointer"
                />
              </div>
              <div className="flex justify-between text-[8px] text-zinc-655 font-sans">
                <span>Concentrated</span>
                <span>Balanced</span>
                <span>Unrestricted</span>
              </div>
            </div>

            {/* Max tokens input */}
            <div>
              <div className="flex justify-between items-center mb-1.5">
                <label className="block text-[9px] text-zinc-550 font-bold tracking-wider font-sans uppercase">MAX RETURN TOKENS</label>
                <span className="text-[9px] text-zinc-500 font-mono">
                  {!activeSpace.max_tokens ? "Unspecified (Default)" : `${activeSpace.max_tokens} tokens`}
                </span>
              </div>
              <input
                type="number"
                min="0"
                max="128000"
                placeholder="Unspecified (leave blank or 0)"
                value={activeSpace.max_tokens || ""}
                onChange={(e) => {
                  const val = e.target.value === "" ? 0 : Math.max(0, parseInt(e.target.value, 10) || 0);
                  onUpdateSpaceParams({ max_tokens: val });
                }}
                className="w-full bg-[#151517] border border-[#222] rounded px-2.5 py-1 text-zinc-300 focus:outline-none focus:border-[#c2a472] font-mono text-[11px] placeholder:text-zinc-600"
              />
              <p className="text-[8.5px] text-zinc-600 mt-1 font-sans">
                Leave blank or set to 0 to let the model decide naturally without capping completion length.
              </p>
            </div>

            {/* Presence Penalty Slider */}
            <div className="space-y-1.5 pt-2 border-t border-[#1a1a1c]/60">
              <div className="flex justify-between items-center text-[9px] font-bold font-sans">
                <span className="text-zinc-555 uppercase tracking-normal">PRESENCE PENALTY</span>
                <span className="text-[#c2a472] font-bold font-mono">
                  {(activeSpace.presence_penalty ?? 0) > 0 ? `+${(activeSpace.presence_penalty ?? 0).toFixed(2)}` : (activeSpace.presence_penalty ?? 0).toFixed(2)}
                </span>
              </div>
              <div className="relative pt-1">
                <input
                  type="range"
                  min="-2.0"
                  max="2.0"
                  step="0.05"
                  value={activeSpace.presence_penalty ?? 0.0}
                  onChange={(e) => onUpdateSpaceParams({ presence_penalty: Number(e.target.value) })}
                  className="w-full accent-[#c2a472] h-1 bg-[#1a1a1c] rounded-full appearance-none cursor-pointer"
                />
              </div>
              <div className="flex justify-between text-[8px] text-zinc-655 font-sans">
                <span>Focus (-2.0)</span>
                <span>Neutral (0.0)</span>
                <span>New Topics (+2.0)</span>
              </div>
              <div className="flex items-center gap-1 pt-0.5">
                {[
                  { label: '-1.0', val: -1.0 },
                  { label: '0.0', val: 0.0 },
                  { label: '+0.5', val: 0.5 },
                  { label: '+1.0', val: 1.0 },
                  { label: '+1.5', val: 1.5 },
                ].map(p => (
                  <button
                    key={p.label}
                    type="button"
                    onClick={() => onUpdateSpaceParams({ presence_penalty: p.val })}
                    className={`flex-1 py-0.5 rounded text-[8px] font-mono transition-colors cursor-pointer ${
                      (activeSpace.presence_penalty ?? 0.0) === p.val
                        ? 'bg-[#c2a472] text-black font-bold'
                        : 'bg-[#151517] text-zinc-400 hover:text-white border border-[#222]'
                    }`}
                  >
                    {p.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Frequency Penalty Slider */}
            <div className="space-y-1.5 pt-2 border-t border-[#1a1a1c]/60">
              <div className="flex justify-between items-center text-[9px] font-bold font-sans">
                <span className="text-zinc-555 uppercase tracking-normal">FREQUENCY PENALTY</span>
                <div className="flex items-center gap-1.5">
                  <span className="text-[#c2a472] font-bold font-mono">
                    {activeSpace.frequency_penalty !== null && activeSpace.frequency_penalty !== undefined
                      ? ((activeSpace.frequency_penalty ?? 0) > 0 ? `+${(activeSpace.frequency_penalty ?? 0).toFixed(2)}` : (activeSpace.frequency_penalty ?? 0).toFixed(2))
                      : '0.00'}
                  </span>
                  {activeSpace.frequency_penalty !== null && activeSpace.frequency_penalty !== undefined && (
                    <button
                      type="button"
                      onClick={() => onUpdateSpaceParams({ frequency_penalty: null })}
                      className="text-[8px] text-zinc-500 hover:text-zinc-300 underline font-mono"
                      title="Set to null / default"
                    >
                      null
                    </button>
                  )}
                </div>
              </div>
              <div className="relative pt-1">
                <input
                  type="range"
                  min="-2.0"
                  max="2.0"
                  step="0.05"
                  value={activeSpace.frequency_penalty ?? 0.0}
                  onChange={(e) => onUpdateSpaceParams({ frequency_penalty: Number(e.target.value) })}
                  className="w-full accent-[#c2a472] h-1 bg-[#1a1a1c] rounded-full appearance-none cursor-pointer"
                />
              </div>
              <div className="flex justify-between text-[8px] text-zinc-655 font-sans">
                <span>Repeat (-2.0)</span>
                <span>Neutral (0.0)</span>
                <span>Varied (+2.0)</span>
              </div>
              <p className="text-[8px] text-zinc-600 font-sans leading-tight">
                Positive values penalize new tokens based on their existing frequency in the text so far, decreasing repetition verbatim.
              </p>
              <div className="flex items-center gap-1 pt-0.5">
                {[
                  { label: '-1.0', val: -1.0 },
                  { label: '0.0', val: 0.0 },
                  { label: '+0.5', val: 0.5 },
                  { label: '+1.0', val: 1.0 },
                  { label: '+1.5', val: 1.5 },
                ].map(p => (
                  <button
                    key={p.label}
                    type="button"
                    onClick={() => onUpdateSpaceParams({ frequency_penalty: p.val })}
                    className={`flex-1 py-0.5 rounded text-[8px] font-mono transition-colors cursor-pointer ${
                      activeSpace.frequency_penalty === p.val
                        ? 'bg-[#c2a472] text-black font-bold'
                        : 'bg-[#151517] text-zinc-400 hover:text-white border border-[#222]'
                    }`}
                  >
                    {p.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Service Tier Selector */}
            <div className="space-y-1.5 pt-2 border-t border-[#1a1a1c]/60">
              <div className="flex justify-between items-center text-[9px] font-bold font-sans">
                <label className="text-zinc-555 uppercase tracking-normal">SERVICE TIER</label>
                <span className="text-[#c2a472] font-mono text-[9px] uppercase font-bold">
                  {activeSpace.service_tier ?? "auto"}
                </span>
              </div>
              <select
                value={activeSpace.service_tier ?? "auto"}
                onChange={(e) => onUpdateSpaceParams({ service_tier: e.target.value === "none" ? null : e.target.value })}
                className="w-full bg-[#151517] border border-[#222] rounded px-2.5 py-1.5 text-zinc-300 focus:outline-none focus:border-[#c2a472] font-mono text-[11px]"
              >
                <option value="auto">auto (Project Default Tier)</option>
                <option value="default">default (Standard Pricing & Performance)</option>
                <option value="flex">flex (Flex Processing Tier)</option>
                <option value="fast">fast (Fast Mode / Priority)</option>
                <option value="priority">priority (Priority Processing)</option>
                <option value="scale">scale (Scale Processing Tier)</option>
                <option value="none">null (Omit / Model Default)</option>
              </select>
              <p className="text-[8px] text-zinc-600 font-sans leading-tight">
                Specifies processing type used for serving requests. Default is &lsquo;auto&rsquo;.
              </p>
            </div>

            {/* OpenAI Audio Output Settings */}
            <div className="space-y-2 pt-2.5 border-t border-[#1a1a1c]/60">
              <div className="flex items-center justify-between">
                <div className="flex flex-col text-left">
                  <label className="text-[9px] font-bold text-zinc-300 font-sans uppercase tracking-normal">
                    AUDIO RESPONSE OUTPUT
                  </label>
                  <span className="text-[8px] text-zinc-500 font-sans">
                    Request speech output (modalities: ["text", "audio"]) for audio models
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => onUpdateSpaceParams({ enableAudioOutput: !activeSpace.enableAudioOutput })}
                  className={`w-9 h-5 flex items-center rounded-full p-0.5 cursor-pointer transition-colors ${
                    activeSpace.enableAudioOutput ? 'bg-[#c2a472] justify-end' : 'bg-zinc-800 justify-start'
                  }`}
                  title="Toggle audio response modality"
                >
                  <span className="w-4 h-4 rounded-full bg-black shadow-sm" />
                </button>
              </div>

              {activeSpace.enableAudioOutput && (
                <div className="space-y-2 bg-[#121214] p-2.5 rounded-sm border border-[#222] animate-fade-in mt-1">
                  <div className="space-y-1">
                    <label className="block text-[8.5px] font-bold text-zinc-400 uppercase font-mono">VOICE PREFERENCE</label>
                    <select
                      value={activeSpace.openaiVoice || "verse"}
                      onChange={(e) => onUpdateSpaceParams({ openaiVoice: e.target.value })}
                      className="w-full bg-[#18181b] border border-[#2e2e33] rounded px-2 py-1 text-zinc-200 font-mono text-[10px] focus:outline-none focus:border-[#c2a472]"
                    >
                      <option value="verse">Verse (Warm & natural)</option>
                      <option value="alloy">Alloy (Neutral & clear)</option>
                      <option value="ash">Ash (Expressive & crisp)</option>
                      <option value="ballad">Ballad (Smooth & soft)</option>
                      <option value="coral">Coral (Energetic & engaging)</option>
                      <option value="echo">Echo (Resonant & articulate)</option>
                      <option value="sage">Sage (Calm & thoughtful)</option>
                      <option value="shimmer">Shimmer (Bright & clear)</option>
                    </select>
                  </div>

                  <div className="space-y-1">
                    <label className="block text-[8.5px] font-bold text-zinc-400 uppercase font-mono">AUDIO FORMAT</label>
                    <select
                      value={activeSpace.openaiAudioFormat || "wav"}
                      onChange={(e) => onUpdateSpaceParams({ openaiAudioFormat: e.target.value })}
                      className="w-full bg-[#18181b] border border-[#2e2e33] rounded px-2 py-1 text-zinc-200 font-mono text-[10px] focus:outline-none focus:border-[#c2a472]"
                    >
                      <option value="wav">WAV (Uncompressed)</option>
                      <option value="mp3">MP3 (Compressed)</option>
                      <option value="flac">FLAC (Lossless)</option>
                    </select>
                  </div>
                </div>
              )}
            </div>

            {/* Sliding Context Scale Slider */}
            {(() => {
              const currentThread = activeSpace.threads.find(t => t.id === activeSpace.activeThreadId);
              let currentHistoryTokens = 0;
              let isCompactifiedActive = false;
              let rawHistoryTokens = 0;

              if (currentThread) {
                rawHistoryTokens = estimateTokenCount(currentThread.messages.map(m => m.content).join(" ") || "");
                const isCompactifiedEnabled = activeSpace.useCompactified ?? false;
                const hasCompactedChunks = currentThread.compactedChunks && currentThread.compactedChunks.length > 0;

                if (isCompactifiedEnabled && hasCompactedChunks) {
                  isCompactifiedActive = true;
                  const summariesText = currentThread.compactedChunks!
                    .map((chunk, idx) => `[COMPACTIFIED HISTORY CHUNK #${idx + 1} SUMMARY (${chunk.timestamp})]:\n${chunk.summary}`)
                    .join("\n\n");
                  const lastMsgId = currentThread.compactedUpToMessageId || currentThread.compactedChunks![currentThread.compactedChunks!.length - 1].lastMsgId;
                  const lastIdx = currentThread.messages.findIndex(m => m.id === lastMsgId);
                  const candidateMessages = lastIdx >= 0 ? currentThread.messages.slice(lastIdx + 1) : currentThread.messages;

                  const uncompactedText = candidateMessages.map(m => m.content).join(" ");
                  currentHistoryTokens = estimateTokenCount(summariesText + "\n\n" + uncompactedText);
                } else {
                  currentHistoryTokens = rawHistoryTokens;
                }
              }

              return (
                <div className="space-y-2 pt-3 border-t border-[#1a1a1c]/80">
                  <div className="flex justify-between items-center text-[9px] font-bold font-sans">
                    <span className="text-zinc-300 uppercase tracking-normal flex items-center gap-1">
                      <Sliders className="w-3 h-3 text-[#c2a472]" />
                      CONTEXT HISTORY SCALE
                    </span>
                    <span className="text-[#c2a472] font-bold font-mono text-[10px]">
                      {(!activeSpace.contextScaleTokens || activeSpace.contextScaleTokens >= 1000000 || activeSpace.contextScaleTokens === 0)
                        ? "FULL / UNLIMITED"
                        : formatTokenEstimate(activeSpace.contextScaleTokens)}
                    </span>
                  </div>

                  <div className="relative pt-1">
                    <input
                      type="range"
                      min="0"
                      max="100"
                      step="1"
                      value={
                        !activeSpace.contextScaleTokens || activeSpace.contextScaleTokens >= 1000000 || activeSpace.contextScaleTokens === 0
                          ? 100
                          : Math.round(((Math.log10(Math.max(100, activeSpace.contextScaleTokens)) - 2) / 4) * 100)
                      }
                      onChange={(e) => {
                        const sliderVal = Number(e.target.value);
                        if (sliderVal >= 100) {
                          onUpdateSpaceParams({ contextScaleTokens: 0 }); // 0 = Unlimited
                        } else {
                          const tokens = Math.round(Math.pow(10, 2 + (sliderVal / 100) * 4));
                          onUpdateSpaceParams({ contextScaleTokens: tokens });
                        }
                      }}
                      className="w-full accent-[#c2a472] h-1 bg-[#1a1a1c] rounded-full appearance-none cursor-pointer"
                    />
                  </div>

                  <div className="flex justify-between text-[8px] text-zinc-500 font-sans px-0.5">
                    <span>100t</span>
                    <span>1kt</span>
                    <span>10kt</span>
                    <span>100kt</span>
                    <span>Full Context</span>
                  </div>

                  {/* Preset Buttons */}
                  <div className="grid grid-cols-5 gap-1 pt-1">
                    {[
                      { label: '100t', val: 100 },
                      { label: '1kt', val: 1000 },
                      { label: '10kt', val: 10000 },
                      { label: '100kt', val: 100000 },
                      { label: 'Full', val: 0 },
                    ].map((preset) => {
                      const isSelected = preset.val === 0
                        ? (!activeSpace.contextScaleTokens || activeSpace.contextScaleTokens === 0 || activeSpace.contextScaleTokens >= 1000000)
                        : activeSpace.contextScaleTokens === preset.val;
                      return (
                        <button
                          key={preset.label}
                          type="button"
                          onClick={() => onUpdateSpaceParams({ contextScaleTokens: preset.val })}
                          className={`py-0.5 rounded text-[8px] font-mono font-bold transition-all cursor-pointer ${
                            isSelected
                              ? 'bg-[#c2a472] text-black shadow-sm'
                              : 'bg-[#151517] border border-[#222] text-zinc-400 hover:text-white'
                          }`}
                        >
                          {preset.label}
                        </button>
                      );
                    })}
                  </div>

                  <div className="text-[8px] text-zinc-500 font-mono flex items-center justify-between pt-1 border-t border-[#1a1a1c]/40">
                    <span>Active history size:</span>
                    <span className="text-zinc-300 font-bold flex items-center gap-1">
                      {formatTokenEstimate(currentHistoryTokens)}
                      {isCompactifiedActive && (
                        <span className="text-[7.5px] text-[#c2a472] bg-[#c2a472]/10 px-1 py-0.2 rounded border border-[#c2a472]/30 font-semibold" title={`Raw uncompacted history size is ${formatTokenEstimate(rawHistoryTokens)}`}>
                          Compactified
                        </span>
                      )}
                    </span>
                  </div>
                </div>
              );
            })()}

            {/* Use Compactified Toggle */}
            {(() => {
              const currentThread = activeSpace.threads.find(t => t.id === activeSpace.activeThreadId);
              return (
                <div className="flex flex-col gap-1.5 py-2 bg-[#121213] px-2.5 rounded-sm border border-[#222]/60">
                  <div className="flex items-center justify-between">
                    <div className="flex flex-col text-left pr-2">
                      <span className="text-[9px] font-bold text-zinc-200 uppercase tracking-normal font-sans flex items-center gap-1">
                        <Shrink className="w-3 h-3 text-[#c2a472]" />
                        USE COMPACTIFIED HISTORY
                      </span>
                      <span className="text-[8px] text-zinc-500 font-sans leading-tight">
                        Send hidden chunk summaries up to checkpoint instead of raw history
                      </span>
                    </div>
                    <label className="relative inline-flex items-center cursor-pointer select-none shrink-0">
                      <input
                        type="checkbox"
                        checked={activeSpace.useCompactified ?? false}
                        onChange={(e) => onUpdateSpaceParams({ useCompactified: e.target.checked })}
                        className="sr-only peer"
                      />
                      <div className="w-8 h-4 bg-zinc-800 rounded-full peer peer-checked:after:translate-x-full after:content-[''] after:absolute after:top-0.5 after:left-[2px] after:bg-zinc-400 after:border-zinc-300 after:border after:rounded-full after:h-3 after:w-3 after:transition-all peer-checked:bg-[#c2a472] peer-checked:after:bg-black peer-checked:after:border-[#c2a472]"></div>
                    </label>
                  </div>

                  {currentThread?.compactedChunks && currentThread.compactedChunks.length > 0 && (
                    <div className="flex flex-col gap-1 mt-0.5">
                      <div className="text-[8px] font-mono text-[#c2a472] bg-[#0a0a0b] p-1.5 rounded border border-[#222] flex items-center justify-between">
                        <span>{currentThread.compactedChunks.length} summary chunk(s) active</span>
                        <span className="text-zinc-400 font-bold">
                          ~{currentThread.compactedChunks.reduce((acc, c) => acc + (c.summaryTokensEst || 0), 0)} tokens
                        </span>
                      </div>
                      <div className="flex items-center gap-1">
                        {onOpenCompactSummariesModal && (
                          <button
                            type="button"
                            onClick={onOpenCompactSummariesModal}
                            className="flex-1 py-1 px-1.5 bg-[#1a1a1c] hover:bg-[#252528] text-[#c2a472] border border-[#333] rounded text-[8px] font-mono font-bold flex items-center justify-center gap-1 cursor-pointer transition-colors"
                          >
                            <Eye className="w-2.5 h-2.5" />
                            VIEW SUMMARIES
                          </button>
                        )}
                        {onClearAllCompactChunks && (
                          <button
                            type="button"
                            onClick={onClearAllCompactChunks}
                            className="py-1 px-1.5 bg-[#1a1a1c] hover:bg-red-950/60 text-red-400 border border-[#333] hover:border-red-800 rounded text-[8px] font-mono font-bold flex items-center justify-center gap-1 cursor-pointer transition-colors"
                            title="Clear all compactified summaries for this thread"
                          >
                            <Trash className="w-2.5 h-2.5" />
                            CLEAR
                          </button>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              );
            })()}

            {/* Thinking Log Toggle */}
            <div className="flex items-center justify-between py-1.5 bg-[#121213] px-2.5 rounded-sm border border-[#222]/40">
              <div className="flex flex-col text-left">
                <span className="text-[9px] font-bold text-zinc-400 uppercase tracking-normal font-sans">Keep Thinking Logs</span>
                <span className="text-[8px] text-zinc-600 font-sans leading-tight">Preserve CoT as separate editable messages</span>
              </div>
              <label className="relative inline-flex items-center cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={activeSpace.enableThinkingLogs ?? false}
                  onChange={(e) => onUpdateSpaceParams({ enableThinkingLogs: e.target.checked })}
                  className="sr-only peer"
                />
                <div className="w-8 h-4 bg-zinc-800 rounded-full peer peer-checked:after:translate-x-full after:content-[''] after:absolute after:top-0.5 after:left-[2px] after:bg-zinc-400 after:border-zinc-300 after:border after:rounded-full after:h-3 after:w-3 after:transition-all peer-checked:bg-[#c2a472] peer-checked:after:bg-black peer-checked:after:border-[#c2a472]"></div>
              </label>
            </div>

            {/* Include CoT in Context Toggle */}
            <div className="flex items-center justify-between py-1.5 bg-[#121213] px-2.5 rounded-sm border border-[#222]/40">
              <div className="flex flex-col text-left">
                <span className="text-[9px] font-bold text-zinc-400 uppercase tracking-normal font-sans">Feed CoT into Context</span>
                <span className="text-[8px] text-zinc-600 font-sans leading-tight">Include past thinking logs in model's prompt history</span>
              </div>
              <label className="relative inline-flex items-center cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={activeSpace.includeCoTInContext ?? false}
                  onChange={(e) => onUpdateSpaceParams({ includeCoTInContext: e.target.checked })}
                  className="sr-only peer"
                />
                <div className="w-8 h-4 bg-zinc-800 rounded-full peer peer-checked:after:translate-x-full after:content-[''] after:absolute after:top-0.5 after:left-[2px] after:bg-zinc-400 after:border-zinc-300 after:border after:rounded-full after:h-3 after:w-3 after:transition-all peer-checked:bg-[#c2a472] peer-checked:after:bg-black peer-checked:after:border-[#c2a472]"></div>
              </label>
            </div>

            {/* Reasoning Specific Controls (Inkling and all OpenAI models except GPT-4x) */}
            {Boolean(activeSpace.model && shouldApplyReasoningLogic(activeSpace.model)) && (
              <div className="space-y-4 pt-3.5 border-t border-[#1a1a1c]/60 animate-fade-in">
                <div className="text-[10px] font-bold text-[#c2a472] tracking-wider uppercase font-sans flex items-center gap-1.5">
                  <Sliders className="w-3.5 h-3.5" style={{ height: '12px' }} />
                  <span>
                    {isInklingModel(activeSpace.model)
                      ? "INKLING (TINKER) PARAMS"
                      : "OPENAI REASONING PARAMS"}
                  </span>
                </div>

                {/* Reasoning Effort Selector */}
                <div className="space-y-1.5">
                  <div className="flex justify-between items-center text-[9px] font-bold font-sans">
                    <span className="text-zinc-500 uppercase tracking-normal">Reasoning Effort</span>
                    <span className="text-[#c2a472] font-bold font-mono uppercase">{String(activeSpace.tinkerReasoningEffort || 'high')}</span>
                  </div>
                  <div className="grid grid-cols-3 gap-1 bg-[#151517] p-1 rounded border border-[#222]">
                    {(['none', 'minimal', 'low', 'medium', 'high', 'xhigh'] as const).map((effortOpt) => {
                      const isSelected = (activeSpace.tinkerReasoningEffort || 'high') === effortOpt;
                      return (
                        <button
                          key={effortOpt}
                          type="button"
                          onClick={() => onUpdateSpaceParams({ tinkerReasoningEffort: effortOpt })}
                          className={`py-1 rounded text-[9px] font-mono font-bold uppercase transition-all ${
                            isSelected
                              ? 'bg-[#c2a472] text-black shadow-sm'
                              : 'text-zinc-400 hover:text-zinc-200 hover:bg-[#1a1a1c]'
                          }`}
                        >
                          {effortOpt}
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Web Search Toggle (for Tinker/Inkling) */}
                {isInklingModel(activeSpace.model) && (
                  <div className="flex items-center justify-between py-1 bg-[#121213] px-2.5 rounded-sm border border-[#222]/40">
                    <span className="text-[9px] font-bold text-zinc-400 uppercase tracking-normal font-sans">Enable Web Search</span>
                    <label className="relative inline-flex items-center cursor-pointer select-none">
                      <input
                        type="checkbox"
                        checked={activeSpace.tinkerWebSearch ?? false}
                        onChange={(e) => onUpdateSpaceParams({ tinkerWebSearch: e.target.checked })}
                        className="sr-only peer"
                      />
                      <div className="w-8 h-4 bg-zinc-800 rounded-full peer peer-checked:after:translate-x-full after:content-[''] after:absolute after:top-0.5 after:left-[2px] after:bg-zinc-400 after:border-zinc-300 after:border after:rounded-full after:h-3 after:w-3 after:transition-all peer-checked:bg-[#c2a472] peer-checked:after:bg-black peer-checked:after:border-[#c2a472]"></div>
                    </label>
                  </div>
                )}
              </div>
            )}

          </div>
        </div>

      </div>

      {/* 5. INDESTRUCTIBLE BACKUP LAYER */}
      <div className="p-4 border-t border-[#1a1a1c] bg-[#0c0c0d] space-y-3 font-sans text-left">
        <div className="text-[9px] font-bold text-zinc-550 tracking-[0.12em] uppercase px-1">LOCAL PERSISTENCE</div>
        
        <div className="grid grid-cols-2 gap-2">
          <button
            onClick={onBackupData}
            className="flex items-center justify-center gap-1.5 bg-[#151517] border border-[#222] hover:bg-[#1a1a1c] text-[#d4d4d8] py-1.5 px-2.5 rounded-sm transition-all text-[10px] font-bold cursor-pointer"
            title="Download full workspace config as JSON"
          >
            <Download className="w-3.5 h-3.5 text-zinc-500" />
            <span>BACKUP</span>
          </button>

          <label className="flex items-center justify-center gap-1.5 bg-[#151517] border border-[#222] hover:bg-[#1a1a1c] text-[#d4d4d8] py-1.5 px-2.5 rounded-sm cursor-pointer transition-all text-[10px] font-bold">
            <Upload className="w-3.5 h-3.5 text-zinc-500" />
            <span>RESTORE</span>
            <input
              type="file"
              accept=".json"
              onChange={onRestoreData}
              className="hidden"
            />
          </label>
        </div>

        {onClearAllImages && (
          <div className="px-1">
            <button
              type="button"
              onClick={onClearAllImages}
              className="w-full flex items-center justify-center gap-1.5 bg-[#151517] border border-[#222] hover:border-red-900/40 hover:bg-red-950/20 text-zinc-300 hover:text-red-300 py-1.5 rounded-sm transition-all text-[10px] font-bold cursor-pointer"
              title="Purge all attached and stored images across threads, spaces, and memories to free up space"
            >
              <ImageIcon className="w-3.5 h-3.5 text-[#c2a472]" />
              <span>CLEAR STORED IMAGES {storedImagesCount !== undefined && storedImagesCount > 0 ? `(${storedImagesCount})` : ''}</span>
            </button>
          </div>
        )}

        {onResetData && (
          <div className="px-1 pt-1">
            {!showResetConfirm ? (
              <button
                onClick={() => setShowResetConfirm(true)}
                className="w-full flex items-center justify-center gap-1.5 bg-red-950/20 border border-red-900/30 hover:border-red-800/80 hover:bg-red-950/40 text-red-400 py-1.5 rounded-sm transition-all text-[10px] font-bold cursor-pointer"
              >
                <Trash className="w-3.5 h-3.5 text-red-500" />
                <span>PURGE PERSISTENCE</span>
              </button>
            ) : (
              <div className="space-y-1.5 p-1 bg-[#151111] border border-red-900/30 rounded">
                <div className="text-[9px] text-red-400 text-center font-bold">WIPE DEFAULTS? ARE YOU ABSOLUTELY SURE?</div>
                <div className="grid grid-cols-2 gap-1.5">
                  <button
                    onClick={() => {
                      setShowResetConfirm(false);
                      onResetData();
                    }}
                    className="bg-red-700 hover:bg-red-600 text-white font-bold py-1 rounded-sm text-[9px] cursor-pointer text-center"
                  >
                    YES, PURGE
                  </button>
                  <button
                    onClick={() => setShowResetConfirm(false)}
                    className="bg-[#151517] border border-[#222] hover:bg-[#1a1a1c] text-[#d4d4d8] font-bold py-1 rounded-sm text-[9px] cursor-pointer text-center"
                  >
                    CANCEL
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        <div className="text-[9px] text-zinc-650 text-center font-sans font-medium leading-normal px-1">
          Exporting/Importing dumps all spaces, notes, memories & credentials completely offline.
        </div>
      </div>

    </div>
  );
};
