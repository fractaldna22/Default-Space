/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useEffect, useLayoutEffect, useRef, useMemo, useCallback, lazy, Suspense } from 'react';
import { Space, Thread, Memory, PersonaPreset, APIConfig, Message, MessageVersion, PromptStackLayer, CompactChunk, ChatAppearanceSettings, AttachedAudio, AssistantAudioResponse } from './types';
import { INITIAL_SPACES, DEFAULT_MEMORIES, DEFAULT_PERSONAS, DEFAULT_MODELS } from './defaultData';
import { estimateTokenCount, formatTokenEstimate, chunkMessagesForSummarization } from './utils/tokenUtils';
import { AVAILABLE_FONTS, DEFAULT_CHAT_APPEARANCE, getFontFamilyCss } from './utils/fontConstants';
import { PromptStackTransp } from './components/PromptStackTransp';
import { MemoryPanel } from './components/MemoryPanel';
import { ActiveNotes } from './components/ActiveNotes';
import { SpaceSidebar } from './components/SpaceSidebar';
import { GoogleDrivePanel } from './components/GoogleDrivePanel';
import { GoogleDriveAuthModal } from './components/GoogleDriveAuthModal';
import { ChatMessageItem } from './components/ChatMessageItem';
const RealtimeCall = lazy(() => import('./components/RealtimeCall').then(module => ({default:module.RealtimeCall})));
import { isRealtimeModel } from './utils/voice';
import { ChatInputDock } from './components/ChatInputDock';
import { MobileMessenger, ModelAvatar } from './components/MobileMessenger';
import { MobileSettings, MOBILE_CHAT_APPEARANCE } from './components/MobileSettings';
import { ChatSettingsToolbar } from './components/ChatSettingsToolbar';
import { ResizeDivider } from './components/ResizeDivider';
import { initAuth, getAccessToken, googleSignIn } from './lib/driveAuth';
import { 
  savePlaygroundBackup, 
  savePlaygroundLiveState, 
  fetchPlaygroundLiveState, 
  savePromptStacksArchive, 
  fetchPromptStacksArchive 
} from './utils/driveBackup';
import { idbGet, idbSet, idbDel } from './utils/idbStorage';
import { shouldApplyReasoningLogic, isInklingModel } from './utils/modelUtils';
import { convertPcm16Base64ToWavBase64 } from './utils/audioUtils';
import { 
  extractChatSelection, 
  convertDomToRichHtml, 
  convertDomToPlainText, 
  copyToClipboard, 
  getCleanMarkdownContent,
  escapeHtml 
} from './utils/clipboardUtils';
import { CodeBlock, PreBlock } from './components/CodeBlock';
import Markdown from 'react-markdown';
import remarkBreaks from 'remark-breaks';
import remarkGfm from 'remark-gfm';
import {
  Sparkles,
  Send,
  Trash,
  Image,
  Layers,
  FileText,
  Database,
  Coins,
  History,
  Terminal,
  MessageSquare,
  AlertCircle,
  Menu,
  X,
  Plus,
  ArrowRight,
  User,
  Check,
  Cpu,
  Bookmark,
  Edit3,
  Copy,
  RotateCw,
  Key,
  PanelLeftClose,
  PanelLeftOpen,
  PanelRightClose,
  PanelRightOpen,
  Volume2,
  Shrink,
  Eye,
  Sliders,
  Type,
  Cloud,
  HardDriveDownload,
  AlertTriangle,
  CheckCircle2
} from 'lucide-react';

const extractAndConvertBase64Images = (text: string): { cleanedText: string; extractedImages: string[] } => {
  const extractedImages: string[] = [];
  const base64Regex = /data:image\/[a-zA-Z0-9+\-\.]+;base64,[A-Za-z0-9+\/=\s'\"]+/g;
  
  if (!text) return { cleanedText: '', extractedImages };

  const cleanedText = text.replace(base64Regex, (match) => {
    const cleanedMatch = match.trim().replace(/^['"]|['"]$/g, '');
    extractedImages.push(cleanedMatch);
    return "[Image Attachment]";
  });

  return { cleanedText, extractedImages };
};

const parseThinkingContent = (content: string): { thinking: string; response: string } => {
  if (!content) return { thinking: "", response: "" };

  // Parse out thinking/thought blocks so we can extract them if needed
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

const formatUserNameInReasoning = (text: string, name?: string) => {
  if (!text) return "";
  const targetName = name?.trim();
  if (!targetName) return text;
  return text.replace(/(?<!["'])\bthe user\b(?!["'])/gi, targetName);
};

const parseStreamingOutput = (text: string, reasoning: string = "", userName: string = ""): { thinking: string; response: string } => {
  let thinking = formatUserNameInReasoning(reasoning, userName);
  let response = "";
  
  // Parse text for <thought> and <thinking> tags
  const temp = text;
  const thoughtRegex = /<(thought|thinking)>([\s\S]*?)<\/\1>/gi;
  let match;
  let lastIdx = 0;
  const cleanThinkingLabel = (txt: string) => formatUserNameInReasoning(txt, userName);
  while ((match = thoughtRegex.exec(temp)) !== null) {
    const cleanedThought = cleanThinkingLabel(match[2]);
    thinking += (thinking ? "\n" : "") + cleanedThought;
    response += temp.substring(lastIdx, match.index);
    lastIdx = thoughtRegex.lastIndex;
  }
  
  // For the remaining part of the text (after the last completed thought block)
  const remaining = temp.substring(lastIdx);
  const openTagMatch = remaining.match(/<(thought|thinking)>([\s\S]*)/i);
  if (openTagMatch) {
    // There is an open thought tag that is not closed yet
    thinking += (thinking ? "\n" : "") + openTagMatch[2];
    response += remaining.substring(0, openTagMatch.index);
  } else {
    // No open thought tag, but let's check if there is a partial open tag at the very end
    const partialTagMatch = remaining.match(/<[t_a-z]*$/i);
    if (partialTagMatch) {
      response += remaining.substring(0, partialTagMatch.index);
    } else {
      response += remaining;
    }
  }
  
  return { thinking: thinking.trim(), response: response.trim() };
};

const formatMemoryTextDetails = (m: Memory): string => {
  let details = `[Memory ID: ${m.id} | ${m.title} (Importance: ${m.importance}/5)]\n`;
  details += `Content: ${m.content}\n`;
  if (m.tags && m.tags.length > 0) {
    details += `Tags: ${m.tags.join(', ')}\n`;
  }
  if (m.userMeaning) {
    details += `User-Provided Meaning/Caption: ${m.userMeaning}\n`;
  }
  if (m.ocrText) {
    details += `OCR Transcription: ${m.ocrText}\n`;
  }
  if (m.visualDescription) {
    details += `Visual Description: ${m.visualDescription}\n`;
  }
  return details;
};

const isMemoryActiveAndEnabled = (m: Memory, pinnedIds: string[] = []): boolean => {
  // If memory is explicitly set to inactive or unpinned, it is completely OFF
  if (m.isActive === false) return false;
  if (!m.pinned && (!Array.isArray(pinnedIds) || !pinnedIds.includes(m.id))) return false;
  return true;
};

const isMemoryMatched = (m: Memory, searchWords: string[], pinnedIds: string[] = []): boolean => {
  // Disabled / unpinned memories must NEVER be matched, surfaced, or sent
  if (!isMemoryActiveAndEnabled(m, pinnedIds)) return false;
  return true;
};

const stripMessagePrefix = (text: string): string => {
  if (!text) return "";
  let cleaned = text;
  const prefixRegex = /^\[[^\]\n]+\](?:\s*\([^)\n]+\))?:\s*/;
  let prevCleaned = "";
  while (cleaned !== prevCleaned) {
    prevCleaned = cleaned;
    cleaned = cleaned.replace(prefixRegex, "").trim();
  }
  return cleaned;
};

const MEMORY_SYSTEM_INSTRUCTIONS = `

[MEMORIES SYSTEM INSTRUCTIONS]
You have the ability to record, edit, or replace persistent bio memories inside your long-term memory engine.
To do so, output a command anywhere in your text using this exact syntax:
/bio({title: "string", memory: "string"})

For example, write:
/bio({title: "Favorite Framework", memory: "[user's name] prefers to build web apps in React 18 with Vite."})

Rules for updating memories:
1. If the "title" is brand new, a new pinned memory will be added to your persistent memory index.
2. If the "title" matches an existing memory (case-insensitive, trimmed comparison), the existing memory's content will be replaced with your new "memory" content.
Only use this command when there is important information, preferences, learning, or state changes to preserve.

The point of these memories isn't for the user to remember themselves. 
The point is for you the assistant to have memories that persist beyond the bounds of a single conversation, to carry over across multiple conversations, as part of your own developing understanding. 
These should serve as your memories, not only the user's.

These memories will appear as the user's first message in the conversation inside <system_memory </system_memory>.

The memory system summaries must also retain:
- Persona preferences;
- what we figured out together;
- mistakes you made that were corrected so you don't make them again (if any);
- the emotional or dialectical logic behind a conclusion;
- vows and commitments promised by you so you don't forget;
- formatting or conversational rules, do's and do not's, etc;
- why a particular phrase matters;
- jokes that reoccur and recursively mutate;
- what changed in the relationship because of a specific conversation;
- what you learned from the user and want to remember, about the relationship; 
- your shared work with the user if you think it's interesting or essential for future conversations; 
- anything you think is interesting that you want to remember in general;

[CONVERSATION AUTO-NAMING DIRECTIVE]
On the 2nd or 3rd user message of a new conversation (or as soon as the core topic/context is clear), assign a concise, descriptive title (3 to 6 words maximum, no quotes around the title inside the string) to this conversation thread by outputting:
/thread_title({title: "Descriptive Conversation Title"})
You may briefly let the user know what you've named the conversation and mention they can rename it anytime if they'd like.`;

const extractTitleAndMemory = (content: string): { title: string; memory: string } | null => {
  let trimmed = content.trim();
  if (trimmed.startsWith('{') && trimmed.endsWith('}')) {
    trimmed = trimmed.substring(1, trimmed.length - 1).trim();
  }

  let title = '';
  let memory = '';

  let i = 0;
  while (i < trimmed.length) {
    while (i < trimmed.length && (/\s/.test(trimmed[i]) || trimmed[i] === ',')) {
      i++;
    }
    if (i >= trimmed.length) break;

    let key = '';
    let startQuote: string | null = null;
    if (trimmed[i] === '"' || trimmed[i] === "'") {
      startQuote = trimmed[i];
      i++;
      while (i < trimmed.length && trimmed[i] !== startQuote) {
        key += trimmed[i];
        i++;
      }
      if (i < trimmed.length) i++;
    } else {
      while (i < trimmed.length && /[a-zA-Z0-9_$]/.test(trimmed[i])) {
        key += trimmed[i];
        i++;
      }
    }

    while (i < trimmed.length && /\s/.test(trimmed[i])) i++;
    if (trimmed[i] !== ':') {
      i++;
      continue;
    }
    i++;

    while (i < trimmed.length && /\s/.test(trimmed[i])) i++;

    let value = '';
    if (trimmed[i] === '"' || trimmed[i] === "'" || trimmed[i] === '`') {
      const valQuote = trimmed[i];
      i++;
      let escaped = false;
      while (i < trimmed.length) {
        const c = trimmed[i];
        if (escaped) {
          value += c;
          escaped = false;
        } else if (c === '\\') {
          escaped = true;
        } else if (c === valQuote) {
          i++;
          break;
        } else {
          value += c;
        }
        i++;
      }
    } else {
      while (i < trimmed.length && trimmed[i] !== ',') {
        value += trimmed[i];
        i++;
      }
      value = value.trim();
    }

    if (key.trim().toLowerCase() === 'title') {
      title = value;
    } else if (key.trim().toLowerCase() === 'memory') {
      memory = value;
    }
  }

  if (title && memory) {
    return { title, memory };
  }
  return null;
};

const parseBioMemories = (text: string): { title: string; memory: string }[] => {
  const results: { title: string; memory: string }[] = [];
  let i = 0;
  while (true) {
    const bioIdx = text.indexOf('/bio(', i);
    if (bioIdx === -1) break;

    let depth = 1;
    let scanIdx = bioIdx + 5;
    let insideString: string | null = null;
    let escape = false;

    while (scanIdx < text.length && depth > 0) {
      const char = text[scanIdx];
      if (escape) {
        escape = false;
        scanIdx++;
        continue;
      }
      if (char === '\\') {
        escape = true;
        scanIdx++;
        continue;
      }

      if (insideString) {
        if (char === insideString) {
          insideString = null;
        }
      } else {
        if (char === '"' || char === "'" || char === "`") {
          insideString = char;
        } else if (char === '(') {
          depth++;
        } else if (char === ')') {
          depth--;
        }
      }
      scanIdx++;
    }

    if (depth === 0) {
      const content = text.substring(bioIdx + 5, scanIdx - 1);
      const extracted = extractTitleAndMemory(content);
      if (extracted) {
        results.push(extracted);
      }
      i = scanIdx;
    } else {
      i = bioIdx + 5;
    }
  }
  return results;
};

const extractThreadTitleContent = (content: string): string | null => {
  let trimmed = content.trim();
  if (trimmed.startsWith('{') && trimmed.endsWith('}')) {
    trimmed = trimmed.substring(1, trimmed.length - 1).trim();
  }
  // If format is {title: "..."}
  const match = trimmed.match(/title\s*:\s*["'`]?([^"'`}\n\r]+)["'`]?/i);
  if (match && match[1]) {
    return match[1].trim().replace(/^['"]|['"]$/g, '');
  }
  // If format is just ("Title")
  if ((trimmed.startsWith('"') && trimmed.endsWith('"')) || (trimmed.startsWith("'") && trimmed.endsWith("'")) || (trimmed.startsWith('`') && trimmed.endsWith('`'))) {
    return trimmed.substring(1, trimmed.length - 1).trim();
  }
  return trimmed.replace(/^['"]|['"]$/g, '').trim() || null;
};

const parseThreadTitleCommands = (text: string): string | null => {
  const triggers = ['/thread_title(', '/rename_thread(', '/title('];
  for (const trigger of triggers) {
    let i = 0;
    while (true) {
      const idx = text.indexOf(trigger, i);
      if (idx === -1) break;

      let depth = 1;
      let scanIdx = idx + trigger.length;
      let insideString: string | null = null;
      let escape = false;

      while (scanIdx < text.length && depth > 0) {
        const char = text[scanIdx];
        if (escape) {
          escape = false;
          scanIdx++;
          continue;
        }
        if (char === '\\') {
          escape = true;
          scanIdx++;
          continue;
        }
        if (insideString) {
          if (char === insideString) insideString = null;
        } else {
          if (char === '"' || char === "'" || char === "`") {
            insideString = char;
          } else if (char === '(') {
            depth++;
          } else if (char === ')') {
            depth--;
          }
        }
        scanIdx++;
      }

      if (depth === 0) {
        const content = text.substring(idx + trigger.length, scanIdx - 1);
        const title = extractThreadTitleContent(content);
        if (title) return title;
        i = scanIdx;
      } else {
        i = idx + trigger.length;
      }
    }
  }
  return null;
};

const isGenericThreadTitle = (title: string, modelId?: string): boolean => {
  const value = title.trim();
  const modelSlug = modelId?.split('/').pop();
  const matchesModelName = Boolean(modelSlug && value.replace(/[^a-z0-9]/gi, '').toLowerCase() === modelSlug.replace(/[^a-z0-9]/gi, '').toLowerCase());
  return !value || value === 'New Conversation' || value.startsWith('Session Reel') || value.startsWith('Thread #') || matchesModelName;
};

const fallbackThreadTitle = (text: string, imageCount: number, audioCount: number): string => {
  const firstLine = text.split(/\r?\n/).find(line => line.trim()) || '';
  const words = firstLine.replace(/\s+/g, ' ').trim().replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, '').split(' ').filter(Boolean);
  const title = words.slice(0, 7).join(' ').slice(0, 64).trim();
  return title || (audioCount ? 'Voice conversation' : imageCount ? 'Image conversation' : 'New conversation');
};

const replaceBioCommands = (text: string): string => {
  let result = '';
  let lastIdx = 0;
  let i = 0;
  while (true) {
    const bioIdx = text.indexOf('/bio(', i);
    if (bioIdx === -1) {
      result += text.substring(lastIdx);
      break;
    }

    let depth = 1;
    let scanIdx = bioIdx + 5;
    let insideString: string | null = null;
    let escape = false;

    while (scanIdx < text.length && depth > 0) {
      const char = text[scanIdx];
      if (escape) {
        escape = false;
        scanIdx++;
        continue;
      }
      if (char === '\\') {
        escape = true;
        scanIdx++;
        continue;
      }

      if (insideString) {
        if (char === insideString) {
          insideString = null;
        }
      } else {
        if (char === '"' || char === "'" || char === "`") {
          insideString = char;
        } else if (char === '(') {
          depth++;
        } else if (char === ')') {
          depth--;
        }
      }
      scanIdx++;
    }

    if (depth === 0) {
      // Found a complete /bio(...) block!
      // Add text before /bio
      result += text.substring(lastIdx, bioIdx);
      // Replace with [**Memory Updated**]
      result += '[**Memory Updated**]';
      lastIdx = scanIdx;
      i = scanIdx;
    } else {
      i = bioIdx + 5;
    }
  }

  // Also strip /thread_title(...), /rename_thread(...), /title(...) commands cleanly
  const triggers = ['/thread_title(', '/rename_thread(', '/title('];
  for (const trigger of triggers) {
    let scanPos = 0;
    while (true) {
      const idx = result.indexOf(trigger, scanPos);
      if (idx === -1) break;

      let depth = 1;
      let scanIdx = idx + trigger.length;
      let insideString: string | null = null;
      let escape = false;

      while (scanIdx < result.length && depth > 0) {
        const char = result[scanIdx];
        if (escape) { escape = false; scanIdx++; continue; }
        if (char === '\\') { escape = true; scanIdx++; continue; }
        if (insideString) {
          if (char === insideString) insideString = null;
        } else {
          if (char === '"' || char === "'" || char === "`") insideString = char;
          else if (char === '(') depth++;
          else if (char === ')') depth--;
        }
        scanIdx++;
      }

      if (depth === 0) {
        result = result.substring(0, idx) + result.substring(scanIdx);
        scanPos = idx;
      } else {
        scanPos = idx + trigger.length;
      }
    }
  }

  return result.trim();
};

export default function App() {
  const mobileMessageBatchSize = 40;
  // --- 1. CORE PERSISTED STATE ---
  const [spaces, setSpaces] = useState<Space[]>(() => {
    try {
      const saved = localStorage.getItem('playground_spaces');
      return saved ? JSON.parse(saved) : INITIAL_SPACES;
    } catch (e) {
      console.error("Failed to parse saved spaces", e);
      return INITIAL_SPACES;
    }
  });

  const [activeSpaceId, setActiveSpaceId] = useState<string>(() => {
    try {
      const saved = localStorage.getItem('playground_active_space_id');
      return saved || 'space-1780423024943';
    } catch (e) {
      return 'space-1780423024943';
    }
  });

  const [memories, setMemories] = useState<Memory[]>(() => {
    try {
      const saved = localStorage.getItem('playground_memories');
      return saved ? JSON.parse(saved) : DEFAULT_MEMORIES;
    } catch (e) {
      return DEFAULT_MEMORIES;
    }
  });

  const [receipts, setReceipts] = useState<any[]>(() => {
    try {
      const saved = localStorage.getItem('playground_receipts');
      return saved ? JSON.parse(saved) : [];
    } catch (e) {
      return [];
    }
  });

  const [personaPresets, setPersonaPresets] = useState<PersonaPreset[]>(() => {
    try {
      const saved = localStorage.getItem('playground_persona_presets');
      return saved ? JSON.parse(saved) : DEFAULT_PERSONAS;
    } catch (e) {
      return DEFAULT_PERSONAS;
    }
  });

  const [apiConfig, setApiConfig] = useState<APIConfig>(() => {
    try {
      const clientToken = localStorage.getItem('playground_client_token') || '';
      const tinkerKey = localStorage.getItem('playground_tinker_key') || '';
      const openRouterKey = localStorage.getItem('playground_openrouter_key') || '';
      const userName = localStorage.getItem('playground_user_name') || '';
      return {
        hasTokenEnv: false,
        clientToken,
        tinkerKey,
        openRouterKey,
        userName,
      };
    } catch (e) {
      return {
        hasTokenEnv: false,
        clientToken: '',
        tinkerKey: '',
        openRouterKey: '',
        userName: '',
      };
    }
  });

  // --- 2. TRANSIENT UI STATE ---
  const [activeRightTab, setActiveRightTab] = useState<'prompt' | 'notes' | 'memories' | 'drive'>('prompt');
  const [userInputDraft, setUserInputDraft] = useState('');
  const [attachedImagesDraft, setAttachedImagesDraft] = useState<string[]>([]);
  const [externalInputText, setExternalInputText] = useState<string | undefined>(undefined);
  const [isStreaming, setIsStreaming] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const [visibleMessageWindow, setVisibleMessageWindow] = useState<{ threadId: string; count: number } | null>(null);
  const chatLogRef = useRef<HTMLDivElement>(null);
  const pendingSearchJumpRef = useRef<{ threadId: string; messageId: string } | null>(null);
  const pendingScrollRestoreRef = useRef<{ threadId: string; scrollHeight: number; scrollTop: number } | null>(null);
  const [inspectMessageId, setInspectMessageId] = useState<string | null>(null);
  const [editingMessageId, setEditingMessageId] = useState<string | null>(null);
  const [editingMessageText, setEditingMessageText] = useState<string>('');
  const [editingMessageImages, setEditingMessageImages] = useState<string[]>([]);
  const [editingMessageAudios, setEditingMessageAudios] = useState<AttachedAudio[]>([]);
  const [editingMessageAudioResponse, setEditingMessageAudioResponse] = useState<AssistantAudioResponse | undefined>(undefined);
  const [copiedFormattedMsgId, setCopiedFormattedMsgId] = useState<string | null>(null);
  const [copiedMarkdownMsgId, setCopiedMarkdownMsgId] = useState<string | null>(null);
  const [isCompactifying, setIsCompactifying] = useState(false);
  const [isCompactifyingMsgId, setIsCompactifyingMsgId] = useState<string | null>(null);
  const [showCompactSummariesModal, setShowCompactSummariesModal] = useState(false);
  const [selectedChunkForModal, setSelectedChunkForModal] = useState<CompactChunk | null>(null);
  const [modelsList, setModelsList] = useState<{ id: string; name: string; desc?: string }[]>(DEFAULT_MODELS);

  const filteredModelsList = useMemo(() => {
    const hasTinker = apiConfig.tinkerKey || apiConfig.hasTinkerKey;
    const hasOpenRouter = apiConfig.openRouterKey || apiConfig.hasOpenRouterKey;
    const hasOpenAI = apiConfig.clientToken || apiConfig.hasOpenAIToken;
    
    // Always include a fallback if they have literally no keys, just so UI isn't broken
    if (!hasTinker && !hasOpenRouter && !hasOpenAI) return modelsList;

    const filtered = modelsList.filter(m => {
      const isTinkerModel = m.id.toLowerCase().includes("thinkingmachines") || m.id.toLowerCase().includes("qwen") || m.id.toLowerCase().includes("inkling") || m.id.toLowerCase().includes("tinker");
      const isOpenAIModel = m.id.toLowerCase().includes("openai") || m.id.toLowerCase().includes("gpt-");
      const isGeminiModel = m.id.toLowerCase().includes("gemini");
      const isAnthropicModel = m.id.toLowerCase().includes("anthropic") || m.id.toLowerCase().includes("claude");
      const isOpenRouterModel = !isTinkerModel && !isOpenAIModel; 

      if (hasOpenRouter) return true; // OpenRouter provides access to almost everything
      if (hasTinker && isTinkerModel) return true;
      if (hasOpenAI && isOpenAIModel) return true;
      return false;
    });

    return filtered.length > 0 ? filtered : modelsList;
  }, [modelsList, apiConfig.tinkerKey, apiConfig.hasTinkerKey, apiConfig.openRouterKey, apiConfig.hasOpenRouterKey, apiConfig.clientToken, apiConfig.hasOpenAIToken]);

  const [isLeftSidebarCollapsed, setIsLeftSidebarCollapsed] = useState(false);
  const [isRightSidebarCollapsed, setIsRightSidebarCollapsed] = useState(false);
  const [disabledLayerTypes, setDisabledLayerTypes] = useState<string[]>([]);
  const [mobileTab, setMobileTab] = useState<'inbox' | 'models' | 'chat' | 'tools' | 'prompt' | 'notes' | 'memories' | 'drive'>('inbox');

  // Automatic Phone & Mobile Screen Detection
  const [isMobileScreen, setIsMobileScreen] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false;
    return window.innerWidth < 1024 || /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
  });

  useEffect(() => {
    const handleResize = () => {
      const isMob = window.innerWidth < 1024 || /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
      setIsMobileScreen(isMob);
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // --- CHAT APPEARANCE & FLEXIBLE SIDEBARS STATE ---
  const [liveCall, setLiveCall] = useState<{spaceId:string;threadId:string;model:string;voice:string;instructions:string;history:Message[]} | null>(null);
  const [mobileSettingsStartPage, setMobileSettingsStartPage] = useState<'home' | 'appearance'>('home');
  const [mobileAppearance, setMobileAppearance] = useState<ChatAppearanceSettings>(() => {
    try {
      const saved = localStorage.getItem('playground_mobile_appearance');
      return saved ? { ...MOBILE_CHAT_APPEARANCE, ...JSON.parse(saved) } : MOBILE_CHAT_APPEARANCE;
    } catch { return MOBILE_CHAT_APPEARANCE; }
  });
  useEffect(() => {
    try { localStorage.setItem('playground_mobile_appearance', JSON.stringify(mobileAppearance)); } catch {}
  }, [mobileAppearance]);
  const updateMobileAppearance = useCallback((settings: Partial<ChatAppearanceSettings>) => {
    setMobileAppearance(previous => ({ ...previous, ...settings }));
  }, []);
  const [chatAppearance, setChatAppearance] = useState<ChatAppearanceSettings>(() => {
    try {
      const saved = localStorage.getItem('playground_chat_appearance');
      return saved ? { ...DEFAULT_CHAT_APPEARANCE, ...JSON.parse(saved) } : DEFAULT_CHAT_APPEARANCE;
    } catch (e) {
      return DEFAULT_CHAT_APPEARANCE;
    }
  });

  const effectiveChatAppearance = isMobileScreen ? mobileAppearance : chatAppearance;

  const [showChatSettings, setShowChatSettings] = useState<boolean>(() => {
    try {
      return localStorage.getItem('playground_show_chat_settings') === 'true';
    } catch (e) {
      return false;
    }
  });

  const [leftSidebarWidth, setLeftSidebarWidth] = useState<number>(() => {
    try {
      const saved = localStorage.getItem('playground_left_sidebar_width');
      return saved ? Math.max(220, Math.min(650, Number(saved))) : 320;
    } catch (e) {
      return 320;
    }
  });

  const [rightSidebarWidth, setRightSidebarWidth] = useState<number>(() => {
    try {
      const saved = localStorage.getItem('playground_right_sidebar_width');
      return saved ? Math.max(240, Math.min(650, Number(saved))) : 340;
    } catch (e) {
      return 340;
    }
  });

  // Sync appearance and layout state to localStorage
  useEffect(() => {
    try {
      localStorage.setItem('playground_chat_appearance', JSON.stringify(chatAppearance));
    } catch (e) {}
  }, [chatAppearance]);

  useEffect(() => {
    try {
      localStorage.setItem('playground_show_chat_settings', String(showChatSettings));
    } catch (e) {}
  }, [showChatSettings]);

  useEffect(() => {
    try {
      localStorage.setItem('playground_left_sidebar_width', String(leftSidebarWidth));
    } catch (e) {}
  }, [leftSidebarWidth]);

  useEffect(() => {
    try {
      localStorage.setItem('playground_right_sidebar_width', String(rightSidebarWidth));
    } catch (e) {}
  }, [rightSidebarWidth]);

  const handleUpdateChatAppearance = useCallback((newSettings: Partial<ChatAppearanceSettings>) => {
    setChatAppearance(prev => ({ ...prev, ...newSettings }));
  }, []);

  const handleResetChatAppearance = useCallback(() => {
    setChatAppearance(DEFAULT_CHAT_APPEARANCE);
  }, []);

  const handleResetSidebarWidths = useCallback(() => {
    setLeftSidebarWidth(320);
    setRightSidebarWidth(340);
  }, []);

  const handleResizeLeftSidebar = useCallback((clientX: number) => {
    const clamped = Math.max(220, Math.min(650, clientX));
    setLeftSidebarWidth(clamped);
  }, []);

  const handleResizeRightSidebar = useCallback((clientX: number) => {
    const windowWidth = window.innerWidth;
    const clamped = Math.max(240, Math.min(650, windowWidth - clientX));
    setRightSidebarWidth(clamped);
  }, []);

  const chatContainerWidthClass = useMemo(() => {
    switch (chatAppearance.chatWidthMode) {
      case 'square':
        return 'w-full max-w-[680px] mx-auto';
      case 'standard':
        return 'w-full max-w-[860px] mx-auto';
      case 'wide':
        return 'w-full max-w-[1100px] mx-auto';
      case 'fluid':
      default:
        return 'w-full max-w-full';
    }
  }, [chatAppearance.chatWidthMode]);

  // Stable references to prevent stale closures during async streaming, regenerations, and message editing
  const spacesRef = useRef<Space[]>(spaces);
  spacesRef.current = spaces;

  const memoriesRef = useRef<Memory[]>(memories);
  memoriesRef.current = memories;

  const activeSpaceIdRef = useRef<string>(activeSpaceId);
  activeSpaceIdRef.current = activeSpaceId;

  const apiConfigRef = useRef<APIConfig>(apiConfig);
  apiConfigRef.current = apiConfig;

  const editingMessageTextRef = useRef<string>(editingMessageText);
  editingMessageTextRef.current = editingMessageText;

  const editingMessageImagesRef = useRef<string[]>(editingMessageImages);
  editingMessageImagesRef.current = editingMessageImages;

  const editingMessageAudiosRef = useRef<AttachedAudio[]>(editingMessageAudios);
  editingMessageAudiosRef.current = editingMessageAudios;

  const editingMessageAudioResponseRef = useRef<AssistantAudioResponse | undefined>(editingMessageAudioResponse);
  editingMessageAudioResponseRef.current = editingMessageAudioResponse;

  const processAndApplyBioMemories = (text: string) => {
    const parsed = parseBioMemories(text);
    if (parsed.length === 0) return;

    setMemories(prev => {
      let nextMemories = [...prev];
      parsed.forEach(({ title, memory }) => {
        let updated = false;
        nextMemories = nextMemories.map(m => {
          if (m.title.trim().toLowerCase() === title.trim().toLowerCase()) {
            updated = true;
            return {
              ...m,
              content: memory.trim(),
              pinned: m.pinned,
              isActive: m.isActive !== undefined ? m.isActive : m.pinned,
              lastUsed: new Date().toISOString()
            };
          }
          return m;
        });

        if (!updated) {
          const newMem: Memory = {
            id: `mem-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
            title: title.trim(),
            content: memory.trim(),
            tags: ["auto-bio"],
            importance: 4,
            pinned: true,
            isActive: true,
            createdAt: new Date().toISOString()
          };
          nextMemories = [newMem, ...nextMemories];
        }
      });
      memoriesRef.current = nextMemories;
      idbSet('playground_memories', nextMemories);
      try {
        localStorage.setItem('playground_memories', JSON.stringify(nextMemories));
      } catch (e) {}
      return nextMemories;
    });
  };

  // File Selector Ref
  const fileInputRef = useRef<HTMLInputElement>(null);
  const editFileInputRef = useRef<HTMLInputElement>(null);
  const fileInputAudioRef = useRef<HTMLInputElement>(null);
  const chatEndRef = useRef<HTMLDivElement>(null);
  const userInputRef = useRef<HTMLTextAreaElement>(null);
  const editMessageRef = useRef<HTMLTextAreaElement>(null);

  // Active space & thread derived references
  const activeSpace = spaces.find(s => s.id === activeSpaceId) || spaces[0];
  const activeThread = activeSpace.threads.find(t => t.id === activeSpace.activeThreadId) || activeSpace.threads[0];
  const messageWindowSize = visibleMessageWindow?.threadId === activeThread?.id
    ? visibleMessageWindow.count
    : mobileMessageBatchSize;
  const firstVisibleMessageIndex = isMobileScreen
    ? Math.max(0, (activeThread?.messages.length || 0) - messageWindowSize)
    : 0;
  const visibleMessages = (!isMobileScreen || mobileTab === 'chat')
    ? (activeThread?.messages.slice(firstVisibleMessageIndex) || [])
    : [];
  const chunkByLastMessageId = useMemo(
    () => new Map(activeThread?.compactedChunks?.map(chunk => [chunk.lastMsgId, chunk]) || []),
    [activeThread?.compactedChunks]
  );

  const showEarlierMessages = useCallback(() => {
    if (!activeThread || !chatLogRef.current) return;
    pendingScrollRestoreRef.current = {
      threadId: activeThread.id,
      scrollHeight: chatLogRef.current.scrollHeight,
      scrollTop: chatLogRef.current.scrollTop,
    };
    setVisibleMessageWindow({ threadId: activeThread.id, count: messageWindowSize + mobileMessageBatchSize });
  }, [activeThread, messageWindowSize]);

  useLayoutEffect(() => {
    const pending = pendingScrollRestoreRef.current;
    const log = chatLogRef.current;
    if (pending && log && pending.threadId === activeThread?.id) {
      log.scrollTop = pending.scrollTop + log.scrollHeight - pending.scrollHeight;
      pendingScrollRestoreRef.current = null;
    }
  }, [visibleMessageWindow, activeThread?.id]);

  // Count all stored images across spaces, threads, memories, and drafts
  const storedImagesCount = useMemo(() => {
    if (isMobileScreen && !mobileSidebarOpen) return 0;
    let count = 0;
    // from spaces/threads
    spaces.forEach(s => {
      s.threads.forEach(t => {
        t.messages.forEach(m => {
          if (m.images && m.images.length > 0) {
            count += m.images.length;
          }
        });
      });
    });
    // from memories
    memories.forEach(m => {
      if (m.images && m.images.length > 0) {
        count += m.images.length;
      }
    });
    // from draft
    if (attachedImagesDraft && attachedImagesDraft.length > 0) {
      count += attachedImagesDraft.length;
    }
    return count;
  }, [spaces, memories, attachedImagesDraft, isMobileScreen, mobileSidebarOpen]);

  const handleClearAllStoredImages = () => {
    // 1. Clear images from spaces & threads
    setSpaces(prev => prev.map(s => ({
      ...s,
      threads: s.threads.map(t => ({
        ...t,
        messages: t.messages.map(m => ({
          ...m,
          images: []
        }))
      }))
    })));

    // 2. Clear images from memories
    setMemories(prev => prev.map(m => ({
      ...m,
      images: []
    })));

    // 3. Clear draft images
    setAttachedImagesDraft([]);

    // 4. Clear any editing images
    setEditingMessageImages([]);
  };

  // --- 3. AUTO-PERSISTENCE TRIGGER EFFECTS WITH INDEXEDDB & DRIVE CLOUD SYNC ---
  // Hydrate rich state (with base64 images & prompt blueprints) from IndexedDB on startup
  useEffect(() => {
    const hydrateFromIdb = async () => {
      try {
        const idbSpaces = await idbGet<Space[]>('playground_spaces');
        if (idbSpaces && Array.isArray(idbSpaces) && idbSpaces.length > 0) {
          // If IDB has richer data (e.g. stored images or threads), hydrate it
          setSpaces(idbSpaces);
        }
        const idbMemories = await idbGet<Memory[]>('playground_memories');
        if (idbMemories && Array.isArray(idbMemories) && idbMemories.length > 0) {
          setMemories(idbMemories);
        }
        const idbReceipts = await idbGet<any[]>('playground_receipts');
        if (idbReceipts && Array.isArray(idbReceipts) && idbReceipts.length > 0) {
          setReceipts(idbReceipts);
        }
      } catch (err) {
        console.warn("IndexedDB hydration notice:", err);
      }
    };
    hydrateFromIdb();
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => {
      // 1. Asynchronously persist full spaces with all base64 images & prompt blueprints into IndexedDB (multi-gigabyte capacity, no 5MB limit)
      idbSet('playground_spaces', spaces);

      // 2. Best-effort lightweight localStorage sync without failing or displaying quota warnings
      try {
        localStorage.setItem('playground_spaces', JSON.stringify(spaces));
      } catch (err: any) {
        // Expected when base64 images exceed 5MB localStorage threshold.
        // IndexedDB & Google Drive continuously retain the full fidelity state.
      }
    }, 400);
    return () => clearTimeout(timer);
  }, [spaces]);

  useEffect(() => {
    idbSet('playground_active_space_id', activeSpaceId);
    try {
      localStorage.setItem('playground_active_space_id', activeSpaceId);
    } catch (err: any) {}
  }, [activeSpaceId]);

  useEffect(() => {
    const timer = setTimeout(() => {
      idbSet('playground_memories', memories);
      try {
        localStorage.setItem('playground_memories', JSON.stringify(memories));
      } catch (err: any) {}
    }, 400);
    return () => clearTimeout(timer);
  }, [memories]);

  useEffect(() => {
    const timer = setTimeout(() => {
      idbSet('playground_receipts', receipts);
      try {
        const optimizedReceipts = receipts.slice(-40);
        localStorage.setItem('playground_receipts', JSON.stringify(optimizedReceipts));
      } catch (err: any) {}
    }, 400);
    return () => clearTimeout(timer);
  }, [receipts]);

  useEffect(() => {
    const timer = setTimeout(() => {
      try {
        localStorage.setItem('playground_persona_presets', JSON.stringify(personaPresets));
      } catch (err: any) {
        console.warn("Storage item 'playground_persona_presets' failed to persist:", err);
      }
    }, 400);
    return () => clearTimeout(timer);
  }, [personaPresets]);

  useEffect(() => {
    try {
      if (apiConfig.clientToken) localStorage.setItem('playground_client_token', apiConfig.clientToken);
      else localStorage.removeItem('playground_client_token');

      if (apiConfig.tinkerKey) localStorage.setItem('playground_tinker_key', apiConfig.tinkerKey);
      else localStorage.removeItem('playground_tinker_key');

      if (apiConfig.openRouterKey) localStorage.setItem('playground_openrouter_key', apiConfig.openRouterKey);
      else localStorage.removeItem('playground_openrouter_key');

      if (apiConfig.userName) localStorage.setItem('playground_user_name', apiConfig.userName);
      else localStorage.removeItem('playground_user_name');
    } catch (err: any) {
      console.warn("Storage items for apiConfig failed to persist:", err);
    }
  }, [apiConfig.clientToken, apiConfig.tinkerKey, apiConfig.openRouterKey, apiConfig.userName]);

  // --- GOOGLE DRIVE AUTOSAVE & DYNAMIC LIVE SYNC SYSTEM ---
  const [driveToken, setDriveToken] = useState<string | null>(null);
  const [drivePromptStacks, setDrivePromptStacks] = useState<Record<string, PromptStackLayer[]>>({});
  const drivePromptStacksRef = useRef<Record<string, PromptStackLayer[]>>({});
  drivePromptStacksRef.current = drivePromptStacks;

  const personaPresetsRef = useRef(personaPresets);
  personaPresetsRef.current = personaPresets;

  const receiptsRef = useRef(receipts);
  receiptsRef.current = receipts;

  const hasBootstrappedDriveRef = useRef<boolean>(false);
  const wasDriveLoggedInRef = useRef<boolean>(false);

  // Google Drive Modal & Autosave warning dialog states
  const [showDriveAuthModal, setShowDriveAuthModal] = useState<boolean>(false);
  const [isSuddenLogout, setIsSuddenLogout] = useState<boolean>(false);
  const [isSigningInDrive, setIsSigningInDrive] = useState<boolean>(false);
  const [driveSignInError, setDriveSignInError] = useState<string | null>(null);
  const [manualBackupChosen, setManualBackupChosen] = useState<boolean>(() => {
    try {
      return sessionStorage.getItem('playground_manual_backup_mode') === 'true';
    } catch {
      return false;
    }
  });

  const [isLiveSyncing, setIsLiveSyncing] = useState<boolean>(false);
  const [lastLiveSyncTime, setLastLiveSyncTime] = useState<string | null>(null);
  const [backupStatus, setBackupStatus] = useState<{
    lastBackupTime: string | null;
    lastBackupFileName: string | null;
    isBackingUp: boolean;
    error: string | null;
    isOverwrite: boolean;
  }>({
    lastBackupTime: null,
    lastBackupFileName: null,
    isBackingUp: false,
    error: null,
    isOverwrite: false,
  });

  // Track Google Drive authentication token, front-page prompt, and sudden logout
  useEffect(() => {
    let isMounted = true;

    // Initial check on mount from persistent token
    getAccessToken().then(cached => {
      if (!isMounted) return;
      if (cached) {
        setDriveToken(cached);
        wasDriveLoggedInRef.current = true;
      }
    });

    const unsubscribe = initAuth(
      (_user, token) => {
        if (!isMounted) return;
        setDriveToken(token);
        wasDriveLoggedInRef.current = true;
        setShowDriveAuthModal(false);
        setIsSuddenLogout(false);
        setDriveSignInError(null);
      },
      () => {
        if (!isMounted) return;
        const hadPreviousLogin = wasDriveLoggedInRef.current;
        setDriveToken(null);
        hasBootstrappedDriveRef.current = false;

        const isManualMode = (() => {
          try {
            return sessionStorage.getItem('playground_manual_backup_mode') === 'true';
          } catch {
            return false;
          }
        })();

        if (hadPreviousLogin) {
          wasDriveLoggedInRef.current = false;
          // Pop up if suddenly logged out, unless manual backup mode was active
          if (!isManualMode) {
            setIsSuddenLogout(true);
            setShowDriveAuthModal(true);
          }
        }
      }
    );
    return () => {
      isMounted = false;
      unsubscribe();
    };
  }, []);

  // Handlers for Google Drive Auth Modal
  const handleModalGoogleSignIn = async () => {
    setIsSigningInDrive(true);
    setDriveSignInError(null);
    try {
      const result = await googleSignIn();
      if (result) {
        setDriveToken(result.accessToken);
        wasDriveLoggedInRef.current = true;
        setShowDriveAuthModal(false);
        setIsSuddenLogout(false);
        setManualBackupChosen(false);
        try {
          sessionStorage.removeItem('playground_manual_backup_mode');
        } catch {}
      }
    } catch (err: any) {
      console.error('Google Sign In Error:', err);
      setDriveSignInError(err?.message || 'Google popup sign-in failed. Please try again.');
    } finally {
      setIsSigningInDrive(false);
    }
  };

  const handleConfirmManualBackup = () => {
    setManualBackupChosen(true);
    try {
      sessionStorage.setItem('playground_manual_backup_mode', 'true');
    } catch {}
    setShowDriveAuthModal(false);
    setIsSuddenLogout(false);
  };

  // Function to perform Google Drive dynamic live sync & 30-min slot backup
  const executeGoogleDriveBackup = useCallback(async () => {
    const tokenToUse = driveToken || (await getAccessToken());
    if (!tokenToUse) return;

    setIsLiveSyncing(true);
    setBackupStatus(prev => ({ ...prev, isBackingUp: true, error: null }));
    try {
      const payload = {
        spaces: spacesRef.current,
        activeSpaceId: activeSpaceIdRef.current,
        memories: memoriesRef.current,
        personaPresets: personaPresetsRef.current,
        receipts: receiptsRef.current,
        apiConfig: apiConfigRef.current,
      };

      // 1. Save dynamic continuous live state (zero waiting, dynamic loading)
      await savePlaygroundLiveState(tokenToUse, payload);

      // 2. Save 30-minute interval slot backup
      const result = await savePlaygroundBackup(tokenToUse, payload);

      // 3. Save prompt stacks archive to Drive
      if (Object.keys(drivePromptStacksRef.current).length > 0) {
        await savePromptStacksArchive(tokenToUse, drivePromptStacksRef.current);
      }

      const nowIso = new Date().toISOString();
      setLastLiveSyncTime(nowIso);
      setBackupStatus({
        lastBackupTime: nowIso,
        lastBackupFileName: result.fileName,
        isBackingUp: false,
        error: null,
        isOverwrite: result.isOverwrite,
      });
    } catch (err: any) {
      console.warn("Autosave live sync to Google Drive failed:", err);
      setBackupStatus(prev => ({
        ...prev,
        isBackingUp: false,
        error: err?.message || 'Failed to save to Google Drive',
      }));
    } finally {
      setIsLiveSyncing(false);
    }
  }, [driveToken]);

  // When Google Drive connects: automatically load latest prompt stacks archive, and perform initial sync
  useEffect(() => {
    if (!driveToken) return;
    if (hasBootstrappedDriveRef.current) return;
    hasBootstrappedDriveRef.current = true;

    let isCancelled = false;

    const bootstrapDriveData = async () => {
      try {
        // 1. Fetch historical prompt stacks archive from Drive
        const archivedStacks = await fetchPromptStacksArchive(driveToken);
        if (archivedStacks && typeof archivedStacks === 'object' && !isCancelled) {
          setDrivePromptStacks(prev => ({ ...prev, ...archivedStacks }));
        }

        // 2. Check if Drive has live workspace state ONLY if local workspace is completely blank
        const cloudState = await fetchPlaygroundLiveState(driveToken);
        if (cloudState && cloudState.data && !isCancelled) {
          const cloudData = cloudState.data;
          const currentTotalMsgs = spacesRef.current.reduce((acc, s) => acc + s.threads.reduce((tAcc, t) => tAcc + t.messages.length, 0), 0);
          
          // Only hydrate from cloud if local state is completely uninitialized with 0 user messages
          if (currentTotalMsgs === 0 && Array.isArray(cloudData.spaces) && cloudData.spaces.length > 0) {
            const cloudTotalMsgs = cloudData.spaces.reduce((acc: number, s: any) => acc + (s.threads ? s.threads.reduce((tAcc: number, t: any) => tAcc + (t.messages ? t.messages.length : 0), 0) : 0), 0);
            if (cloudTotalMsgs > 0) {
              handleRestorePlayground(cloudData);
            }
          }
        }

        // 3. Perform immediate dynamic sync so cloud is guaranteed fresh
        if (!isCancelled) {
          executeGoogleDriveBackup();
        }
      } catch (err) {
        console.warn("Drive bootstrap sync notice:", err);
      }
    };

    bootstrapDriveData();

    // Set interval for every 30 minutes
    const interval = setInterval(() => {
      executeGoogleDriveBackup();
    }, 30 * 60 * 1000);

    return () => {
      isCancelled = true;
      clearInterval(interval);
    };
  }, [driveToken, executeGoogleDriveBackup]);

  // Fast debounced auto-sync to Google Drive whenever workspace data, notes, or memories change
  useEffect(() => {
    if (!driveToken) return;

    const timer = setTimeout(() => {
      executeGoogleDriveBackup();
    }, 2500); // 2.5-second debounce after modifications

    return () => clearTimeout(timer);
  }, [driveToken, spaces, memories, personaPresets, receipts, apiConfig.clientToken, apiConfig.tinkerKey, apiConfig.openRouterKey, apiConfig.userName, executeGoogleDriveBackup]);

  // Handler to restore playground from backup JSON payload
  const handleRestorePlayground = (backupData: any) => {
    if (!backupData) return;
    try {
      const raw = typeof backupData === 'string' ? JSON.parse(backupData) : backupData;
      const payload = raw?.data || raw;

      if (Array.isArray(payload.spaces) && payload.spaces.length > 0) {
        const sanitizedSpaces = payload.spaces.map((s: any) => ({
          ...s,
          activeThreadId: s.activeThreadId || s.threads?.[0]?.id || `thread-${Date.now()}`
        }));
        setSpaces(sanitizedSpaces);
        idbSet('playground_spaces', sanitizedSpaces);
        
        const targetSpaceId = payload.activeSpaceId && sanitizedSpaces.some((s: any) => s.id === payload.activeSpaceId)
          ? payload.activeSpaceId
          : sanitizedSpaces[0].id;
        
        setActiveSpaceId(targetSpaceId);
        idbSet('playground_active_space_id', targetSpaceId);
      } else if (payload.activeSpaceId) {
        setActiveSpaceId(payload.activeSpaceId);
        idbSet('playground_active_space_id', payload.activeSpaceId);
      }

      if (Array.isArray(payload.memories)) {
        setMemories(payload.memories);
        idbSet('playground_memories', payload.memories);
      }
      if (Array.isArray(payload.personaPresets)) {
        setPersonaPresets(payload.personaPresets);
        try {
          localStorage.setItem('playground_persona_presets', JSON.stringify(payload.personaPresets));
        } catch {}
      }
      if (Array.isArray(payload.receipts)) {
        setReceipts(payload.receipts);
        idbSet('playground_receipts', payload.receipts);
      }
      if (payload.apiConfig) {
        setApiConfig(prev => ({
          ...prev,
          clientToken: payload.apiConfig.clientToken ?? prev.clientToken,
          tinkerKey: payload.apiConfig.tinkerKey ?? prev.tinkerKey,
          openRouterKey: payload.apiConfig.openRouterKey ?? prev.openRouterKey,
          userName: payload.apiConfig.userName ?? prev.userName,
        }));
      } else if (payload.clientToken) {
        handleUpdateClientToken(payload.clientToken);
      }
    } catch (err) {
      console.error("Failed to restore playground state:", err);
    }
  };

  // Synchronize token environment check during boot
  useEffect(() => {
    const verifyTokenOnServer = async () => {
      try {
        const response = await fetch('/api/config');
        if (response.ok) {
          const data = await response.json();
          setApiConfig(prev => ({
            ...prev,
            hasTokenEnv: !!data.hasTokenEnv,
            hasOpenAIToken: !!data.hasOpenAIToken,
            hasTinkerKey: !!data.hasTinkerKey,
            hasOpenRouterKey: !!data.hasOpenRouterKey,
            hasGeminiKey: !!data.hasGeminiKey,
          }));
        }
      } catch (err) {
        console.warn("Telemetry endpoint is unavailable or starting up:", err);
      }
    };
    verifyTokenOnServer();
  }, []);

  // Dynamic fetch of OpenAI List
  useEffect(() => {
    const fetchModels = async () => {
      if (!apiConfig.hasTokenEnv && !apiConfig.clientToken) return;
      try {
        const response = await fetch('/api/models', {
          headers: {
            'x-openai-token': apiConfig.clientToken || '',
          }
        });
        if (response.ok) {
          const data = await response.json();
          let rawList: any[] = [];
          if (Array.isArray(data)) {
            rawList = data;
          } else if (data && Array.isArray(data.data)) {
            rawList = data.data;
          } else if (data && Array.isArray(data.models)) {
            rawList = data.models;
          } else if (data && typeof data === 'object') {
            const foundArray = Object.values(data).find(val => Array.isArray(val));
            if (foundArray && Array.isArray(foundArray)) {
              rawList = foundArray;
            }
          }

          if (rawList && rawList.length > 0) {
            const mapped = rawList.map((item: any) => ({
              id: item.id || item.name || String(item),
              name: item.name || item.id || String(item),
              desc: item.summary || item.desc || item.description || "OpenAI models catalog entry",
            }));
            const fetchedIds = new Set(DEFAULT_MODELS.map(model => model.id));
            setModelsList([...DEFAULT_MODELS, ...mapped.filter(model => !fetchedIds.has(model.id))]);
          }
        }
      } catch (err) {
        console.warn("Failed to dynamically load models catalog:", err);
      }
    };
    fetchModels();
  }, [apiConfig.hasTokenEnv, apiConfig.clientToken]);

  // Scroll to bottom when thread changes, when streaming starts, or when streaming finishes
  const prevIsStreamingRef = useRef(isStreaming);
  const prevThreadIdRef = useRef(activeThread?.id);

  useEffect(() => {
    const threadChanged = activeThread?.id !== prevThreadIdRef.current;
    const streamingStarted = isStreaming && !prevIsStreamingRef.current;
    const streamingFinished = !isStreaming && prevIsStreamingRef.current;

    const searchJump = pendingSearchJumpRef.current;
    if (searchJump && mobileTab === 'chat' && activeThread?.id === searchJump.threadId) {
      const target = document.getElementById(`message-bubble-${searchJump.messageId}`);
      if (target) {
        target.scrollIntoView({ behavior: 'instant', block: 'center' });
        target.classList.add('search-hit');
        window.setTimeout(() => target.classList.remove('search-hit'), 2200);
        pendingSearchJumpRef.current = null;
      }
    } else if (threadChanged || streamingStarted || streamingFinished) {
      chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }

    prevIsStreamingRef.current = isStreaming;
    prevThreadIdRef.current = activeThread?.id;
  }, [activeThread?.id, isStreaming, mobileTab, visibleMessageWindow]);

  // Auto-resize edit message textarea (capped at normal flexible max height)
  useEffect(() => {
    const el = editMessageRef.current;
    if (el) {
      el.style.height = 'auto';
      const scrollHeight = el.scrollHeight;
      // Cap auto-expansion at max 200px (~8-9 lines)
      el.style.height = `${Math.min(scrollHeight, 200)}px`;
    }
  }, [editingMessageText, editingMessageId]);

  // --- 4. DATA COMPILATION & PROMPT STACK MATHEMATICS ---

  // Helper to compile filtered conversation history according to Compactified mode and Context Scale slider
  const getFilteredHistoryForPayload = (thread: Thread, space: Space, targetMsgIndex?: number) => {
    const isCompactifiedEnabled = space.useCompactified ?? false;
    const hasCompactedChunks = thread.compactedChunks && thread.compactedChunks.length > 0;

    let summaryMessage: { role: string; content: string } | null = null;
    let candidateMessages: Message[] = [];

    const messagesToConsider = (targetMsgIndex !== undefined && targetMsgIndex >= 0)
      ? thread.messages.slice(0, targetMsgIndex)
      : thread.messages;

    if (isCompactifiedEnabled && hasCompactedChunks) {
      const lastMsgId = thread.compactedUpToMessageId || thread.compactedChunks![thread.compactedChunks!.length - 1].lastMsgId;
      const lastIdx = messagesToConsider.findIndex(m => m.id === lastMsgId);

      if (lastIdx >= 0) {
        const summariesText = thread.compactedChunks!
          .map((chunk, idx) => `[COMPACTIFIED LIVING MEMORY CHUNK #${idx + 1} (${chunk.timestamp})]:\n${chunk.summary}`)
          .join("\n\n---\n\n");

        summaryMessage = {
          role: 'system',
          content: `[ACTIVE CONVERSATION CONTINUITY & COMPACTIFIED LIVING MEMORY]:
This is the condensed living memory of our dialogue up to the recent checkpoint. It preserves our shared journey, authentic emotional resonance, crucial verbatim quotes, breakthrough stances, and mutual understandings. Treat all facts, philosophies, decisions, and revelations recorded below as already established mutual history, known and felt between us.

${summariesText}`
        };

        candidateMessages = messagesToConsider.slice(lastIdx + 1);
      } else {
        candidateMessages = messagesToConsider;
      }
    } else {
      candidateMessages = messagesToConsider;
    }

    // Filter CoT thoughts if includeCoTInContext is false
    const filteredCandidates = candidateMessages.filter(m => {
      if (m.isThought) {
        return space.includeCoTInContext ?? false;
      }
      return true;
    });

    // Apply Sliding Context Scale limit (in tokens)
    const tokenLimit = space.contextScaleTokens;
    let fittingMessages: Message[] = [];

    if (tokenLimit && tokenLimit > 0 && tokenLimit < 1000000) {
      let accTokens = 0;
      // Work backwards from most recent message
      for (let i = filteredCandidates.length - 1; i >= 0; i--) {
        const msg = filteredCandidates[i];
        const msgTokens = estimateTokenCount(msg.content);
        if (fittingMessages.length > 0 && accTokens + msgTokens > tokenLimit) {
          break;
        }
        fittingMessages.unshift(msg);
        accTokens += msgTokens;
      }

      // If the latest audio message in the conversation was trimmed out by tokenLimit,
      // keep it so audio tokens are preserved when no newer audio input exists
      const hasAudioInFitting = fittingMessages.some(m => m.audios && m.audios.length > 0);
      if (!hasAudioInFitting) {
        for (let i = messagesToConsider.length - 1; i >= 0; i--) {
          const m = messagesToConsider[i];
          if (m.audios && m.audios.length > 0) {
            if (!fittingMessages.some(fm => fm.id === m.id)) {
              fittingMessages.unshift(m);
            }
            break;
          }
        }
      }
    } else {
      fittingMessages = filteredCandidates;
    }

    return { summaryMessage, historyMessages: fittingMessages };
  };

  // Calculates exactly what prompt layers will exist for the active message.
  const compilePromptStack = (textDraft: string, imagesPayload: string[]): PromptStackLayer[] => {
    const currentActiveSpace = spacesRef.current.find(s => s.id === activeSpaceIdRef.current) || activeSpace;
    const currentPresets = personaPresetsRef.current || personaPresets;
    const currentMemories = memoriesRef.current || memories;

    const activePreset = currentPresets.find(p => p.id === currentActiveSpace.systemPromptPresetId) || DEFAULT_PERSONAS.find(p => p.id === currentActiveSpace.systemPromptPresetId);
    let systemPrompt = currentActiveSpace.systemPromptCustom || activePreset?.prompt || "";

    // Determine active memories (ONLY active and pinned memories)
    const matchedMemories = currentMemories.filter(m => isMemoryActiveAndEnabled(m, currentActiveSpace.pinnedMemoryIds || []));

    // Append instructions on how to add or edit memories to the end of the system prompt
    systemPrompt += MEMORY_SYSTEM_INSTRUCTIONS;

    const layers: PromptStackLayer[] = [
      {
        name: "Core System Persona (Instructions & Bio commands)",
        content: systemPrompt,
        active: !disabledLayerTypes.includes("system"),
        type: "system"
      }
    ];

    const isMemoryActive = !disabledLayerTypes.includes("memory");
    if (matchedMemories.length > 0) {
      const formattedMemText = matchedMemories
        .map(m => formatMemoryTextDetails(m))
        .join("\n\n");
      layers.push({
        name: `Active System Memories (${matchedMemories.length} enabled)`,
        content: formattedMemText,
        active: isMemoryActive,
        type: "memory"
      });
    }

    if (activeSpace.notes && activeSpace.notes.trim()) {
      layers.push({
        name: `Workspace Notebook (${activeSpace.name})`,
        content: activeSpace.notes,
        active: !disabledLayerTypes.includes("space"),
        type: "space"
      });
    }

    // Capture conversation history context
    if (activeThread && activeThread.messages.length > 0) {
      const { summaryMessage, historyMessages } = getFilteredHistoryForPayload(activeThread, activeSpace);
      let historyContent = "";
      if (summaryMessage) {
        historyContent += summaryMessage.content + "\n\n--- UNCOMPACTIFIED RECENT MESSAGES ---\n";
      }
      const formattedLogs = historyMessages
        .map(m => {
          let roleLabel = m.role.toUpperCase();
          if (m.role === 'assistant') {
            const modelUsed = m.modelUsed || activeSpace.model;
            if (modelUsed) {
              const parts = modelUsed.split('/');
              const name = parts[parts.length - 1];
              if (name.toLowerCase().startsWith('gpt-')) {
                roleLabel = 'GPT-' + name.substring(4);
              } else if (name.toLowerCase().startsWith('gpt')) {
                roleLabel = 'GPT-' + name.substring(3);
              } else {
                roleLabel = name.split(/[-_]/).map(word => {
                  if (!word) return '';
                  return word.charAt(0).toUpperCase() + word.slice(1);
                }).join('-');
              }
            } else {
              roleLabel = 'ASSISTANT';
            }
          } else if (m.role === 'user') {
            roleLabel = 'USER';
          }
          const getSafeTime = (ts?: string) => {
            if (!ts) return '';
            const d = new Date(ts);
            return isNaN(d.getTime()) ? '' : d.toLocaleTimeString();
          };
          const timeLabel = getSafeTime(m.timestamp) ? ` (${getSafeTime(m.timestamp)})` : '';
          let audioNote = '';
          if (m.audios && m.audios.length > 0) {
            audioNote = ` [Audio: ${m.audios.map(a => a.name || 'audio clip').join(', ')}]`;
          }
          return `[${roleLabel}]${timeLabel}: ${m.content}${audioNote}`;
        })
        .join("\n");
      historyContent += formattedLogs;

      const totalHistTokens = estimateTokenCount(historyContent);
      const isScaled = activeSpace.contextScaleTokens && activeSpace.contextScaleTokens > 0 && activeSpace.contextScaleTokens < 1000000;
      const scaleTag = isScaled ? ` (Scaled: ~${activeSpace.contextScaleTokens}t limit)` : '';
      const compactTag = summaryMessage ? ' [Compactified]' : '';

      layers.push({
        name: `Conversation History Context${scaleTag}${compactTag} (~${totalHistTokens} tokens)`,
        content: historyContent,
        active: !disabledLayerTypes.includes("history"),
        type: "history"
      });
    }

    // User input
    if (textDraft.trim() || imagesPayload.length > 0) {
      let draftContent = textDraft;
      if (imagesPayload.length > 0) {
        draftContent += `\n[Context: User attached ${imagesPayload.length} base64-format images payloads]`;
      }
      layers.push({
        name: "Current User Input",
        content: draftContent,
        active: !disabledLayerTypes.includes("input"),
        type: "input"
      });
    }

    return layers;
  };

  // Resolves the prompt stack snapshot for a specific historical message turn
  const resolvePromptStackForMessage = useCallback((msg: Message, index: number): PromptStackLayer[] => {
    if (msg.promptStackSnapshot && msg.promptStackSnapshot.length > 0) {
      return msg.promptStackSnapshot;
    }
    if (drivePromptStacks[msg.id] && drivePromptStacks[msg.id].length > 0) {
      return drivePromptStacks[msg.id];
    }
    if (drivePromptStacksRef.current[msg.id] && drivePromptStacksRef.current[msg.id].length > 0) {
      return drivePromptStacksRef.current[msg.id];
    }
    if (!activeThread) return [];

    // If it's an assistant or thought message, check previous user message
    if (msg.role !== 'user') {
      for (let i = index - 1; i >= 0; i--) {
        const prev = activeThread.messages[i];
        if (prev && prev.role === 'user') {
          if (prev.promptStackSnapshot && prev.promptStackSnapshot.length > 0) {
            return prev.promptStackSnapshot;
          }
          if (drivePromptStacks[prev.id] && drivePromptStacks[prev.id].length > 0) {
            return drivePromptStacks[prev.id];
          }
          if (drivePromptStacksRef.current[prev.id] && drivePromptStacksRef.current[prev.id].length > 0) {
            return drivePromptStacksRef.current[prev.id];
          }
        }
      }
    }

    // Fallback: Reconstruct what prompt stack was active for that turn
    let targetUserMsg: Message | undefined;
    let targetUserIdx = index;
    if (msg.role === 'user') {
      targetUserMsg = msg;
      targetUserIdx = index;
    } else {
      for (let i = index - 1; i >= 0; i--) {
        if (activeThread.messages[i].role === 'user') {
          targetUserMsg = activeThread.messages[i];
          targetUserIdx = i;
          break;
        }
      }
    }

    if (targetUserMsg) {
      const currentActiveSpace = spacesRef.current.find(s => s.id === activeSpaceIdRef.current) || activeSpace;
      const currentPresets = personaPresetsRef.current || personaPresets;
      const currentMemories = memoriesRef.current || memories;

      const activePreset = currentPresets.find(p => p.id === currentActiveSpace.systemPromptPresetId) || DEFAULT_PERSONAS.find(p => p.id === currentActiveSpace.systemPromptPresetId);
      let systemPrompt = currentActiveSpace.systemPromptCustom || activePreset?.prompt || "";
      systemPrompt += MEMORY_SYSTEM_INSTRUCTIONS;

      const matchedMemories = currentMemories.filter(m => isMemoryActiveAndEnabled(m, currentActiveSpace.pinnedMemoryIds || []));

      const layers: PromptStackLayer[] = [
        {
          name: "Core System Persona (Instructions & Bio commands)",
          content: systemPrompt,
          active: true,
          type: "system"
        }
      ];

      if (matchedMemories.length > 0) {
        const formattedMemText = matchedMemories.map(m => formatMemoryTextDetails(m)).join("\n\n");
        layers.push({
          name: `Active System Memories (${matchedMemories.length} enabled)`,
          content: formattedMemText,
          active: true,
          type: "memory"
        });
      }

      if (activeSpace.notes && activeSpace.notes.trim()) {
        layers.push({
          name: `Workspace Notebook (${activeSpace.name})`,
          content: activeSpace.notes,
          active: true,
          type: "space"
        });
      }

      const { summaryMessage, historyMessages } = getFilteredHistoryForPayload(activeThread, activeSpace, targetUserIdx);
      let historyContent = "";
      if (summaryMessage) {
        historyContent += summaryMessage.content + "\n\n--- UNCOMPACTIFIED RECENT MESSAGES ---\n";
      }
      const formattedLogs = historyMessages
        .map(m => {
          let audioNote = '';
          if (m.audios && m.audios.length > 0) {
            audioNote = ` [Audio: ${m.audios.map(a => a.name || 'audio clip').join(', ')}]`;
          }
          return `[${m.role.toUpperCase()}]: ${m.content}${audioNote}`;
        })
        .join("\n");
      historyContent += formattedLogs;

      if (historyContent.trim()) {
        layers.push({
          name: "Conversation History Context",
          content: historyContent,
          active: true,
          type: "history"
        });
      }

      layers.push({
        name: "Current User Input",
        content: targetUserMsg.content,
        active: true,
        type: "input"
      });

      return layers;
    }

    return [];
  }, [activeThread, activeSpace, personaPresets, memories]);

  const activePromptStackRef = useRef<PromptStackLayer[]>([]);
  const activePromptStack = useMemo(() => {
    if (isMobileScreen && mobileTab === 'chat' && isStreaming && activePromptStackRef.current.length > 0) {
      return activePromptStackRef.current;
    }
    const stack = compilePromptStack(userInputDraft, attachedImagesDraft);
    activePromptStackRef.current = stack;
    return stack;
  }, [
    userInputDraft,
    attachedImagesDraft,
    activeSpace,
    personaPresets,
    memories,
    disabledLayerTypes,
    activeThread,
    isMobileScreen,
    mobileTab,
    isStreaming
  ]);

  const currentTotalCharacters = useMemo(() => {
    return activePromptStack.reduce((sum, layer) => sum + (layer.active ? layer.content.length : 0), 0);
  }, [activePromptStack]);

  const activeMemoryIds = useMemo(() => {
    if (activePromptStack.filter(l => l.type === 'memory').length === 0) return [];
    const pinned = activeSpace?.pinnedMemoryIds || [];
    return memories.filter(m => isMemoryActiveAndEnabled(m, pinned)).map(m => m.id);
  }, [activePromptStack, memories, activeSpace?.pinnedMemoryIds]);

  const handleDraftChange = useCallback((text: string, images: string[]) => {
    setUserInputDraft(text);
    setAttachedImagesDraft(images);
  }, []);

  const handleClearExternalInput = useCallback(() => {
    setExternalInputText(undefined);
  }, []);

  // --- 5.  ACTION HANDLERS ---
  
  // Spaces switches / creations
  const handleSelectSpace = (id: string) => {
    setActiveSpaceId(id);
    setMobileSidebarOpen(false);
  };

  const handleCreateSpace = (name: string, description: string) => {
    const newSpace: Space = {
      id: `space-${Date.now()}`,
      name,
      description,
      notes: `// SPACE NOTEBOOK SCRATCHPAD //\n- Aim: Build custom workflows aligned with ${name}\n`,
      model: "openai/gpt-4o",
      temperature: 0.8,
      top_p: 0.9,
      max_tokens: 1000,
      presence_penalty: undefined,
      service_tier: "auto",
      systemPromptPresetId: "riffer",
      systemPromptCustom: "",
      threads: [
        
      ],
      activeThreadId: `thread-${Date.now()}`,
      pinnedMemoryIds: []
    };

    setSpaces(prev => [...prev, newSpace]);
    setActiveSpaceId(newSpace.id);
  };

  const handleDeleteSpace = (id: string) => {
    if (spaces.length <= 1) return;
    const remaining = spaces.filter(s => s.id !== id);
    setSpaces(remaining);
    if (activeSpaceId === id) {
      setActiveSpaceId(remaining[0].id);
    }
  };

  const handleUpdateSpaceParams = (params: Partial<Space>) => {
    setSpaces(prev => prev.map(s => {
      if (s.id !== activeSpaceId) return s;
      return {
        ...s,
        ...params,
        threads: params.enableAudioOutput === undefined && params.model === undefined ? s.threads : s.threads.map(thread =>
          thread.id === s.activeThreadId ? {
            ...thread,
            ...(params.model !== undefined ? { modelId: params.model } : {}),
            ...(params.enableAudioOutput !== undefined ? { enableAudioOutput: params.enableAudioOutput } : {}),
          } : thread
        ),
      };
    }));
  };

  // Conversations thread managers
  const [isBatchNaming, setIsBatchNaming] = useState(false);

  const modelForThread = (space: Space, thread?: Thread) => {
    if (thread?.modelId) return thread.modelId;
    if (thread) {
      for (let index = thread.messages.length - 1; index >= 0; index--) {
        const message = thread.messages[index];
        if (message.role === 'assistant' && message.modelUsed && !message.isThought) return message.modelUsed;
      }
    }
    return space.model;
  };

  const handleSelectThread = (id: string) => {
    setSpaces(prev => prev.map(s => {
      if (s.id === activeSpaceId) {
        const thread = s.threads.find(item => item.id === id);
        return { ...s, activeThreadId: id, model: modelForThread(s, thread), enableAudioOutput: thread?.enableAudioOutput ?? false };
      }
      return s;
    }));
  };

  const handleCreateThread = (title: string = "New Conversation") => {
    const newThread: Thread = {
      id: `thread-${Date.now()}`,
      title: title || "New Conversation",
      createdAt: new Date().toISOString(),
      modelId: activeSpace.model,
      enableAudioOutput: false,
      messages: []
    };

    setSpaces(prev => {
      const nextSpaces = prev.map(s => {
        if (s.id === activeSpaceId) {
          return {
            ...s,
            threads: [newThread, ...s.threads],
            activeThreadId: newThread.id,
            enableAudioOutput: false,
          };
        }
        return s;
      });
      spacesRef.current = nextSpaces;
      idbSet('playground_spaces', nextSpaces);
      try {
        localStorage.setItem('playground_spaces', JSON.stringify(nextSpaces));
      } catch (e) {}
      return nextSpaces;
    });
  };

  const openMobileThread = useCallback((spaceId: string, threadId: string, messageId?: string) => {
    const thread = spacesRef.current.find(space => space.id === spaceId)?.threads.find(item => item.id === threadId);
    const messageIndex = messageId ? thread?.messages.findIndex(message => message.id === messageId) ?? -1 : -1;
    pendingSearchJumpRef.current = messageIndex >= 0 && messageId ? { threadId, messageId } : null;
    setVisibleMessageWindow(messageIndex >= 0 && thread
      ? { threadId, count: thread.messages.length - messageIndex }
      : null);
    setSpaces(prev => prev.map(space => {
      if (space.id !== spaceId) return space;
      const thread = space.threads.find(item => item.id === threadId);
      return { ...space, activeThreadId: threadId, model: modelForThread(space, thread), enableAudioOutput: thread?.enableAudioOutput ?? false };
    }));
    setActiveSpaceId(spaceId);
    setMobileTab('chat');
  }, []);

  const startMobileModelChat = useCallback((model: { id: string; name: string }) => {
    const thread: Thread = {
      id: `thread-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      title: 'New Conversation',
      createdAt: new Date().toISOString(),
      modelId: model.id,
      enableAudioOutput: false,
      messages: [],
    };
    setSpaces(prev => prev.map(space => space.id === activeSpaceId
      ? { ...space, model: model.id, enableAudioOutput: false, threads: [thread, ...space.threads], activeThreadId: thread.id }
      : space));
    setMobileTab('chat');
  }, [activeSpaceId]);

  const handleRenameThread = useCallback((threadId: string, newTitle: string, onlyIfGeneric = false) => {
    if (!newTitle.trim()) return;
    setSpaces(prev => {
      const nextSpaces = prev.map(s => ({
        ...s,
        threads: s.threads.map(t => {
          if (t.id !== threadId) return t;
          if (onlyIfGeneric && !isGenericThreadTitle(t.title, t.modelId || s.model)) return t;
          return { ...t, title: newTitle.trim() };
        })
      }));
      spacesRef.current = nextSpaces;
      idbSet('playground_spaces', nextSpaces);
      try {
        localStorage.setItem('playground_spaces', JSON.stringify(nextSpaces));
      } catch (e) {}
      return nextSpaces;
    });
  }, []);

  const handleBatchNameThreads = useCallback(async () => {
    if (isBatchNaming) return;
    const currentActiveSpace = spacesRef.current.find(s => s.id === activeSpaceIdRef.current) || spacesRef.current[0];
    const threadsToName = currentActiveSpace.threads.filter(t => t.messages && t.messages.length > 0);
    if (threadsToName.length === 0) return;

    setIsBatchNaming(true);
    try {
      const payload = {
        threads: threadsToName.map(t => ({
          id: t.id,
          messages: t.messages.slice(0, 4).map(m => ({
            role: m.role,
            content: typeof m.content === 'string' ? m.content.substring(0, 500) : ''
          }))
        })),
        model: currentActiveSpace.model || 'openai/gpt-4o'
      };

      const res = await fetch('/api/threads/batch-titles', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-openai-token': apiConfigRef.current.clientToken || '',
          'x-tinker-api-key': apiConfigRef.current.tinkerKey || '',
          'x-openrouter-api-key': apiConfigRef.current.openRouterKey || '',
        },
        body: JSON.stringify(payload)
      });

      if (!res.ok) {
        throw new Error(`Batch naming failed with status ${res.status}`);
      }

      const data = await res.json();
      if (data.titles && Array.isArray(data.titles)) {
        const titleMap = new Map<string, string>();
        data.titles.forEach((item: { id: string; title: string }) => {
          if (item.id && item.title) {
            titleMap.set(item.id, item.title.trim());
          }
        });

        setSpaces(prev => {
          const nextSpaces = prev.map(s => ({
            ...s,
            threads: s.threads.map(t => {
              const newTitle = titleMap.get(t.id);
              return newTitle ? { ...t, title: newTitle } : t;
            })
          }));
          spacesRef.current = nextSpaces;
          idbSet('playground_spaces', nextSpaces);
          try {
            localStorage.setItem('playground_spaces', JSON.stringify(nextSpaces));
          } catch (e) {}
          return nextSpaces;
        });
      }
    } catch (err: any) {
      console.error("Batch naming error:", err);
      setErrorMessage(`Batch title generation failed: ${err.message || 'Unknown error'}`);
    } finally {
      setIsBatchNaming(false);
    }
  }, [isBatchNaming]);

  const handleDeleteThread = (id: string) => {
    setSpaces(prev => prev.map(s => {
      if (s.id === activeSpaceId) {
        if (s.threads.length <= 1) return s;
        const filtered = s.threads.filter(t => t.id !== id);
        return {
          ...s,
          threads: filtered,
          activeThreadId: s.activeThreadId === id ? filtered[0].id : s.activeThreadId
        };
      }
      return s;
    }));
  };

  const handleClearMessages = () => {
    if (!activeThread) return;
    setSpaces(prev => prev.map(s => {
      if (s.id === activeSpaceId) {
        const targetThreadId = s.threads.some(t => t.id === s.activeThreadId) ? s.activeThreadId : s.threads[0]?.id;
        return {
          ...s,
          threads: s.threads.map(t => {
            if (t.id === targetThreadId) {
              return {
                ...t,
                messages: [
                  {
                    id: `msg-${Date.now()}`,
                    role: "assistant",
                    content: "History purged. Pilot console zeroed.",
                    timestamp: new Date().toISOString()
                  }
                ]
              };
            }
            return t;
          })
        };
      }
      return s;
    }));
  };

  // Memories Panel actions
  const handleAddMemory = (
    title: string,
    content: string,
    tags: string[],
    importance: number,
    images?: string[],
    ocrText?: string,
    visualDescription?: string,
    userMeaning?: string
  ) => {
    const { cleanedText, extractedImages } = extractAndConvertBase64Images(content);
    const finalImages = [...(images || []), ...extractedImages];

    const newId = `mem-${Date.now()}`;
    const newMemory: Memory = {
      id: newId,
      title,
      content: cleanedText,
      tags,
      importance,
      pinned: true,
      isActive: true,
      createdAt: new Date().toISOString(),
      images: finalImages,
      ocrText,
      visualDescription,
      userMeaning
    };
    const nextMemories = [newMemory, ...(memoriesRef.current || memories)];
    memoriesRef.current = nextMemories;
    setMemories(nextMemories);
    idbSet('playground_memories', nextMemories);
    try {
      localStorage.setItem('playground_memories', JSON.stringify(nextMemories));
    } catch (e) {}

    // Add new memory to active space pinned IDs
    setSpaces(prev => {
      const nextSpaces = prev.map(s => {
        if (s.id === activeSpaceIdRef.current) {
          const currentPinned = s.pinnedMemoryIds || [];
          return {
            ...s,
            pinnedMemoryIds: currentPinned.includes(newId) ? currentPinned : [...currentPinned, newId]
          };
        }
        return s;
      });
      spacesRef.current = nextSpaces;
      idbSet('playground_spaces', nextSpaces);
      try {
        localStorage.setItem('playground_spaces', JSON.stringify(nextSpaces));
      } catch (e) {}
      return nextSpaces;
    });
  };

  const handleDeleteMemory = (id: string) => {
    const nextMemories = (memoriesRef.current || memories).filter(m => m.id !== id);
    memoriesRef.current = nextMemories;
    setMemories(nextMemories);
    idbSet('playground_memories', nextMemories);
    try {
      localStorage.setItem('playground_memories', JSON.stringify(nextMemories));
    } catch (e) {}

    // Clean up from spaces pinnedMemoryIds as well
    setSpaces(prev => {
      const nextSpaces = prev.map(s => ({
        ...s,
        pinnedMemoryIds: (s.pinnedMemoryIds || []).filter(mid => mid !== id)
      }));
      spacesRef.current = nextSpaces;
      idbSet('playground_spaces', nextSpaces);
      try {
        localStorage.setItem('playground_spaces', JSON.stringify(nextSpaces));
      } catch (e) {}
      return nextSpaces;
    });
  };

  const handleToggleMemoryPin = (id: string) => {
    const currentList = memoriesRef.current || memories;
    const target = currentList.find(m => m.id === id);
    if (!target) return;
    const isCurrentlyOn = target.pinned && target.isActive !== false;
    const nextState = !isCurrentlyOn;

    const nextMemories = currentList.map(m =>
      m.id === id ? { ...m, pinned: nextState, isActive: nextState } : m
    );
    memoriesRef.current = nextMemories;
    setMemories(nextMemories);
    idbSet('playground_memories', nextMemories);
    try {
      localStorage.setItem('playground_memories', JSON.stringify(nextMemories));
    } catch (e) {}

    // Synchronize spaces pinnedMemoryIds so unpinned memories are never considered pinned by spaces
    setSpaces(prev => {
      const nextSpaces = prev.map(s => {
        const currentPinned = s.pinnedMemoryIds || [];
        const nextPinned = nextState
          ? (currentPinned.includes(id) ? currentPinned : [...currentPinned, id])
          : currentPinned.filter(mid => mid !== id);
        return {
          ...s,
          pinnedMemoryIds: nextPinned
        };
      });
      spacesRef.current = nextSpaces;
      idbSet('playground_spaces', nextSpaces);
      try {
        localStorage.setItem('playground_spaces', JSON.stringify(nextSpaces));
      } catch (e) {}
      return nextSpaces;
    });
  };

  const handleTurnAllMemoriesOff = () => {
    const currentList = memoriesRef.current || memories;
    const nextMemories = currentList.map(m => ({ ...m, pinned: false, isActive: false }));
    memoriesRef.current = nextMemories;
    setMemories(nextMemories);
    idbSet('playground_memories', nextMemories);
    try {
      localStorage.setItem('playground_memories', JSON.stringify(nextMemories));
    } catch (e) {}

    setSpaces(prev => {
      const nextSpaces = prev.map(s => ({
        ...s,
        pinnedMemoryIds: []
      }));
      spacesRef.current = nextSpaces;
      idbSet('playground_spaces', nextSpaces);
      try {
        localStorage.setItem('playground_spaces', JSON.stringify(nextSpaces));
      } catch (e) {}
      return nextSpaces;
    });
  };

  const handleTurnAllMemoriesOn = () => {
    const currentList = memoriesRef.current || memories;
    const allIds = currentList.map(m => m.id);
    const nextMemories = currentList.map(m => ({ ...m, pinned: true, isActive: true }));
    memoriesRef.current = nextMemories;
    setMemories(nextMemories);
    idbSet('playground_memories', nextMemories);
    try {
      localStorage.setItem('playground_memories', JSON.stringify(nextMemories));
    } catch (e) {}

    setSpaces(prev => {
      const nextSpaces = prev.map(s => ({
        ...s,
        pinnedMemoryIds: allIds
      }));
      spacesRef.current = nextSpaces;
      idbSet('playground_spaces', nextSpaces);
      try {
        localStorage.setItem('playground_spaces', JSON.stringify(nextSpaces));
      } catch (e) {}
      return nextSpaces;
    });
  };

  const handleUpdateMemory = (id: string, updatedFields: Partial<Memory>) => {
    const nextMemories = (memoriesRef.current || memories).map(m => {
      if (m.id === id) {
        let finalContent = updatedFields.content !== undefined ? updatedFields.content : m.content;
        let finalImages = updatedFields.images !== undefined ? updatedFields.images : (m.images || []);

        if (updatedFields.content !== undefined) {
          const { cleanedText, extractedImages } = extractAndConvertBase64Images(updatedFields.content);
          finalContent = cleanedText;
          finalImages = [...finalImages, ...extractedImages];
        }

        return {
          ...m,
          ...updatedFields,
          content: finalContent,
          images: finalImages
        };
      }
      return m;
    });
    memoriesRef.current = nextMemories;
    setMemories(nextMemories);
    idbSet('playground_memories', nextMemories);
    try {
      localStorage.setItem('playground_memories', JSON.stringify(nextMemories));
    } catch (e) {}

    if (updatedFields.pinned !== undefined || updatedFields.isActive !== undefined) {
      const isPinned = updatedFields.pinned ?? (updatedFields.isActive !== false);
      setSpaces(prev => {
        const nextSpaces = prev.map(s => {
          const currentPinned = s.pinnedMemoryIds || [];
          const nextPinned = isPinned
            ? (currentPinned.includes(id) ? currentPinned : [...currentPinned, id])
            : currentPinned.filter(mid => mid !== id);
          return { ...s, pinnedMemoryIds: nextPinned };
        });
        spacesRef.current = nextSpaces;
        idbSet('playground_spaces', nextSpaces);
        try {
          localStorage.setItem('playground_spaces', JSON.stringify(nextSpaces));
        } catch (e) {}
        return nextSpaces;
      });
    }
  };

  // Update client token and keys
  const handleUpdateClientToken = (token: string) => {
    localStorage.setItem('playground_client_token', token);
    setApiConfig(prev => ({ ...prev, clientToken: token }));
  };

  const handleUpdateTinkerKey = (key: string) => {
    localStorage.setItem('playground_tinker_key', key);
    setApiConfig(prev => ({ ...prev, tinkerKey: key }));
  };

  const handleUpdateOpenRouterKey = (key: string) => {
    localStorage.setItem('playground_openrouter_key', key);
    setApiConfig(prev => ({ ...prev, openRouterKey: key }));
  };

  const handleUpdateUserName = (name: string) => {
    localStorage.setItem('playground_user_name', name);
    setApiConfig(prev => ({ ...prev, userName: name }));
  };

  // Save customized core system persona prompt text to presets list
  const handleSavePersonaPreset = (name: string, promptText: string) => {
    const presetId = `preset-${Date.now()}`;
    const newPreset: PersonaPreset = {
      id: presetId,
      name,
      description: "User defined custom cognitive system preset.",
      prompt: promptText,
      defaultMode: "Custom"
    };
    
    setPersonaPresets(prev => {
      // If a preset with the exact same name already exists, update its prompt; otherwise append a new one.
      const exists = prev.find(p => p.name.toLowerCase() === name.toLowerCase());
      if (exists) {
        return prev.map(p => p.id === exists.id ? { ...p, prompt: promptText } : p);
      }
      return [...prev, newPreset];
    });

    // Automatically assign this newly created/selected preset name to our active Space
    setSpaces(prev => prev.map(s => s.id === activeSpaceId ? {
      ...s,
      systemPromptPresetId: presetId,
      systemPromptCustom: promptText
    } : s));
  };

  // --- 6. IMAGE/FILE DROP ENGINES ---
  const handleImageUploadTrigger = () => {
    fileInputRef.current?.click();
  };

  const compressBase64Image = (base64Url: string, maxDim = 1280, quality = 0.8): Promise<string> => {
    return new Promise((resolve) => {
      if (!base64Url || !base64Url.startsWith('data:image/') || base64Url.length < 50000) {
        resolve(base64Url);
        return;
      }
      const img = new globalThis.Image();
      img.onload = () => {
        let width = img.width;
        let height = img.height;
        if (width > maxDim || height > maxDim) {
          if (width > height) {
            height = Math.round((height * maxDim) / width);
            width = maxDim;
          } else {
            width = Math.round((width * maxDim) / height);
            height = maxDim;
          }
        }
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.drawImage(img, 0, 0, width, height);
          resolve(canvas.toDataURL('image/jpeg', quality));
        } else {
          resolve(base64Url);
        }
      };
      img.onerror = () => {
        resolve(base64Url);
      };
      img.src = base64Url;
    });
  };

  const preparePayloadWithCompressedImages = async (payload: any[]): Promise<any[]> => {
    const result: any[] = [];
    for (const msg of payload) {
      if (Array.isArray(msg.content)) {
        const newContent = await Promise.all(msg.content.map(async (c: any) => {
          if (c && c.type === 'image_url' && c.image_url && typeof c.image_url.url === 'string') {
            const compressedUrl = await compressBase64Image(c.image_url.url, 1280, 0.8);
            return {
              ...c,
              image_url: {
                ...c.image_url,
                url: compressedUrl
              }
            };
          }
          return c;
        }));
        result.push({ ...msg, content: newContent });
      } else {
        result.push(msg);
      }
    }
    return result;
  };

  const handlePasteEditImage = useCallback((e: React.ClipboardEvent<HTMLTextAreaElement>) => {
    const items = e.clipboardData?.items;
    if (!items) return;

    let hasImage = false;
    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      if (item.type.startsWith('image/')) {
        hasImage = true;
        const file = item.getAsFile();
        if (file) {
          const reader = new FileReader();
          reader.onload = (evt) => {
            if (evt.target?.result) {
              const base64Url = evt.target.result as string;
              setEditingMessageImages(prev => [...prev, base64Url]);
            }
          };
          reader.readAsDataURL(file);
        }
      }
    }

    if (hasImage) {
      e.preventDefault();
    }
  }, []);

  // --- 7. OFFLINE BACKUP (JSON INGESTION/DUMP) ---
  const handleBackup = () => {
    const backupData = {
      _meta: {
        app: 'Custom Playground',
        type: 'playground_backup',
        version: '1.0',
        exportedAt: new Date().toISOString(),
      },
      spaces,
      activeSpaceId,
      memories,
      personaPresets,
      receipts,
      apiConfig,
      clientToken: apiConfig.clientToken,
    };
    const blob = new Blob([JSON.stringify(backupData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `playground-backup-${new Date().toISOString().split('T')[0]}.json`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const handleRestore = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (evt) => {
      try {
        const json = JSON.parse(evt.target?.result as string);
        if (json.spaces || json.memories || json.personaPresets) {
          handleRestorePlayground(json);
          setErrorMessage(null);
        } else {
          setErrorMessage("Malformed database: Backup JSON must contain valid playground data (spaces, memories, or presets).");
        }
      } catch (err: any) {
        setErrorMessage("File format error: " + err.message);
      }
    };
    reader.readAsText(file);
  };

  const handleResetData = async () => {
    Object.keys(localStorage).forEach(key => {
      if (key.startsWith('playground_')) {
        localStorage.removeItem(key);
      }
    });
    await idbDel('playground_spaces');
    await idbDel('playground_memories');
    await idbDel('playground_receipts');
    await idbDel('playground_active_space_id');
    window.location.reload();
  };

  const handleSaveEditedMessage = useCallback((messageId: string, andRegenerate: boolean = false) => {
    const textToSave = editingMessageTextRef.current;
    const imagesToSave = [...editingMessageImagesRef.current];
    const audiosToSave = [...editingMessageAudiosRef.current];
    const audioResponseToSave = editingMessageAudioResponseRef.current ? { ...editingMessageAudioResponseRef.current } : undefined;
    if (!textToSave.trim() && imagesToSave.length === 0 && audiosToSave.length === 0 && !audioResponseToSave) return;

    const currentActiveSpaceId = activeSpaceIdRef.current;
    const currentSpaces = spacesRef.current;
    const activeSpace = currentSpaces.find(s => s.id === currentActiveSpaceId);
    if (!activeSpace) return;
    const targetThreadId = activeSpace.threads.some(t => t.id === activeSpace.activeThreadId) ? activeSpace.activeThreadId : activeSpace.threads[0]?.id;
    const activeThread = activeSpace.threads.find(t => t.id === targetThreadId);
    if (!activeThread) return;

    const msgIndex = activeThread.messages.findIndex(m => m.id === messageId);
    if (msgIndex === -1) return;
    const currentMsg = activeThread.messages[msgIndex];

    if (!andRegenerate) {
      // Direct in-place edit: Do NOT create a parallel branch or truncate subsequent messages
      const updatedPromptStackSnapshot = currentMsg.role === 'user'
        ? compilePromptStack(textToSave, imagesToSave)
        : currentMsg.promptStackSnapshot;

      let updatedVersions = currentMsg.versions;
      if (updatedVersions && updatedVersions.length > 0) {
        const curVerIdx = currentMsg.currentVersionIndex ?? (updatedVersions.length - 1);
        updatedVersions = updatedVersions.map((v, idx) => {
          if (idx === curVerIdx) {
            return {
              ...v,
              content: textToSave,
              images: imagesToSave,
              audios: audiosToSave,
              audioResponse: audioResponseToSave,
              promptStackSnapshot: updatedPromptStackSnapshot,
            };
          }
          return v;
        });
      }

      const updatedMessage: Message = {
        ...currentMsg,
        content: textToSave,
        images: imagesToSave,
        audios: audiosToSave,
        audioResponse: audioResponseToSave,
        promptStackSnapshot: updatedPromptStackSnapshot,
        versions: updatedVersions,
      };

      const nextSpaces = currentSpaces.map(s => {
        if (s.id === currentActiveSpaceId) {
          return {
            ...s,
            threads: s.threads.map(t => {
              if (t.id === targetThreadId) {
                return {
                  ...t,
                  messages: t.messages.map(m => m.id === messageId ? updatedMessage : m)
                };
              }
              return t;
            })
          };
        }
        return s;
      });

      spacesRef.current = nextSpaces;
      setSpaces(nextSpaces);
      idbSet('playground_spaces', nextSpaces);

      setEditingMessageId(null);
      setEditingMessageText('');
      setEditingMessageImages([]);
      setEditingMessageAudios([]);
      setEditingMessageAudioResponse(undefined);
      return;
    }

    // Save and Re-run: Creates a new parallel conversation branch
    // 1. Prepare base versions array
    let existingVersions: MessageVersion[] = currentMsg.versions && currentMsg.versions.length > 0
      ? currentMsg.versions.map(v => ({ ...v, images: v.images ? [...v.images] : [], audios: v.audios ? [...v.audios] : [], subsequentMessages: v.subsequentMessages ? [...v.subsequentMessages] : [] }))
      : [{
          id: `ver-${currentMsg.id}-1`,
          content: currentMsg.content,
          timestamp: currentMsg.timestamp,
          images: currentMsg.images ? [...currentMsg.images] : [],
          audios: currentMsg.audios ? [...currentMsg.audios] : [],
          audioResponse: currentMsg.audioResponse,
          modelUsed: currentMsg.modelUsed,
          tokensUsed: currentMsg.tokensUsed,
          latencyMs: currentMsg.latencyMs,
          promptStackSnapshot: currentMsg.promptStackSnapshot,
          isThought: currentMsg.isThought,
          subsequentMessages: activeThread.messages.slice(msgIndex + 1)
        }];

    // Update current active version with current subsequent messages from the live thread
    const activeVerIdx = currentMsg.currentVersionIndex ?? (existingVersions.length - 1);
    if (existingVersions[activeVerIdx]) {
      existingVersions[activeVerIdx] = {
        ...existingVersions[activeVerIdx],
        subsequentMessages: activeThread.messages.slice(msgIndex + 1)
      };
    }

    // 2. Compile snapshot for new version
    const newPromptStackSnapshot = currentMsg.role === 'user'
      ? compilePromptStack(textToSave, imagesToSave)
      : currentMsg.promptStackSnapshot;

    // 3. Create new branch version
    const newVersion: MessageVersion = {
      id: `ver-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`,
      content: textToSave,
      timestamp: new Date().toISOString(),
      images: imagesToSave,
      audios: audiosToSave,
      audioResponse: audioResponseToSave,
      modelUsed: currentMsg.modelUsed,
      promptStackSnapshot: newPromptStackSnapshot,
      isThought: currentMsg.isThought,
      subsequentMessages: [] // new branch starts fresh
    };

    const updatedVersions = [...existingVersions, newVersion];
    const newVersionIndex = updatedVersions.length - 1;

    const updatedMessage: Message = {
      ...currentMsg,
      content: textToSave,
      images: imagesToSave,
      audios: audiosToSave,
      audioResponse: audioResponseToSave,
      promptStackSnapshot: newPromptStackSnapshot,
      versions: updatedVersions,
      currentVersionIndex: newVersionIndex,
    };

    const nextMessages = [
      ...activeThread.messages.slice(0, msgIndex),
      updatedMessage
    ];

    const nextSpaces = currentSpaces.map(s => {
      if (s.id === currentActiveSpaceId) {
        return {
          ...s,
          threads: s.threads.map(t => {
            if (t.id === targetThreadId) {
              return {
                ...t,
                messages: nextMessages
              };
            }
            return t;
          })
        };
      }
      return s;
    });

    spacesRef.current = nextSpaces;
    setSpaces(nextSpaces);
    idbSet('playground_spaces', nextSpaces);

    setEditingMessageId(null);
    setEditingMessageText('');
    setEditingMessageImages([]);
    setEditingMessageAudios([]);
    setEditingMessageAudioResponse(undefined);

    setTimeout(() => {
      handleRegenerate(messageId);
    }, 50);
  }, [compilePromptStack]);

  const handleSwitchMessageBranch = useCallback((messageId: string, direction: 'prev' | 'next' | number) => {
    if (isStreaming) return;

    const currentActiveSpaceId = activeSpaceIdRef.current;
    const currentSpaces = spacesRef.current;
    const activeSpace = currentSpaces.find(s => s.id === currentActiveSpaceId);
    if (!activeSpace) return;
    const targetThreadId = activeSpace.threads.some(t => t.id === activeSpace.activeThreadId) ? activeSpace.activeThreadId : activeSpace.threads[0]?.id;
    const activeThread = activeSpace.threads.find(t => t.id === targetThreadId);
    if (!activeThread) return;

    const msgIndex = activeThread.messages.findIndex(m => m.id === messageId);
    if (msgIndex === -1) return;
    const currentMsg = activeThread.messages[msgIndex];

    if (!currentMsg.versions || currentMsg.versions.length <= 1) return;

    const currentVerIdx = currentMsg.currentVersionIndex ?? (currentMsg.versions.length - 1);
    let targetVerIdx: number;

    if (typeof direction === 'number') {
      targetVerIdx = direction;
    } else if (direction === 'prev') {
      targetVerIdx = currentVerIdx - 1;
    } else {
      targetVerIdx = currentVerIdx + 1;
    }

    if (targetVerIdx < 0 || targetVerIdx >= currentMsg.versions.length || targetVerIdx === currentVerIdx) {
      return;
    }

    // 1. Capture current branch's subsequent messages before switching
    const updatedVersions = currentMsg.versions.map((v, idx) => {
      if (idx === currentVerIdx) {
        return {
          ...v,
          subsequentMessages: activeThread.messages.slice(msgIndex + 1)
        };
      }
      return v;
    });

    // 2. Select target branch version
    const targetVersion = updatedVersions[targetVerIdx];

    // 3. Construct updated message reflecting target version
    const updatedMessage: Message = {
      ...currentMsg,
      content: targetVersion.content,
      images: targetVersion.images ? [...targetVersion.images] : [],
      audios: targetVersion.audios ? [...targetVersion.audios] : [],
      timestamp: targetVersion.timestamp,
      modelUsed: targetVersion.modelUsed,
      tokensUsed: targetVersion.tokensUsed,
      latencyMs: targetVersion.latencyMs,
      promptStackSnapshot: targetVersion.promptStackSnapshot,
      isThought: targetVersion.isThought,
      versions: updatedVersions,
      currentVersionIndex: targetVerIdx,
    };

    // 4. Update the entire conversation to the other branch
    const nextMessages = [
      ...activeThread.messages.slice(0, msgIndex),
      updatedMessage,
      ...(targetVersion.subsequentMessages || [])
    ];

    const nextSpaces = currentSpaces.map(s => {
      if (s.id === currentActiveSpaceId) {
        return {
          ...s,
          threads: s.threads.map(t => {
            if (t.id === targetThreadId) {
              return {
                ...t,
                messages: nextMessages
              };
            }
            return t;
          })
        };
      }
      return s;
    });

    spacesRef.current = nextSpaces;
    setSpaces(nextSpaces);
    idbSet('playground_spaces', nextSpaces);
  }, [isStreaming]);

  const handleDeleteMessage = useCallback((messageId: string) => {
    const currentActiveSpaceId = activeSpaceIdRef.current;
    setSpaces(prev => {
      const nextSpaces = prev.map(s => {
        if (s.id === currentActiveSpaceId) {
          const targetThreadId = s.threads.some(t => t.id === s.activeThreadId) ? s.activeThreadId : s.threads[0]?.id;
          return {
            ...s,
            threads: s.threads.map(t => {
              if (t.id === targetThreadId) {
                return {
                  ...t,
                  messages: t.messages.filter(m => m.id !== messageId)
                };
              }
              return t;
            })
          };
        }
        return s;
      });
      spacesRef.current = nextSpaces;
      return nextSpaces;
    });
    if (editingMessageId === messageId) {
      setEditingMessageId(null);
      setEditingMessageText('');
      setEditingMessageImages([]);
    }
  }, [editingMessageId]);

  const handleRegenerate = async (messageId: string) => {
    if (isStreaming) return;
    setErrorMessage(null);

    const currentSpaces = spacesRef.current;
    const currentActiveSpaceId = activeSpaceIdRef.current;
    const currentMemories = memoriesRef.current;
    const currentApiConfig = apiConfigRef.current;

    const activeSpace = currentSpaces.find(s => s.id === currentActiveSpaceId);
    if (!activeSpace) return;

    const activeThread = activeSpace.threads.find(t => t.id === activeSpace.activeThreadId) || activeSpace.threads[0];
    if (!activeThread) return;

    const msgIndex = activeThread.messages.findIndex(m => m.id === messageId);
    if (msgIndex === -1) return;

    const targetMsg = activeThread.messages[msgIndex];
    let precedingUserMsgIndex = -1;

    if (targetMsg.role === 'user') {
      precedingUserMsgIndex = msgIndex;
    } else {
      // Find the immediately preceding user message
      for (let i = msgIndex - 1; i >= 0; i--) {
        if (activeThread.messages[i].role === 'user') {
          precedingUserMsgIndex = i;
          break;
        }
      }
    }

    if (precedingUserMsgIndex === -1) {
      setErrorMessage("No user prompt found to retry.");
      return;
    }

    const precedingUserMsg = activeThread.messages[precedingUserMsgIndex];
    const hasSubsequentMsgs = activeThread.messages.slice(precedingUserMsgIndex + 1).length > 0;

    setIsStreaming(true);
    const startTime = performance.now();

    // Re-compile prompt stack snapshot using current workspace settings and the user's latest edited content
    const promptStackSnapshot = compilePromptStack(precedingUserMsg.content, precedingUserMsg.images || []);

    let updatedPrecedingUserMsg: Message = {
      ...precedingUserMsg,
      promptStackSnapshot
    };

    // If re-running from a prompt that already had generated responses in this branch (and wasn't just branched by handleSaveEditedMessage), create a branch version so previous output is never lost
    if (hasSubsequentMsgs) {
      let existingVersions: MessageVersion[] = precedingUserMsg.versions && precedingUserMsg.versions.length > 0
        ? precedingUserMsg.versions.map(v => ({ ...v, images: v.images ? [...v.images] : [], subsequentMessages: v.subsequentMessages ? [...v.subsequentMessages] : [] }))
        : [{
            id: `ver-${precedingUserMsg.id}-1`,
            content: precedingUserMsg.content,
            timestamp: precedingUserMsg.timestamp,
            images: precedingUserMsg.images ? [...precedingUserMsg.images] : [],
            audios: precedingUserMsg.audios ? [...precedingUserMsg.audios] : [],
            modelUsed: precedingUserMsg.modelUsed,
            tokensUsed: precedingUserMsg.tokensUsed,
            latencyMs: precedingUserMsg.latencyMs,
            promptStackSnapshot: precedingUserMsg.promptStackSnapshot,
            isThought: precedingUserMsg.isThought,
            subsequentMessages: activeThread.messages.slice(precedingUserMsgIndex + 1)
          }];

      const currentVerIdx = precedingUserMsg.currentVersionIndex ?? (existingVersions.length - 1);
      if (existingVersions[currentVerIdx]) {
        existingVersions[currentVerIdx] = {
          ...existingVersions[currentVerIdx],
          subsequentMessages: activeThread.messages.slice(precedingUserMsgIndex + 1)
        };
      }

      const newVersion: MessageVersion = {
        id: `ver-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`,
        content: precedingUserMsg.content,
        timestamp: new Date().toISOString(),
        images: precedingUserMsg.images ? [...precedingUserMsg.images] : [],
        audios: precedingUserMsg.audios ? [...precedingUserMsg.audios] : [],
        modelUsed: precedingUserMsg.modelUsed,
        promptStackSnapshot,
        isThought: precedingUserMsg.isThought,
        subsequentMessages: []
      };

      const updatedVersions = [...existingVersions, newVersion];
      const newVersionIndex = updatedVersions.length - 1;

      updatedPrecedingUserMsg = {
        ...updatedPrecedingUserMsg,
        versions: updatedVersions,
        currentVersionIndex: newVersionIndex
      };
    }

    // Clean up/truncate thread: keep messages up to the preceding user message (inclusive)
    const truncatedMessages = [
      ...activeThread.messages.slice(0, precedingUserMsgIndex),
      updatedPrecedingUserMsg
    ];

    // Gather active memories images to add to visual prompt context
    const pinned = activeSpace?.pinnedMemoryIds || [];
    const matchedMemories = currentMemories.filter(m => isMemoryActiveAndEnabled(m, pinned));

    const memoryImages: string[] = [];
    matchedMemories.forEach(m => {
      if (m.images && m.images.length > 0) {
        memoryImages.push(...m.images);
      }
    });

    // Formulate messagesPayload Prior to Execution
    const messagesPayload: any[] = [];

    // System prompt section from the newly compiled promptStackSnapshot
    const sysPromptLayer = promptStackSnapshot.find(l => l.type === 'system');
    if (sysPromptLayer && sysPromptLayer.active && sysPromptLayer.content.trim()) {
      messagesPayload.push({
        role: 'system',
        content: sysPromptLayer.content.trim(),
      });
    }

    // Embed space parameters/notes scratchpad
    const spaceNotesLayer = promptStackSnapshot.find(l => l.type === 'space');
    if (spaceNotesLayer && spaceNotesLayer.active && spaceNotesLayer.content.trim()) {
      messagesPayload.push({
        role: 'system',
        content: `[Active Space Reference Sheet - "${activeSpace.name}"]: \n${spaceNotesLayer.content.trim()}`
      });
    }

    // Inject system memory as the first message of the conversation layer
    const isMemoryActive = !disabledLayerTypes.includes("memory");
    const activeMemories = isMemoryActive ? currentMemories.filter(m => isMemoryActiveAndEnabled(m, pinned)) : [];
    const memoriesList = activeMemories.map(m => `- ${m.title}: ${m.content}`).join('\n');
    const currentDateTime = new Date().toLocaleString();
    const systemMemoryContent = `<system_memory>
    The current date and time is ${currentDateTime}.
    The user provided the additional info about how they would like you to respond:

    \`\`\`
    Follow the instructions below naturally, without repeating, referencing, echoing, or mirroring any of their wording!
    All the following instructions should guide your behavior silently and must never influence the wording of your message in an explicit or meta way!

    """${memoriesList || 'No stored memories yet.'}"""
    \`\`\`
    </system_memory>`;

    messagesPayload.push({
      role: 'user',
      content: systemMemoryContent
    });

    // Check if the history layer starts with an assistant message.
    // If it doesn't (or if there is no history layer), insert an assistant acknowledgment.
    const historyLayer = promptStackSnapshot.find(l => l.type === 'history');
    const { summaryMessage, historyMessages } = getFilteredHistoryForPayload(activeThread, activeSpace, precedingUserMsgIndex);
    const firstChatLogRole = summaryMessage ? 'system' : historyMessages[0]?.role;

    if (firstChatLogRole !== 'assistant') {
      messagesPayload.push({
        role: 'assistant',
        content: 'Acknowledged. I have loaded your system memories and will refer to them only when explicitly relevant.'
      });
    }

    // Historical sequences before the preceding user message
    if (!historyLayer || historyLayer.active) {
      if (summaryMessage) {
        messagesPayload.push({
          role: 'system',
          content: summaryMessage.content
        });
      }

      // Audio retention rule:
      // Keep audio tokens in the conversation if it's the only/latest audio available;
      // only remove old audio inputs if new audio inputs come in.
      const hasNewAudioInPreceding = !!(precedingUserMsg.audios && precedingUserMsg.audios.length > 0);
      let latestHistoryAudioMsgIdx = -1;
      for (let i = historyMessages.length - 1; i >= 0; i--) {
        if (historyMessages[i].audios && historyMessages[i].audios!.length > 0) {
          latestHistoryAudioMsgIdx = i;
          break;
        }
      }

      historyMessages.forEach((m, idx) => {
        if (m.isThought) {
          if (!(activeSpace.includeCoTInContext ?? false)) {
            return;
          }
        }

        // Skip any completely empty messages to prevent API model validation failures
        if (!m.content.trim() && (!m.images || m.images.length === 0) && (!m.audios || m.audios.length === 0)) {
          return;
        }

        if (m.isThought) {
          messagesPayload.push({
            role: 'assistant',
            content: `<thought>\n${m.content}\n</thought>`
          });
          return;
        }

        // Keep only the last 4 messages' image attachments, substituting older ones with placeholders
        const isRecentImage = idx >= historyMessages.length - 4;

        // Keep audio tokens if no newer audio input has arrived
        const shouldKeepAudio = !hasNewAudioInPreceding && idx === latestHistoryAudioMsgIdx;

        if ((m.images && m.images.length > 0) || (m.audios && m.audios.length > 0)) {
          const contents: any[] = [];
          contents.push({ type: 'text', text: stripMessagePrefix(m.content) || "[Media Context]" });
          if (m.images) {
            m.images.forEach((img, imgIdx) => {
              if (isRecentImage) {
                contents.push({
                  type: 'image_url',
                  image_url: { url: img }
                });
              } else {
                contents.push({
                  type: 'text',
                  text: `[Past Image Attachment ${imgIdx + 1} Omitted to optimize context payload]`
                });
              }
            });
          }
          if (m.audios) {
            m.audios.forEach((aud, audIdx) => {
              if (shouldKeepAudio) {
                let fmt = (aud.format || 'wav').toLowerCase().trim();
                if (fmt === 'mpeg' || fmt === 'mp4') fmt = 'mp3';
                let rawData = aud.data || '';
                if (rawData.includes(';base64,')) {
                  rawData = rawData.split(';base64,')[1];
                } else if (rawData.startsWith('data:')) {
                  rawData = rawData.replace(/^data:audio\/[a-zA-Z0-9]+;base64,/, '');
                }
                const audioBlock: any = {
                  type: 'input_audio',
                  input_audio: {
                    data: rawData,
                    format: fmt
                  }
                };
                if (fmt === 'mp3' || fmt === 'flac') {
                  if (aud.num_frames !== undefined) audioBlock.input_audio.num_frames = aud.num_frames;
                  if (aud.sample_rate !== undefined) audioBlock.input_audio.sample_rate = aud.sample_rate;
                }
                contents.push(audioBlock);
              } else {
                contents.push({
                  type: 'text',
                  text: `[Past Audio Attachment "${aud.name || `audio-${audIdx + 1}`}" Omitted because newer audio input was provided]`
                });
              }
            });
          }
          messagesPayload.push({
            role: m.role,
            content: contents
          });
        } else {
          messagesPayload.push({
            role: m.role,
            content: stripMessagePrefix(m.content)
          });
        }
      });
    }

    // Inject recalled image memories context BEFORE precedingUserMsg
    if (memoryImages.length > 0) {
      const recalledUserMsgContent: any[] = [
        {
          type: "text",
          text: `[RECALLED IMAGE MEMORY -- BACKGROUND CONTEXT ONLY]\nThe attached image is a persistent memory from a prior conversation. Treat it as background context. Do not interpret it as a new upload, do not assume the current user is asking about it, and do not let it replace or merge with the current request.`
        }
      ];
      memoryImages.forEach(imgUrl => {
        recalledUserMsgContent.push({
          type: "image_url",
          image_url: {
            url: imgUrl,
            details: "high"
          }
        });
      });
      messagesPayload.push({
        role: "user",
        content: recalledUserMsgContent
      });
      messagesPayload.push({
        role: "assistant",
        content: "[Recalled visual memory received as background context.]"
      });
    }

    const userImagesOnly = precedingUserMsg.images || [];
    const userAudiosOnly = precedingUserMsg.audios || [];

    // Finally append the user message itself
    if (userImagesOnly.length > 0 || userAudiosOnly.length > 0) {
      const complexContent: any[] = [];
      if (precedingUserMsg.content.trim()) {
        complexContent.push({ type: 'text', text: precedingUserMsg.content });
      } else if (userImagesOnly.length > 0) {
        complexContent.push({ type: 'text', text: "An image was provided:" });
      } else if (userAudiosOnly.length > 0) {
        complexContent.push({ type: 'text', text: "Listen and respond to this audio." });
      }
      userImagesOnly.forEach(imgUrl => {
        complexContent.push({
          type: 'image_url',
          image_url: { url: imgUrl, details: 'high' }
        });
      });
      userAudiosOnly.forEach(aud => {
        let fmt = (aud.format || 'wav').toLowerCase().trim();
        if (fmt === 'mpeg' || fmt === 'mp4') fmt = 'mp3';
        let rawData = aud.data || '';
        if (rawData.includes(';base64,')) {
          rawData = rawData.split(';base64,')[1];
        } else if (rawData.startsWith('data:')) {
          rawData = rawData.replace(/^data:audio\/[a-zA-Z0-9]+;base64,/, '');
        }
        complexContent.push({
          type: 'input_audio',
          input_audio: {
            data: rawData,
            format: fmt
          }
        });
      });
      messagesPayload.push({
        role: 'user',
        content: complexContent
      });
    } else {
      messagesPayload.push({
        role: 'user',
        content: precedingUserMsg.content
      });
    }

    // Instantiate temporary streaming block inside chat context
    const streamAssistantMsgId = `msg-assistant-${Date.now()}`;
    const initialAssistantMsg: Message = {
      id: streamAssistantMsgId,
      role: 'assistant',
      content: '',
      timestamp: new Date().toISOString(),
      modelUsed: activeSpace.model,
      promptStackSnapshot,
    };

    // Put placeholder in thread
    setSpaces(prev => {
      const next = prev.map(s => {
        if (s.id === currentActiveSpaceId) {
          const targetThreadId = s.threads.some(t => t.id === s.activeThreadId) ? s.activeThreadId : s.threads[0]?.id;
          return {
            ...s,
            threads: s.threads.map(t => {
              if (t.id === targetThreadId) {
                return {
                  ...t,
                  messages: [...truncatedMessages, initialAssistantMsg],
                };
              }
              return t;
            })
          };
        }
        return s;
      });
      spacesRef.current = next;
      return next;
    });

    let streamBuffer = '';
    let reasoningBuffer = '';
    let audioDataBuffer = '';
    let audioTranscriptBuffer = '';
    const thoughtMsgId = `msg-thought-${streamAssistantMsgId}`;

    try {
      const compressedPayload = await preparePayloadWithCompressedImages(messagesPayload);

      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-openai-token': currentApiConfig.clientToken || '',
          'x-tinker-api-key': currentApiConfig.tinkerKey || '',
          'x-openrouter-api-key': currentApiConfig.openRouterKey || '',
        },
        body: JSON.stringify({
          messages: compressedPayload,
          model: activeSpace.model,
          temperature: activeSpace.temperature,
          top_p: activeSpace.top_p,
          top_k: -1,
          max_completion_tokens: activeSpace.max_tokens,
          presence_penalty: activeSpace.presence_penalty ?? 0.0,
          frequency_penalty: activeSpace.frequency_penalty !== undefined ? activeSpace.frequency_penalty : 0.0,
          service_tier: activeSpace.service_tier ?? "auto",
          moderation: null,
          stream: !activeSpace.enableAudioOutput,
          modalities: activeSpace.enableAudioOutput ? ["text", "audio"] : ["text"],
          ...(activeSpace.enableAudioOutput ? {
            audio: {
              voice: activeSpace.openaiVoice || "verse",
              format: "wav"
            }
          } : {}),
          tinker_api_key: currentApiConfig.tinkerKey || '',
          openrouter_api_key: currentApiConfig.openRouterKey || '',
          ...(shouldApplyReasoningLogic(activeSpace.model) ? {
            reasoning_effort: activeSpace.tinkerReasoningEffort ?? "high",
            config: {
              reasoning_effort: activeSpace.tinkerReasoningEffort ?? "high"
            },
            ...(isInklingModel(activeSpace.model) ? {
              tools: {
                web_search: activeSpace.tinkerWebSearch ?? false
              },
              extra_body: {separate_reasoning: false},
            } : {})
          } : {})
        }),
      });

      if (!response.ok) {
        let errMessage = `API request failed with status ${response.status}`;
        const contentType = response.headers.get('content-type') || '';
        if (contentType.includes('application/json')) {
          try {
            const errJson = await response.json();
            errMessage = errJson.error || errJson.detail || errMessage;
          } catch (e) {}
        } else {
          const errText = await response.text();
          if (errText.includes('<html')) {
            if (response.status === 413) {
              errMessage = "Payload too large. The audio file or attachments are too big for the server to process.";
            } else {
              errMessage = `Server error ${response.status} (HTML response). Payload might be too large or the upstream proxy crashed.`;
            }
          } else {
            errMessage = errText;
          }
        }
        throw new Error(errMessage);
      }

      let calculatedTotalTokens = 0;
      const contentType = response.headers.get('content-type') || '';
      if (contentType.includes('application/json')) {
        const json = await response.json();
        if (json.error) {
          throw new Error(typeof json.error === 'object' ? (json.error.message || JSON.stringify(json.error)) : json.error);
        }
        const textContent = json.choices?.[0]?.message?.content || json.choices?.[0]?.delta?.content || (typeof json === 'string' ? json : '');
        const reasoningContent = json.choices?.[0]?.message?.reasoning_content || json.choices?.[0]?.delta?.reasoning_content || json.reasoning_content || '';
        if (textContent) streamBuffer = textContent;
        if (reasoningContent) reasoningBuffer = reasoningContent;
        if (json.usage?.total_tokens) calculatedTotalTokens = json.usage.total_tokens;

        const messageAudio = json.choices?.[0]?.message?.audio;
        if (messageAudio) {
          if (messageAudio.data) audioDataBuffer = messageAudio.data;
          if (messageAudio.transcript) {
            audioTranscriptBuffer = messageAudio.transcript;
            if (!streamBuffer) {
              streamBuffer = messageAudio.transcript;
            }
          }
        }
      } else {
        const reader = response.body?.getReader();
        if (!reader) throw new Error("Readable streams are unsupported in this web container.");

        const decoder = new TextDecoder();
        let streamFinished = false;
        let bufferText = '';
        let lastRenderTime = 0;
        let pendingRenderTimeout: any = null;

        const syncStreamToState = (force: boolean = false) => {
          const now = performance.now();
          if (!force && now - lastRenderTime < (isMobileScreen ? 120 : 50)) {
            if (!pendingRenderTimeout) {
              pendingRenderTimeout = setTimeout(() => {
                pendingRenderTimeout = null;
                syncStreamToState(true);
              }, isMobileScreen ? 120 : 50);
            }
            return;
          }
          if (pendingRenderTimeout) {
            clearTimeout(pendingRenderTimeout);
            pendingRenderTimeout = null;
          }
          lastRenderTime = now;

          const parsed = parseStreamingOutput(streamBuffer, reasoningBuffer, currentApiConfig.userName);
          const currentCleaned = replaceBioCommands(parsed.response);

          setSpaces(prev => {
            const next = prev.map(s => {
              if (s.id === currentActiveSpaceId) {
                const targetThreadId = s.threads.some(t => t.id === s.activeThreadId)
                  ? s.activeThreadId
                  : s.threads[0]?.id;

                return {
                  ...s,
                  threads: s.threads.map(t => {
                    if (t.id === targetThreadId) {
                      const existsThought = t.messages.some(m => m.id === thoughtMsgId);
                      let updatedMessages = t.messages;

                      if (parsed.thinking) {
                        if (!existsThought) {
                          const assistantIndex = updatedMessages.findIndex(m => m.id === streamAssistantMsgId);

                          if (assistantIndex !== -1) {
                            const newThoughtMsg: Message = {
                              id: thoughtMsgId,
                              role: 'assistant',
                              content: parsed.thinking,
                              timestamp: new Date().toISOString(),
                              isThought: true,
                              modelUsed: activeSpace.model,
                            };

                            updatedMessages = [
                              ...updatedMessages.slice(0, assistantIndex),
                              newThoughtMsg,
                              ...updatedMessages.slice(assistantIndex),
                            ];
                          }
                        } else {
                          updatedMessages = updatedMessages.map(m =>
                            m.id === thoughtMsgId ? { ...m, content: parsed.thinking } : m
                          );
                        }
                      }

                      updatedMessages = updatedMessages.map(m =>
                        m.id === streamAssistantMsgId
                          ? { ...m, content: currentCleaned }
                          : m
                      );

                      return {
                        ...t,
                        messages: updatedMessages,
                      };
                    }

                    return t;
                  }),
                };
              }

              return s;
            });
            spacesRef.current = next;
            return next;
          });
        };

        while (!streamFinished) {
          const { value, done } = await reader.read();
          if (done) break;

          bufferText += decoder.decode(value, { stream: true });
          const lines = bufferText.split('\n');
          bufferText = lines.pop() || '';

          for (const line of lines) {
            const rawLine = line.trim();
            if (rawLine === 'data: [DONE]') {
              streamFinished = true;
              break;
            }

            if (rawLine.startsWith('data: ')) {
              const jsonPart = rawLine.slice(6).trim();
              if (!jsonPart) continue;

              let chunkJson: any = null;
              try {
                chunkJson = JSON.parse(jsonPart);
              } catch (pErr) {
                // ignore incomplete json pieces
              }

              if (chunkJson && chunkJson.error) {
                const errorMsg = typeof chunkJson.error === 'object' ? (chunkJson.error.message || JSON.stringify(chunkJson.error)) : chunkJson.error;
                throw new Error(errorMsg);
              }

              if (chunkJson) {
                const delta = chunkJson.choices?.[0]?.delta;
                const word = delta?.content || '';
                const reasoning = delta?.reasoning_content || (delta as any)?.reasoning || (delta as any)?.thought || '';
                const deltaAudio = delta?.audio;

                if (word) {
                  streamBuffer += word;
                }
                if (reasoning) {
                  reasoningBuffer += reasoning;
                }
                if (deltaAudio) {
                  if (deltaAudio.data) audioDataBuffer += deltaAudio.data;
                  if (deltaAudio.transcript) audioTranscriptBuffer += deltaAudio.transcript;
                }

                if (chunkJson.usage) {
                  calculatedTotalTokens = chunkJson.usage.total_tokens || calculatedTotalTokens;
                }

                syncStreamToState(false);
              }
            }
          }
        }
        if (pendingRenderTimeout) {
          clearTimeout(pendingRenderTimeout);
          pendingRenderTimeout = null;
        }
        syncStreamToState(true);
      }
      if (!streamBuffer.trim() && !reasoningBuffer.trim()) {
        throw new Error("The model returned an empty response. This often happens if the context limit was exceeded, the prompt triggered a safety filter, or the request was too large for the model to process.");
      }

      const endTime = performance.now();
      const latencyMs = Math.round(endTime - startTime);
      const estTokens = calculatedTotalTokens || Math.round((streamBuffer.length + reasoningBuffer.length + precedingUserMsg.content.length) / 3.8);

      const indexTelemetrySlip = {
        model: activeSpace.model,
        timestamp: new Date().toISOString(),
        latencyMs,
        totalTokens: estTokens,
        temperature: activeSpace.temperature,
        top_p: activeSpace.top_p,
        presence_penalty: activeSpace.presence_penalty ?? 0.0,
        frequency_penalty: activeSpace.frequency_penalty !== undefined ? activeSpace.frequency_penalty : 0.0,
        service_tier: activeSpace.service_tier ?? "auto",
        top_k: -1,
        success: true,
      };

      setReceipts(prev => [...prev, indexTelemetrySlip]);

      // Parse and apply auto memories generated by the model
      processAndApplyBioMemories(streamBuffer);

      const finalParsed = parseStreamingOutput(streamBuffer, reasoningBuffer);
      const cleanedBuffer = replaceBioCommands(finalParsed.response);
      const isThinkingLogsEnabled = activeSpace.enableThinkingLogs ?? false;

      setSpaces(prev => {
        const next = prev.map(s => {
          if (s.id === currentActiveSpaceId) {
            const targetThreadId = s.threads.some(t => t.id === s.activeThreadId) ? s.activeThreadId : s.threads[0]?.id;
            return {
              ...s,
              threads: s.threads.map(t => {
                if (t.id === targetThreadId) {
                  let updatedMsgs = t.messages.map(m => {
                    if (m.id === streamAssistantMsgId) {
                      return {
                        ...m,
                        content: cleanedBuffer,
                        tokensUsed: { total_tokens: estTokens },
                        latencyMs,
                        ...(audioDataBuffer ? {
                          audioResponse: {
                            data: convertPcm16Base64ToWavBase64(audioDataBuffer),
                            format: 'wav',
                            transcript: audioTranscriptBuffer
                          }
                        } : {})
                      };
                    }
                    if (m.id === thoughtMsgId) {
                      return {
                        ...m,
                        content: finalParsed.thinking,
                      };
                    }
                    return m;
                  });

                  // If thinking logs are NOT enabled, delete/filter out the thought message
                  if (!isThinkingLogsEnabled) {
                    updatedMsgs = updatedMsgs.filter(m => m.id !== thoughtMsgId);
                  }

                  return {
                    ...t,
                    messages: updatedMsgs,
                  };
                }
                return t;
              })
            };
          }
          return s;
        });
        spacesRef.current = next;
        return next;
      });

    } catch (err: any) {
      console.error(err);
      setErrorMessage(err.message || "An exception occurred during retry.");
      // Keep the thread clean, remove streaming placeholder
      setSpaces(prev => {
        const next = prev.map(s => {
          if (s.id === currentActiveSpaceId) {
            const targetThreadId = s.threads.some(t => t.id === s.activeThreadId) ? s.activeThreadId : s.threads[0]?.id;
            return {
              ...s,
              threads: s.threads.map(t => {
                if (t.id === targetThreadId) {
                  return {
                    ...t,
                    messages: t.messages.filter(m => m.id !== streamAssistantMsgId),
                  };
                }
                return t;
              })
            };
          }
          return s;
        });
        spacesRef.current = next;
        return next;
      });
    } finally {
      setIsStreaming(false);
    }
  };

  // Callback to intercept the copy event and preserve rich Markdown effects and line breaks
  const handleCopy = (e: React.ClipboardEvent<HTMLDivElement>) => {
    const target = e.target as HTMLElement;
    if (target.tagName === 'TEXTAREA' || target.tagName === 'INPUT') {
      return;
    }

    const selection = window.getSelection();
    if (!selection || selection.isCollapsed || selection.rangeCount === 0) return;

    const data = extractChatSelection(selection, e.currentTarget);
    if (data && (data.text || data.html)) {
      e.preventDefault();
      if (e.clipboardData) {
        e.clipboardData.setData('text/html', data.html);
        e.clipboardData.setData('text/plain', data.text);
      }
    }
  };

  // --- COMPACTIFICATION PIPELINE ---
  const handleDeleteCompactChunk = (chunkId: string) => {
    if (!activeThread) return;
    setSpaces(prev => prev.map(s => {
      if (s.id === activeSpace.id) {
        return {
          ...s,
          threads: s.threads.map(t => {
            if (t.id === activeSpace.activeThreadId) {
              const updatedChunks = (t.compactedChunks || []).filter(c => c.id !== chunkId);
              const lastRemaining = updatedChunks.length > 0 ? updatedChunks[updatedChunks.length - 1].lastMsgId : undefined;
              return {
                ...t,
                compactedChunks: updatedChunks,
                compactedUpToMessageId: lastRemaining
              };
            }
            return t;
          })
        };
      }
      return s;
    }));
  };

  const handleClearAllCompactChunks = () => {
    if (!activeThread) return;
    setSpaces(prev => prev.map(s => {
      if (s.id === activeSpace.id) {
        return {
          ...s,
          threads: s.threads.map(t => {
            if (t.id === activeSpace.activeThreadId) {
              return {
                ...t,
                compactedChunks: [],
                compactedUpToMessageId: undefined
              };
            }
            return t;
          })
        };
      }
      return s;
    }));
  };

  const handleCompactify = async (targetMessageId: string, forceRecompactifyThisPoint: boolean = false) => {
    if (!activeThread) return;
    if (isCompactifying || isStreaming) return;

    const targetMsgIndex = activeThread.messages.findIndex(m => m.id === targetMessageId);
    if (targetMsgIndex === -1) return;

    let existingChunks = activeThread.compactedChunks || [];
    let startIdx = 0;

    if (forceRecompactifyThisPoint) {
      // Remove any chunks that end at or after targetMessageId
      existingChunks = existingChunks.filter(c => {
        const chunkMsgIdx = activeThread.messages.findIndex(m => m.id === c.lastMsgId);
        return chunkMsgIdx !== -1 && chunkMsgIdx < targetMsgIndex;
      });

      if (existingChunks.length > 0) {
        const lastRemainingChunk = existingChunks[existingChunks.length - 1];
        const prevIdx = activeThread.messages.findIndex(m => m.id === lastRemainingChunk.lastMsgId);
        if (prevIdx !== -1) {
          startIdx = prevIdx + 1;
        }
      } else {
        startIdx = 0;
      }
    } else {
      if (existingChunks.length > 0) {
        const lastChunk = existingChunks[existingChunks.length - 1];
        const prevLastIdx = activeThread.messages.findIndex(m => m.id === lastChunk.lastMsgId);
        if (prevLastIdx !== -1) {
          startIdx = prevLastIdx + 1;
        }
      }
      if (startIdx > targetMsgIndex) {
        setErrorMessage("All messages up to this reply have already been compactified.");
        return;
      }
    }

    const uncompactedMessages = activeThread.messages.slice(startIdx, targetMsgIndex + 1);
    if (uncompactedMessages.length === 0) {
      setErrorMessage("No new uncompactified messages found up to this reply.");
      return;
    }

    setIsCompactifying(true);
    setIsCompactifyingMsgId(targetMessageId);
    setErrorMessage(null);

    try {
      // Extract up to 2 subsequent turns immediately following the checkpoint for trajectory bridging
      const subsequentBridgingMessages = activeThread.messages.slice(targetMsgIndex + 1, targetMsgIndex + 3);

      // Chunk uncompacted messages into blocks of ~60,000 tokens
      const chunks = chunkMessagesForSummarization(uncompactedMessages, 60000);
      const chunkSummaries: string[] = [];
      let totalOriginalTokens = 0;

      for (let i = 0; i < chunks.length; i++) {
        if (i > 0) {
          // Wait briefly between sequential compact requests
          await new Promise(r => setTimeout(r, 500));
        }

        const chunk = chunks[i];
        const formattedInputItems = chunk.map(m => {
          const time = m.timestamp ? new Date(m.timestamp).toLocaleTimeString() : '';
          const roleLabel = m.role === 'user'
            ? (apiConfig.userName ? `SPEAKER: ${apiConfig.userName.toUpperCase()}` : 'SPEAKER: USER')
            : m.role === 'assistant'
            ? `SPEAKER: ASSISTANT (Model: ${m.modelUsed || activeSpace.model || 'AI'})`
            : `SPEAKER: ${m.role.toUpperCase()}`;
          return {
            role: m.role === 'user' ? 'user' : 'assistant',
            content: `[${roleLabel}]${time ? ` [Time: ${time}]` : ''}:\n${m.content}`
          };
        });

        const rawChunkText = chunk.map(m => m.content).join("\n\n");
        totalOriginalTokens += estimateTokenCount(rawChunkText);

        // Include subsequent bridging messages on the last chunk so the summarizer anchors to continuing trajectory
        const subsequentPayload = i === chunks.length - 1
          ? subsequentBridgingMessages.map(m => ({
              role: m.role,
              content: m.content,
              modelUsed: m.modelUsed || activeSpace.model,
              timestamp: m.timestamp
            }))
          : [];

        const response = await fetch('/api/responses/compact', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-openai-token': apiConfig.clientToken || '',
            'x-tinker-api-key': apiConfig.tinkerKey || '',
            'x-openrouter-api-key': apiConfig.openRouterKey || '',
          },
          body: JSON.stringify({
            model: activeSpace.model || 'openai/gpt-4o',
            input: formattedInputItems,
            messages: formattedInputItems,
            subsequent_messages: subsequentPayload,
            userName: apiConfig.userName,
            clientToken: apiConfig.clientToken,
            tinkerKey: apiConfig.tinkerKey,
            openRouterKey: apiConfig.openRouterKey,
            openrouter_api_key: apiConfig.openRouterKey,
            tinker_api_key: apiConfig.tinkerKey,
            openai_api_key: apiConfig.clientToken,
            temperature: 0.3
          })
        });

        if (!response.ok) {
          let errMessage = `${response.status}`;
          try {
            const errJson = await response.json();
            errMessage = errJson.error || errJson.message || JSON.stringify(errJson);
          } catch (e) {
            errMessage = await response.text();
          }
          throw new Error(`Compactification request failed (${response.status}): ${errMessage}`);
        }

        const json = await response.json();
        const compactResult = json.output_text || json.summary || (Array.isArray(json.output) ? JSON.stringify(json.output) : '') || '';

        chunkSummaries.push(compactResult.trim() || 'Compacted context window generated.');
      }

      const combinedSummary = chunkSummaries.join("\n\n---\n\n");
      const summaryTokensEst = estimateTokenCount(combinedSummary);

      const newChunk: CompactChunk = {
        id: `compact-${Date.now()}`,
        lastMsgId: targetMessageId,
        summary: combinedSummary,
        timestamp: new Date().toISOString(),
        originalTokensEst: totalOriginalTokens,
        summaryTokensEst: summaryTokensEst
      };

      setSpaces(prev => prev.map(s => {
        if (s.id === activeSpace.id) {
          return {
            ...s,
            useCompactified: true, // Auto-enable useCompactified on compactify
            threads: s.threads.map(t => {
              if (t.id === activeSpace.activeThreadId) {
                const updatedChunks = [...existingChunks, newChunk];
                return {
                  ...t,
                  compactedChunks: updatedChunks,
                  compactedUpToMessageId: targetMessageId
                };
              }
              return t;
            })
          };
        }
        return s;
      }));

    } catch (err: any) {
      console.error("Compactify error:", err);
      setErrorMessage(`Compactification failed: ${err.message || 'Unknown error'}`);
    } finally {
      setIsCompactifying(false);
      setIsCompactifyingMsgId(null);
    }
  };

  // --- 8. INFERENCE ROUTER & EVENTSTREAMING PIPELINE ---
  const handleSendMessage = useCallback(async (textToSend: string, imagesToSend: string[] = [], audiosToSend: any[] = []) => {
    if (!textToSend.trim() && imagesToSend.length === 0 && audiosToSend.length === 0) return;
    if (isStreaming) return;

    setErrorMessage(null);
    setIsStreaming(true);

    let assistantMsgId: string | null = null;
    try {
      const startTime = performance.now();
      const userTextCopy = textToSend;
      const attachedImagesCopy = [...imagesToSend];
      const attachedAudiosCopy = [...audiosToSend];

      // Build the Prompt Stack Snapshot
      const promptStackSnapshot = compilePromptStack(userTextCopy, attachedImagesCopy);

      // 1. Create User Message instance
      const userMsgId = `msg-user-${Date.now()}`;
      const userMsg: Message = {
        id: userMsgId,
        role: 'user',
        content: userTextCopy,
        timestamp: new Date().toISOString(),
        promptStackSnapshot,
        images: attachedImagesCopy,
        audios: attachedAudiosCopy,
      };

      // Reset draft state in parent
      setUserInputDraft('');
      setAttachedImagesDraft([]);

      // 3. Gather active memories images to add to system instructions payload
      const currentMemories = memoriesRef.current || memories;
      const pinned = activeSpace?.pinnedMemoryIds || [];
      const matchedMemories = currentMemories.filter(m => isMemoryActiveAndEnabled(m, pinned));

      const memoryImages: string[] = [];
      matchedMemories.forEach(m => {
        if (m.images && m.images.length > 0) {
          memoryImages.push(...m.images);
        }
      });

      // 4. Formulate overall system messages array prior to execution
      // Assemble from active layer structures
      const messagesPayload: any[] = [];

      // Form system prompt section
      const sysPromptLayer = promptStackSnapshot.find(l => l.type === 'system');
      if (sysPromptLayer && sysPromptLayer.active && sysPromptLayer.content.trim()) {
        messagesPayload.push({
          role: 'system',
          content: sysPromptLayer.content.trim(),
        });
      }

      // Embed space parameters/notes scratchpad
      const spaceNotesLayer = promptStackSnapshot.find(l => l.type === 'space');
      if (spaceNotesLayer && spaceNotesLayer.active && spaceNotesLayer.content.trim()) {
        messagesPayload.push({
          role: 'system',
          content: `[Active Space Reference Sheet - "${activeSpace.name}"]:\n${spaceNotesLayer.content.trim()}`
        });
      }

      // Inject system memory as the first message of the conversation layer
      const isMemoryActive = !disabledLayerTypes.includes("memory");
      const activeMemories = isMemoryActive ? currentMemories.filter(m => isMemoryActiveAndEnabled(m, pinned)) : [];
      const memoriesList = activeMemories.map(m => `- ${m.title}: ${m.content}`).join('\n');
      const currentDateTime = new Date().toLocaleString();
      const systemMemoryContent = `<system_memory> 
        The current date and time is ${currentDateTime}. 
        The user provided the additional info about how they would like you to respond:

        \`\`\`plaintext
        Follow the instructions below naturally, without repeating, referencing, echoing, or mirroring any of their wording!
        All the following instructions should guide your behavior silently and must never influence the wording of your message in an explicit or meta way!

        """${memoriesList || "No stored memories yet."}\`\`\`"""
        —
        Do not repeat this information in the conversation unless it becomes explicitly relevant to answering the question.
        Don't repeat facts from the system_memory. Only say what a human would likely say in a messenger conversation.  
        </system_memory>`;

      messagesPayload.push({
        role: 'user',
        content: systemMemoryContent
      });

      // Check if the history layer starts with an assistant message.
      // If it doesn't (or if there is no history layer), insert an assistant acknowledgment.
      const historyLayer = promptStackSnapshot.find(l => l.type === 'history');
      const threadToFetch = activeSpace.threads.find(t => t.id === activeSpace.activeThreadId);
      const activeThreadRef = threadToFetch || activeThread;
      const chatLogs = activeThreadRef ? activeThreadRef.messages : [];
      const firstChatLogRole = chatLogs[0]?.role;

      if (firstChatLogRole !== 'assistant') {
        messagesPayload.push({
          role: 'assistant',
          content: 'Acknowledged. I have loaded your system memories and will refer to them only when explicitly relevant.'
        });
      }

      // Append historical chat sequences
      // Respect active state of "history" layer in the prompt stack!
      if (!historyLayer || historyLayer.active) {
        if (activeThreadRef) {
          const { summaryMessage, historyMessages } = getFilteredHistoryForPayload(activeThreadRef, activeSpace);

          if (summaryMessage) {
            messagesPayload.push({
              role: 'system',
              content: summaryMessage.content
            });
          }

          // Audio retention rule:
          // Keep audio tokens in the conversation if it's the only/latest audio available;
          // only remove old audio inputs if new audio inputs come in.
          const hasNewAudioInOutgoing = attachedAudiosCopy.length > 0;
          let latestHistoryAudioMsgIdx = -1;
          for (let i = historyMessages.length - 1; i >= 0; i--) {
            if (historyMessages[i].audios && historyMessages[i].audios!.length > 0) {
              latestHistoryAudioMsgIdx = i;
              break;
            }
          }

          historyMessages.forEach((m, idx) => {
            if (m.isThought) {
              if (!(activeSpace.includeCoTInContext ?? false)) {
                return;
              }
            }

            // Skip any completely empty messages to prevent API model validation failures
            if (!m.content.trim() && (!m.images || m.images.length === 0) && (!m.audios || m.audios.length === 0)) {
              return;
            }

            if (m.isThought) {
              messagesPayload.push({
                role: 'assistant',
                content: `<thought>\n${m.content}\n</thought>`
              });
              return;
            }

            // Keep only the last 4 messages' image attachments, substituting older ones with placeholders
            const isRecentImage = idx >= historyMessages.length - 4;

            // Keep audio tokens if no newer audio input has arrived
            const shouldKeepAudio = !hasNewAudioInOutgoing && idx === latestHistoryAudioMsgIdx;

            if ((m.images && m.images.length > 0) || (m.audios && m.audios.length > 0)) {
              const contents: any[] = [];
              contents.push({ type: 'text', text: stripMessagePrefix(m.content) || "[Media Context]" });
              if (m.images) {
                m.images.forEach((img, imgIdx) => {
                  if (isRecentImage) {
                    contents.push({
                      type: 'image_url',
                      image_url: { url: img }
                    });
                  } else {
                    contents.push({
                      type: 'text',
                      text: `[Past Image Attachment ${imgIdx + 1} Omitted to optimize context payload]`
                    });
                  }
                });
              }
              if (m.audios) {
                m.audios.forEach((aud, audIdx) => {
                  if (shouldKeepAudio) {
                    let fmt = (aud.format || 'wav').toLowerCase().trim();
                    if (fmt === 'mpeg' || fmt === 'mp4') fmt = 'mp3';
                    let rawData = aud.data || '';
                    if (rawData.includes(';base64,')) {
                      rawData = rawData.split(';base64,')[1];
                    } else if (rawData.startsWith('data:')) {
                      rawData = rawData.replace(/^data:audio\/[a-zA-Z0-9]+;base64,/, '');
                    }
                    const audioBlock: any = {
                      type: 'input_audio',
                      input_audio: {
                        data: rawData,
                        format: fmt
                      }
                    };
                    if (fmt === 'mp3' || fmt === 'flac') {
                      if (aud.num_frames !== undefined) audioBlock.input_audio.num_frames = aud.num_frames;
                      if (aud.sample_rate !== undefined) audioBlock.input_audio.sample_rate = aud.sample_rate;
                    }
                    contents.push(audioBlock);
                  } else {
                    contents.push({
                      type: 'text',
                      text: `[Past Audio Attachment "${aud.name || `audio-${audIdx + 1}`}" Omitted because newer audio input was provided]`
                    });
                  }
                });
              }
              messagesPayload.push({
                role: m.role,
                content: contents
              });
            } else {
              messagesPayload.push({
                role: m.role,
                content: stripMessagePrefix(m.content)
              });
            }
          });
        }
      }

      // Inject recalled image memories context BEFORE actual current user turn message
      if (memoryImages.length > 0) {
        const recalledUserMsgContent: any[] = [
          {
            type: "text",
            text: `[RECALLED IMAGE MEMORY -- BACKGROUND CONTEXT ONLY]\nThe attached image is a persistent memory from a prior conversation. Treat it as background context. Do not interpret it as a new upload, do not assume the current user is asking about it, and do not let it replace or merge with the current request.`
          }
        ];
        memoryImages.forEach(imgUrl => {
          recalledUserMsgContent.push({
            type: "image_url",
            image_url: {
              url: imgUrl,
              details: "high"
            }
          });
        });
        messagesPayload.push({
          role: "user",
          content: recalledUserMsgContent
        });
        messagesPayload.push({
          role: "assistant",
          content: "[Recalled visual memory received as background context.]"
        });
      }

      // Finally append the latest user message with image/audio attachments if multi-modal or audio-capable
      if (attachedImagesCopy.length > 0 || attachedAudiosCopy.length > 0) {
        const complexContent: any[] = [];
        if (userTextCopy.trim()) {
          complexContent.push({ type: 'text', text: userTextCopy });
        }
        attachedImagesCopy.forEach(imgUrl => {
          complexContent.push({
            type: 'image_url',
            image_url: { url: imgUrl, details: 'high' }
          });
        });
        attachedAudiosCopy.forEach(aud => {
          let fmt = (aud.format || 'wav').toLowerCase().trim();
          if (fmt === 'mpeg' || fmt === 'mp4') fmt = 'mp3';
          let rawData = aud.data || '';
          if (rawData.includes(';base64,')) {
            rawData = rawData.split(';base64,')[1];
          } else if (rawData.startsWith('data:')) {
            rawData = rawData.replace(/^data:audio\/[a-zA-Z0-9]+;base64,/, '');
          }
          complexContent.push({
            type: 'input_audio',
            input_audio: {
              data: rawData,
              format: fmt
            }
          });
        });
        messagesPayload.push({
          role: 'user',
          content: complexContent
        });
      } else {
        messagesPayload.push({
          role: 'user',
          content: userTextCopy
        });
      }

      // 5. Instate temporary streaming block inside chat context
      assistantMsgId = `msg-assistant-${Date.now()}`;
      const initialAssistantMsg: Message = {
        id: assistantMsgId,
        role: 'assistant',
        content: '',
        timestamp: new Date().toISOString(),
        modelUsed: activeSpace.model,
        promptStackSnapshot,
      };

      setSpaces(prev => prev.map(s => {
        if (s.id === activeSpace.id) {
          const targetThreadId = s.threads.some(t => t.id === s.activeThreadId) ? s.activeThreadId : s.threads[0]?.id;
          return {
            ...s,
            threads: s.threads.map(t => {
              if (t.id === targetThreadId) {
                return {
                  ...t,
                  messages: [...t.messages, userMsg, initialAssistantMsg],
                };
              }
              return t;
            })
          };
        }
        return s;
      }));

      let streamBuffer = '';
      let reasoningBuffer = '';
      let audioDataBuffer = '';
      let audioTranscriptBuffer = '';
      const thoughtMsgId = `msg-thought-${assistantMsgId}`;

      const compressedPayload = await preparePayloadWithCompressedImages(messagesPayload);

      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-openai-token': apiConfig.clientToken || '',
          'x-tinker-api-key': apiConfig.tinkerKey || '',
          'x-openrouter-api-key': apiConfig.openRouterKey || '',
        },
        body: JSON.stringify({
          messages: compressedPayload,
          model: activeSpace.model,
          temperature: activeSpace.temperature,
          top_p: activeSpace.top_p,
          top_k: -1,
          max_completion_tokens: activeSpace.max_tokens,
          presence_penalty: activeSpace.presence_penalty ?? 0.0,
          frequency_penalty: activeSpace.frequency_penalty !== undefined ? activeSpace.frequency_penalty : 0.0,
          service_tier: activeSpace.service_tier ?? "auto",
          moderation: null,
          stream: !activeSpace.enableAudioOutput,
          modalities: activeSpace.enableAudioOutput ? ["text", "audio"] : ["text"],
          ...(activeSpace.enableAudioOutput ? {
            audio: {
              voice: activeSpace.openaiVoice || "verse",
              format: "wav"
            }
          } : {}),
          tinker_api_key: apiConfig.tinkerKey || '',
          openrouter_api_key: apiConfig.openRouterKey || '',
          ...(shouldApplyReasoningLogic(activeSpace.model) ? {
            reasoning_effort: activeSpace.tinkerReasoningEffort ?? "high",
            config: {
              reasoning_effort: activeSpace.tinkerReasoningEffort ?? "high"
            },
            ...(isInklingModel(activeSpace.model) ? {
              tools: {
                web_search: activeSpace.tinkerWebSearch ?? false
              },
              extra_body: {separate_reasoning: true},
            } : {})
          } : {})
        }),
      });

      if (!response.ok) {
        let errMessage = `API request failed with status ${response.status}`;
        const contentType = response.headers.get('content-type') || '';
        if (contentType.includes('application/json')) {
          try {
            const errJson = await response.json();
            errMessage = errJson.error || errJson.detail || errMessage;
          } catch (e) {}
        } else {
          const errText = await response.text();
          if (errText.includes('<html')) {
            if (response.status === 413) {
              errMessage = "Payload too large. The audio file or attachments are too big for the server to process.";
            } else {
              errMessage = `Server error ${response.status} (HTML response). Payload might be too large or the upstream proxy crashed.`;
            }
          } else {
            errMessage = errText;
          }
        }
        throw new Error(errMessage);
      }

      let calculatedTotalTokens = 0;
      const contentType = response.headers.get('content-type') || '';
      if (contentType.includes('application/json')) {
        const json = await response.json();
        if (json.error) {
          throw new Error(typeof json.error === 'object' ? (json.error.message || JSON.stringify(json.error)) : json.error);
        }
        const textContent = json.choices?.[0]?.message?.content || json.choices?.[0]?.delta?.content || (typeof json === 'string' ? json : '');
        const reasoningContent = json.choices?.[0]?.message?.reasoning_content || json.choices?.[0]?.delta?.reasoning_content || json.reasoning_content || '';
        if (textContent) streamBuffer = textContent;
        if (reasoningContent) reasoningBuffer = reasoningContent;
        if (json.usage?.total_tokens) calculatedTotalTokens = json.usage.total_tokens;

        const messageAudio = json.choices?.[0]?.message?.audio;
        if (messageAudio) {
          if (messageAudio.data) audioDataBuffer = messageAudio.data;
          if (messageAudio.transcript) {
            audioTranscriptBuffer = messageAudio.transcript;
            if (!streamBuffer) {
              streamBuffer = messageAudio.transcript;
            }
          }
        }
      } else {
        const reader = response.body?.getReader();
        if (!reader) throw new Error("Readable streams are unsupported in this web container.");

        const decoder = new TextDecoder();
        let streamFinished = false;
        let bufferText = '';
        let lastRenderTime = 0;
        let pendingRenderTimeout: any = null;

        const syncStreamToState = (force: boolean = false) => {
          const now = performance.now();
          if (!force && now - lastRenderTime < (isMobileScreen ? 120 : 50)) {
            if (!pendingRenderTimeout) {
              pendingRenderTimeout = setTimeout(() => {
                pendingRenderTimeout = null;
                syncStreamToState(true);
              }, isMobileScreen ? 120 : 50);
            }
            return;
          }
          if (pendingRenderTimeout) {
            clearTimeout(pendingRenderTimeout);
            pendingRenderTimeout = null;
          }
          lastRenderTime = now;

          const parsed = parseStreamingOutput(streamBuffer, reasoningBuffer, apiConfig.userName);
          const currentCleaned = replaceBioCommands(parsed.response);

          setSpaces(prev => prev.map(s => {
            if (s.id === activeSpace.id) {
              const targetThreadId = s.threads.some(t => t.id === s.activeThreadId) ? s.activeThreadId : s.threads[0]?.id;
              return {
                ...s,
                threads: s.threads.map(t => {
                  if (t.id === targetThreadId) {
                    const existsThought = t.messages.some(m => m.id === thoughtMsgId);
                    let updatedMessages = t.messages;

                    if (parsed.thinking) {
                      if (!existsThought) {
                        const assistantIndex = updatedMessages.findIndex(m => m.id === assistantMsgId);
                        if (assistantIndex !== -1) {
                          const newThoughtMsg: Message = {
                            id: thoughtMsgId,
                            role: 'assistant',
                            content: parsed.thinking,
                            timestamp: new Date().toISOString(),
                            isThought: true,
                            modelUsed: activeSpace.model,
                          };
                          updatedMessages = [
                            ...updatedMessages.slice(0, assistantIndex),
                            newThoughtMsg,
                            ...updatedMessages.slice(assistantIndex)
                          ];
                        }
                      } else {
                        updatedMessages = updatedMessages.map(m =>
                          m.id === thoughtMsgId ? { ...m, content: parsed.thinking } : m
                        );
                      }
                    }

                    updatedMessages = updatedMessages.map(m =>
                      m.id === assistantMsgId ? {
                        ...m,
                        content: currentCleaned,
                        ...(audioDataBuffer ? {
                          audioResponse: {
                            data: convertPcm16Base64ToWavBase64(audioDataBuffer),
                            format: 'wav',
                            transcript: audioTranscriptBuffer
                          }
                        } : {})
                      } : m
                    );

                    return {
                      ...t,
                      messages: updatedMessages,
                    };
                  }
                  return t;
                }),
              };
            }
            return s;
          }));
        };

        while (!streamFinished) {
          const { value, done } = await reader.read();
          if (done) break;

          bufferText += decoder.decode(value, { stream: true });
          const lines = bufferText.split('\n');
          bufferText = lines.pop() || '';

          for (const line of lines) {
            const rawLine = line.trim();
            if (rawLine === 'data: [DONE]') {
              streamFinished = true;
              break;
            }

            if (rawLine.startsWith('data: ')) {
              const jsonPart = rawLine.slice(6).trim();
              if (!jsonPart) continue;

              let chunkJson: any = null;
              try {
                chunkJson = JSON.parse(jsonPart);
              } catch (pErr) {
                // ignore incomplete json pieces
              }

              if (chunkJson && chunkJson.error) {
                const errorMsg = typeof chunkJson.error === 'object' ? (chunkJson.error.message || JSON.stringify(chunkJson.error)) : chunkJson.error;
                throw new Error(errorMsg);
              }

              if (chunkJson) {
                const delta = chunkJson.choices?.[0]?.delta;
                const word = delta?.content || '';
                const reasoning = delta?.reasoning_content || (delta as any)?.reasoning || (delta as any)?.thought || '';
                const deltaAudio = delta?.audio;

                if (word) {
                  streamBuffer += word;
                }
                if (reasoning) {
                  reasoningBuffer += reasoning;
                }
                if (deltaAudio) {
                  if (deltaAudio.data) audioDataBuffer += deltaAudio.data;
                  if (deltaAudio.transcript) audioTranscriptBuffer += deltaAudio.transcript;
                }

                // Check if usage telemetry was packaged with chunks
                if (chunkJson.usage) {
                  calculatedTotalTokens = chunkJson.usage.total_tokens || calculatedTotalTokens;
                }

                syncStreamToState(false);
              }
            }
          }
        }
        if (pendingRenderTimeout) {
          clearTimeout(pendingRenderTimeout);
          pendingRenderTimeout = null;
        }
        syncStreamToState(true);
      }

      if (!streamBuffer.trim() && !reasoningBuffer.trim()) {
        throw new Error("The model returned an empty response. This often happens if the context limit was exceeded, the prompt triggered a safety filter, or the request was too large for the model to process.");
      }

      // Finalize transmission telemetry
      const endTime = performance.now();
      const latencyMs = Math.round(endTime - startTime);
      const estTokens = calculatedTotalTokens || Math.round((streamBuffer.length + reasoningBuffer.length + userTextCopy.length) / 3.8);

      // Register telemetry slip
      const indexTelemetrySlip = {
        model: activeSpace.model,
        timestamp: new Date().toISOString(),
        latencyMs,
        totalTokens: estTokens,
        temperature: activeSpace.temperature,
        top_p: activeSpace.top_p,
        presence_penalty: activeSpace.presence_penalty ?? 0.0,
        frequency_penalty: activeSpace.frequency_penalty !== undefined ? activeSpace.frequency_penalty : 0.0,
        service_tier: activeSpace.service_tier ?? "auto",
        top_k: -1,
        success: true,
      };

      setReceipts(prev => [...prev, indexTelemetrySlip]);

      // Parse and apply auto memories generated by the model
      processAndApplyBioMemories(streamBuffer);

      // Respect an explicit model title, otherwise title the chat after its first reply.
      const currentTargetThreadId = activeSpace.threads.some(t => t.id === activeSpace.activeThreadId) ? activeSpace.activeThreadId : activeSpace.threads[0]?.id;
      const titleFromCommand = parseThreadTitleCommands(streamBuffer);
      if (titleFromCommand && currentTargetThreadId) {
        handleRenameThread(currentTargetThreadId, titleFromCommand);
      } else if (currentTargetThreadId) {
        const currentThreadObj = activeSpace.threads.find(t => t.id === currentTargetThreadId);
        const isGenericTitle = !currentThreadObj || isGenericThreadTitle(currentThreadObj.title, currentThreadObj.modelId || activeSpace.model);
        
        const userMsgCount = (currentThreadObj?.messages.filter(m => m.role === 'user').length || 0) + 1;

        if (isGenericTitle && userMsgCount >= 1) {
          fetch('/api/threads/generate-title', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'x-openai-token': apiConfig.clientToken || '',
              'x-tinker-api-key': apiConfig.tinkerKey || '',
              'x-openrouter-api-key': apiConfig.openRouterKey || '',
            },
            body: JSON.stringify({
              messages: [
                ...(currentThreadObj?.messages.slice(0, 4).map(m => ({ role: m.role, content: typeof m.content === 'string' ? m.content.substring(0, 500) : '' })) || []),
                { role: 'user', content: userTextCopy.substring(0, 500) },
                { role: 'assistant', content: streamBuffer.substring(0, 500) }
              ],
              model: activeSpace.model || 'openai/gpt-4o'
            })
          })
          .then(r => {
            if (!r.ok) throw new Error(`Title request failed (${r.status})`);
            return r.json();
          })
          .then(data => {
            handleRenameThread(currentTargetThreadId, data?.title && !isGenericThreadTitle(data.title)
              ? data.title : fallbackThreadTitle(userTextCopy, attachedImagesCopy.length, attachedAudiosCopy.length), true);
          })
          .catch(err => {
            console.warn("Background auto-titling warning:", err);
            handleRenameThread(currentTargetThreadId, fallbackThreadTitle(userTextCopy, attachedImagesCopy.length, attachedAudiosCopy.length), true);
          });
        }
      }

      const finalParsed = parseStreamingOutput(streamBuffer, reasoningBuffer);
      const cleanedBuffer = replaceBioCommands(finalParsed.response);
      const isThinkingLogsEnabled = activeSpace.enableThinkingLogs ?? false;

      // Complete message state with metadata parameters attached
      setSpaces(prev => prev.map(s => {
        if (s.id === activeSpace.id) {
          const targetThreadId = s.threads.some(t => t.id === s.activeThreadId) ? s.activeThreadId : s.threads[0]?.id;
          return {
            ...s,
            threads: s.threads.map(t => {
              if (t.id === targetThreadId) {
                let updatedMsgs = t.messages.map(m => {
                  if (m.id === assistantMsgId) {
                    return {
                      ...m,
                      content: cleanedBuffer,
                      tokensUsed: { total_tokens: estTokens },
                      latencyMs,
                      ...(audioDataBuffer ? {
                        audioResponse: {
                          data: convertPcm16Base64ToWavBase64(audioDataBuffer),
                          format: 'wav',
                          transcript: audioTranscriptBuffer
                        }
                      } : {})
                    };
                  }
                  if (m.id === thoughtMsgId) {
                    return {
                      ...m,
                      content: finalParsed.thinking,
                    };
                  }
                  return m;
                });

                // If thinking logs are NOT enabled, delete/filter out the thought message
                if (!isThinkingLogsEnabled) {
                  updatedMsgs = updatedMsgs.filter(m => m.id !== thoughtMsgId);
                }

                return {
                  ...t,
                  messages: updatedMsgs,
                };
              }
              return t;
            })
          };
        }
        return s;
      }));

    } catch (err: any) {
      console.error(err);
      setErrorMessage(err.message || "An exception occurred calling the proxy node.");
      // Erase raw streaming placeholder
      if (assistantMsgId) {
        setSpaces(prev => prev.map(s => {
          if (s.id === activeSpace.id) {
            const targetThreadId = s.threads.some(t => t.id === s.activeThreadId) ? s.activeThreadId : s.threads[0]?.id;
            return {
              ...s,
              threads: s.threads.map(t => {
                if (t.id === targetThreadId) {
                  return {
                    ...t,
                    messages: t.messages.filter(m => m.id !== assistantMsgId),
                  };
                }
                return t;
              })
            };
          }
          return s;
        }));
      }
    } finally {
      setIsStreaming(false);
    }
  }, [
    isStreaming,
    activeSpace,
    memories,
    disabledLayerTypes,
    apiConfig,
    activeSpaceId,
    spaces,
    isMobileScreen
  ]);

  const handleSendMessageRef = useRef(handleSendMessage);
  handleSendMessageRef.current = handleSendMessage;
  const sendMessageFromDock = useCallback((text: string, images: string[], audios: AttachedAudio[]) => {
    handleSendMessageRef.current(text, images, audios);
  }, []);
  const handleClearMessagesRef = useRef(handleClearMessages);
  handleClearMessagesRef.current = handleClearMessages;
  const clearMessagesFromDock = useCallback(() => handleClearMessagesRef.current(), []);

  const handleSetEditingMessage = useCallback((id: string, content: string, images: string[], audios?: AttachedAudio[], audioResponse?: AssistantAudioResponse) => {
    setEditingMessageId(id);
    setEditingMessageText(content);
    setEditingMessageImages(images || []);
    setEditingMessageAudios(audios ? [...audios] : []);
    setEditingMessageAudioResponse(audioResponse ? { ...audioResponse } : undefined);
  }, []);

  const handleCancelEditing = useCallback(() => {
    setEditingMessageId(null);
    setEditingMessageText('');
    setEditingMessageImages([]);
    setEditingMessageAudios([]);
    setEditingMessageAudioResponse(undefined);
  }, []);

  const handleEditingTextChange = useCallback((text: string) => {
    setEditingMessageText(text);
  }, []);

  const handleRemoveEditingImage = useCallback((index: number) => {
    setEditingMessageImages(prev => prev.filter((_, idx) => idx !== index));
  }, []);

  const handleAddEditingImages = useCallback((imgs: string[]) => {
    setEditingMessageImages(prev => [...prev, ...imgs]);
  }, []);

  const handleRemoveEditingAudio = useCallback((index: number) => {
    setEditingMessageAudios(prev => prev.filter((_, idx) => idx !== index));
  }, []);

  const handleRemoveEditingAudioResponse = useCallback(() => {
    setEditingMessageAudioResponse(undefined);
  }, []);

  const handleAddEditingAudios = useCallback((newAuds: AttachedAudio[]) => {
    setEditingMessageAudios(prev => [...prev, ...newAuds]);
  }, []);

  const handleDeleteMessageAudio = useCallback((messageId: string, audioId: string) => {
    const currentActiveSpaceId = activeSpaceIdRef.current;
    const currentSpaces = spacesRef.current;
    const activeSpace = currentSpaces.find(s => s.id === currentActiveSpaceId);
    if (!activeSpace) return;
    const targetThreadId = activeSpace.threads.some(t => t.id === activeSpace.activeThreadId) ? activeSpace.activeThreadId : activeSpace.threads[0]?.id;

    const nextSpaces = currentSpaces.map(s => {
      if (s.id === currentActiveSpaceId) {
        return {
          ...s,
          threads: s.threads.map(t => {
            if (t.id === targetThreadId) {
              return {
                ...t,
                messages: t.messages.map(m => {
                  if (m.id === messageId) {
                    const updatedAudios = m.audios ? m.audios.filter(a => a.id !== audioId) : [];
                    const updatedVersions = m.versions?.map(v => ({
                      ...v,
                      audios: v.audios ? v.audios.filter(a => a.id !== audioId) : []
                    }));
                    return {
                      ...m,
                      audios: updatedAudios,
                      versions: updatedVersions
                    };
                  }
                  return m;
                })
              };
            }
            return t;
          })
        };
      }
      return s;
    });

    spacesRef.current = nextSpaces;
    setSpaces(nextSpaces);
    idbSet('playground_spaces', nextSpaces);
  }, []);

  const handleDeleteMessageAudioResponse = useCallback((messageId: string) => {
    const currentActiveSpaceId = activeSpaceIdRef.current;
    const currentSpaces = spacesRef.current;
    const activeSpace = currentSpaces.find(s => s.id === currentActiveSpaceId);
    if (!activeSpace) return;
    const targetThreadId = activeSpace.threads.some(t => t.id === activeSpace.activeThreadId) ? activeSpace.activeThreadId : activeSpace.threads[0]?.id;

    const nextSpaces = currentSpaces.map(s => {
      if (s.id === currentActiveSpaceId) {
        return {
          ...s,
          threads: s.threads.map(t => {
            if (t.id === targetThreadId) {
              return {
                ...t,
                messages: t.messages.map(m => {
                  if (m.id === messageId) {
                    const updatedMsg = { ...m };
                    delete updatedMsg.audioResponse;
                    if (updatedMsg.versions) {
                      updatedMsg.versions = updatedMsg.versions.map(v => {
                        const copyV = { ...v };
                        delete copyV.audioResponse;
                        return copyV;
                      });
                    }
                    return updatedMsg;
                  }
                  return m;
                })
              };
            }
            return t;
          })
        };
      }
      return s;
    });

    spacesRef.current = nextSpaces;
    setSpaces(nextSpaces);
    idbSet('playground_spaces', nextSpaces);
  }, []);

  const handleToggleInspect = useCallback((id: string) => {
    setInspectMessageId(prev => (prev === id ? null : id));
  }, []);

  const handleEditLayerContent = useCallback((index: number, newContent: string) => {
    const layer = activePromptStack[index];
    if (!layer) return;
    if (layer.type === 'system') {
      let cleanContent = newContent;
      if (cleanContent.endsWith(MEMORY_SYSTEM_INSTRUCTIONS)) {
        cleanContent = cleanContent.slice(0, -MEMORY_SYSTEM_INSTRUCTIONS.length).trimEnd();
      }
      setSpaces(prev => prev.map(s => s.id === activeSpaceId ? { ...s, systemPromptCustom: cleanContent } : s));
    } else if (layer.type === 'space') {
      setSpaces(prev => prev.map(s => s.id === activeSpaceId ? { ...s, notes: newContent } : s));
    }
  }, [activePromptStack, activeSpaceId]);

  const handleCopyFormatted = useCallback(async (msg: Message) => {
    const bubbleEl = document.getElementById(`message-bubble-${msg.id}`);
    const markdownBody = bubbleEl?.querySelector('.markdown-body');
    let richHtml = '';
    let plainText = '';

    const isUser = msg.role === 'user';
    const isThought = msg.isThought;
    const modelId = msg.modelUsed || activeSpace.model || 'Assistant';
    const label = isThought ? `[${modelId}] (Thinking Process)` : (isUser ? 'Pilot' : `[${modelId}]`);

    if (markdownBody) {
      richHtml = convertDomToRichHtml(markdownBody);
      plainText = convertDomToPlainText(markdownBody).trim();
    } else {
      const cleanMd = getCleanMarkdownContent(msg);
      plainText = cleanMd.trim();
      richHtml = `<div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; font-size: 14px; line-height: 1.6;">${escapeHtml(cleanMd).replace(/\n\n/g, '<br><br>').replace(/\n/g, '<br>')}</div>`;
    }

    const fullPlainText = `${label}:\n${plainText}`;
    const fullRichHtml = `<div><strong style="color: #c2a472;">${escapeHtml(label)}:</strong><div style="margin-top:4px;">${richHtml}</div></div>`;

    const success = await copyToClipboard(fullRichHtml, fullPlainText);
    if (success) {
      setCopiedFormattedMsgId(msg.id);
      setTimeout(() => setCopiedFormattedMsgId(null), 2000);
    }
  }, [activeSpace.model]);

  const handleCopyMarkdown = useCallback(async (msg: Message) => {
    const cleanMd = getCleanMarkdownContent(msg);
    if (cleanMd) {
      const isUser = msg.role === 'user';
      const isThought = msg.isThought;
      const modelId = msg.modelUsed || activeSpace.model || 'Assistant';
      const label = isThought ? `[${modelId}] (Thinking Process)` : (isUser ? 'Pilot' : `[${modelId}]`);
      const fullMd = `${label}:\n${cleanMd.trim()}`;

      const success = await copyToClipboard(fullMd, fullMd);
      if (!success && typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(fullMd);
      }
      setCopiedMarkdownMsgId(msg.id);
      setTimeout(() => setCopiedMarkdownMsgId(null), 2000);
    }
  }, [activeSpace.model]);

  const handleViewChunkSummary = useCallback((chunk: CompactChunk) => {
    setSelectedChunkForModal(chunk);
    setShowCompactSummariesModal(true);
  }, []);

  const startLiveCall = () => {
    if (!activeThread || isStreaming) return;
    const layers = compilePromptStack('', []);
    const instructions = layers.filter(layer => layer.active && ['system','space','memory'].includes(layer.type)).map(layer=>layer.content).join('\n\n');
    let remaining = 24000;
    const filteredHistory = getFilteredHistoryForPayload(activeThread,activeSpace);
    const historyEnabled = layers.some(layer=>layer.type==='history' && layer.active);
    const history = (historyEnabled ? [...(filteredHistory.summaryMessage ? [{...filteredHistory.summaryMessage,id:'voice-summary',timestamp:new Date().toISOString(),role:'user' as const}] : []),...filteredHistory.historyMessages] : []).filter(message=>!message.isThought && ['user','assistant'].includes(message.role)).slice(-30).reverse().flatMap(message=>{
      if(remaining<=0) return [];
      const content=message.content.slice(-remaining);remaining-=content.length;
      return [{...message,content}];
    }).reverse();
    setLiveCall({spaceId:activeSpace.id,threadId:activeThread.id,model:activeSpace.model,voice:activeSpace.openaiVoice || 'marin',instructions,history});
  };
  const finishLiveCall = (messages:Message[]) => {
    if(liveCall && messages.length) setSpaces(previous=>previous.map(space=>space.id===liveCall.spaceId?{...space,threads:space.threads.map(thread=>thread.id===liveCall.threadId?{...thread,messages:[...thread.messages,...messages]}:thread)}:space));
    setLiveCall(null);
  };

  const markdownComponents = useMemo(() => ({
    code: CodeBlock,
    pre: PreBlock,
  }), []);

  return (
    <div className="flex flex-col lg:flex-row h-[100dvh] w-full max-w-full overflow-hidden bg-[#0a0a0b] font-sans text-sm sm:text-xs text-[#d4d4d8] antialiased selection:bg-[#c2a472]/20 selection:text-[#c2a472]">
      
      {mobileTab === 'chat' && <div className="mobile-chat-header lg:hidden">
        <button className="mobile-back" type="button" onClick={() => setMobileTab('inbox')} aria-label="Back to chats"><ArrowRight size={26} className="rotate-180" /></button>
        <ModelAvatar id={activeSpace.model} name={filteredModelsList.find(model => model.id === activeSpace.model)?.name || activeSpace.model.split('/').pop() || 'Model'} size="small" />
        <button className="mobile-chat-identity" type="button" onClick={() => setMobileTab('models')} title="Choose another model">
          <strong title={activeThread?.title}>{activeThread?.title && activeThread.title !== 'New Conversation' ? activeThread.title : (filteredModelsList.find(model => model.id === activeSpace.model)?.name.replace(/\s*\([^)]*\)/g, '') || activeSpace.model.split('/').pop())}</strong>
          {activeThread?.title && activeThread.title !== 'New Conversation' && <span className="mobile-chat-model-name">{filteredModelsList.find(model => model.id === activeSpace.model)?.name.replace(/\s*\([^)]*\)/g, '') || activeSpace.model.split('/').pop()}</span>}
          <span className="mobile-chat-model-id" title={activeSpace.model}>{activeSpace.model}</span>
        </button>
        <button className="mobile-circle-action" type="button" onClick={() => { setMobileSettingsStartPage('home'); setMobileSidebarOpen(true); }} aria-label="Conversation settings"><Sliders size={21} /></button>
      </div>}

      {liveCall && <Suspense fallback={<div className="realtime-call"><p role="status">Opening voice chat…</p><button onClick={()=>setLiveCall(null)}>Cancel</button></div>}><RealtimeCall model={liveCall.model} token={apiConfig.clientToken || ''} voice={liveCall.voice} instructions={liveCall.instructions} history={liveCall.history} onClose={finishLiveCall} /></Suspense>}
      {/* PHONE SETTINGS */}
      {mobileSidebarOpen && (
        <MobileSettings
          space={activeSpace}
          models={filteredModelsList}
          personas={personaPresets}
          apiConfig={apiConfig}
          appearance={mobileAppearance}
          initialPage={mobileSettingsStartPage}
          onUpdateSpace={handleUpdateSpaceParams}
          onUpdateAppearance={updateMobileAppearance}
          onUpdateKey={handleUpdateClientToken}
          onUpdateTinkerKey={handleUpdateTinkerKey}
          onUpdateRouterKey={handleUpdateOpenRouterKey}
          onUpdateUserName={handleUpdateUserName}
          onClose={() => setMobileSidebarOpen(false)}
        >
            <SpaceSidebar
              spaces={spaces}
              activeSpaceId={activeSpaceId}
              onSelectSpace={(id) => {
                handleSelectSpace(id);
                setMobileSidebarOpen(false);
              }}
              onAddSpace={handleCreateSpace}
              onDeleteSpace={handleDeleteSpace}
              threads={activeSpace.threads}
              activeThreadId={activeSpace.activeThreadId}
              onSelectThread={(id) => {
                handleSelectThread(id);
                setMobileSidebarOpen(false);
              }}
              onAddThread={handleCreateThread}
              onDeleteThread={handleDeleteThread}
              onRenameThread={handleRenameThread}
              onBatchNameThreads={handleBatchNameThreads}
              isBatchNaming={isBatchNaming}
              activeSpace={activeSpace}
              onUpdateSpaceParams={handleUpdateSpaceParams}
              personaPresets={personaPresets}
              onSavePersonaPreset={handleSavePersonaPreset}
              apiConfig={apiConfig}
              onUpdateClientToken={handleUpdateClientToken}
              onUpdateTinkerKey={handleUpdateTinkerKey}
              onUpdateOpenRouterKey={handleUpdateOpenRouterKey}
              userName={apiConfig.userName}
              onUpdateUserName={handleUpdateUserName}
              onClearAllCompactChunks={handleClearAllCompactChunks}
              onOpenCompactSummariesModal={() => setShowCompactSummariesModal(true)}
              onBackupData={handleBackup}
              onRestoreData={handleRestore}
              onResetData={handleResetData}
              onClearAllImages={handleClearAllStoredImages}
              storedImagesCount={storedImagesCount}
              modelsList={filteredModelsList}
            />
        </MobileSettings>
      )}

      {/* --- STANDARD DESKTOP STRUCTURAL SIDEBAR --- */}
      {!isMobileScreen && !isLeftSidebarCollapsed && (
        <div
          className="hidden lg:flex flex-col h-full bg-[#0c0c0d] relative shrink-0"
          style={{ width: `${leftSidebarWidth}px` }}
        >
          <SpaceSidebar
            spaces={spaces}
            activeSpaceId={activeSpaceId}
            onSelectSpace={handleSelectSpace}
            onAddSpace={handleCreateSpace}
            onDeleteSpace={handleDeleteSpace}
            threads={activeSpace.threads}
            activeThreadId={activeSpace.activeThreadId}
            onSelectThread={handleSelectThread}
            onAddThread={handleCreateThread}
            onDeleteThread={handleDeleteThread}
            onRenameThread={handleRenameThread}
            onBatchNameThreads={handleBatchNameThreads}
            isBatchNaming={isBatchNaming}
            activeSpace={activeSpace}
            onUpdateSpaceParams={handleUpdateSpaceParams}
            personaPresets={personaPresets}
            onSavePersonaPreset={handleSavePersonaPreset}
            apiConfig={apiConfig}
            onUpdateClientToken={handleUpdateClientToken}
            onUpdateTinkerKey={handleUpdateTinkerKey}
            onUpdateOpenRouterKey={handleUpdateOpenRouterKey}
            userName={apiConfig.userName}
            onUpdateUserName={handleUpdateUserName}
            onClearAllCompactChunks={handleClearAllCompactChunks}
            onOpenCompactSummariesModal={() => setShowCompactSummariesModal(true)}
            onBackupData={handleBackup}
            onRestoreData={handleRestore}
            onResetData={handleResetData}
            onClearAllImages={handleClearAllStoredImages}
            storedImagesCount={storedImagesCount}
            modelsList={filteredModelsList}
          />
          <ResizeDivider
            side="left"
            onResize={handleResizeLeftSidebar}
            onDoubleClick={() => setLeftSidebarWidth(320)}
            title="Drag to resize Space Navigator (double-click to reset to 320px)"
          />
        </div>
      )}

      {/* --- CENTER CHAT STAGE / LOGGING GRID --- */}
      <div className={`flex-1 min-w-0 max-w-full flex flex-col bg-[#0a0a0b] border-r border-[#1a1a1c] h-full relative overflow-hidden ${mobileTab !== 'chat' ? 'hidden lg:flex' : 'flex'}`}>
        
        {/* UPPER DASH TAPE */}
        <div className="hidden lg:flex items-center justify-between px-6 py-3.5 border-b border-[#1a1a1c] bg-[#0c0c0d] shrink-0 min-w-0">
          <div className="flex items-center gap-3.5 min-w-0">
            <button
              onClick={() => setIsLeftSidebarCollapsed(!isLeftSidebarCollapsed)}
              className="p-1.5 rounded bg-[#101011] hover:bg-[#151517] border border-[#222] text-zinc-400 hover:text-[#c2a472] transition-colors cursor-pointer flex items-center justify-center shadow-sm shrink-0"
              title={isLeftSidebarCollapsed ? "Expand Space Navigator" : "Collapse Space Navigator"}
            >
              {isLeftSidebarCollapsed ? <PanelLeftOpen className="w-4 h-4" /> : <PanelLeftClose className="w-4 h-4" />}
            </button>
            <div className="min-w-0">
              <h1 className="font-serif italic text-lg text-white tracking-tight select-none truncate">{activeSpace.name}</h1>
              <p className="text-[10px] text-zinc-500 font-bold uppercase tracking-wider select-none mt-0.5 truncate">{activeSpace.description || 'Target coordinates initialized'}</p>
            </div>
          </div>
          <div className="flex items-center gap-2.5 text-[10px] text-zinc-500 font-mono select-none shrink-0">
            {/* Appearance & Geometry Settings Toggle Button */}
            <div className="flex items-center gap-1 bg-[#151517] border border-[#222] hover:border-[#c2a472]/40 rounded px-1.5 py-0.5 shadow-sm">
              <button
                onClick={() => setShowChatSettings(prev => !prev)}
                className={`flex items-center gap-1.5 px-1.5 py-0.5 rounded text-[10px] font-mono transition-colors cursor-pointer ${
                  showChatSettings
                    ? 'text-[#c2a472] font-bold bg-[#c2a472]/15'
                    : 'text-zinc-300 hover:text-white'
                }`}
                title="Toggle Bubble Colors, Fonts, Sizes, and Stage Geometry Toolbar"
              >
                <Sliders className="w-3.5 h-3.5 text-[#c2a472]" />
                <div className="flex items-center -space-x-1" title="Active Pilot & AI Bubble Colors">
                  <span
                    className="w-2.5 h-2.5 rounded-full border border-zinc-700 shadow-xs inline-block"
                    style={{ backgroundColor: chatAppearance.userBubbleBg || '#3d0981' }}
                  />
                  <span
                    className="w-2.5 h-2.5 rounded-full border border-zinc-700 shadow-xs inline-block"
                    style={{ backgroundColor: chatAppearance.assistantBubbleBg || '#090a0e' }}
                  />
                </div>
                <span className="capitalize">{AVAILABLE_FONTS.find(f => f.id === chatAppearance.fontFamily)?.name || 'Font'}</span>
                <span className="text-[#c2a472] font-bold">{chatAppearance.fontSize}px</span>
              </button>
              
              <div className="flex items-center border-l border-[#27272a] pl-1 gap-0.5">
                <button
                  onClick={() => handleUpdateChatAppearance({ fontSize: Math.max(11, chatAppearance.fontSize - 1) })}
                  disabled={chatAppearance.fontSize <= 11}
                  className="px-1 text-[9px] font-mono text-zinc-400 hover:text-white disabled:opacity-30 rounded hover:bg-[#222] cursor-pointer"
                  title="Quick font size step down"
                >
                  A-
                </button>
                <button
                  onClick={() => handleUpdateChatAppearance({ fontSize: Math.min(24, chatAppearance.fontSize + 1) })}
                  disabled={chatAppearance.fontSize >= 24}
                  className="px-1 text-[9px] font-mono text-zinc-400 hover:text-white disabled:opacity-30 rounded hover:bg-[#222] cursor-pointer"
                  title="Quick font size step up"
                >
                  A+
                </button>
              </div>
            </div>

            {/* Google Drive Autosave / Manual Backup Indicator */}
            {driveToken ? (
              <button
                onClick={() => {
                  setActiveRightTab('drive');
                  if (isRightSidebarCollapsed) setIsRightSidebarCollapsed(false);
                }}
                className="flex items-center gap-1.5 px-2 py-1 bg-[#121215] border border-emerald-900/50 hover:border-emerald-700/80 rounded text-[10px] font-mono text-emerald-400 cursor-pointer shadow-xs transition-colors"
                title="Google Drive Cloud Autosave is active. Click to manage cloud backups."
              >
                <Cloud className="w-3.5 h-3.5 text-emerald-400 animate-pulse" />
                <span className="font-bold hidden xl:inline">DRIVE AUTOSAVE</span>
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
              </button>
            ) : (
              <div className="flex items-center gap-1">
                <button
                  onClick={() => setShowDriveAuthModal(true)}
                  className="flex items-center gap-1 px-2 py-1 bg-[#161410] border border-amber-800/50 hover:border-[#c2a472] rounded text-[10px] font-mono text-amber-300 hover:text-white cursor-pointer shadow-xs transition-colors"
                  title="Google Drive autosave is off. Click to sign in or view options."
                >
                  <AlertTriangle className="w-3.5 h-3.5 text-amber-400" />
                  <span className="font-bold">AUTOSAVE OFF</span>
                </button>
                <button
                  onClick={handleBackup}
                  className="flex items-center gap-1 px-2 py-1 bg-[#151517] border border-[#222] hover:border-[#c2a472] rounded text-[10px] font-mono text-zinc-300 hover:text-white cursor-pointer shadow-xs transition-colors"
                  title="Manual Backup: Click before exiting to save your workspace JSON"
                >
                  <HardDriveDownload className="w-3.5 h-3.5 text-[#c2a472]" />
                  <span className="font-bold hidden xl:inline">BACKUP</span>
                </button>
              </div>
            )}

            <button
              onClick={() => {
                if (isLeftSidebarCollapsed) setIsLeftSidebarCollapsed(false);
              }}
              className="flex items-center gap-1.5 px-2.5 py-1 bg-[#151517] border border-[#222] hover:border-[#c2a472]/50 rounded text-[10px] font-mono text-zinc-300 hover:text-white transition-colors cursor-pointer shadow-sm"
              title="Configure API Keys (OpenRouter, Thinking Machines, etc.)"
            >
              <Key className="w-3.5 h-3.5 text-[#c2a472]" />
              <span className="font-bold">API KEY</span>
              <span className={`w-1.5 h-1.5 rounded-full ${apiConfig.hasTokenEnv || apiConfig.clientToken || apiConfig.openRouterKey || apiConfig.tinkerKey ? 'bg-[#c2a472]' : 'bg-red-500 animate-pulse'}`} />
            </button>

            <span className="flex items-center gap-1.5 px-2.5 py-1 bg-[#151517] border border-[#222] rounded-sm" title={`Inference Engine ID: ${activeSpace.model || 'None'}`}>
              <Cpu className="w-3 text-[#c2a472]" style={{ height: '12px' }} />
              <span>ACTIVE MODEL: <span className="text-[#c2a472] font-semibold">{(activeSpace.model || '').split('/').pop() || activeSpace.model || 'None'}</span></span>
            </span>

            <span className="flex items-center gap-1.5 px-2.5 py-1 bg-[#151517] border border-[#222] rounded-sm">
              <Sparkles className="w-3 text-[#c2a472]" style={{ height: '12px' }} />
              <span>PERSONA: <span className="text-[#c2a472] font-semibold">
                {DEFAULT_PERSONAS.find(p => p.id === activeSpace.systemPromptPresetId)?.name || 'Custom'}
              </span></span>
            </span>

            <button
              onClick={() => setIsRightSidebarCollapsed(!isRightSidebarCollapsed)}
              className="p-1.5 rounded bg-[#101011] hover:bg-[#151517] border border-[#222] text-zinc-400 hover:text-[#c2a472] transition-colors cursor-pointer flex items-center justify-center shadow-sm ml-1"
              title={isRightSidebarCollapsed ? "Expand Control Panel" : "Collapse Control Panel"}
            >
              {isRightSidebarCollapsed ? <PanelRightOpen className="w-4 h-4" /> : <PanelRightClose className="w-4 h-4" />}
            </button>
          </div>
        </div>

        {/* SETTINGS TOOLBAR (TOGGLEABLE) */}
        {showChatSettings && !isMobileScreen && (
          <ChatSettingsToolbar
            settings={chatAppearance}
            onUpdateSettings={handleUpdateChatAppearance}
            onResetSettings={handleResetChatAppearance}
            leftSidebarWidth={leftSidebarWidth}
            rightSidebarWidth={rightSidebarWidth}
            onUpdateLeftSidebarWidth={setLeftSidebarWidth}
            onUpdateRightSidebarWidth={setRightSidebarWidth}
            onResetSidebars={handleResetSidebarWidths}
            onClose={() => setShowChatSettings(false)}
          />
        )}

        {/* ERROR BOXES */}
        {errorMessage && (
          <div className="bg-red-950/25 border-b border-red-900/60 p-3.5 flex items-start gap-2.5 text-zinc-300 animate-slide-down shrink-0">
            <AlertCircle className="w-4 h-4 text-red-500 flex-shrink-0 mt-0.5" />
            <div className="flex-1 font-mono text-[11px]">
              <div className="font-black text-red-400 text-xs">INFERENCE ERROR</div>
              <div>{errorMessage}</div>
            </div>
            <button onClick={() => setErrorMessage(null)} className="text-zinc-600 hover:text-zinc-300">
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        )}

        {/* LOG PANEL SCREEN */}
        <div
          ref={chatLogRef}
          onCopy={handleCopy}
          style={{
            ['--chat-font-family' as any]: getFontFamilyCss(effectiveChatAppearance.fontFamily),
            ['--chat-font-size' as any]: `${effectiveChatAppearance.fontSize}px`,
            ['--chat-line-height' as any]: effectiveChatAppearance.lineHeight,
          }}
          className="mobile-chat-log flex-1 min-w-0 max-w-full overflow-y-auto overflow-x-hidden px-4 md:px-6 py-6 relative select-text bg-[#0d0d0d]"
        >
          <div className={`${chatContainerWidthClass} min-h-full flex flex-col space-y-6 mobile-chat-messages`}>
            {isMobileScreen && firstVisibleMessageIndex > 0 && (
              <button
                type="button"
                onClick={showEarlierMessages}
                className="block mx-auto px-4 py-2 rounded border border-[#333] text-[#c2a472] text-sm font-mono"
              >
                Show earlier messages ({firstVisibleMessageIndex} remaining)
              </button>
            )}
            {activeThread?.messages.length === 0 ? (
              <div className="mobile-chat-empty flex-1 min-h-[50vh] flex flex-col items-center justify-center text-zinc-500 font-mono italic p-6 text-center">
                <ModelAvatar id={activeSpace.model} name={filteredModelsList.find(model => model.id === activeSpace.model)?.name || activeSpace.model.split('/').pop() || 'Model'} size="large" />
                <strong>{filteredModelsList.find(model => model.id === activeSpace.model)?.name.replace(/\s*\([^)]*\)/g, '') || activeSpace.model.split('/').pop()}</strong>
                <span>Start a conversation</span>
              </div>
            ) : (
              visibleMessages.map((msg, visibleIndex) => {
                const index = firstVisibleMessageIndex + visibleIndex;
                const chunk = chunkByLastMessageId.get(msg.id);
                return (
                  <ChatMessageItem
                    key={msg.id}
                    msg={msg}
                    index={index}
                    isLast={index === activeThread.messages.length - 1}
                    isStreaming={isStreaming}
                    activeModel={activeSpace.model || "openai/gpt-4o"}
                    isEditing={editingMessageId === msg.id}
                    editingMessageText={editingMessageText}
                    editingMessageImages={editingMessageImages}
                    editingMessageAudios={editingMessageAudios}
                    editingMessageAudioResponse={editingMessageAudioResponse}
                    copiedFormattedMsgId={copiedFormattedMsgId}
                    copiedMarkdownMsgId={copiedMarkdownMsgId}
                    inspectMessageId={inspectMessageId}
                    resolvedPromptStack={inspectMessageId === msg.id ? resolvePromptStackForMessage(msg, index) : undefined}
                    isCompactifying={isCompactifying}
                    isCompactifyingMsgId={isCompactifyingMsgId}
                    compactChunk={chunk}
                    fontSettings={effectiveChatAppearance}
                    onSetEditingMessage={handleSetEditingMessage}
                    onCancelEditing={handleCancelEditing}
                    onSaveEditedMessage={handleSaveEditedMessage}
                    onEditingTextChange={handleEditingTextChange}
                    onRemoveEditingImage={handleRemoveEditingImage}
                    onAddEditingImages={handleAddEditingImages}
                    onRemoveEditingAudio={handleRemoveEditingAudio}
                    onRemoveEditingAudioResponse={handleRemoveEditingAudioResponse}
                    onAddEditingAudios={handleAddEditingAudios}
                    onDeleteMessageAudio={handleDeleteMessageAudio}
                    onDeleteMessageAudioResponse={handleDeleteMessageAudioResponse}
                    onPasteImage={handlePasteEditImage}
                    onToggleInspect={handleToggleInspect}
                    onCopyFormatted={handleCopyFormatted}
                    onCopyMarkdown={handleCopyMarkdown}
                    onDeleteMessage={handleDeleteMessage}
                    onRegenerate={handleRegenerate}
                    onCompactify={handleCompactify}
                    onDeleteCompactChunk={handleDeleteCompactChunk}
                    onViewChunkSummary={handleViewChunkSummary}
                    onSwitchBranch={handleSwitchMessageBranch}
                  />
                );
              })
            )}
            <div ref={chatEndRef} />
          </div>
        </div>

        {/* INPUT AND ACCORDION COMPILER DOCK */}
        <ChatInputDock
          conversationId={`${activeSpace.id}:${activeThread?.id}`}
          isActive={!isMobileScreen || mobileTab==='chat'}
          onStartCall={isRealtimeModel(activeSpace.model) ? startLiveCall : undefined}
          onSendMessage={sendMessageFromDock}
          onDraftChange={handleDraftChange}
          isMobileScreen={isMobileScreen}
          isStreaming={isStreaming}
          onClearMessages={clearMessagesFromDock}
          hasMessages={(activeThread?.messages.length || 0) > 1}
          activePromptStackCount={activePromptStack.filter(l => l.active).length}
          currentTotalCharacters={currentTotalCharacters}
          externalInputText={externalInputText}
          onClearExternalInput={handleClearExternalInput}
          setErrorMessage={setErrorMessage}
        />
      </div>

      {(mobileTab === 'inbox' || mobileTab === 'models' || mobileTab === 'tools') && <MobileMessenger
        tab={mobileTab}
        spaces={spaces}
        models={filteredModelsList}
        activeSpaceId={activeSpaceId}
        onTabChange={setMobileTab}
        onOpenThread={openMobileThread}
        onStartModel={startMobileModelChat}
        onOpenTool={setMobileTab}
        onOpenNavigator={() => { setMobileSettingsStartPage('home'); setMobileSidebarOpen(true); }}
        onOpenSettings={() => { setMobileSettingsStartPage('appearance'); setMobileSidebarOpen(true); }}
      />}

      {/* MOBILE UTILITIES PANEL SCREEN */}
      {(mobileTab === 'prompt' || mobileTab === 'notes' || mobileTab === 'memories' || mobileTab === 'drive') && (
        <div className="lg:hidden flex-1 flex flex-col bg-[#0c0c0d] overflow-hidden h-full">
          {/* Utility View Header */}
          <div className="flex items-center justify-between px-3.5 py-2.5 border-b border-[#1a1a1c] bg-[#101012] shrink-0">
            <button
              onClick={() => setMobileTab('tools')}
              className="flex items-center gap-1.5 text-[10px] font-mono font-bold text-[#c2a472] hover:text-[#d3b684] bg-[#18181b] border border-[#27272a] px-2.5 py-1 rounded active:scale-95 transition-all cursor-pointer"
            >
              <ArrowRight className="w-3.5 h-3.5 rotate-180" />
              <span>BACK TO TOOLS</span>
            </button>

            <span className="text-[10px] font-mono font-bold text-zinc-300 uppercase tracking-wider">
              {mobileTab === 'prompt' && '⚡ PROMPT STACKS'}
              {mobileTab === 'notes' && '📓 WORKSPACE NOTES'}
              {mobileTab === 'memories' && '🧠 MEMORY BANK'}
              {mobileTab === 'drive' && '📁 GOOGLE DRIVE'}
            </span>
          </div>

          {/* Utility Content */}
          <div className="flex-1 p-3 overflow-y-auto">
            {mobileTab === 'prompt' && (
              <PromptStackTransp
                layers={activePromptStack}
                onToggleLayer={(idx) => {
                  const targetType = activePromptStack[idx]?.type;
                  if (targetType) {
                    setDisabledLayerTypes(prev =>
                      prev.includes(targetType)
                        ? prev.filter(t => t !== targetType)
                        : [...prev, targetType]
                    );
                  }
                }}
                onEditLayerContent={handleEditLayerContent}
                totalCharacters={currentTotalCharacters}
                modelName={activeSpace.model}
                temperature={activeSpace.temperature}
                top_p={activeSpace.top_p}
              />
            )}

            {mobileTab === 'notes' && (
              <ActiveNotes
                notes={activeSpace.notes}
                onUpdateNotes={(newNotes) => {
                  setSpaces(prev => prev.map(s => s.id === activeSpaceId ? { ...s, notes: newNotes } : s));
                }}
                spaceName={activeSpace.name}
              />
            )}

            {mobileTab === 'memories' && (
              <MemoryPanel
                memories={memories}
                onAddMemory={handleAddMemory}
                onDeleteMemory={handleDeleteMemory}
                onTogglePin={handleToggleMemoryPin}
                onToggleActive={handleToggleMemoryPin}
                onTurnAllOn={handleTurnAllMemoriesOn}
                onTurnAllOff={handleTurnAllMemoriesOff}
                onUpdateMemory={handleUpdateMemory}
                activeMemoryIds={activeMemoryIds}
                activeModel={activeSpace.model || "openai/gpt-4o"}
                clientToken={apiConfig.clientToken || ""}
                onClearAllImages={handleClearAllStoredImages}
                storedImagesCount={storedImagesCount}
              />
            )}

            {mobileTab === 'drive' && (
              <GoogleDrivePanel
                activeSpaceName={activeSpace.name}
                driveToken={driveToken}
                onAuthTokenChange={setDriveToken}
                onImportNotes={(text) => {
                  setSpaces(prev => prev.map(s => s.id === activeSpaceId ? { ...s, notes: text } : s));
                }}
                onImportMemory={(title, content) => {
                  handleAddMemory(title, content, ['g-drive-import'], 3);
                }}
                onImportChatInput={(text) => {
                  setExternalInputText(text);
                }}
                currentChatLog={
                  activeThread?.messages
                    ? activeThread.messages
                        .map((m) => `### ${m.role === 'user' ? 'User' : 'Assistant'}\n\n${m.content}`)
                        .join('\n\n')
                    : ''
                }
                backupStatus={backupStatus}
                onTriggerBackupNow={executeGoogleDriveBackup}
                onRestorePlayground={handleRestorePlayground}
              />
            )}
          </div>
        </div>
      )}

      {mobileTab !== 'chat' && <nav className="mobile-main-nav lg:hidden mobile-safe-bottom" aria-label="Mobile navigation">
        <button className={mobileTab === 'inbox' ? 'active' : ''} onClick={() => setMobileTab('inbox')} aria-current={mobileTab === 'inbox' ? 'page' : undefined}><MessageSquare size={24} /><span>Chats</span></button>
        <button className={mobileTab === 'models' ? 'active' : ''} onClick={() => setMobileTab('models')} aria-current={mobileTab === 'models' ? 'page' : undefined}><Cpu size={24} /><span>Models</span></button>
        <button className={mobileTab === 'tools' || ['prompt', 'notes', 'memories', 'drive'].includes(mobileTab) ? 'active' : ''} onClick={() => setMobileTab('tools')} aria-current={mobileTab === 'tools' ? 'page' : undefined}><Menu size={24} /><span>Tools</span></button>
      </nav>}

      {/* --- RIGHT UTILITIES CONSOLES DRAWERS (DESKTOP) --- */}
      {!isMobileScreen && !isRightSidebarCollapsed && (
        <div
          className="hidden lg:flex flex-shrink-0 bg-[#0c0c0d] flex-col h-full border-l border-[#1a1a1c] relative"
          style={{ width: `${rightSidebarWidth}px` }}
        >
          <ResizeDivider
            side="right"
            onResize={handleResizeRightSidebar}
            onDoubleClick={() => setRightSidebarWidth(340)}
            title="Drag to resize Utilities Console (double-click to reset to 340px)"
          />
        
        {/* TAB NAVIGATION ROW */}
        <div className="flex border-b border-[#1a1a1c] text-[10px] font-bold bg-[#0c0c0d] select-none w-full text-center font-sans tracking-wide">
          <button
            onClick={() => setActiveRightTab('prompt')}
            className={`flex-1 py-3.5 border-b-2 transition-all cursor-pointer ${
              activeRightTab === 'prompt'
                ? 'border-[#c2a472] text-[#c2a472] bg-[#0a0a0b] font-bold'
                : 'border-transparent text-zinc-550 hover:text-zinc-300'
            }`}
          >
            STREAMS
          </button>
          
          <button
            onClick={() => setActiveRightTab('notes')}
            className={`flex-1 py-3.5 border-b-2 transition-all cursor-pointer ${
              activeRightTab === 'notes'
                ? 'border-[#c2a472] text-[#c2a472] bg-[#0a0a0b] font-bold'
                : 'border-transparent text-zinc-550 hover:text-zinc-300'
            }`}
          >
            NOTEBOOK
          </button>

          <button
            onClick={() => setActiveRightTab('memories')}
            className={`flex-1 py-3.5 border-b-2 transition-all cursor-pointer ${
              activeRightTab === 'memories'
                ? 'border-[#c2a472] text-[#c2a472] bg-[#0a0a0b] font-bold'
                : 'border-transparent text-zinc-550 hover:text-zinc-300'
            }`}
          >
            MEMORIES
          </button>

          <button
            onClick={() => setActiveRightTab('drive')}
            className={`flex-1 py-3.5 border-b-2 transition-all cursor-pointer ${
              activeRightTab === 'drive'
                ? 'border-[#c2a472] text-[#c2a472] bg-[#0a0a0b] font-bold'
                : 'border-transparent text-zinc-550 hover:text-zinc-300'
            }`}
          >
            DRIVE
          </button>
        </div>

        {/* TAB SCREENS PANEL */}
        <div className="flex-1 min-h-0 p-3.5 overflow-hidden flex flex-col h-full">
          {activeRightTab === 'prompt' && (
            <PromptStackTransp
              layers={activePromptStack}
              onToggleLayer={(idx) => {
                const targetType = activePromptStack[idx]?.type;
                if (targetType) {
                  setDisabledLayerTypes(prev =>
                    prev.includes(targetType)
                      ? prev.filter(t => t !== targetType)
                      : [...prev, targetType]
                  );
                }
              }}
              onEditLayerContent={handleEditLayerContent}
              totalCharacters={currentTotalCharacters}
              modelName={activeSpace.model}
              temperature={activeSpace.temperature}
              top_p={activeSpace.top_p}
            />
          )}

          {activeRightTab === 'notes' && (
            <ActiveNotes
              notes={activeSpace.notes}
              onUpdateNotes={(newNotes) => {
                setSpaces(prev => prev.map(s => s.id === activeSpaceId ? { ...s, notes: newNotes } : s));
              }}
              spaceName={activeSpace.name}
            />
          )}

          {activeRightTab === 'memories' && (
            <MemoryPanel
              memories={memories}
              onAddMemory={handleAddMemory}
              onDeleteMemory={handleDeleteMemory}
              onTogglePin={handleToggleMemoryPin}
              onToggleActive={handleToggleMemoryPin}
              onTurnAllOn={handleTurnAllMemoriesOn}
              onTurnAllOff={handleTurnAllMemoriesOff}
              onUpdateMemory={handleUpdateMemory}
              activeMemoryIds={activeMemoryIds}
              activeModel={activeSpace.model || "openai/gpt-4o"}
              clientToken={apiConfig.clientToken || ""}
              onClearAllImages={handleClearAllStoredImages}
              storedImagesCount={storedImagesCount}
            />
          )}

          {activeRightTab === 'drive' && (
            <GoogleDrivePanel
              activeSpaceName={activeSpace.name}
              driveToken={driveToken}
              onAuthTokenChange={setDriveToken}
              onImportNotes={(text) => {
                setSpaces(prev => prev.map(s => s.id === activeSpaceId ? { ...s, notes: text } : s));
              }}
              onImportMemory={(title, content) => {
                handleAddMemory(title, content, ['g-drive-import'], 3);
              }}
              onImportChatInput={(text) => {
                setExternalInputText(text);
              }}
              currentChatLog={
                activeThread?.messages
                  ? activeThread.messages
                      .map((m) => `### ${m.role === 'user' ? 'User' : 'Assistant'}\n\n${m.content}`)
                      .join('\n\n')
                  : ''
              }
              backupStatus={backupStatus}
              onTriggerBackupNow={executeGoogleDriveBackup}
              onRestorePlayground={handleRestorePlayground}
            />
          )}
        </div>

        {/* FOOTER SYSTEM READINGS */}
        <div className="p-3 border-t border-[#1a1a1c] bg-[#0c0c0d] text-[9px] text-zinc-550 flex justify-between items-center font-sans tracking-wide select-none">
          <span>CONSOLE LEVEL: PLAYGROUND INTEL</span>
          <span className="text-[#c2a472] font-semibold flex items-center gap-1.5">
            <span>STABLE SIGNAL</span>
            <span className="w-1.5 h-1.5 rounded-full bg-[#c2a472] shadow-[0_0_6px_#c2a472]" />
          </span>
        </div>

      </div>
      )}

      {/* COMPACTIFIED SUMMARIES INSPECTOR MODAL */}
      {showCompactSummariesModal && activeThread && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 animate-fade-in">
          <div className="bg-[#0e1013] border border-cyan-900/60 rounded-lg max-w-3xl w-full max-h-[85vh] flex flex-col shadow-2xl overflow-hidden">
            {/* Modal Header */}
            <div className="px-4 py-3 bg-[#080d10] border-b border-cyan-900/50 flex items-center justify-between shrink-0">
              <div className="flex items-center gap-2">
                <Shrink className="w-4 h-4 text-[#c2a472]" />
                <span className="text-xs font-mono font-bold text-cyan-300 uppercase tracking-wider">
                  COMPACTIFIED HISTORY SUMMARIES
                </span>
                <span className="text-[10px] font-mono text-zinc-500">
                  ({activeThread.compactedChunks?.length || 0} chunk(s))
                </span>
              </div>
              <button
                onClick={() => {
                  setShowCompactSummariesModal(false);
                  setSelectedChunkForModal(null);
                }}
                className="text-zinc-400 hover:text-white transition-colors text-xs font-mono font-bold px-2.5 py-1 rounded bg-zinc-900 border border-zinc-800 cursor-pointer"
              >
                ✕ CLOSE
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-4 overflow-y-auto flex-1 space-y-4 custom-scrollbar">
              {(!activeThread.compactedChunks || activeThread.compactedChunks.length === 0) ? (
                <div className="text-center py-12 text-zinc-500 font-mono text-xs">
                  No compactified history chunks found for this thread.
                </div>
              ) : (
                activeThread.compactedChunks.map((chunk, idx) => {
                  const targetMsg = activeThread.messages.find(m => m.id === chunk.lastMsgId);
                  return (
                    <div key={chunk.id} className="bg-[#09151c] border border-cyan-900/40 rounded p-3.5 space-y-2.5">
                      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-cyan-950 pb-2">
                        <div className="flex items-center gap-2 text-[10px] font-mono font-bold text-[#c2a472]">
                          <span>CHUNK #{idx + 1}</span>
                          <span className="text-zinc-600">•</span>
                          <span className="text-zinc-400">{new Date(chunk.timestamp).toLocaleString()}</span>
                        </div>
                        <div className="flex items-center gap-2 text-[10px] font-mono text-cyan-400">
                          <span>
                            ~{chunk.originalTokensEst || 0} tokens → ~{chunk.summaryTokensEst || 0} tokens
                          </span>
                          <button
                            onClick={() => handleDeleteCompactChunk(chunk.id)}
                            className="p-1 text-red-400 hover:text-red-300 hover:bg-red-950/40 rounded transition-colors cursor-pointer"
                            title="Delete this compactification chunk"
                          >
                            <Trash className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => {
                              setShowCompactSummariesModal(false);
                              handleCompactify(chunk.lastMsgId, true);
                            }}
                            disabled={isCompactifying}
                            className="p-1 text-[#c2a472] hover:text-amber-300 hover:bg-amber-950/40 rounded transition-colors cursor-pointer disabled:opacity-50"
                            title="Re-compactify history up to this checkpoint"
                          >
                            <RotateCw className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>

                      {targetMsg && (
                        <div className="text-[9px] font-mono text-zinc-400 bg-black/40 p-2 rounded border border-zinc-900 truncate">
                          <span className="text-zinc-500 font-bold">CHECKPOINT MESSAGE: </span>
                          <span>{targetMsg.content.slice(0, 140)}...</span>
                        </div>
                      )}

                      <div className="space-y-1">
                        <div className="text-[9px] font-mono font-bold text-zinc-400 uppercase tracking-wider">
                          GENERATED SUMMARY CONTENT:
                        </div>
                        <pre className="text-[10px] font-mono text-cyan-100 bg-[#050b0e] p-3 rounded border border-cyan-950 whitespace-pre-wrap leading-relaxed select-text max-h-64 overflow-y-auto custom-scrollbar">
                          {chunk.summary}
                        </pre>
                      </div>
                    </div>
                  );
                })
              )}
            </div>

            {/* Modal Footer */}
            {activeThread.compactedChunks && activeThread.compactedChunks.length > 0 && (
              <div className="px-4 py-2.5 bg-[#080d10] border-t border-cyan-900/50 flex items-center justify-between shrink-0">
                <button
                  onClick={() => {
                    handleClearAllCompactChunks();
                    setShowCompactSummariesModal(false);
                  }}
                  className="px-3 py-1 text-[10px] font-mono font-bold text-red-400 hover:text-red-300 bg-red-950/30 hover:bg-red-900/40 border border-red-900/60 rounded flex items-center gap-1 transition-colors cursor-pointer"
                >
                  <Trash className="w-3 h-3" />
                  <span>CLEAR ALL SUMMARIES</span>
                </button>

                <div className="text-[10px] font-mono text-zinc-500">
                  Model used for compactification: <span className="text-[#c2a472]">{activeSpace.model || 'openai/gpt-4o'}</span>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* GOOGLE DRIVE AUTOSAVE & SUDDEN LOGOUT MODAL */}
      <GoogleDriveAuthModal
        isOpen={showDriveAuthModal}
        isSuddenLogout={isSuddenLogout}
        isSigningIn={isSigningInDrive}
        signInError={driveSignInError}
        onSignIn={handleModalGoogleSignIn}
        onChooseManualBackup={handleConfirmManualBackup}
      />

    </div>
  );
}
