import React, { useState } from 'react';
import { Memory } from '../types';
import { Plus, Trash, Pin, Search, Tag, Sparkles, Image, X, Database, Edit3, Check, EyeOff } from 'lucide-react';

interface MemoryPanelProps {
  memories: Memory[];
  onAddMemory: (
    title: string,
    content: string,
    tags: string[],
    importance: number,
    images?: string[],
    ocrText?: string,
    visualDescription?: string,
    userMeaning?: string
  ) => void;
  onDeleteMemory: (id: string) => void;
  onTogglePin: (id: string) => void;
  onToggleActive?: (id: string) => void;
  onTurnAllOn?: () => void;
  onTurnAllOff?: () => void;
  onUpdateMemory?: (id: string, updatedFields: Partial<Memory>) => void;
  activeMemoryIds: string[]; // which ones are currently actively injected
  activeModel: string;
  clientToken: string;
  onClearAllImages?: () => void;
  storedImagesCount?: number;
}

export const MemoryPanel: React.FC<MemoryPanelProps> = ({
  memories,
  onAddMemory,
  onDeleteMemory,
  onTogglePin,
  onToggleActive,
  onTurnAllOn,
  onTurnAllOff,
  onUpdateMemory,
  activeMemoryIds,
  activeModel,
  clientToken,
  onClearAllImages,
  storedImagesCount,
}) => {
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'off'>('all');
  const [showAddForm, setShowAddForm] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [newContent, setNewContent] = useState('');
  const [newTagsString, setNewTagsString] = useState('');
  const [newImportance, setNewImportance] = useState(3);
  const [attachedImages, setAttachedImages] = useState<string[]>([]);

  // Editing existing memory states
  const [editingMemoryId, setEditingMemoryId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState('');
  const [editContent, setEditContent] = useState('');
  const [editTagsString, setEditTagsString] = useState('');
  const [editImportance, setEditImportance] = useState(3);
  const [editOcrText, setEditOcrText] = useState('');
  const [editVisualDescription, setEditVisualDescription] = useState('');
  const [editUserMeaning, setEditUserMeaning] = useState('');

  // Visual cognitive enrichment states
  const [newOcrText, setNewOcrText] = useState('');
  const [newVisualDescription, setNewVisualDescription] = useState('');
  const [newUserMeaning, setNewUserMeaning] = useState('');
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analysisError, setAnalysisError] = useState<string | null>(null);

  const fileInputRef = React.useRef<HTMLInputElement>(null);

  const handleAnalyzeWithAI = async () => {
    if (attachedImages.length === 0) return;
    setIsAnalyzing(true);
    setAnalysisError(null);
    try {
      const contentList: any[] = [
        {
          type: "text",
          text: `You are a cognitive memory index assistant. Analyze the attached base64 image asset(s) and provide:
1. An OCR text transcription of any readable texts (e.g. diagrams, whiteboard sketches, screenshots, source codes, text documents). If no text is readable, write "None".
2. A very concise visual description of the layout, elements, graphs, styles, or concepts.
3. Suggested tags (comma-separated, up to 5).

Respond strictly in JSON format matching this schema:
{
  "ocrText": "raw text inside the image...",
  "visualDescription": "concise visual representation...",
  "suggestedTags": "tag1, tag2, tag3"
}`
        }
      ];

      attachedImages.forEach(img => {
        contentList.push({
          type: "image_url",
          image_url: { url: img }
        });
      });

      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': clientToken ? `Bearer ${clientToken}` : '',
        },
        body: JSON.stringify({
          messages: [{ role: 'user', content: contentList }],
          model: activeModel || "openai/gpt-4o",
          temperature: 0.8,
          top_p: 0.98,
          max_tokens: 4096,
          stream: false
        })
      });

      if (!response.ok) {
        throw new Error(`AI Engine error: ${response.statusText}`);
      }

      const resData = await response.json();
      const aiReply = resData.choices?.[0]?.message?.content || "";
      
      // Clean up markdown block indicators if any
      const cleanedJson = aiReply.replace(/```json/g, '').replace(/```/g, '').trim();
      const parsed = JSON.parse(cleanedJson);
      
      if (parsed.ocrText) {
        setNewOcrText(parsed.ocrText);
      }
      if (parsed.visualDescription) {
        setNewVisualDescription(parsed.visualDescription);
      }
      if (parsed.suggestedTags) {
        setNewTagsString(prev => {
          const current = prev.trim();
          return current ? `${current}, ${parsed.suggestedTags}` : parsed.suggestedTags;
        });
      }
    } catch (err: any) {
      console.error("Image analysis failure:", err);
      setAnalysisError(err?.message || "Failed to auto-generate image descriptors.");
    } finally {
      setIsAnalyzing(false);
    }
  };

  const handlePasteImage = (e: React.ClipboardEvent<HTMLTextAreaElement | HTMLInputElement>) => {
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
              setAttachedImages(prev => [...prev, base64Url]);
            }
          };
          reader.readAsDataURL(file);
        }
      }
    }

    if (hasImage) {
      e.preventDefault();
    }
  };

  const handleAdd = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTitle.trim() || !newContent.trim()) return;
    const tags = newTagsString
      .split(',')
      .map(t => t.trim().toLowerCase())
      .filter(t => t.length > 0);
    onAddMemory(
      newTitle, 
      newContent, 
      tags, 
      newImportance, 
      attachedImages,
      newOcrText,
      newVisualDescription,
      newUserMeaning
    );
    setNewTitle('');
    setNewContent('');
    setNewTagsString('');
    setNewImportance(3);
    setAttachedImages([]);
    setNewOcrText('');
    setNewVisualDescription('');
    setNewUserMeaning('');
    setShowAddForm(false);
  };

  const totalCount = memories.length;
  const activeCount = memories.filter(m => m.pinned && m.isActive !== false).length;
  const offCount = totalCount - activeCount;

  const filteredMemories = memories.filter(m => {
    const isEnabled = m.pinned && m.isActive !== false;
    if (statusFilter === 'active' && !isEnabled) return false;
    if (statusFilter === 'off' && isEnabled) return false;

    const q = (search || '').toLowerCase();
    const titleMatch = (m.title || '').toLowerCase().includes(q);
    const contentMatch = (m.content || '').toLowerCase().includes(q);
    const tagsMatch = Array.isArray(m.tags) && m.tags.some(t => typeof t === 'string' && t.toLowerCase().includes(q));
    return titleMatch || contentMatch || tagsMatch;
  });

  return (
    <div className="bg-transparent flex flex-col h-full min-h-0 font-mono text-xs text-zinc-400 text-left">
      <div className="flex items-center justify-between border-b border-[#1a1a1c] pb-3 mb-4">
        <div className="flex items-center gap-2">
          <Database className="w-4 h-4 text-[#c2a472] animate-pulse" />
          <span className="font-sans font-bold text-zinc-200 tracking-tight text-sm">PERSISTENT MEMORY BANK</span>
        </div>
        <div className="flex items-center gap-1.5">
          {onClearAllImages && (
            <button
              type="button"
              onClick={onClearAllImages}
              className="bg-[#151517] hover:bg-red-950/40 text-zinc-400 hover:text-red-400 border border-[#222] hover:border-red-900/50 transition-colors px-2 py-1 rounded-sm flex items-center gap-1 font-bold text-[9px] cursor-pointer"
              title="Clear all stored image attachments across all memories, spaces, and threads"
            >
              <Image className="w-3 h-3 text-[#c2a472]" />
              <span>CLEAR IMAGES</span>
            </button>
          )}
          <button
            onClick={() => setShowAddForm(!showAddForm)}
            className="bg-[#c2a472]/15 text-[#c2a472] border border-[#c2a472]/30 hover:bg-[#c2a472]/25 focus:outline-none transition-colors px-2.5 py-1 rounded-sm flex items-center gap-1 font-bold text-[10px] cursor-pointer"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>NEW MEM</span>
          </button>
        </div>
      </div>

      <p className="text-[11px] font-sans text-zinc-500 mb-3 leading-normal text-left font-normal">
        Memories store persistent rules, facts, and context. Only pinned memories are sent with conversations. Unpin a memory anytime to turn it off without deleting it.
      </p>

      {/* Searched Memory Input */}
      <div className="relative mb-2.5">
        <Search className="absolute left-2.5 top-2.5 w-3.5 h-3.5 text-zinc-650" />
        <input
          type="text"
          placeholder="Search memories by title, content, or tag..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full bg-[#0a0a0b] border border-[#222] rounded-sm pl-8 pr-3 py-2 text-zinc-300 focus:outline-none focus:border-[#c2a472]"
        />
      </div>

      {/* Filter Tabs & Bulk Controls */}
      <div className="flex items-center justify-between gap-2 mb-3 bg-[#0f0f11] p-1.5 rounded-sm border border-[#222]">
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => setStatusFilter('all')}
            className={`px-2 py-0.5 rounded text-[10px] font-bold transition-all cursor-pointer ${
              statusFilter === 'all'
                ? 'bg-zinc-800 text-zinc-100 shadow-sm'
                : 'text-zinc-500 hover:text-zinc-300'
            }`}
          >
            ALL ({totalCount})
          </button>
          <button
            type="button"
            onClick={() => setStatusFilter('active')}
            className={`px-2 py-0.5 rounded text-[10px] font-bold transition-all cursor-pointer flex items-center gap-1 ${
              statusFilter === 'active'
                ? 'bg-emerald-950/70 text-emerald-300 border border-emerald-800/60 shadow-sm'
                : 'text-zinc-500 hover:text-emerald-400'
            }`}
          >
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
            ACTIVE ({activeCount})
          </button>
          <button
            type="button"
            onClick={() => setStatusFilter('off')}
            className={`px-2 py-0.5 rounded text-[10px] font-bold transition-all cursor-pointer flex items-center gap-1 ${
              statusFilter === 'off'
                ? 'bg-zinc-800 text-zinc-200 border border-zinc-700 shadow-sm'
                : 'text-zinc-500 hover:text-zinc-300'
            }`}
          >
            <span className="w-1.5 h-1.5 rounded-full bg-zinc-600" />
            OFF ({offCount})
          </button>
        </div>

        <div className="flex items-center gap-1.5">
          {onTurnAllOff && activeCount > 0 && (
            <button
              type="button"
              onClick={onTurnAllOff}
              className="text-[9px] font-bold text-zinc-500 hover:text-red-400 px-1.5 py-0.5 rounded hover:bg-zinc-800 transition-colors cursor-pointer"
              title="Pause all memories without deleting them"
            >
              PAUSE ALL
            </button>
          )}
          {onTurnAllOn && offCount > 0 && (
            <button
              type="button"
              onClick={onTurnAllOn}
              className="text-[9px] font-bold text-[#c2a472] hover:text-[#e4ca9d] px-1.5 py-0.5 rounded hover:bg-[#c2a472]/15 transition-colors cursor-pointer"
              title="Activate all memories"
            >
              ENABLE ALL
            </button>
          )}
        </div>
      </div>

      {/* Add Memory Form */}
      {showAddForm && (
        <form onSubmit={handleAdd} className="bg-[#151517] border border-[#222] rounded-sm p-3.5 mb-4 space-y-3.5 text-left">
          <div>
            <label className="block text-[10px] text-zinc-500 font-bold mb-1">MEM TITLE *</label>
            <input
              type="text"
              required
              placeholder="e.g., Target Tech Stack / Custom Rules"
              value={newTitle}
              onChange={(e) => setNewTitle(e.target.value)}
              onPaste={handlePasteImage}
              className="w-full bg-[#0a0a0b] border border-[#222] rounded-sm px-2 py-1.5 text-zinc-300 focus:outline-none focus:border-[#c2a472]"
            />
          </div>
          <div>
            <label className="block text-[10px] text-zinc-500 font-bold mb-1">MEM CONTENT *</label>
            <textarea
              required
              rows={3}
              placeholder="Core ideas, project guidelines or guidelines you want remembered..."
              value={newContent}
              onChange={(e) => {
                setNewContent(e.target.value);
                e.target.style.height = 'auto';
                e.target.style.height = `${Math.min(e.target.scrollHeight, 160)}px`;
              }}
              ref={(el) => {
                if (el) {
                  el.style.height = 'auto';
                  el.style.height = `${Math.min(el.scrollHeight, 160)}px`;
                }
              }}
              onPaste={handlePasteImage}
              className="w-full bg-[#0a0a0b] border border-[#222] rounded-sm p-2 text-zinc-300 focus:outline-none focus:border-[#c2a472] resize-y font-mono text-[11px] max-h-[220px] overflow-y-auto"
            />
          </div>

          {/* Attached images preview within the form */}
          {attachedImages.length > 0 && (
            <div className="space-y-1.5">
              <label className="block text-[9px] text-zinc-500 font-bold uppercase">ATTACHED IMAGES ({attachedImages.length})</label>
              <div className="flex gap-2 overflow-x-auto pb-1 no-scrollbar">
                {attachedImages.map((img, i) => (
                  <div key={i} className="relative group flex-shrink-0">
                    <img
                      src={img}
                      alt="Attach media"
                      className="h-12 w-12 rounded-sm object-cover border border-[#222]"
                    />
                    <button
                      type="button"
                      onClick={() => setAttachedImages(prev => prev.filter((_, idx) => idx !== i))}
                      className="absolute -top-1 -right-1 rounded-full bg-red-650 hover:bg-red-500 p-0.5 cursor-pointer shadow-md transition-colors"
                      title="Remove image"
                    >
                      <X className="w-2.5 h-2.5 text-white" />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Attach Button */}
          <div>
            <input
              type="file"
              ref={fileInputRef}
              accept="image/*"
              multiple
              className="hidden"
              onChange={(e) => {
                const files = e.target.files;
                if (files) {
                  Array.from(files).forEach((file) => {
                    if (file.type.startsWith('image/')) {
                      const reader = new FileReader();
                      reader.onload = (evt) => {
                        if (evt.target?.result) {
                          setAttachedImages(prev => [...prev, evt.target!.result as string]);
                        }
                      };
                      reader.readAsDataURL(file);
                    }
                  });
                }
              }}
            />
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="w-full bg-[#0a0a0b] hover:bg-[#121213] border border-[#222] hover:border-zinc-700/80 rounded px-2.5 py-1.5 text-zinc-400 hover:text-[#c2a472] transition-colors flex items-center justify-center gap-1.5 text-[10px] font-bold cursor-pointer"
            >
              <Image className="w-3.5 h-3.5 text-[#c2a472]" />
              <span>UPLOAD OR PASTE IMAGES</span>
            </button>
          </div>

          {/* Visual Memory Enrichment Fields */}
          {attachedImages.length > 0 && (
            <div className="bg-[#0e0e10] p-3 rounded border border-[#222] space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-[10px] text-zinc-400 font-bold tracking-wider flex items-center gap-1.5">
                  <Sparkles className="w-3.5 h-3.5 text-[#c2a472] animate-pulse" />
                  VISUAL COGNITIVE DESCRIPTORS
                </span>
                <button
                  type="button"
                  disabled={isAnalyzing}
                  onClick={handleAnalyzeWithAI}
                  className="bg-[#c2a472]/10 border border-[#c2a472]/30 text-[#c2a472] hover:bg-[#c2a472]/20 hover:text-white px-2 py-1 rounded text-[9px] font-bold flex items-center gap-1 transition-colors disabled:opacity-40 select-none cursor-pointer"
                >
                  {isAnalyzing ? (
                    <>
                      <div className="w-2.5 h-2.5 rounded-full border border-t-transparent border-[#c2a472] animate-spin" />
                      <span>ANALYZING...</span>
                    </>
                  ) : (
                    <>
                      <Sparkles className="w-2.5 h-2.5" />
                      <span>AUTO-EXTRACT DESCRIPTORS</span>
                    </>
                  )}
                </button>
              </div>

              {analysisError && (
                <div className="text-red-400 text-[10px] font-mono leading-normal bg-red-950/20 border border-red-900/50 p-2 rounded">
                  {analysisError}
                </div>
              )}

              <div>
                <label className="block text-[9px] text-zinc-500 font-bold mb-1 uppercase">User Meaning / Caption (Meaning in this context)</label>
                <input
                  type="text"
                  placeholder="What is the significance or meaning of this image?"
                  value={newUserMeaning}
                  onChange={(e) => setNewUserMeaning(e.target.value)}
                  className="w-full bg-[#0a0a0b] border border-[#222] rounded-sm px-2 py-1.5 text-zinc-300 focus:outline-none focus:border-[#c2a472] font-mono text-[10px]"
                />
              </div>

              <div>
                <label className="block text-[9px] text-zinc-500 font-bold mb-1 uppercase">Visual Description (Layout, Styles, Drawing, Artifact details)</label>
                <textarea
                  rows={2}
                  placeholder="Describe the styling, formatting, or what is drawn inside..."
                  value={newVisualDescription}
                  onChange={(e) => {
                    setNewVisualDescription(e.target.value);
                    e.target.style.height = 'auto';
                    e.target.style.height = `${Math.min(e.target.scrollHeight, 140)}px`;
                  }}
                  ref={(el) => {
                    if (el) {
                      el.style.height = 'auto';
                      el.style.height = `${Math.min(el.scrollHeight, 140)}px`;
                    }
                  }}
                  className="w-full bg-[#0a0a0b] border border-[#222] rounded-sm p-2 text-zinc-300 focus:outline-none focus:border-[#c2a472] resize-y font-mono text-[10px] leading-normal max-h-[180px] overflow-y-auto"
                />
              </div>

              <div>
                <label className="block text-[9px] text-zinc-500 font-bold mb-1 uppercase">OCR Text Transcription (Readable alphanumeric elements)</label>
                <textarea
                  rows={2}
                  placeholder="Text contents written inside the visual image..."
                  value={newOcrText}
                  onChange={(e) => {
                    setNewOcrText(e.target.value);
                    e.target.style.height = 'auto';
                    e.target.style.height = `${Math.min(e.target.scrollHeight, 140)}px`;
                  }}
                  ref={(el) => {
                    if (el) {
                      el.style.height = 'auto';
                      el.style.height = `${Math.min(el.scrollHeight, 140)}px`;
                    }
                  }}
                  className="w-full bg-[#0a0a0b] border border-[#222] rounded-sm p-2 text-zinc-305 focus:outline-none focus:border-[#c2a472] resize-y font-mono text-[10px] leading-normal max-h-[180px] overflow-y-auto"
                />
              </div>
            </div>
          )}

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-[10px] text-zinc-500 font-bold mb-1 col-span-1">TAGS (COMMA SEPARATE)</label>
              <input
                type="text"
                placeholder="tech, model, static"
                 value={newTagsString}
                onChange={(e) => setNewTagsString(e.target.value)}
                className="w-full bg-[#0a0a0b] border border-[#222] rounded-sm px-2 py-1.5 text-zinc-300 focus:outline-none focus:border-[#c2a472]"
              />
            </div>
            <div>
              <label className="block text-[10px] text-zinc-500 font-bold mb-1 col-span-1">IMPORTANCE (1-5)</label>
              <select
                value={newImportance}
                onChange={(e) => setNewImportance(Number(e.target.value))}
                className="w-full bg-[#0a0a0b] border border-[#222] rounded px-2 py-1.5 text-zinc-350 focus:outline-none focus:border-[#c2a472]"
              >
                <option value={1}>1 - Low</option>
                <option value={2}>2 - Standard</option>
                <option value={3}>3 - Important</option>
                <option value={4}>4 - High</option>
                <option value={5}>5 - Mission Critical</option>
              </select>
            </div>
          </div>
          <div className="flex gap-2 justify-end pt-1">
            <button
              type="button"
              onClick={() => {
                setShowAddForm(false);
                setAttachedImages([]);
                setNewOcrText('');
                setNewVisualDescription('');
                setNewUserMeaning('');
              }}
              className="px-2.5 py-1 text-zinc-500 hover:text-zinc-200 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-3.5 py-1 rounded-sm bg-[#c2a472] hover:bg-[#b09363] text-black font-extrabold text-[10px] transition-all cursor-pointer"
            >
              COMMIT TO ENGINE
            </button>
          </div>
        </form>
      )}

      {/* Memories List */}
      <div className="flex-1 min-h-0 overflow-y-auto space-y-2.5 pr-2 custom-scrollbar">
        {filteredMemories.length === 0 ? (
          <div className="text-zinc-650 text-center py-8 italic font-mono">
            {memories.length === 0
              ? 'No memories stored yet. Click NEW MEM to add persistent knowledge.'
              : statusFilter === 'off'
              ? 'No memories are currently turned off.'
              : statusFilter === 'active'
              ? 'No active memories. Click the switch or pin on any memory to activate it.'
              : 'No memories match your search query.'}
          </div>
        ) : (
          filteredMemories.map(m => {
            const isEnabled = m.pinned && m.isActive !== false;
            return (
              <div
                key={m.id}
                className={`p-3 border rounded-sm transition-all text-left ${
                  !isEnabled
                    ? 'border-zinc-800/60 bg-[#0a0a0b]/40 opacity-70 hover:opacity-100 border-dashed'
                    : 'border-[#222] bg-[#0c0c0d]/60 hover:border-zinc-700'
                }`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2 min-w-0">
                    {/* On/Off Toggle Button */}
                    <button
                      type="button"
                      onClick={() => (onToggleActive ? onToggleActive(m.id) : onTogglePin(m.id))}
                      className={`flex items-center gap-1 px-2 py-0.5 rounded-full text-[9px] font-bold tracking-wider transition-all cursor-pointer select-none flex-shrink-0 border ${
                        isEnabled
                          ? 'bg-emerald-950/40 text-emerald-400 border-emerald-800/50 hover:bg-emerald-900/40'
                          : 'bg-zinc-900/80 text-zinc-500 border-zinc-800 hover:bg-zinc-800 hover:text-zinc-300'
                      }`}
                      title={isEnabled ? "Memory is ACTIVE. Click to turn OFF (pause without deleting)" : "Memory is OFF. Click to turn ON"}
                    >
                      <span className={`w-1.5 h-1.5 rounded-full ${isEnabled ? 'bg-emerald-400 shadow-[0_0_5px_rgba(52,211,153,0.8)]' : 'bg-zinc-600'}`} />
                      <span>{isEnabled ? 'ACTIVE' : 'OFF'}</span>
                    </button>

                    {/* Pin button */}
                    <button
                      type="button"
                      onClick={() => onTogglePin(m.id)}
                      className={`p-1 rounded transition-colors cursor-pointer flex-shrink-0 ${
                        isEnabled ? 'text-[#c2a472] hover:text-[#d3b684]' : 'text-zinc-650 hover:text-zinc-400'
                      }`}
                      title={isEnabled ? "Unpin memory (turns memory OFF)" : "Pin memory (turns memory ON)"}
                    >
                      <Pin className={`w-3.5 h-3.5 transition-transform ${isEnabled ? 'fill-[#c2a472] text-[#c2a472] rotate-45' : 'text-zinc-650'}`} />
                    </button>

                    <span className={`font-sans font-bold leading-tight text-[11px] truncate select-all ${
                      isEnabled ? 'text-zinc-200' : 'text-zinc-500'
                    }`}>
                      {m.title}
                    </span>
                  </div>
                  <div className="flex items-center gap-1 flex-shrink-0">
                    {onUpdateMemory && (
                      <button
                        onClick={() => {
                          if (editingMemoryId === m.id) {
                            setEditingMemoryId(null);
                          } else {
                            setEditingMemoryId(m.id);
                            setEditTitle(m.title);
                            setEditContent(m.content);
                            setEditTagsString(m.tags.join(', '));
                            setEditImportance(m.importance);
                            setEditOcrText(m.ocrText || '');
                            setEditVisualDescription(m.visualDescription || '');
                            setEditUserMeaning(m.userMeaning || '');
                          }
                        }}
                        className={`p-1 rounded hover:bg-[#151517] transition-colors cursor-pointer ${
                          editingMemoryId === m.id ? 'text-[#c2a472] bg-[#151517]' : 'text-zinc-550 hover:text-[#c2a472]'
                        }`}
                        title="Edit Memory Details"
                      >
                        <Edit3 className="w-3 h-3" />
                      </button>
                    )}
                    <button
                      onClick={() => onDeleteMemory(m.id)}
                      className="p-1 text-zinc-550 hover:text-red-400 rounded hover:bg-[#151517] transition-colors cursor-pointer"
                      title="Delete Memory completely"
                    >
                      <Trash className="w-3 h-3 text-zinc-600 hover:text-red-400" />
                    </button>
                  </div>
                </div>

                {/* If memory is turned off, show clear notice */}
                {!isEnabled && (
                  <div className="mt-1.5 px-2 py-1 bg-zinc-900/60 rounded border border-zinc-800 text-[10px] text-zinc-500 flex items-center justify-between">
                    <span className="italic flex items-center gap-1">
                      <EyeOff className="w-3 h-3 text-zinc-600 inline flex-shrink-0" />
                      Turned off &bull; Not sent in conversation context
                    </span>
                    <button
                      type="button"
                      onClick={() => (onToggleActive ? onToggleActive(m.id) : onTogglePin(m.id))}
                      className="text-[9px] text-[#c2a472] hover:text-[#e0c697] font-bold cursor-pointer ml-2 flex-shrink-0"
                    >
                      Turn On
                    </button>
                  </div>
                )}

                {editingMemoryId === m.id ? (
                  <div className="mt-2.5 pt-2 border-t border-zinc-800 space-y-2.5 animate-fade-in">
                    <div>
                      <label className="block text-[8px] text-zinc-500 font-bold uppercase mb-0.5">Title</label>
                      <input
                        type="text"
                        value={editTitle}
                        onChange={(e) => setEditTitle(e.target.value)}
                        className="w-full bg-[#0a0a0b] border border-[#222] rounded px-2 py-1 text-zinc-200 font-sans text-xs focus:outline-none focus:border-[#c2a472]"
                      />
                    </div>
                    <div>
                      <label className="block text-[8px] text-zinc-500 font-bold uppercase mb-0.5">Content</label>
                      <textarea
                        rows={3}
                        value={editContent}
                        onChange={(e) => setEditContent(e.target.value)}
                        className="w-full bg-[#0a0a0b] border border-[#222] rounded p-2 text-zinc-300 font-mono text-[10px] focus:outline-none focus:border-[#c2a472] resize-y max-h-[200px]"
                      />
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="block text-[8px] text-zinc-500 font-bold uppercase mb-0.5">Tags (comma-separated)</label>
                        <input
                          type="text"
                          value={editTagsString}
                          onChange={(e) => setEditTagsString(e.target.value)}
                          className="w-full bg-[#0a0a0b] border border-[#222] rounded px-2 py-1 text-zinc-300 font-mono text-[10px] focus:outline-none focus:border-[#c2a472]"
                        />
                      </div>
                      <div>
                        <label className="block text-[8px] text-zinc-500 font-bold uppercase mb-0.5">Importance (1-5)</label>
                        <select
                          value={editImportance}
                          onChange={(e) => setEditImportance(Number(e.target.value))}
                          className="w-full bg-[#0a0a0b] border border-[#222] rounded px-2 py-1 text-zinc-300 font-mono text-[10px] focus:outline-none focus:border-[#c2a472]"
                        >
                          <option value={1}>1 - Low</option>
                          <option value={2}>2 - Standard</option>
                          <option value={3}>3 - Important</option>
                          <option value={4}>4 - High</option>
                          <option value={5}>5 - Mission Critical</option>
                        </select>
                      </div>
                    </div>
                    <div className="flex justify-end gap-2 pt-1">
                      <button
                        type="button"
                        onClick={() => setEditingMemoryId(null)}
                        className="px-2.5 py-1 text-zinc-400 hover:text-zinc-200 bg-zinc-900 border border-zinc-800 rounded-sm text-[10px] font-bold cursor-pointer"
                      >
                        CANCEL
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          if (onUpdateMemory) {
                            const tags = editTagsString
                              .split(',')
                              .map(t => t.trim().toLowerCase())
                              .filter(t => t.length > 0);
                            onUpdateMemory(m.id, {
                              title: editTitle.trim() || m.title,
                              content: editContent.trim() || m.content,
                              tags: tags.length > 0 ? tags : m.tags,
                              importance: editImportance,
                              ocrText: editOcrText,
                              visualDescription: editVisualDescription,
                              userMeaning: editUserMeaning
                            });
                          }
                          setEditingMemoryId(null);
                        }}
                        className="px-3 py-1 bg-[#c2a472] hover:bg-[#b09363] text-black font-extrabold rounded-sm text-[10px] flex items-center gap-1 cursor-pointer"
                      >
                        <Check className="w-3 h-3 text-black stroke-[3]" />
                        <span>SAVE CHANGES</span>
                      </button>
                    </div>
                  </div>
                ) : (
                  <>

                <p className="mt-1.5 text-[11px] text-zinc-400 font-mono leading-normal select-text whitespace-pre-wrap">{m.content}</p>

                {/* Stored memory images with individual deletion */}
                {m.images && m.images.length > 0 && (
                  <div className="flex gap-2 mt-2.5 pb-1 overflow-x-auto no-scrollbar">
                    {m.images.map((img, i) => (
                      <div key={i} className="relative group flex-shrink-0">
                        <img
                          src={img}
                          alt="Memory Attachment"
                          referrerPolicy="no-referrer"
                          className="h-14 w-14 rounded-sm object-cover border border-[#222] cursor-zoom-in transition-transform duration-200 hover:scale-105"
                          onClick={() => {
                            const w = window.open();
                            if (w) {
                              w.document.write(`<img src="${img}" style="max-width:100%; max-height:100%; display:block; margin:auto;" />`);
                              w.document.body.style.backgroundColor = '#0a0a0b';
                            }
                          }}
                        />
                        {onUpdateMemory && (
                          <button
                            type="button"
                            onClick={() => {
                              onUpdateMemory(m.id, {
                                images: m.images?.filter((_, idx) => idx !== i)
                              });
                            }}
                            className="absolute -top-1 -right-1 rounded-full bg-red-650 hover:bg-red-500 p-0.5 opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer shadow-md"
                            title="Delete this image from memory"
                          >
                            <X className="w-2.5 h-2.5 text-white" />
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                )}

                {/* Cognitive visual metadata details */}
                {(m.userMeaning || m.ocrText || m.visualDescription) && (
                  <div className="mt-2 text-[10px] space-y-1.5 bg-[#151517] p-2 rounded border border-[#222]">
                    {m.userMeaning && (
                      <div>
                        <span className="text-zinc-500 font-bold uppercase block text-[8px]">USER CAPTION/MEANING:</span>
                        <span className="text-[#c2a472] select-text font-mono">{m.userMeaning}</span>
                      </div>
                    )}
                    {m.visualDescription && (
                      <div>
                        <span className="text-zinc-500 font-bold uppercase block text-[8px]">VISUAL DESCRIPTION:</span>
                        <p className="text-zinc-350 select-text leading-relaxed font-mono">{m.visualDescription}</p>
                      </div>
                    )}
                    {m.ocrText && (
                      <div>
                        <span className="text-zinc-500 font-bold uppercase block text-[8px]">OCR TRANSCRIPTION:</span>
                        <p className="text-zinc-300 bg-[#0a0a0b] p-1.5 rounded text-[10px] select-text max-h-24 overflow-y-auto whitespace-pre-wrap border border-[#1b1b1d] font-mono leading-normal no-scrollbar">{m.ocrText}</p>
                      </div>
                    )}
                  </div>
                )}

                <div className="flex items-center justify-between gap-2 mt-2 pt-2 border-t border-[#1a1a1c] text-[9px]">
                  <div className="flex items-center gap-1.5 overflow-hidden">
                    <Tag className="w-3 h-3 text-zinc-600 flex-shrink-0" />
                    <div className="flex gap-1 overflow-x-auto no-scrollbar py-0.5">
                      {m.tags.map(t => (
                        <span key={t} className="bg-[#151517] text-[#c2a472]/70 px-1.5 py-0.2 rounded-sm border border-[#222]">
                          {t}
                        </span>
                      ))}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <div className="flex items-center gap-0.5" title={`Importance: ${m.importance}/5`}>
                      {[1, 2, 3, 4, 5].map(i => (
                        <span
                          key={i}
                          className={`w-1 h-1 rounded-full ${
                            i <= m.importance ? (isEnabled ? 'bg-[#c2a472]' : 'bg-zinc-600') : 'bg-[#151517]'
                          }`}
                        />
                      ))}
                    </div>
                    {!isEnabled ? (
                      <span className="text-zinc-500 bg-zinc-900/80 border border-zinc-800 font-bold px-1.5 py-0.2 rounded-sm text-[8px] flex items-center gap-1">
                        <span className="w-1.5 h-1.5 rounded-full bg-zinc-600" />
                        OFF
                      </span>
                    ) : (
                      <span className="text-emerald-400 bg-emerald-950/30 border border-emerald-800/40 font-bold px-1.5 py-0.2 rounded-sm text-[8px] flex items-center gap-1">
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                        ACTIVE
                      </span>
                    )}
                  </div>
                </div>
                </>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};
