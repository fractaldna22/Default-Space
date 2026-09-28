import { useMemo, useState } from 'react';
import { ArrowLeft, ChevronRight, Cloud, Database, FileText, KeyRound, Layers, Menu, MessageCircle, Plus, Search, Settings2, Sparkles } from 'lucide-react';
import { Space } from '../types';
import { getModelIcon } from '../utils/modelIcons';

type Model = { id: string; name: string; desc?: string };
type HomeTab = 'inbox' | 'models' | 'tools';

interface Props {
  tab: HomeTab;
  spaces: Space[];
  models: Model[];
  activeSpaceId: string;
  onTabChange: (tab: HomeTab) => void;
  onOpenThread: (spaceId: string, threadId: string) => void;
  onStartModel: (model: Model) => void;
  onOpenTool: (tab: 'prompt' | 'notes' | 'memories' | 'drive') => void;
  onOpenNavigator: () => void;
  onOpenSettings: () => void;
}

const palette = [
  ['#103d3a', '#65dfcf'], ['#43245f', '#d7a0ff'], ['#5a3012', '#ffc180'],
  ['#5c2032', '#ff91ad'], ['#27451b', '#b2e779'], ['#253664', '#a9baff'],
  ['#154455', '#85dcf9'], ['#534013', '#ffdb75'], ['#542650', '#f4a9e8'],
  ['#173b75', '#78aeff'], ['#334417', '#d0ed7b'], ['#5a2824', '#ffa294'],
];

function modelBadge(id: string, name: string) {
  const slug = id.split('/').pop()?.toLowerCase() || name.toLowerCase();
  if (slug.startsWith('gpt-4o-mini-audio')) return '4mA';
  if (slug.startsWith('gpt-4o-audio')) return '4oA';
  if (slug.startsWith('gpt-4o-mini')) return '4oM';
  const audioDate = slug.match(/^gpt-audio(?:-mini)?-20\d{2}-(\d{2})-(\d{2})$/);
  if (audioDate) return `${Number(audioDate[1])}/${audioDate[2]}`;
  if (slug === 'gpt-audio-mini') return 'A·m';
  if (slug === 'gpt-audio') return '♫';
  const audioVersion = slug.match(/^gpt-audio-(\d+(?:\.\d+)?)/);
  if (audioVersion) return `A${audioVersion[1]}`;
  const gptVersion = slug.match(/^gpt-(\d+(?:\.\d+)?[a-z]?)/);
  if (gptVersion) return gptVersion[1];
  const oVersion = slug.match(/^(o\d+)/);
  if (oVersion) return oVersion[1];
  const geminiVersion = slug.match(/^gemini-(\d+(?:\.\d+)?)/);
  if (geminiVersion) return `G${geminiVersion[1]}`;
  const claudeVersion = slug.match(/^claude-(\d+(?:\.\d+)?)/);
  if (claudeVersion) return `C${claudeVersion[1]}`;
  const deepseekVersion = slug.match(/deepseek-r(\d+)/);
  if (deepseekVersion) return `R${deepseekVersion[1]}`;
  return slug.replace(/[^a-z0-9]/g, '').slice(0, 3).toUpperCase() || 'AI';
}

export function ModelAvatar({ id, name, size = 'normal' }: { id: string; name: string; size?: 'normal' | 'small' | 'large' }) {
  const icon = getModelIcon(id);
  const [failedIcon, setFailedIcon] = useState<string | null>(null);
  const showIcon = icon && icon !== failedIcon;
  let hash = 2166136261;
  for (const char of id) hash = Math.imul(hash ^ char.charCodeAt(0), 16777619);
  hash >>>= 0;
  const colorIndex = id.includes('gpt-4o-mini-audio') ? 8 : id.includes('gpt-4o-audio') ? 3 : hash % palette.length;
  const [background, foreground] = palette[colorIndex];
  return (
    <span
      className={`model-avatar shrink-0 ${showIcon ? 'model-avatar-image' : ''} ${size === 'small' ? 'model-avatar-small' : size === 'large' ? 'model-avatar-large' : ''}`}
      style={{ background: showIcon ? 'transparent' : `radial-gradient(circle at 32% 22%, ${foreground}55, transparent 58%), ${background}`, color: foreground }}
      aria-hidden="true"
    >
      {showIcon ? <img src={icon} alt="" loading="lazy" decoding="async" draggable={false} onError={() => setFailedIcon(icon)} /> : modelBadge(id, name)}
    </span>
  );
}

function friendlyTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const now = new Date();
  if (date.toDateString() === now.toDateString()) return date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  if (now.getTime() - date.getTime() < 7 * 86400000) return date.toLocaleDateString([], { weekday: 'short' });
  return date.toLocaleDateString([], { month: 'short', day: 'numeric' });
}

export function MobileMessenger({ tab, spaces, models, activeSpaceId, onTabChange, onOpenThread, onStartModel, onOpenTool, onOpenNavigator, onOpenSettings }: Props) {
  const [inboxSearch, setInboxSearch] = useState('');
  const [modelSearch, setModelSearch] = useState('');
  const [inboxLimit, setInboxLimit] = useState(30);
  const [modelLimit, setModelLimit] = useState(60);
  const featuredModels = useMemo(() => {
    const preferredIds = ['openai/gpt-4o', 'thinkingmachines/Inkling', 'gemini-3.1-pro-preview', 'deepseek/deepseek-r1', 'anthropic/claude-3.5-sonnet'];
    const preferred = preferredIds.map(id => models.find(model => model.id === id)).filter((model): model is Model => Boolean(model));
    return [...preferred, ...models.filter(model => !preferredIds.includes(model.id))].slice(0, 8);
  }, [models]);

  const conversations = useMemo(() => spaces.flatMap(space => space.threads.map(thread => {
    let lastMessage;
    let lastAssistantModel;
    for (let index = thread.messages.length - 1; index >= 0; index--) {
      const message = thread.messages[index];
      if (!lastMessage && (message.role === 'assistant' || message.role === 'user')) lastMessage = message;
      if (!lastAssistantModel && message.role === 'assistant' && message.modelUsed) lastAssistantModel = message.modelUsed;
      if (lastMessage && lastAssistantModel) break;
    }
    const modelId = thread.modelId || lastAssistantModel || space.model;
    const model = models.find(item => item.id === modelId);
    return {
      spaceId: space.id, threadId: thread.id, title: thread.title,
      modelId, modelName: model?.name || modelId.split('/').pop() || 'Model',
      spaceName: space.name,
      preview: lastMessage?.content?.slice(0, 400).replace(/\s+/g, ' ').trim().slice(0, 160) || 'Start a conversation',
      isOwnPreview: lastMessage?.role === 'user',
      time: lastMessage?.timestamp || thread.createdAt,
    };
  })).sort((a, b) => new Date(b.time).getTime() - new Date(a.time).getTime()), [spaces, models]);

  const visibleConversations = conversations.filter(item =>
    `${item.title} ${item.modelName} ${item.modelId} ${item.spaceName} ${item.preview}`.toLowerCase().includes(inboxSearch.toLowerCase())
  );
  const visibleModels = models.filter(model =>
    `${model.name} ${model.id} ${model.desc || ''}`.toLowerCase().includes(modelSearch.toLowerCase())
  );
  const activeSpaceName = spaces.find(space => space.id === activeSpaceId)?.name || 'Default Space';

  return (
    <section className="mobile-messenger lg:hidden" aria-label={tab === 'inbox' ? 'Conversations' : tab === 'models' ? 'Models' : 'Tools'}>
      {tab === 'inbox' && <>
        <header className="mobile-messenger-header">
          <div>
            <div className="mobile-eyebrow">SPACE · {activeSpaceName}</div>
            <h1>Chats</h1>
          </div>
          <button className="mobile-circle-action" type="button" onClick={() => onTabChange('models')} aria-label="New chat with a model" title="New chat"><Plus size={23} /></button>
        </header>
        <div className="mobile-messenger-scroll">
          <label className="mobile-search"><Search size={21} aria-hidden="true" /><input value={inboxSearch} onChange={event => setInboxSearch(event.target.value)} placeholder="Search conversations" aria-label="Search conversations" /></label>
          {!inboxSearch && <>
            <div className="mobile-section-heading"><span>Models</span><button onClick={() => onTabChange('models')}>See all <ChevronRight size={16} /></button></div>
            <div className="mobile-model-strip">
              {featuredModels.map(model => <button key={model.id} type="button" onClick={() => onStartModel(model)} className="mobile-model-shortcut" title={`Chat with ${model.name}`}><ModelAvatar id={model.id} name={model.name} size="large" /><span>{model.name.replace(/\s*\([^)]*\)/g, '')}</span></button>)}
            </div>
          </>}
          <div className="mobile-section-heading"><span>Recent chats</span><span className="mobile-count">{visibleConversations.length}</span></div>
          {visibleConversations.length === 0 ? <div className="mobile-empty"><MessageCircle size={32} /><strong>{inboxSearch ? 'No matching chats' : 'Your chats will live here'}</strong><span>{inboxSearch ? 'Try another search.' : 'Choose a model above to start talking.'}</span></div> : <div className="mobile-list">
            {visibleConversations.slice(0, inboxLimit).map(item => <button className="mobile-conversation-row" key={`${item.spaceId}:${item.threadId}`} type="button" onClick={() => onOpenThread(item.spaceId, item.threadId)}>
              <ModelAvatar id={item.modelId} name={item.modelName} />
              <span className="mobile-row-body"><span className="mobile-row-top"><strong>{item.title === 'New Conversation' ? item.modelName : item.title}</strong><time>{friendlyTime(item.time)}</time></span><span className="mobile-row-sub">{item.isOwnPreview ? 'You: ' : ''}{item.preview}</span><span className="mobile-row-context">{item.modelName}{spaces.length > 1 ? ` · ${item.spaceName}` : ''}</span></span>
            </button>)}
            {visibleConversations.length > inboxLimit && <button className="mobile-more" onClick={() => setInboxLimit(value => value + 30)}>Show more chats</button>}
          </div>}
        </div>
      </>}

      {tab === 'models' && <>
        <header className="mobile-messenger-header mobile-models-header"><button className="mobile-back" type="button" onClick={() => onTabChange('inbox')} aria-label="Back to chats"><ArrowLeft size={26} /></button><h1>Models</h1><span className="mobile-header-spacer" /></header>
        <div className="mobile-messenger-scroll">
          <label className="mobile-search"><Search size={21} aria-hidden="true" /><input value={modelSearch} onChange={event => setModelSearch(event.target.value)} placeholder="Search models" aria-label="Search models" autoComplete="off" /></label>
          <div className="mobile-section-heading"><span>{modelSearch ? 'Search results' : 'Available models'}</span><span className="mobile-count">{visibleModels.length}</span></div>
          {visibleModels.length === 0 ? <div className="mobile-empty"><Search size={32} /><strong>No models found</strong><span>Try a different name or provider.</span></div> : <div className="mobile-list">
            {visibleModels.slice(0, modelLimit).map(model => <button className="mobile-model-row" key={model.id} type="button" onClick={() => onStartModel(model)}><ModelAvatar id={model.id} name={model.name} /><span className="mobile-row-body"><strong>{model.name}</strong><span className="mobile-row-sub">{model.desc || model.id}</span><span className="mobile-row-context">{model.id}</span></span><ChevronRight size={18} className="mobile-row-chevron" /></button>)}
            {visibleModels.length > modelLimit && <button className="mobile-more" onClick={() => setModelLimit(value => value + 60)}>Show more models</button>}
          </div>}
        </div>
      </>}

      {tab === 'tools' && <>
        <header className="mobile-messenger-header"><div><div className="mobile-eyebrow">YOUR WORKSPACE</div><h1>Tools</h1></div><button className="mobile-circle-action" type="button" onClick={onOpenSettings} aria-label="Chat appearance"><Settings2 size={23} /></button></header>
        <div className="mobile-messenger-scroll mobile-tools-scroll">
          <div className="mobile-section-heading"><span>Workspace</span></div>
          <div className="mobile-list mobile-tools-list">
            <button onClick={onOpenNavigator}><span className="mobile-tool-icon"><Menu /></span><span><strong>Settings</strong><small>Models, instructions, appearance & keys</small></span><ChevronRight /></button>
            <button onClick={() => onOpenTool('prompt')}><span className="mobile-tool-icon"><Layers /></span><span><strong>Prompt stacks</strong><small>See what the model receives</small></span><ChevronRight /></button>
            <button onClick={() => onOpenTool('notes')}><span className="mobile-tool-icon"><FileText /></span><span><strong>Notes</strong><small>Workspace scratchpad</small></span><ChevronRight /></button>
            <button onClick={() => onOpenTool('memories')}><span className="mobile-tool-icon"><Database /></span><span><strong>Memory bank</strong><small>Saved context</small></span><ChevronRight /></button>
            <button onClick={() => onOpenTool('drive')}><span className="mobile-tool-icon"><Cloud /></span><span><strong>Google Drive</strong><small>Backups and imports</small></span><ChevronRight /></button>
          </div>
          <div className="mobile-tools-foot"><Sparkles size={15} /> Choose a model from the Models tab to start a chat. <KeyRound size={15} /></div>
        </div>
      </>}
    </section>
  );
}
