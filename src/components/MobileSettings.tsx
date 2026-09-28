import { useEffect, useRef, useState, type ReactNode } from 'react';
import { ArrowLeft, Check, ChevronRight, KeyRound, MessageCircle, Palette, Sliders, Sparkles } from 'lucide-react';
import { APIConfig, ChatAppearanceSettings, PersonaPreset, Space } from '../types';
import { AVAILABLE_FONTS, getFontFamilyCss } from '../utils/fontConstants';
import { isInklingModel, shouldApplyReasoningLogic } from '../utils/modelUtils';
import { ModelAvatar } from './MobileMessenger';

export const MOBILE_CHAT_APPEARANCE: ChatAppearanceSettings = {
  fontFamily: 'system', fontSize: 16, lineHeight: 1.45, bubbleMaxWidth: '86%', chatWidthMode: 'fluid',
  userBubbleBg: '#2866ed', userBubbleBorder: '#2866ed', userBubbleText: '#ffffff',
  assistantBubbleBg: '#303034', assistantBubbleBorder: '#303034', assistantBubbleText: '#f7f7f8',
};

type Page = 'home' | 'replies' | 'instructions' | 'appearance' | 'connections' | 'advanced';
interface Props {
  space: Space;
  models: { id: string; name: string; desc?: string }[];
  personas: PersonaPreset[];
  apiConfig: APIConfig;
  appearance: ChatAppearanceSettings;
  initialPage?: 'home' | 'appearance';
  onUpdateSpace: (settings: Partial<Space>) => void;
  onUpdateAppearance: (settings: Partial<ChatAppearanceSettings>) => void;
  onUpdateKey: (key: string) => void;
  onUpdateTinkerKey: (key: string) => void;
  onUpdateRouterKey: (key: string) => void;
  onUpdateUserName: (name: string) => void;
  onClose: () => void;
  children: ReactNode;
}

function Toggle({ label, description, checked, onChange }: { label: string; description?: string; checked: boolean; onChange: (checked: boolean) => void }) {
  return <button type="button" className="ms-toggle-row" role="switch" aria-checked={checked} onClick={() => onChange(!checked)}>
    <span><strong>{label}</strong>{description && <small>{description}</small>}</span><span className={`ms-switch ${checked ? 'on' : ''}`} aria-hidden="true"><span /></span>
  </button>;
}

function Range({ label, value, min, max, step, suffix = '', onChange }: { label: string; value: number; min: number; max: number; step: number; suffix?: string; onChange: (value: number) => void }) {
  return <label className="ms-field"><span>{label}<output>{value}{suffix}</output></span><input type="range" aria-label={label} min={min} max={max} step={step} value={value} onChange={event => onChange(Number(event.target.value))} /></label>;
}

function ProviderKey({ label, value, serverConfigured, onSave }: { label: string; value: string; serverConfigured?: boolean; onSave: (value: string) => void }) {
  const [draft, setDraft] = useState(value);
  const [saved, setSaved] = useState(false);
  useEffect(() => { setDraft(value); }, [value]);
  return <form className="ms-card ms-provider" onSubmit={event => { event.preventDefault(); onSave(draft.trim()); setSaved(true); }}>
    <div className="ms-card-heading"><strong>{label}</strong><span className={value || serverConfigured ? 'ms-status' : 'ms-muted'}>{value ? 'Saved on device' : serverConfigured ? 'Server connected' : 'Not connected'}</span></div>
    <label className="ms-field"><span>API key</span><input type="password" aria-label={`${label} API key`} value={draft} onChange={event => { setDraft(event.target.value); setSaved(false); }} placeholder="Paste your API key" autoComplete="off" autoCapitalize="none" spellCheck={false} /></label>
    <div className="ms-actions"><button className="ms-primary" type="submit">{saved ? <><Check size={17} /> Saved</> : 'Save key'}</button>{value && <button type="button" className="ms-quiet" onClick={() => { onSave(''); setDraft(''); setSaved(false); }}>Remove key</button>}</div>
  </form>;
}

const themes = [
  { name: 'Messenger', user: '#2866ed', assistant: '#303034' },
  { name: 'Violet', user: '#7046ce', assistant: '#302838' },
  { name: 'Ocean', user: '#087d8c', assistant: '#20383c' },
  { name: 'Rose', user: '#ae3868', assistant: '#3b2933' },
  { name: 'Graphite', user: '#535563', assistant: '#28292f' },
];

export function MobileSettings(props: Props) {
  const { space, models, personas, apiConfig, appearance, onUpdateSpace, onUpdateAppearance, onClose } = props;
  const [page, setPage] = useState<Page>(props.initialPage || 'home');
  const [modelSearch, setModelSearch] = useState('');
  const [choosingModel, setChoosingModel] = useState(false);
  const [prompt, setPrompt] = useState(space.systemPromptCustom);
  const [userName, setUserName] = useState(apiConfig.userName || '');
  const panel = useRef<HTMLDivElement>(null);
  const content = useRef<HTMLDivElement>(null);
  const modelName = models.find(model => model.id === space.model)?.name.replace(/\s*\([^)]*\)/g, '') || space.model.split('/').pop() || 'Model';
  const titles: Record<Page, string> = { home: 'Settings', replies: 'Model & replies', instructions: 'Instructions', appearance: 'Appearance', connections: 'API connections', advanced: 'More controls' };
  const savePrompt = () => { if (prompt !== space.systemPromptCustom) onUpdateSpace({ systemPromptCustom: prompt }); };
  const close = () => { if (page === 'instructions') savePrompt(); onClose(); };
  const navigate = (next: Page) => { if (page === 'instructions') savePrompt(); setPage(next); };
  useEffect(() => { setPrompt(space.systemPromptCustom); }, [space.id, space.systemPromptCustom]);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    panel.current?.querySelector<HTMLButtonElement>('button')?.focus();
    return () => previous?.focus();
  }, []);
  useEffect(() => { content.current?.scrollTo(0, 0); }, [page]);
  const visibleModels = models.filter(model => `${model.name} ${model.id}`.toLowerCase().includes(modelSearch.toLowerCase())).slice(0, 30);
  return <div ref={panel} className="mobile-settings lg:hidden" role="dialog" aria-modal="true" aria-labelledby="mobile-settings-title" onKeyDown={event => {
    if (event.key === 'Escape') { event.stopPropagation(); close(); }
    if (event.key === 'Tab') {
      const elements = [...(panel.current?.querySelectorAll<HTMLElement>('button, input, select, textarea, summary, [tabindex="0"]') || [])].filter(element => !element.hasAttribute('disabled') && element.getClientRects().length > 0);
      const first = elements[0], last = elements[elements.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
    }
  }}>
    <header className="ms-header"><button type="button" aria-label={page === 'home' ? 'Close settings' : 'Back to settings'} onClick={() => page === 'home' ? close() : navigate('home')}><ArrowLeft size={24} /></button><h1 id="mobile-settings-title">{titles[page]}</h1><button type="button" aria-label="Done with settings" onClick={close}><Check size={23} /></button></header>
    <div className="ms-content" ref={content}>
      {page === 'home' && <>
        <div className="ms-model-summary"><ModelAvatar id={space.model} name={modelName} /><div><strong>{modelName}</strong><span>{space.model}</span><small>{space.name}</small></div></div>
        <p className="ms-intro">Make this space yours.</p>
        <div className="ms-menu">
          <button onClick={() => navigate('replies')}><span className="ms-menu-icon blue"><MessageCircle /></span><span><strong>Model & replies</strong><small>{space.enableAudioOutput ? 'Text and audio replies' : 'Text replies · audio off'}</small></span><ChevronRight /></button>
          <button onClick={() => navigate('instructions')}><span className="ms-menu-icon purple"><Sparkles /></span><span><strong>Instructions</strong><small>Personality, tone, and how to respond</small></span><ChevronRight /></button>
          <button onClick={() => navigate('appearance')}><span className="ms-menu-icon pink"><Palette /></span><span><strong>Appearance</strong><small>Colors, text size, and readability</small></span><ChevronRight /></button>
          <button onClick={() => navigate('connections')}><span className="ms-menu-icon green"><KeyRound /></span><span><strong>API connections</strong><small>Provider keys and your name</small></span><ChevronRight /></button>
          <button onClick={() => navigate('advanced')}><span className="ms-menu-icon gray"><Sliders /></span><span><strong>More controls</strong><small>Conversations, advanced options, backups</small></span><ChevronRight /></button>
        </div>
        <p className="ms-note">Model settings apply to this space. Appearance is saved for the mobile layout on this device.</p>
      </>}
      {page === 'replies' && <>
        <section className="ms-card"><h2>Model</h2><button className="ms-model-picker" onClick={() => setChoosingModel(!choosingModel)} aria-expanded={choosingModel}><ModelAvatar id={space.model} name={modelName} size="small" /><span><strong>{modelName}</strong><small>{space.model}</small></span><ChevronRight size={19} /></button>
          {choosingModel && <div className="ms-model-options"><input aria-label="Find a model for this conversation" type="search" placeholder="Search model names or IDs" value={modelSearch} onChange={event => setModelSearch(event.target.value)} />{visibleModels.map(model => <button key={model.id} onClick={() => { onUpdateSpace({ model: model.id }); setChoosingModel(false); }}><span>{model.name}<small>{model.id}</small></span>{model.id === space.model && <Check size={18} />}</button>)}{visibleModels.length === 0 && <p className="ms-note">No matching models.</p>}</div>}
        </section>
        <section className="ms-card"><h2>Reply format</h2><Toggle label="Audio replies" description="Off gives you text-only replies. Turn on to request speech from audio-capable models." checked={space.enableAudioOutput ?? false} onChange={value => onUpdateSpace({ enableAudioOutput: value })} />
          {space.enableAudioOutput && <><label className="ms-field"><span>Voice</span><select value={space.openaiVoice || 'verse'} onChange={event => onUpdateSpace({ openaiVoice: event.target.value })}>{['verse','alloy','ash','ballad','coral','echo','sage','shimmer'].map(voice => <option key={voice} value={voice}>{voice}</option>)}</select></label><label className="ms-field"><span>Audio format</span><select value={space.openaiAudioFormat || 'wav'} onChange={event => onUpdateSpace({ openaiAudioFormat: event.target.value })}>{['wav','mp3','flac'].map(format => <option key={format}>{format}</option>)}</select></label></>}
        </section>
        <section className="ms-card"><h2>Responses</h2><Range label="Temperature" value={space.temperature} min={0} max={2} step={0.05} onChange={value => onUpdateSpace({ temperature: value })} /><p className="ms-note">Lower is more consistent. Higher allows more variation. Support depends on the model.</p><label className="ms-field"><span>Reply token limit</span><input type="number" min={1} step={1} placeholder="Model default" value={space.max_tokens || ''} onChange={event => { const value=Number(event.target.value); if (!event.target.value || value > 0) onUpdateSpace({ max_tokens: value || null }); }} /></label>
          {shouldApplyReasoningLogic(space.model) && <label className="ms-field"><span>Reasoning effort</span><select value={space.tinkerReasoningEffort || 'high'} onChange={event => onUpdateSpace({ tinkerReasoningEffort: event.target.value })}>{['none','minimal','low','medium','high','xhigh'].map(value => <option key={value}>{value}</option>)}</select></label>}
          {isInklingModel(space.model) && <Toggle label="Web search" checked={space.tinkerWebSearch ?? false} onChange={value => onUpdateSpace({ tinkerWebSearch: value })} />}
        </section>
        <details className="ms-card"><summary>More generation controls</summary><Range label="Top P" min={0} max={1} step={0.05} value={space.top_p} onChange={value => onUpdateSpace({ top_p:value })} /><Range label="Presence penalty" min={-2} max={2} step={0.1} value={space.presence_penalty ?? 0} onChange={value => onUpdateSpace({ presence_penalty:value })} /><Range label="Frequency penalty" min={-2} max={2} step={0.1} value={space.frequency_penalty ?? 0} onChange={value => onUpdateSpace({ frequency_penalty:value })} /><button className="ms-quiet" onClick={() => onUpdateSpace({ frequency_penalty:null })}>Use default frequency penalty</button><label className="ms-field"><span>Service tier</span><select value={space.service_tier ?? 'none'} onChange={event => onUpdateSpace({ service_tier:event.target.value === 'none' ? null : event.target.value })}>{['none','auto','default','flex','priority','scale'].map(value => <option key={value} value={value}>{value === 'none' ? 'Model default' : value}</option>)}</select></label></details>
        <details className="ms-card"><summary>Context & reasoning logs</summary><label className="ms-field"><span>Context token limit</span><input type="number" min={0} step={1000} placeholder="Unlimited" value={space.contextScaleTokens || ''} onChange={event => { const value=Number(event.target.value); if(value>=0) onUpdateSpace({ contextScaleTokens:value }); }} /></label><p className="ms-note">Leave empty to use the full available conversation.</p><Toggle label="Use conversation summaries" description="Use saved summaries in place of older messages when available." checked={space.useCompactified ?? false} onChange={value => onUpdateSpace({ useCompactified:value })} /><Toggle label="Show reasoning logs" checked={space.enableThinkingLogs ?? false} onChange={value => onUpdateSpace({ enableThinkingLogs:value })} /><Toggle label="Include reasoning in context" checked={space.includeCoTInContext ?? false} onChange={value => onUpdateSpace({ includeCoTInContext:value })} /></details>
      </>}
      {page === 'instructions' && <>
        <section className="ms-card"><h2>Persona</h2><label className="ms-field"><span>Start from a preset</span><select value={space.systemPromptPresetId} onChange={event => { const preset=personas.find(item => item.id===event.target.value); if(preset){setPrompt(preset.prompt);onUpdateSpace({systemPromptPresetId:preset.id,systemPromptCustom:preset.prompt});} }}>{personas.map(persona => <option key={persona.id} value={persona.id}>{persona.name}</option>)}</select></label></section>
        <section className="ms-card"><h2>Custom instructions</h2><p className="ms-note">Describe the voice, habits, and context you want the model to use.</p><textarea className="ms-prompt" aria-label="Custom instructions" value={prompt} onChange={event => setPrompt(event.target.value)} rows={12} /><button className="ms-primary" onClick={savePrompt}>{prompt===space.systemPromptCustom ? <><Check size={17} /> Saved</> : 'Save instructions'}</button><p className="ms-note">Your edits also save when you leave this page.</p></section>
      </>}
      {page === 'appearance' && <>
        <div className="ms-preview" style={{fontFamily:getFontFamilyCss(appearance.fontFamily),fontSize:appearance.fontSize,lineHeight:appearance.lineHeight}}><div style={{background:appearance.userBubbleBg,color:appearance.userBubbleText,maxWidth:appearance.bubbleMaxWidth}}>A little more room to breathe.</div><div style={{background:appearance.assistantBubbleBg,color:appearance.assistantBubbleText,maxWidth:appearance.bubbleMaxWidth}}>Your words, your space.<br /><br />Keep every paragraph readable.</div></div>
        <section className="ms-card"><h2>Chat colors</h2><div className="ms-themes">{themes.map(theme => <button key={theme.name} aria-pressed={appearance.userBubbleBg===theme.user} onClick={() => onUpdateAppearance({userBubbleBg:theme.user,userBubbleBorder:theme.user,userBubbleText:'#ffffff',assistantBubbleBg:theme.assistant,assistantBubbleBorder:theme.assistant,assistantBubbleText:'#f7f7f8'})}><span style={{background:theme.user}}>{appearance.userBubbleBg===theme.user && <Check size={18} />}</span>{theme.name}</button>)}</div><div className="ms-color-pickers"><label>Your bubbles<input type="color" value={appearance.userBubbleBg} onChange={event => onUpdateAppearance({userBubbleBg:event.target.value,userBubbleBorder:event.target.value})} /></label><label>Model bubbles<input type="color" value={appearance.assistantBubbleBg} onChange={event => onUpdateAppearance({assistantBubbleBg:event.target.value,assistantBubbleBorder:event.target.value})} /></label></div></section>
        <section className="ms-card"><h2>Readability</h2><Range label="Text size" value={appearance.fontSize} min={14} max={24} step={1} suffix=" px" onChange={value => onUpdateAppearance({fontSize:value})} /><Range label="Line spacing" value={appearance.lineHeight} min={1.3} max={2} step={0.05} onChange={value => onUpdateAppearance({lineHeight:value})} /><Range label="Bubble width" value={parseInt(appearance.bubbleMaxWidth)} min={70} max={96} step={1} suffix="%" onChange={value => onUpdateAppearance({bubbleMaxWidth:`${value}%`})} /><label className="ms-field"><span>Font</span><select value={appearance.fontFamily} onChange={event => onUpdateAppearance({fontFamily:event.target.value})}>{AVAILABLE_FONTS.map(font => <option key={font.id} value={font.id}>{font.name}</option>)}</select></label></section><button className="ms-quiet ms-wide" onClick={() => onUpdateAppearance(MOBILE_CHAT_APPEARANCE)}>Reset mobile appearance</button>
      </>}
      {page === 'connections' && <>
        <section className="ms-card"><h2>Your name</h2><input aria-label="Your name" value={userName} onChange={event => setUserName(event.target.value)} onBlur={() => props.onUpdateUserName(userName.trim())} placeholder="What should the models call you?" autoComplete="given-name" /></section>
        <p className="ms-note">Keys stay hidden here. Save a key to connect its provider.</p>
        <ProviderKey label="OpenAI / primary" value={apiConfig.clientToken || ''} serverConfigured={apiConfig.hasOpenAIToken || apiConfig.hasTokenEnv} onSave={props.onUpdateKey} />
        <ProviderKey label="OpenRouter" value={apiConfig.openRouterKey || ''} serverConfigured={apiConfig.hasOpenRouterKey} onSave={props.onUpdateRouterKey} />
        <ProviderKey label="Thinking Machines" value={apiConfig.tinkerKey || ''} serverConfigured={apiConfig.hasTinkerKey} onSave={props.onUpdateTinkerKey} />
      </>}
      {page === 'advanced' && <div className="ms-legacy">{props.children}</div>}
    </div>
  </div>;
}
