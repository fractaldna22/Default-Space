import React, { memo, useState } from 'react';
import { Message, CompactChunk, PromptStackLayer, ChatAppearanceSettings, AttachedAudio, AssistantAudioResponse } from '../types';
import { getFontFamilyCss } from '../utils/fontConstants';
import { copyToClipboard, escapeHtml } from '../utils/clipboardUtils';
import { CodeBlock, PreBlock } from './CodeBlock';
import Markdown from 'react-markdown';
import remarkBreaks from 'remark-breaks';
import remarkGfm from 'remark-gfm';
import {
  Cpu,
  User,
  Volume2,
  Image,
  X,
  Check,
  Edit3,
  Copy,
  Trash,
  RotateCw,
  Shrink,
  Eye,
  Layers,
  ChevronLeft,
  ChevronRight,
  GitBranch,
  FileText,
  MoreHorizontal
} from 'lucide-react';

const markdownComponents = {
  code: CodeBlock,
  pre: PreBlock,
};

const REMARK_PLUGINS = [remarkBreaks, remarkGfm];

const parseThinkingContent = (content: any): { thinking: string; response: string } => {
  if (!content || typeof content !== 'string') return { thinking: "", response: typeof content === 'string' ? content : "" };

  let thinkingText = "";
  const thoughtRegex = /<(thought|thinking)>([\s\S]*?)<\/\1>/gi;
  let match;
  while ((match = thoughtRegex.exec(content)) !== null) {
    thinkingText += match[2] + "\n";
  }

  let cleanedResponse = content.replace(/<(thought|thinking)>[\s\S]*?<\/\1>/gi, "");
  cleanedResponse = cleanedResponse.replace(/<(thought|thinking)>[\s\S]*/gi, "");

  return { thinking: thinkingText.trim(), response: cleanedResponse.trim() };
};

interface ChatMessageItemProps {
  msg: Message;
  index: number;
  isLast: boolean;
  isStreaming: boolean;
  activeModel: string;
  isEditing: boolean;
  editingMessageText: string;
  editingMessageImages: string[];
  editingMessageAudios?: AttachedAudio[];
  editingMessageAudioResponse?: AssistantAudioResponse;
  copiedFormattedMsgId: string | null;
  copiedMarkdownMsgId: string | null;
  inspectMessageId: string | null;
  resolvedPromptStack?: PromptStackLayer[];
  isCompactifying: boolean;
  isCompactifyingMsgId: string | null;
  compactChunk?: CompactChunk;
  fontSettings?: ChatAppearanceSettings;
  onSetEditingMessage: (id: string, content: string, images: string[], audios?: AttachedAudio[], audioResponse?: AssistantAudioResponse) => void;
  onCancelEditing: () => void;
  onSaveEditedMessage: (id: string, andRegenerate?: boolean) => void;
  onEditingTextChange: (text: string) => void;
  onRemoveEditingImage: (index: number) => void;
  onAddEditingImages: (images: string[]) => void;
  onRemoveEditingAudio?: (index: number) => void;
  onRemoveEditingAudioResponse?: () => void;
  onAddEditingAudios?: (audios: AttachedAudio[]) => void;
  onDeleteMessageAudio?: (messageId: string, audioId: string) => void;
  onDeleteMessageAudioResponse?: (messageId: string) => void;
  onPasteImage: (e: React.ClipboardEvent<HTMLTextAreaElement>) => void;
  onToggleInspect: (id: string) => void;
  onCopyFormatted: (msg: Message) => void;
  onCopyMarkdown: (msg: Message) => void;
  onDeleteMessage: (id: string) => void;
  onRegenerate: (id: string) => void;
  onCompactify: (id: string, force: boolean) => void;
  onDeleteCompactChunk: (chunkId: string) => void;
  onViewChunkSummary: (chunk: CompactChunk) => void;
  onSwitchBranch?: (id: string, direction: 'prev' | 'next' | number) => void;
}

export const ChatMessageItem = memo(function ChatMessageItem({
  msg,
  index,
  isLast,
  isStreaming,
  activeModel,
  isEditing,
  editingMessageText,
  editingMessageImages,
  editingMessageAudios,
  editingMessageAudioResponse,
  copiedFormattedMsgId,
  copiedMarkdownMsgId,
  inspectMessageId,
  resolvedPromptStack,
  isCompactifying,
  isCompactifyingMsgId,
  compactChunk,
  fontSettings,
  onSetEditingMessage,
  onCancelEditing,
  onSaveEditedMessage,
  onEditingTextChange,
  onRemoveEditingImage,
  onAddEditingImages,
  onRemoveEditingAudio,
  onRemoveEditingAudioResponse,
  onAddEditingAudios,
  onDeleteMessageAudio,
  onDeleteMessageAudioResponse,
  onPasteImage,
  onToggleInspect,
  onCopyFormatted,
  onCopyMarkdown,
  onDeleteMessage,
  onRegenerate,
  onCompactify,
  onDeleteCompactChunk,
  onViewChunkSummary,
  onSwitchBranch,
}: ChatMessageItemProps) {
  const isUser = msg.role === 'user';
  const isThought = msg.isThought === true;
  const editFileInputRef = React.useRef<HTMLInputElement>(null);
  const editAudioFileInputRef = React.useRef<HTMLInputElement>(null);
  const editMessageRef = React.useRef<HTMLTextAreaElement>(null);

  const customFontFamily = fontSettings ? getFontFamilyCss(fontSettings.fontFamily) : 'Verdana, sans-serif';
  const customFontSize = fontSettings?.fontSize ? `${fontSettings.fontSize}px` : '13px';
  const customLineHeight = fontSettings?.lineHeight || 1.6;
  const bubbleMaxWidth = fontSettings?.bubbleMaxWidth || '88%';

  const userBubbleBg = fontSettings?.userBubbleBg || '#3d0981';
  const userBubbleBorder = fontSettings?.userBubbleBorder || '#5d1fa2';
  const userBubbleText = fontSettings?.userBubbleText || '#e4e4e7';

  const assistantBubbleBg = fontSettings?.assistantBubbleBg || '#090a0e';
  const assistantBubbleBorder = fontSettings?.assistantBubbleBorder || '#1e2029';
  const assistantBubbleText = fontSettings?.assistantBubbleText || '#f4f4f5';

  const bubbleBg = isThought ? '#131316' : (isUser ? userBubbleBg : assistantBubbleBg);
  const bubbleBorder = isThought ? '#2a2a30' : (isUser ? userBubbleBorder : assistantBubbleBorder);
  const bubbleColor = isThought ? '#a1a1aa' : (isUser ? userBubbleText : assistantBubbleText);

  const hasBranches = Boolean(msg.versions && msg.versions.length > 1);
  const currentBranchIdx = msg.currentVersionIndex ?? 0;
  const totalBranches = msg.versions?.length ?? 1;

  const [copiedInspectLayerIdx, setCopiedInspectLayerIdx] = useState<number | null>(null);
  const [copiedInspectStack, setCopiedInspectStack] = useState(false);
  const [showMobileActions, setShowMobileActions] = useState(false);

  // Auto-resize edit message textarea
  React.useEffect(() => {
    if (isEditing && editMessageRef.current) {
      const el = editMessageRef.current;
      el.style.height = 'auto';
      el.style.height = `${Math.min(el.scrollHeight, 200)}px`;
    }
  }, [editingMessageText, isEditing]);

  return (
    <div
      className={`flex flex-col gap-1.5 relative group animate-fade-in ${isUser ? 'items-end' : 'items-start'} w-full min-w-0 max-w-full`}
    >
      {/* Sender stamp & Branch Indicator */}
      <div className={`flex items-center gap-2 text-[9px] text-zinc-600 select-none ${hasBranches ? '' : 'mobile-message-stamp'}`}>
        {isThought ? (
          <>
            <span className="font-bold text-amber-500 flex items-center gap-1 uppercase font-mono tracking-wider">
              <Cpu className="w-2.5 h-2.5 text-amber-500 animate-pulse" />
              <span>{msg.modelUsed || activeModel || "openai/gpt-4o"} (THINKING LOG)</span>
            </span>
            <span>{new Date(msg.timestamp).toLocaleTimeString()}</span>
          </>
        ) : isUser ? (
          <>
            {/* Branch Switcher Pill for User Message */}
            {hasBranches && (
              <div
                id={`branch-switcher-${msg.id}`}
                className="flex items-center gap-1 bg-[#151518] border border-[#2b2b32] hover:border-[#c2a472]/60 rounded px-1.5 py-0.5 text-[9px] font-mono shadow-sm transition-colors mr-1"
              >
                <GitBranch className="w-2.5 h-2.5 text-[#c2a472]" />
                <button
                  type="button"
                  id={`branch-prev-${msg.id}`}
                  onClick={() => onSwitchBranch?.(msg.id, 'prev')}
                  disabled={isStreaming || currentBranchIdx <= 0}
                  className="p-0.5 text-zinc-400 hover:text-[#c2a472] disabled:opacity-30 disabled:hover:text-zinc-400 cursor-pointer disabled:cursor-not-allowed transition-colors"
                  title="Switch to previous branch / version"
                >
                  <ChevronLeft className="w-3 h-3" />
                </button>
                <span className="font-bold text-[#c2a472] px-0.5 tracking-wider">
                  {currentBranchIdx + 1}/{totalBranches}
                </span>
                <button
                  type="button"
                  id={`branch-next-${msg.id}`}
                  onClick={() => onSwitchBranch?.(msg.id, 'next')}
                  disabled={isStreaming || currentBranchIdx >= totalBranches - 1}
                  className="p-0.5 text-zinc-400 hover:text-[#c2a472] disabled:opacity-30 disabled:hover:text-zinc-400 cursor-pointer disabled:cursor-not-allowed transition-colors"
                  title="Switch to next branch / version"
                >
                  <ChevronRight className="w-3 h-3" />
                </button>
              </div>
            )}
            <span>{new Date(msg.timestamp).toLocaleTimeString()}</span>
            <span className="font-bold text-zinc-400 flex items-center gap-1">
              <span>PILOT</span>
              <User className="w-2.5 h-2.5" />
            </span>
          </>
        ) : (
          <>
            <span className="font-bold text-emerald-500 flex items-center gap-1 uppercase font-mono tracking-wider">
              <Cpu className="w-2.5 h-2.5" />
              <span>{msg.modelUsed || activeModel || "openai/gpt-4o"}</span>
            </span>
            <span>{new Date(msg.timestamp).toLocaleTimeString()}</span>
            {msg.latencyMs && (
              <span className="text-zinc-650">({msg.latencyMs}ms)</span>
            )}
            {/* Branch Switcher Pill for Assistant Message */}
            {hasBranches && (
              <div
                id={`branch-switcher-${msg.id}`}
                className="flex items-center gap-1 bg-[#151518] border border-[#2b2b32] hover:border-[#c2a472]/60 rounded px-1.5 py-0.5 text-[9px] font-mono shadow-sm transition-colors ml-1"
              >
                <GitBranch className="w-2.5 h-2.5 text-[#c2a472]" />
                <button
                  type="button"
                  id={`branch-prev-${msg.id}`}
                  onClick={() => onSwitchBranch?.(msg.id, 'prev')}
                  disabled={isStreaming || currentBranchIdx <= 0}
                  className="p-0.5 text-zinc-400 hover:text-[#c2a472] disabled:opacity-30 disabled:hover:text-zinc-400 cursor-pointer disabled:cursor-not-allowed transition-colors"
                  title="Switch to previous branch / version"
                >
                  <ChevronLeft className="w-3 h-3" />
                </button>
                <span className="font-bold text-[#c2a472] px-0.5 tracking-wider">
                  {currentBranchIdx + 1}/{totalBranches}
                </span>
                <button
                  type="button"
                  id={`branch-next-${msg.id}`}
                  onClick={() => onSwitchBranch?.(msg.id, 'next')}
                  disabled={isStreaming || currentBranchIdx >= totalBranches - 1}
                  className="p-0.5 text-zinc-400 hover:text-[#c2a472] disabled:opacity-30 disabled:hover:text-zinc-400 cursor-pointer disabled:cursor-not-allowed transition-colors"
                  title="Switch to next branch / version"
                >
                  <ChevronRight className="w-3 h-3" />
                </button>
              </div>
            )}
          </>
        )}
      </div>

      {/* Body Speech Card */}
      <div
        id={`message-bubble-${msg.id}`}
        className="message-bubble w-full rounded-sm p-4 overflow-hidden min-w-0 leading-relaxed shadow-sm border transition-all"
        data-message-id={msg.id}
        data-is-user={isUser ? "true" : "false"}
        data-is-thought={isThought ? "true" : "false"}
        data-model-id={msg.modelUsed || activeModel || "openai/gpt-4o"}
        style={{
          maxWidth: bubbleMaxWidth,
          backgroundColor: bubbleBg,
          borderColor: bubbleBorder,
          color: bubbleColor,
          fontFamily: isThought ? 'var(--font-mono)' : customFontFamily,
          fontSize: isThought ? `${Math.max(10, (fontSettings?.fontSize || 13) - 2)}px` : customFontSize,
          lineHeight: customLineHeight,
          ['--chat-font-family' as any]: isThought ? 'var(--font-mono)' : customFontFamily,
          ['--chat-font-size' as any]: isThought ? `${Math.max(10, (fontSettings?.fontSize || 13) - 2)}px` : customFontSize,
          ['--chat-line-height' as any]: customLineHeight,
        }}
      >
        {/* Attached images, if user uploaded and not in edit mode */}
        {!isEditing && msg.images && msg.images.length > 0 && (
          <div className="flex gap-2 mb-3 overflow-x-auto pb-1.5 border-b border-zinc-805/40">
            {msg.images.map((img, i) => (
              <img
                key={i}
                src={img}
                alt="Visual Payload"
                referrerPolicy="no-referrer"
                className="h-28 rounded-sm object-cover border border-[#222]"
              />
            ))}
          </div>
        )}

        {/* Attached audios, if user uploaded and not in edit mode */}
        {!isEditing && msg.audios && msg.audios.length > 0 && (
          <div className="flex flex-col gap-2 mb-3 max-w-sm border-b border-zinc-800/40 pb-2">
            {msg.audios.map((aud) => (
              <div key={aud.id} className="bg-[#0b0b0d] border border-zinc-800/60 p-2 rounded-sm flex flex-col gap-1 w-full text-left">
                <div className="flex items-center gap-1.5 text-[10px] text-zinc-400 font-mono">
                  <Volume2 className="w-3.5 h-3.5 text-[#c2a472]" />
                  <span className="font-semibold truncate flex-1">{aud.name}</span>
                  <span className="text-[8px] text-zinc-650 font-mono uppercase">{aud.format}</span>
                  {onDeleteMessageAudio && (
                    <button
                      type="button"
                      onClick={() => onDeleteMessageAudio(msg.id, aud.id)}
                      className="p-1 rounded hover:bg-red-950/60 text-zinc-500 hover:text-red-400 transition-colors cursor-pointer ml-1"
                      title="Delete audio clip from message"
                    >
                      <Trash className="w-3 h-3 text-red-400/80 hover:text-red-400" />
                    </button>
                  )}
                </div>
                <audio 
                  src={`data:audio/${aud.format};base64,${aud.data}`} 
                  controls 
                  className="w-full h-8 bg-zinc-900 rounded border border-zinc-800 mt-1 accent-[#c2a472]"
                />
                {(aud.sample_rate !== undefined || aud.num_frames !== undefined) && (
                  <div className="text-[8px] text-zinc-600 font-mono flex gap-2 mt-0.5">
                    {aud.sample_rate && <span>SR: {aud.sample_rate}Hz</span>}
                    {aud.num_frames && <span>FR: {aud.num_frames}</span>}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        {/* Generated Model Audio Output, if model returned audio and not in edit mode */}
        {!isEditing && msg.audioResponse && msg.audioResponse.data && (
          <div className="bg-[#0b0b0e] border border-[#2b2b32] p-3 rounded-sm flex flex-col gap-1.5 mb-3 max-w-md text-left font-mono">
            <div className="flex items-center justify-between text-[10px] text-[#c2a472] font-bold">
              <div className="flex items-center gap-1.5">
                <Volume2 className="w-3.5 h-3.5 text-[#c2a472] animate-pulse" />
                <span>AI AUDIO RESPONSE ({msg.audioResponse.format.toUpperCase()})</span>
              </div>
              {onDeleteMessageAudioResponse && (
                <button
                  type="button"
                  onClick={() => onDeleteMessageAudioResponse(msg.id)}
                  className="flex items-center gap-1 px-1.5 py-0.5 rounded bg-red-950/50 hover:bg-red-900/80 border border-red-900/60 text-red-300 hover:text-white text-[9px] cursor-pointer transition-colors"
                  title="Delete AI audio response"
                >
                  <Trash className="w-3 h-3 text-red-400" />
                  <span>DELETE AUDIO</span>
                </button>
              )}
            </div>
            <audio
              src={`data:audio/${msg.audioResponse.format || 'wav'};base64,${msg.audioResponse.data}`}
              controls
              className="w-full h-8 bg-zinc-900 rounded border border-zinc-800 accent-[#c2a472]"
            />
            {msg.audioResponse.transcript && (
              <div className="text-[10px] text-zinc-400 font-sans italic border-t border-zinc-800/80 pt-1 mt-0.5 leading-snug">
                &ldquo;{msg.audioResponse.transcript}&rdquo;
              </div>
            )}
          </div>
        )}

        {isEditing ? (
          <div className="space-y-3 font-mono w-full min-w-[280px] lg:min-w-[450px]">
            {/* Interactive edit images preview context */}
            {editingMessageImages.length > 0 && (
              <div className="flex gap-2.5 mb-2 overflow-x-auto pb-2 border-b border-zinc-800 animate-fade-in">
                {editingMessageImages.map((img, i) => (
                  <div key={i} className="relative group flex-shrink-0">
                    <img
                      src={img}
                      alt="Editable Visual Payload"
                      referrerPolicy="no-referrer"
                      className="h-20 w-20 rounded-sm object-cover border border-zinc-800"
                    />
                    <button
                      type="button"
                      onClick={() => onRemoveEditingImage(i)}
                      className="absolute -top-1.5 -right-1.5 rounded-full bg-red-600 hover:bg-red-500 p-0.5 cursor-pointer shadow-md transition-colors"
                      title="Remove image from message"
                    >
                      <X className="w-3 h-3 text-white" />
                    </button>
                  </div>
                ))}
              </div>
            )}

            {/* Interactive edit audio clips preview context */}
            {editingMessageAudios && editingMessageAudios.length > 0 && (
              <div className="flex flex-col gap-2 mb-2 p-2 bg-[#0d0d0f] border border-zinc-800 rounded-sm animate-fade-in">
                <div className="text-[9px] font-bold text-[#c2a472] uppercase tracking-wider flex items-center gap-1">
                  <Volume2 className="w-3 h-3" />
                  <span>Attached Input Audio ({editingMessageAudios.length})</span>
                </div>
                {editingMessageAudios.map((aud, idx) => (
                  <div key={aud.id || idx} className="bg-[#121215] border border-zinc-800 p-2 rounded flex items-center justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <div className="text-[10px] font-semibold text-zinc-300 truncate">{aud.name}</div>
                      <audio
                        src={`data:audio/${aud.format};base64,${aud.data}`}
                        controls
                        className="w-full h-7 mt-1 accent-[#c2a472]"
                      />
                    </div>
                    <button
                      type="button"
                      onClick={() => onRemoveEditingAudio?.(idx)}
                      className="p-1.5 rounded bg-red-950/60 hover:bg-red-900 border border-red-800 text-red-300 hover:text-white cursor-pointer transition-colors shrink-0"
                      title="Remove audio clip from message"
                    >
                      <Trash className="w-3.5 h-3.5 text-red-400" />
                    </button>
                  </div>
                ))}
              </div>
            )}

            {/* Interactive edit model audio response context */}
            {editingMessageAudioResponse && editingMessageAudioResponse.data && (
              <div className="bg-[#0e0e11] border border-[#2b2b32] p-2.5 rounded-sm flex flex-col gap-1.5 mb-2 text-left font-mono animate-fade-in">
                <div className="flex items-center justify-between text-[10px] text-[#c2a472] font-bold">
                  <div className="flex items-center gap-1.5">
                    <Volume2 className="w-3.5 h-3.5 text-[#c2a472]" />
                    <span>Generated AI Audio Response</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => onRemoveEditingAudioResponse?.()}
                    className="flex items-center gap-1 px-1.5 py-0.5 rounded bg-red-950/60 hover:bg-red-900 border border-red-800 text-red-300 hover:text-white text-[9px] cursor-pointer transition-colors"
                    title="Remove AI audio response from message"
                  >
                    <Trash className="w-3 h-3 text-red-400" />
                    <span>DELETE AUDIO</span>
                  </button>
                </div>
                <audio
                  src={`data:audio/${editingMessageAudioResponse.format || 'wav'};base64,${editingMessageAudioResponse.data}`}
                  controls
                  className="w-full h-7 bg-zinc-900 rounded border border-zinc-800 accent-[#c2a472]"
                />
              </div>
            )}

            <textarea
              ref={editMessageRef}
              value={editingMessageText}
              onChange={(e) => onEditingTextChange(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Escape') {
                  e.preventDefault();
                  onCancelEditing();
                } else if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
                  e.preventDefault();
                  onSaveEditedMessage(msg.id, isUser);
                }
              }}
              onPaste={onPasteImage}
              rows={3}
              placeholder={isUser ? "Edit prompt text here... (Ctrl+Enter to save & re-run, Esc to cancel)" : "Edit response text here... (Ctrl+Enter to save, Esc to cancel)"}
              style={{
                fontFamily: customFontFamily,
                fontSize: customFontSize,
                lineHeight: customLineHeight
              }}
              className="w-full bg-[#0a0a0b] border border-[#222] rounded p-2.5 text-zinc-200 focus:outline-none focus:border-[#c2a472] resize-y max-h-[280px] overflow-y-auto"
            />

            {/* Hidden dynamic Input for edit screen uploads */}
            <input
              type="file"
              ref={editFileInputRef}
              accept="image/*"
              multiple
              className="hidden"
              onChange={(e) => {
                const files = e.target.files;
                if (files) {
                  const newImgs: string[] = [];
                  let count = files.length;
                  Array.from(files).forEach((file) => {
                    if (file.type.startsWith('image/')) {
                      const reader = new FileReader();
                      reader.onload = (evt) => {
                        if (evt.target?.result) {
                          newImgs.push(evt.target.result as string);
                        }
                        count--;
                        if (count === 0) {
                          onAddEditingImages(newImgs);
                        }
                      };
                      reader.readAsDataURL(file);
                    } else {
                      count--;
                      if (count === 0 && newImgs.length > 0) {
                        onAddEditingImages(newImgs);
                      }
                    }
                  });
                }
              }}
            />

            {/* Hidden dynamic Input for edit screen audio uploads */}
            <input
              type="file"
              ref={editAudioFileInputRef}
              accept="audio/*"
              multiple
              className="hidden"
              onChange={(e) => {
                const files = e.target.files;
                if (files) {
                  const newAuds: AttachedAudio[] = [];
                  let count = files.length;
                  Array.from(files).forEach((file) => {
                    const reader = new FileReader();
                    reader.onload = (evt) => {
                      if (evt.target?.result) {
                        const dataUrl = evt.target.result as string;
                        const base64Data = dataUrl.split(',')[1] || '';
                        const format = file.name.endsWith('.mp3') ? 'mp3' : 'wav';
                        newAuds.push({
                          id: `aud-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
                          name: file.name,
                          data: base64Data,
                          format
                        });
                      }
                      count--;
                      if (count === 0 && newAuds.length > 0) {
                        onAddEditingAudios?.(newAuds);
                      }
                    };
                    reader.readAsDataURL(file);
                  });
                }
              }}
            />

            <div className="flex flex-col sm:flex-row justify-between items-stretch sm:items-center gap-2 pt-1 border-t border-zinc-900">
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => editFileInputRef.current?.click()}
                  className="bg-[#121213] border border-[#222] hover:bg-[#18181a] hover:text-[#c2a472] px-2.5 py-1.5 rounded-sm text-[10px] text-zinc-400 font-bold tracking-wider cursor-pointer flex items-center justify-center gap-1.5 transition-colors"
                  title="Add / replace images in this message"
                >
                  <Image className="w-3.5 h-3.5 text-[#c2a472]" />
                  <span>ATTACH / REPLACE IMAGE</span>
                </button>
                <button
                  type="button"
                  onClick={() => editAudioFileInputRef.current?.click()}
                  className="bg-[#121213] border border-[#222] hover:bg-[#18181a] hover:text-[#c2a472] px-2.5 py-1.5 rounded-sm text-[10px] text-zinc-400 font-bold tracking-wider cursor-pointer flex items-center justify-center gap-1.5 transition-colors"
                  title="Attach audio files to this message"
                >
                  <Volume2 className="w-3.5 h-3.5 text-[#c2a472]" />
                  <span>ATTACH AUDIO</span>
                </button>
              </div>

              <div className="flex flex-wrap gap-2 justify-end">
                <button
                  type="button"
                  onClick={onCancelEditing}
                  className="bg-zinc-950 border border-[#222] hover:bg-zinc-900 px-3 py-1.5 rounded-sm text-[10px] text-zinc-455 font-bold tracking-wider cursor-pointer transition-colors"
                >
                  CANCEL
                </button>
                <button
                  type="button"
                  onClick={() => onSaveEditedMessage(msg.id, false)}
                  className="bg-[#18181a] border border-zinc-700 hover:border-[#c2a472] text-zinc-200 hover:text-white px-3 py-1.5 rounded-sm text-[10px] font-bold tracking-wider flex items-center gap-1 cursor-pointer transition-all"
                  title="Save message edits without regenerating"
                >
                  <Check className="w-3.5 h-3.5 text-[#c2a472]" style={{ strokeWidth: 2.5 }} />
                  <span>SAVE EDITS</span>
                </button>
                {isUser && (
                  <button
                    type="button"
                    onClick={() => onSaveEditedMessage(msg.id, true)}
                    className="bg-[#c2a472] hover:bg-[#b09363] text-black hover:scale-[1.02] px-3 py-1.5 rounded-sm text-[10px] font-extrabold tracking-wider flex items-center gap-1 cursor-pointer transition-all shadow-[0_0_8px_rgba(194,164,114,0.25)]"
                    title="Save your changes and immediately generate a new response"
                  >
                    <RotateCw className="w-3.5 h-3.5 text-black stroke-[2.5]" />
                    <span>SAVE & RE-RUN</span>
                  </button>
                )}
              </div>
            </div>
          </div>
        ) : (
          <>
            {isThought ? (
              <div
                className="markdown-body w-full min-w-0 max-w-full overflow-hidden text-zinc-400 space-y-3 select-text selection:bg-[#c2a472]/20 selection:text-white"
                style={{
                  fontFamily: 'var(--font-mono)',
                  fontSize: `${Math.max(10, (fontSettings?.fontSize || 13) - 2)}px`,
                  lineHeight: customLineHeight,
                  ['--chat-font-family' as any]: 'var(--font-mono)',
                  ['--chat-font-size' as any]: `${Math.max(10, (fontSettings?.fontSize || 13) - 2)}px`,
                  ['--chat-line-height' as any]: customLineHeight,
                }}
              >
                <Markdown remarkPlugins={REMARK_PLUGINS} components={markdownComponents}>{typeof msg.content === 'string' ? (msg.content || 'Thinking...') : 'Thinking...'}</Markdown>
              </div>
            ) : isUser ? (
              <div
                className="markdown-body w-full min-w-0 max-w-full overflow-hidden space-y-3.5 select-text selection:bg-[#c2a472]/20 selection:text-white"
                style={{
                  color: bubbleColor,
                  fontFamily: customFontFamily,
                  fontSize: customFontSize,
                  lineHeight: customLineHeight,
                  ['--chat-font-family' as any]: customFontFamily,
                  ['--chat-font-size' as any]: customFontSize,
                  ['--chat-line-height' as any]: customLineHeight,
                }}
              >
                <Markdown remarkPlugins={REMARK_PLUGINS} components={markdownComponents}>{typeof msg.content === 'string' ? msg.content : (Array.isArray(msg.content as any) ? (msg.content as any[]).map((c: any) => c?.text || '').join('\n') : String(msg.content || ''))}</Markdown>
              </div>
            ) : (
              (() => {
                const parsed = parseThinkingContent(typeof msg.content === 'string' ? msg.content : (msg.content ? String(msg.content) : ''));
                return (
                  <div className="space-y-3 w-full min-w-0 max-w-full overflow-hidden">
                    <div
                      className="markdown-body w-full min-w-0 max-w-full overflow-hidden space-y-3.5 select-text selection:bg-[#c2a472]/20 selection:text-white"
                      style={{
                        color: bubbleColor,
                        fontFamily: customFontFamily,
                        fontSize: customFontSize,
                        lineHeight: customLineHeight,
                        ['--chat-font-family' as any]: customFontFamily,
                        ['--chat-font-size' as any]: customFontSize,
                        ['--chat-line-height' as any]: customLineHeight,
                      }}
                    >
                      <Markdown remarkPlugins={REMARK_PLUGINS} components={markdownComponents}>{parsed.response}</Markdown>
                      {!msg.content && isStreaming && isLast && (
                        <span className="inline-block w-1.5 h-3.5 bg-[#c2a472] animate-pulse ml-0.5" />
                      )}
                    </div>
                  </div>
                );
              })()
            )}
          </>
        )}
      </div>

      {/* Inline actions line / receipts / inspector / edit / retry */}
      <div className={`mobile-message-actions ${showMobileActions ? 'expanded' : ''} flex flex-wrap items-center gap-3.5 mt-1 select-none text-[9px] font-mono text-zinc-650 lg:text-zinc-600`}>
        <button type="button" className="mobile-more-trigger lg:hidden" onClick={() => setShowMobileActions(value => !value)} aria-label={showMobileActions ? 'Hide message actions' : 'Show message actions'} aria-expanded={showMobileActions}><MoreHorizontal size={19} /></button>
        {/* Branch Switcher in Action Bar */}
        {hasBranches && (
          <div
            id={`branch-action-bar-${msg.id}`}
            className="flex items-center gap-1 bg-[#121214] border border-zinc-800 rounded px-1.5 py-0.5"
          >
            <span className="text-[8px] text-zinc-500 font-bold uppercase tracking-wider mr-0.5 flex items-center gap-1">
              <GitBranch className="w-2.5 h-2.5 text-[#c2a472]" />
              <span>BRANCH:</span>
            </span>
            <button
              type="button"
              id={`branch-action-prev-${msg.id}`}
              onClick={() => onSwitchBranch?.(msg.id, 'prev')}
              disabled={isStreaming || currentBranchIdx <= 0}
              className="p-0.5 text-zinc-400 hover:text-[#c2a472] disabled:opacity-30 disabled:hover:text-zinc-400 cursor-pointer disabled:cursor-not-allowed transition-colors"
              title="Previous branch / version"
            >
              <ChevronLeft className="w-2.5 h-2.5" />
            </button>
            <span className="text-[9px] font-bold text-[#c2a472] px-0.5">
              {currentBranchIdx + 1}/{totalBranches}
            </span>
            <button
              type="button"
              id={`branch-action-next-${msg.id}`}
              onClick={() => onSwitchBranch?.(msg.id, 'next')}
              disabled={isStreaming || currentBranchIdx >= totalBranches - 1}
              className="p-0.5 text-zinc-400 hover:text-[#c2a472] disabled:opacity-30 disabled:hover:text-zinc-400 cursor-pointer disabled:cursor-not-allowed transition-colors"
              title="Next branch / version"
            >
              <ChevronRight className="w-2.5 h-2.5" />
            </button>
          </div>
        )}

        {!isStreaming && (
          <button
            onClick={() => onToggleInspect(msg.id)}
            className={`hover:text-amber-400 transition-colors flex items-center gap-1 cursor-pointer ${inspectMessageId === msg.id ? 'text-amber-400 font-bold' : ''}`}
            title="Display exactly what prompt stack blueprint was constructed for this message / response turn"
          >
            <Layers className="w-3 h-3 text-amber-500/80" />
            <span>{inspectMessageId === msg.id ? 'CLOSE STACK STAMP' : 'INSPECT PROMPT STACK'}</span>
          </button>
        )}

        {!isStreaming && !isEditing && (
          <button
            onClick={() => onSetEditingMessage(msg.id, msg.content, msg.images || [])}
            className="hover:text-[#c2a472] transition-colors flex items-center gap-0.5 cursor-pointer"
            title="Modify this message's content dynamically"
          >
            <Edit3 className="w-3 h-3" />
            <span>EDIT CONTENT</span>
          </button>
        )}

        <button
          type="button"
          onClick={() => onCopyFormatted(msg)}
          className="hover:text-[#c2a472] transition-colors flex items-center gap-1 cursor-pointer font-medium"
          title="Copy message as it exists (preserves all Markdown effects, bold, italics, code, headings, and line breaks)"
        >
          {copiedFormattedMsgId === msg.id ? (
            <>
              <Check className="w-3 h-3 text-emerald-400" />
              <span className="text-emerald-400 font-bold">COPIED!</span>
            </>
          ) : (
            <>
              <Copy className="w-3 h-3 text-[#c2a472]" />
              <span className="text-zinc-200 hover:text-white font-bold">COPY</span>
            </>
          )}
        </button>

        <button
          type="button"
          onClick={() => onCopyMarkdown(msg)}
          className="hover:text-[#c2a472] transition-colors flex items-center gap-1 cursor-pointer"
          title="Copy message syntax as raw Markdown text"
        >
          {copiedMarkdownMsgId === msg.id ? (
            <>
              <Check className="w-3 h-3 text-emerald-400" />
              <span className="text-emerald-400 font-bold">COPIED MD!</span>
            </>
          ) : (
            <>
              <FileText className="w-3 h-3 text-zinc-400" />
              <span>COPY AS MARKDOWN</span>
            </>
          )}
        </button>

        <button
          onClick={() => onDeleteMessage(msg.id)}
          className="hover:text-red-400 transition-colors flex items-center gap-0.5 cursor-pointer font-bold"
          title="Delete this message from conversation history"
        >
          <Trash className="w-3 h-3" />
          <span>DELETE</span>
        </button>

        {!isStreaming && !isThought && (
          <button
            onClick={() => onRegenerate(msg.id)}
            className="hover:text-emerald-400 lg:hover:text-[#c2a472] transition-colors flex items-center gap-0.5 cursor-pointer"
            title={isUser ? "Discard subsequent messages and regenerate the assistant's reply to this user prompt" : "Retry response generation under current parameters"}
          >
            <RotateCw className="w-3 h-3" />
            <span>{isUser ? "RE-RUN FROM HERE" : "RETRY RESPONSE"}</span>
          </button>
        )}

        {!isUser && !isThought && !isStreaming && (
          <button
            onClick={() => {
              const isAlreadyCheckpoint = !!compactChunk;
              onCompactify(msg.id, isAlreadyCheckpoint);
            }}
            disabled={isCompactifying}
            className="hover:text-cyan-400 transition-colors flex items-center gap-0.5 cursor-pointer disabled:opacity-50"
            title="Compactify history up to this reply into hidden summaries"
          >
            <Shrink className="w-3 h-3 text-[#c2a472]" />
            <span>
              {isCompactifyingMsgId === msg.id
                ? "COMPACTIFYING..."
                : compactChunk
                ? "RE-COMPACTIFY UP TO HERE"
                : "COMPACTIFY UP TO HERE"}
            </span>
          </button>
        )}
      </div>

      {/* Compactified Checkpoint Badge if message is a checkpoint */}
      {compactChunk && (
        <div className="w-full max-w-2xl bg-[#09151c] border border-cyan-900/60 rounded p-2.5 text-[10px] font-mono text-cyan-300 mt-2 mb-1 animate-fade-in flex flex-col gap-1.5">
          <div className="flex items-center justify-between font-bold text-[9px] uppercase tracking-wider text-[#c2a472]">
            <span className="flex items-center gap-1">
              <Shrink className="w-3 h-3 text-[#c2a472]" />
              <span>COMPACTIFIED CHECKPOINT REACHED</span>
            </span>
            <span>
              {compactChunk.originalTokensEst ? `~${compactChunk.originalTokensEst}t → ~${compactChunk.summaryTokensEst}t` : 'Summary Active'}
            </span>
          </div>
          <div className="text-[9px] text-zinc-400 leading-normal">
            History up to this reply is saved as a hidden summary context. Active when "Use Compactified History" toggle is enabled.
          </div>
          <div className="flex items-center gap-2 pt-1 border-t border-cyan-950">
            <button
              onClick={() => onViewChunkSummary(compactChunk)}
              className="flex items-center gap-1 px-2 py-0.5 bg-cyan-950/80 hover:bg-cyan-900 text-cyan-200 border border-cyan-800 rounded text-[9px] font-mono font-bold transition-colors cursor-pointer"
            >
              <Eye className="w-3 h-3" />
              <span>VIEW SUMMARY</span>
            </button>
            <button
              onClick={() => onCompactify(msg.id, true)}
              disabled={isCompactifying}
              className="flex items-center gap-1 px-2 py-0.5 bg-amber-950/50 hover:bg-amber-900/70 text-[#c2a472] border border-amber-800/80 rounded text-[9px] font-mono font-bold transition-colors cursor-pointer disabled:opacity-50"
            >
              <RotateCw className="w-3 h-3" />
              <span>{isCompactifyingMsgId === msg.id ? "RECOMPACTIFYING..." : "RE-COMPACTIFY"}</span>
            </button>
            <button
              onClick={() => onDeleteCompactChunk(compactChunk.id)}
              className="flex items-center gap-1 px-2 py-0.5 bg-red-950/40 hover:bg-red-900/60 text-red-400 border border-red-900/70 rounded text-[9px] font-mono font-bold transition-colors cursor-pointer ml-auto"
            >
              <Trash className="w-3 h-3" />
              <span>DELETE CHECKPOINT</span>
            </button>
          </div>
        </div>
      )}

      {/* Expansion prompt stack used for this specific Turn */}
      {inspectMessageId === msg.id && (() => {
        const stackToRender = resolvedPromptStack || msg.promptStackSnapshot || [];
        const totalChars = stackToRender.reduce((s, l) => s + (l.content ? l.content.length : 0), 0);

        const handleCopyInspectStack = async () => {
          if (stackToRender.length === 0) return;
          const textParts = stackToRender.map((l: PromptStackLayer) => {
            return `=== [${l.type.toUpperCase()}] ${l.name} ===\n${(l.content || '').replace(/\r\n/g, '\n')}`;
          });
          const fullText = textParts.join('\n\n');
          const richHtml = `<div style="font-family: ui-monospace, monospace; font-size: 10px; line-height: 1.5; color: inherit;">${escapeHtml(fullText).replace(/\n/g, '<br>')}</div>`;
          const success = await copyToClipboard(richHtml, fullText);
          if (success) {
            setCopiedInspectStack(true);
            setTimeout(() => setCopiedInspectStack(false), 2000);
          }
        };

        const handleCopyInspectLayer = async (idx: number, layer: PromptStackLayer) => {
          const content = layer.content || '';
          if (!content) return;
          const cleanText = content.replace(/\r\n/g, '\n');
          const richHtml = `<div style="font-family: ui-monospace, monospace; font-size: 10px; line-height: 1.5; color: inherit;">${escapeHtml(cleanText).replace(/\n/g, '<br>')}</div>`;
          const success = await copyToClipboard(richHtml, cleanText);
          if (success) {
            setCopiedInspectLayerIdx(idx);
            setTimeout(() => setCopiedInspectLayerIdx(null), 2000);
          }
        };

        return (
          <div 
            onCopy={(e) => {
              e.stopPropagation();
              const selection = window.getSelection();
              if (!selection || selection.isCollapsed || selection.rangeCount === 0) return;
              const rawText = selection.toString();
              if (!rawText) return;
              const cleanPlainText = rawText.replace(/\r\n/g, '\n');
              const richHtml = `<div style="font-family: ui-monospace, monospace; font-size: 10px; line-height: 1.5; color: inherit;">${escapeHtml(cleanPlainText).replace(/\n/g, '<br>')}</div>`;
              e.preventDefault();
              if (e.clipboardData) {
                e.clipboardData.setData('text/html', richHtml);
                e.clipboardData.setData('text/plain', cleanPlainText);
              }
            }}
            className="w-full max-w-2xl bg-zinc-950 border border-amber-900/40 rounded p-3 text-[10px] font-mono text-zinc-400 space-y-2 mb-4 animate-slide-down shadow-xl"
          >
            <div className="flex items-center justify-between text-[9px] text-amber-500 font-bold border-b border-amber-950 pb-1.5">
              <span className="flex items-center gap-1.5">
                <Layers className="w-3 h-3 text-amber-400" />
                <span>PROMPT STACK BLUEPRINT AT DISPATCH TIME</span>
              </span>
              <div className="flex items-center gap-2">
                {stackToRender.length > 0 && (
                  <button
                    type="button"
                    onClick={handleCopyInspectStack}
                    className="flex items-center gap-1 px-1.5 py-0.5 rounded bg-amber-950/60 hover:bg-amber-900/80 text-amber-300 border border-amber-800/60 text-[9px] font-mono transition-colors cursor-pointer"
                    title="Copy full blueprint with all line breaks and empty lines preserved"
                  >
                    {copiedInspectStack ? (
                      <>
                        <Check className="w-2.5 h-2.5 text-emerald-400" />
                        <span className="text-emerald-400 font-bold">COPIED</span>
                      </>
                    ) : (
                      <>
                        <Copy className="w-2.5 h-2.5 text-amber-400" />
                        <span>COPY BLUEPRINT</span>
                      </>
                    )}
                  </button>
                )}
                <span>
                  {stackToRender.length > 0
                    ? `LEN: ${totalChars} CHARS (${stackToRender.length} LAYERS)`
                    : 'NO STACK RECORDED'}
                </span>
              </div>
            </div>
            {stackToRender.length > 0 ? (
              <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
                {stackToRender.map((layer: PromptStackLayer, idx: number) => (
                  <div key={idx} className="bg-zinc-900/50 p-2.5 rounded border border-zinc-800/80">
                    <div className="font-bold text-amber-400/90 text-[9px] tracking-wider mb-1 flex items-center justify-between">
                      <span>:: {layer.name.toUpperCase()}</span>
                      <div className="flex items-center gap-1.5">
                        {layer.content && (
                          <button
                            type="button"
                            onClick={() => handleCopyInspectLayer(idx, layer)}
                            className="flex items-center gap-1 px-1.5 py-0.5 rounded bg-zinc-950 hover:bg-zinc-800 text-zinc-300 border border-zinc-800 text-[8px] font-mono transition-colors cursor-pointer"
                            title="Copy layer with all line breaks and empty lines preserved"
                          >
                            {copiedInspectLayerIdx === idx ? (
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
                        <span className="text-[8px] text-zinc-500 uppercase px-1.5 py-0.5 rounded bg-zinc-950 border border-zinc-800">{layer.type}</span>
                      </div>
                    </div>
                    <pre className="whitespace-pre-wrap text-[10px] text-zinc-300 leading-normal font-mono select-text bg-zinc-950 p-2 rounded border border-zinc-900 max-h-48 overflow-y-auto">{layer.content}</pre>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-zinc-500 text-[10px] py-2 italic font-mono">
                No archived prompt stack blueprint was recorded for this turn.
              </div>
            )}
          </div>
        );
      })()}
    </div>
  );
}, (prev, next) => {
  if (prev.isEditing !== next.isEditing) return false;
  if (next.isEditing) {
    if (prev.editingMessageText !== next.editingMessageText) return false;
    if (prev.editingMessageImages !== next.editingMessageImages) return false;
  }
  if (prev.msg !== next.msg) return false;
  if (prev.msg.currentVersionIndex !== next.msg.currentVersionIndex) return false;
  if (prev.msg.versions !== next.msg.versions) return false;
  if (prev.index !== next.index) return false;
  if (prev.isLast !== next.isLast) return false;
  if (prev.isStreaming !== next.isStreaming) return false;
  if (prev.activeModel !== next.activeModel) return false;
  if (prev.copiedFormattedMsgId === prev.msg.id || next.copiedFormattedMsgId === next.msg.id) {
    if (prev.copiedFormattedMsgId !== next.copiedFormattedMsgId) return false;
  }
  if (prev.copiedMarkdownMsgId === prev.msg.id || next.copiedMarkdownMsgId === next.msg.id) {
    if (prev.copiedMarkdownMsgId !== next.copiedMarkdownMsgId) return false;
  }
  if (prev.inspectMessageId === prev.msg.id || next.inspectMessageId === next.msg.id) {
    if (prev.inspectMessageId !== next.inspectMessageId) return false;
  }
  if (prev.isCompactifyingMsgId === prev.msg.id || next.isCompactifyingMsgId === next.msg.id) {
    if (prev.isCompactifyingMsgId !== next.isCompactifyingMsgId) return false;
  }
  if (prev.compactChunk !== next.compactChunk) return false;
  if (prev.resolvedPromptStack !== next.resolvedPromptStack) return false;
  if (
    prev.fontSettings?.fontFamily !== next.fontSettings?.fontFamily ||
    prev.fontSettings?.fontSize !== next.fontSettings?.fontSize ||
    prev.fontSettings?.lineHeight !== next.fontSettings?.lineHeight ||
    prev.fontSettings?.bubbleMaxWidth !== next.fontSettings?.bubbleMaxWidth ||
    prev.fontSettings?.chatWidthMode !== next.fontSettings?.chatWidthMode
  ) {
    return false;
  }
  return true;
});
