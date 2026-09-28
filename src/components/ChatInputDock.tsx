import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Paperclip, Mic, Phone, Volume2, Send, Trash, X, FileText } from 'lucide-react';
import { VoiceRecorder } from './VoiceRecorder';
import { audioToWav } from '../utils/voice';

interface AttachedAudio {
  id: string;
  name: string;
  data: string;
  format: string;
  num_frames?: number;
  sample_rate?: number;
}

interface ChatInputDockProps {
  onSendMessage: (text: string, images: string[], audios: AttachedAudio[]) => void;
  onDraftChange?: (text: string, images: string[]) => void;
  isStreaming: boolean;
  onClearMessages?: () => void;
  hasMessages: boolean;
  activePromptStackCount: number;
  currentTotalCharacters: number;
  externalInputText?: string;
  onClearExternalInput?: () => void;
  setErrorMessage: (msg: string | null) => void;
  isMobileScreen: boolean;
  onStartCall?: () => void;
  conversationId: string;
  isActive: boolean;
}

export const ChatInputDock = React.memo(function ChatInputDock({
  onSendMessage,
  onDraftChange,
  isStreaming,
  onClearMessages,
  hasMessages,
  activePromptStackCount,
  currentTotalCharacters,
  externalInputText,
  onClearExternalInput,
  setErrorMessage,
  isMobileScreen,
  onStartCall, conversationId, isActive,
}: ChatInputDockProps) {
  const [text, setText] = useState('');
  const [attachedImages, setAttachedImages] = useState<string[]>([]);
  const [attachedAudios, setAttachedAudios] = useState<AttachedAudio[]>([]);

  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [recording, setRecording] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [documents, setDocuments] = useState<{name:string;content:string}[]>([]);
  const attachmentGeneration = useRef(0);
  useEffect(() => {
    attachmentGeneration.current++;
    setRecording(false); setProcessing(false); setAttachedImages([]); setAttachedAudios([]); setDocuments([]); setText('');
  }, [conversationId]);
  useEffect(() => { if (!isActive) setRecording(false); }, [isActive]);


  // Sync external text input (e.g. from Google Drive import)
  useEffect(() => {
    if (externalInputText) {
      setText(prev => (prev ? `${prev}\n${externalInputText}` : externalInputText));
      onClearExternalInput?.();
    }
  }, [externalInputText, onClearExternalInput]);

  // Debounced notification to parent for prompt stack & token counter
  useEffect(() => {
    const timer = setTimeout(() => {
      onDraftChange?.(text, attachedImages);
    }, isMobileScreen ? 800 : 300);
    return () => clearTimeout(timer);
  }, [text, attachedImages, onDraftChange, isMobileScreen]);

  // Auto-resize textarea locally without triggering parent re-renders
  useEffect(() => {
    const el = textareaRef.current;
    if (el) {
      el.style.height = 'auto';
      const scrollHeight = el.scrollHeight;
      el.style.height = `${Math.min(scrollHeight, 160)}px`;
    }
  }, [text]);

  const handleTextChange = useCallback((e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setText(e.target.value);
  }, []);

  const handleSend = useCallback(() => {
    if ((!text.trim() && attachedImages.length === 0 && attachedAudios.length === 0 && documents.length === 0) || isStreaming || recording || processing) {
      return;
    }
    const textToSend = [text, ...documents.map(doc => `Attached file: ${doc.name}\n\n${doc.content}`)].filter(Boolean).join('\n\n');
    const imagesToSend = [...attachedImages];
    const audiosToSend = [...attachedAudios];

    // Clear local state immediately
    setText('');
    setAttachedImages([]);
    setAttachedAudios([]);
    setDocuments([]);

    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
    }

    onSendMessage(textToSend, imagesToSend, audiosToSend);
  }, [text, attachedImages, attachedAudios, documents, recording, processing, isStreaming, onSendMessage]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      handleSend();
    }
  }, [handleSend]);

  const processImageFile = useCallback(async (file: File) => {
    const generation = attachmentGeneration.current;
    const data = await new Promise<string>((resolve,reject)=>{
      const reader = new FileReader();reader.onload=()=>resolve(String(reader.result));reader.onerror=()=>reject(new Error(`Could not read ${file.name}.`));reader.readAsDataURL(file);
    });
    if(generation === attachmentGeneration.current) setAttachedImages(prev=>[...prev,data]);
  }, []);

  const processAudioFile = useCallback(async (file: File) => {
    const generation = attachmentGeneration.current;
    const wav = await audioToWav(file);
    if (generation !== attachmentGeneration.current) return;
    setAttachedAudios(prev => [...prev, {id:crypto.randomUUID(), name:file.name.replace(/\.[^.]+$/, '') + '.wav', ...wav}]);
  }, []);

  const handleFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files || []); event.target.value = '';
    const generation = attachmentGeneration.current;
    setProcessing(true); setErrorMessage(null);
    const errors: string[] = [];
    for (const file of files) {
      try {
        if (file.size > 25 * 1024 * 1024) throw new Error(`${file.name}: choose a file smaller than 25 MB.`);
        if (file.type.startsWith('image/')) await processImageFile(file);
        else if (file.type.startsWith('audio/') || /\.(mp3|wav|m4a|ogg|flac|webm|aac)$/i.test(file.name)) await processAudioFile(file);
        else if (file.type.startsWith('text/') || /\.(txt|md|csv|json|jsonl|xml|html?|css|[cm]?[jt]sx?|py|yml|yaml|log|sh|ps1|sql|rs|go|java|c|cpp|h|toml|ini)$/i.test(file.name)) {
          if (file.size > 1024 * 1024) throw new Error(`${file.name}: text attachments are limited to 1 MB.`);
          const content = await file.text();
          if (content.includes('\0')) throw new Error(`${file.name}: this is not a readable text file.`);
          if (generation === attachmentGeneration.current) setDocuments(prev => [...prev,{name:file.name,content}]);
        } else throw new Error(`${file.name}: supported files are images, audio, and text/code documents. Export PDF or Office documents as text first.`);
      } catch(error) { errors.push(error instanceof Error ? error.message : `Could not open ${file.name}.`); }
    }
    if (generation === attachmentGeneration.current) {setProcessing(false); if(errors.length) setErrorMessage(errors.join(' '));}
  };

  const handlePaste = useCallback((event: React.ClipboardEvent<HTMLTextAreaElement>) => {
    const images = Array.from(event.clipboardData?.items || []).filter(item=>item.type.startsWith('image/'));
    if(!images.length) return;
    event.preventDefault();
    const generation=attachmentGeneration.current;setProcessing(true);
    Promise.all(images.map(item=>item.getAsFile()).filter(Boolean).map(file=>processImageFile(file)))
      .catch(()=>setErrorMessage('Could not read the pasted image.'))
      .finally(()=>{if(generation===attachmentGeneration.current)setProcessing(false);});
  }, [processImageFile,setErrorMessage]);

  const handleRemoveImage = useCallback((idx: number) => {
    setAttachedImages(prev => prev.filter((_, i) => i !== idx));
  }, []);

  const handleRemoveAudio = useCallback((idx: number) => {
    setAttachedAudios(prev => prev.filter((_, i) => i !== idx));
  }, []);

  const canSend = (text.trim() || attachedImages.length > 0 || attachedAudios.length > 0 || documents.length > 0) && !isStreaming && !recording && !processing;

  return (
    <div className="mobile-compose p-2.5 sm:p-4 border-t border-zinc-850/80 bg-zinc-950 space-y-2.5 font-mono shrink-0 select-none">
      {recording && <VoiceRecorder onClip={processAudioFile} onClose={() => setRecording(false)} onError={setErrorMessage} />}
      {processing && <p className="attachment-note" role="status">Preparing attachments…</p>}
      {documents.length > 0 && <div className="document-drafts">{documents.map((doc,index) => <div key={index}><FileText size={20}/><span>{doc.name}<small>{doc.content.length.toLocaleString()} characters</small></span><button type="button" aria-label={`Remove ${doc.name}`} onClick={() => setDocuments(prev => prev.filter((_,i)=>i!==index))}><X size={18}/></button></div>)}</div>}
      {/* Images preview array draft */}
      {attachedImages.length > 0 && (
        <div className="flex gap-2 overflow-x-auto p-2 bg-zinc-900 border border-zinc-800 rounded animate-fade-in">
          {attachedImages.map((img, idx) => (
            <div key={idx} className="relative group flex-shrink-0">
              <img
                src={img}
                alt="Draft Ingested"
                referrerPolicy="no-referrer"
                className="w-16 h-16 rounded object-cover border border-zinc-700"
              />
              <button
                type="button"
                onClick={() => handleRemoveImage(idx)}
                className="absolute -top-1 right-0 rounded-full bg-red-650 hover:bg-red-500 p-1 cursor-pointer active-touch"
                title="Evict visual"
              >
                <X className="w-3.5 h-3.5 text-zinc-200" />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Audios preview array draft */}
      {attachedAudios.length > 0 && (
        <div className="flex flex-wrap gap-2 p-2 bg-zinc-900 border border-zinc-800 rounded animate-fade-in text-left">
          {attachedAudios.map((aud, idx) => (
            <div key={aud.id} className="relative group flex-shrink-0 bg-[#0c0c0d] border border-zinc-800 rounded px-2.5 py-1.5 flex items-center gap-2 max-w-xs animate-fade-in">
              <Volume2 className="w-4 h-4 text-blue-400" />
              <div className="flex-1 min-w-0 pr-4">
                <div className="text-xs text-zinc-300 font-bold truncate max-w-[200px]">{aud.name}</div>
                <div className="text-xs text-zinc-400">
                  {aud.format.toUpperCase()} · {Math.ceil((aud.num_frames || 0)/(aud.sample_rate || 24000))} seconds
                </div>
                <audio controls preload="none" src={`data:audio/wav;base64,${aud.data}`} aria-label={`Preview ${aud.name}`} className="voice-clip-preview" />
              </div>
              <button
                type="button"
                onClick={() => handleRemoveAudio(idx)}
                className="absolute top-1 right-1 rounded-full bg-red-650 hover:bg-red-500 p-1 cursor-pointer active-touch"
                title="Evict audio file"
              >
                <X className="w-3 h-3 text-zinc-200" />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* ACTIVE FORM */}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          handleSend();
        }}
        className="space-y-2"
      >
        <div className="mobile-compose-field flex flex-wrap sm:flex-nowrap items-center gap-1.5 bg-[#151517] border border-[#222] rounded p-2 focus-within:border-[#c2a472] transition-colors">
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="mobile-attach p-2 text-zinc-400 hover:text-[#c2a472] rounded hover:bg-zinc-800/40 active-touch transition-colors flex-shrink-0 cursor-pointer min-w-[36px] min-h-[36px] flex items-center justify-center"
            title="Attach files" aria-label="Attach files" disabled={recording || processing || isStreaming}
          >
            <Paperclip className="w-4 h-4" />
          </button>

          <button
            type="button"
            onClick={() => setRecording(value => !value)}
            className="mobile-attach p-2 text-zinc-400 hover:text-[#c2a472] rounded hover:bg-zinc-800/40 active-touch transition-colors flex-shrink-0 cursor-pointer min-w-[36px] min-h-[36px] flex items-center justify-center"
            title="Record a voice clip" aria-label="Record a voice clip" aria-expanded={recording} disabled={processing || isStreaming}
          >
            <Mic className="w-4 h-4" />
          </button>

          <input
            type="file"
            ref={fileInputRef}
            accept="image/*,audio/*,.txt,.md,.csv,.json,.jsonl,.xml,.html,.css,.js,.ts,.tsx,.jsx,.py,.yaml,.yml,.log,.sql,.sh,.ps1,.rs,.go,.java,.c,.cpp,.h,.toml,.ini"
            multiple
            className="hidden"
            onChange={handleFileChange}
          />

          {onStartCall && <button type="button" className="mobile-attach voice-call-button" onClick={onStartCall} disabled={recording || processing || isStreaming} title="Start live voice chat" aria-label="Start live voice chat"><Phone size={19}/></button>}

          <textarea
            ref={textareaRef}
            value={text}
            onChange={handleTextChange}
            onKeyDown={handleKeyDown}
            onPaste={handlePaste}
            placeholder="Send a message..."
            enterKeyHint="send"
            rows={1}
            className="mobile-compose-text order-first sm:order-none basis-full sm:basis-auto sm:flex-1 min-w-0 w-full bg-transparent text-zinc-200 text-base sm:text-sm focus:outline-none resize-none px-1 font-mono py-1.5 min-h-[44px] sm:min-h-[32px] max-h-[160px] overflow-y-auto custom-scrollbar"
          />

          <div className="mobile-compose-actions flex items-center gap-1 flex-shrink-0 ml-auto sm:ml-0">
            {hasMessages && onClearMessages && (
              <button
                type="button"
                onClick={onClearMessages}
                className="mobile-clear p-2 text-zinc-500 hover:text-red-400 rounded hover:bg-zinc-800/40 active-touch transition-colors cursor-pointer min-w-[36px] min-h-[36px] flex items-center justify-center"
                title="Purge thread log completely"
              >
                <Trash className="w-4 h-4" />
              </button>
            )}

            <button
              type="submit"
              disabled={!canSend}
              className={`mobile-send px-3 py-2 text-[11px] uppercase font-bold tracking-wider rounded transition-all focus:outline-none min-h-[38px] active-touch flex items-center justify-center ${
                canSend
                  ? 'bg-[#c2a472] text-black hover:bg-[#b09363] cursor-pointer shadow-[0_0_12px_rgba(194,164,114,0.2)]'
                  : 'bg-zinc-900 border border-[#222] text-zinc-600 cursor-not-allowed'
              }`}
              title="Fire payload"
            >
              <div className="flex items-center gap-1.5 font-sans">
                <span className="mobile-send-label">Send</span>
                <Send className="w-3.5 h-3.5" />
              </div>
            </button>
          </div>
        </div>
      </form>

      {/* Prompt Draft Ticker */}
      <div className="mobile-compose-ticker flex items-center justify-between text-[10px] text-zinc-500 select-none font-sans px-0.5">
        <div className="flex gap-2 sm:gap-4 flex-wrap">
          <span>STACKS: <span className="text-[#c2a472] font-semibold">{activePromptStackCount}</span></span>
          <span>CONTEXT: <span className="text-zinc-400 font-semibold">{currentTotalCharacters} chars</span></span>
        </div>
        <span className="font-sans leading-none italic text-zinc-600 text-[9px] hidden sm:inline">Protected workspace.</span>
      </div>
    </div>
  );
});
