import { useEffect, useRef, useState } from 'react';
import { ArrowLeft, Mic, MicOff, Phone, PhoneOff, Volume2 } from 'lucide-react';
import { ModelAvatar } from './MobileMessenger';
import { Message } from '../types';
import { microphoneError, requireMicrophone } from '../utils/voice';

interface Props {
  model: string; token: string; voice: string; instructions: string; history: Message[];
  onClose: (messages: Message[]) => void;
}

export function RealtimeCall({model, token, voice, instructions, history, onClose}: Props) {
  const [state, setState] = useState<'ready'|'connecting'|'connected'|'ended'|'error'>('ready');
  const [error, setError] = useState('');
  const [muted, setMuted] = useState(false);
  const [playbackBlocked, setPlaybackBlocked] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const [caption, setCaption] = useState('');
  const peer = useRef<RTCPeerConnection>(null);
  const media = useRef<MediaStream>(null);
  const channel = useRef<RTCDataChannel>(null);
  const audio = useRef<HTMLAudioElement>(null);
  const controller = useRef<AbortController>(null);
  const connectTimer = useRef<ReturnType<typeof setTimeout>>(null);
  const durationTimer = useRef<ReturnType<typeof setInterval>>(null);
  const generation = useRef(0);
  const historyIds = useRef(new Set<string>());
  const messages = useRef(new Map<string, Message>());
  const panel = useRef<HTMLDivElement>(null);

  const cleanup = () => {
    generation.current++;
    clearTimeout(connectTimer.current); clearInterval(durationTimer.current);
    controller.current?.abort();
    media.current?.getTracks().forEach(track => track.stop()); media.current = null;
    if(channel.current) {channel.current.onclose=null; channel.current.close(); channel.current=null;}
    if(peer.current) {peer.current.onconnectionstatechange=null; peer.current.close(); peer.current=null;}
    if(audio.current) {audio.current.pause(); audio.current.srcObject=null;}
  };
  useEffect(() => {
    const previous = document.activeElement as HTMLElement;
    panel.current?.focus();
    const leave = () => {cleanup();onClose([...messages.current.values()].filter(message=>message.content.trim()));};
    window.addEventListener('pagehide',leave);
    return () => {window.removeEventListener('pagehide',leave);cleanup();previous?.focus?.();};
  }, []);
  const close = () => { cleanup(); onClose([...messages.current.values()].filter(message => message.content.trim())); };
  const fail = (message: string) => { cleanup();setError(message);setState('error'); };
  const remember = (id: string, role: 'user'|'assistant', content?: string) => {
    const previous = messages.current.get(id);
    messages.current.set(id, {id:`voice-${id}`,role,content:content ?? previous?.content ?? '',timestamp:previous?.timestamp || new Date().toISOString(),modelUsed:role==='assistant'?model:undefined});
  };
  const start = async () => {
    setError('');setState('connecting');setMuted(false);setSeconds(0);
    const attempt = ++generation.current;
    try {
      requireMicrophone();
      if (!window.RTCPeerConnection) throw new Error('Live voice is not supported in this browser. Try a current Safari or Chrome browser.');
      const stream = await navigator.mediaDevices.getUserMedia({audio:{echoCancellation:true,noiseSuppression:true,autoGainControl:true}});
      if(attempt !== generation.current) {stream.getTracks().forEach(track=>track.stop());return;}
      media.current=stream;
      // Keep input muted until the history has been sent on the event channel.
      stream.getAudioTracks().forEach(track=>track.enabled=false);
      const pc = new RTCPeerConnection(); peer.current=pc;
      stream.getTracks().forEach(track=>pc.addTrack(track,stream));
      pc.ontrack = event => {
        if(!audio.current) return;
        audio.current.srcObject=event.streams[0] || new MediaStream([event.track]);
        audio.current.play().catch(()=>setPlaybackBlocked(true));
      };
      pc.onconnectionstatechange=()=> {
        if(pc.connectionState==='failed' || pc.connectionState==='disconnected') fail('The voice connection was interrupted. Your completed transcript is kept. Close this call and try again.');
      };
      const dc=pc.createDataChannel('oai-events');channel.current=dc;
      dc.onopen=()=> {
        if(attempt !== generation.current) return;
        for(const message of history) {
          if(!['user','assistant'].includes(message.role) || !message.content.trim()) continue;
          const id='ctx_' + crypto.randomUUID().replace(/-/g,'').slice(0,24); historyIds.current.add(id);
          dc.send(JSON.stringify({type:'conversation.item.create',item:{id,type:'message',role:message.role,content:[{type:message.role==='assistant'?'output_text':'input_text',text:message.content}]}}));
        }
        stream.getAudioTracks().forEach(track=>track.enabled=true);
        clearTimeout(connectTimer.current);setState('connected');
        const started=Date.now();durationTimer.current=setInterval(()=>setSeconds(Math.floor((Date.now()-started)/1000)),1000);
      };
      dc.onclose=()=> {if(attempt===generation.current) fail('The call ended. Your completed transcript is kept.');};
      dc.onmessage=event=> {
        if(attempt!==generation.current) return;
        let data:any;try{data=JSON.parse(event.data);}catch{return;}
        if(historyIds.current.has(data.item?.id || data.item_id)) return;
        if(data.type==='error') {fail(data.error?.message || 'The model could not start this voice session.');return;}
        if(data.type==='conversation.item.added' && ['user','assistant'].includes(data.item?.role)) remember(data.item.id,data.item.role);
        if(data.type==='conversation.item.input_audio_transcription.completed') remember(data.item_id,'user',data.transcript);
        if(data.type==='conversation.item.input_audio_transcription.failed') remember(data.item_id,'user','[Voice message — transcription unavailable]');
        if(data.type==='response.output_audio_transcript.done' || data.type==='response.output_text.done') {
          const text=data.transcript || data.text || '';remember(data.item_id,'assistant',text);setCaption(text);
        }
        if(data.type==='response.done' && data.response?.status==='failed') fail(data.response.status_details?.error?.message || 'The voice response failed.');
      };
      connectTimer.current=setTimeout(()=>fail('The voice connection timed out. Close this call and try again.'),30000);
      controller.current=new AbortController();
      const offer=await pc.createOffer();await pc.setLocalDescription(offer);
      const response=await fetch('/api/realtime/calls',{method:'POST',headers:{'Content-Type':'application/json','x-openai-token':token},signal:controller.current.signal,body:JSON.stringify({model,sdp:offer.sdp,voice,instructions})});
      if(!response.ok) {const result=await response.json().catch(()=>({}));throw new Error(result.error || `Voice connection failed (${response.status}).`);}
      const sdp=await response.text();
      if(attempt!==generation.current) return;
      await pc.setRemoteDescription({type:'answer',sdp});
    } catch(error) {if(attempt===generation.current) fail(microphoneError(error));}
  };
  const toggleMute = () => {const value=!muted;media.current?.getAudioTracks().forEach(track=>track.enabled=!value);setMuted(value);};
  return <div className="realtime-call" role="dialog" aria-modal="true" aria-labelledby="voice-title" tabIndex={-1} ref={panel} onKeyDown={event=>{
    if(event.key==='Escape'){event.preventDefault();close();}
    if(event.key==='Tab'){
      const controls=Array.from(panel.current?.querySelectorAll<HTMLButtonElement>('button:not([disabled])') || []);
      const first=controls[0],last=controls[controls.length-1];
      if(event.shiftKey && (document.activeElement===first || document.activeElement===panel.current)){event.preventDefault();last?.focus();}
      else if(!event.shiftKey && document.activeElement===last){event.preventDefault();first?.focus();}
    }
  }}>
    <header><button onClick={close} aria-label="Close voice chat"><ArrowLeft size={24}/></button><span>LIVE VOICE</span><span className="voice-time">{state==='connected'?`${Math.floor(seconds/60)}:${String(seconds%60).padStart(2,'0')}`:''}</span></header>
    <main><div className={`voice-orb ${state==='connected'?'connected':''}`}><ModelAvatar id={model} name={model.split('/').pop() || model}/></div><h1 id="voice-title">{model.split('/').pop()}</h1><p role="status">{state==='ready'?'Ready when you are':state==='connecting'?'Connecting…':state==='connected'?(muted?'Microphone muted':'Listening · speak naturally'):state==='error'?'Call interrupted':'Call ended'}</p>
      {error && <div className="voice-error" role="alert">{error}</div>}
      {state==='ready' && <p className="voice-explainer">Talk with this model using your microphone and speaker. Recent text context is included, and completed transcripts stay in this chat.</p>}
      {caption && <div className="voice-caption">{caption}</div>}
      {playbackBlocked && <button className="voice-playback" onClick={()=>audio.current?.play().then(()=>setPlaybackBlocked(false)).catch(()=>setError('Speaker playback is blocked. Check your browser’s sound permission.'))}><Volume2 size={20}/> Enable speaker</button>}
    </main>
    <footer>{state==='ready'?<button className="voice-start" onClick={start}><Phone size={23}/> Start voice chat</button>:<div className="voice-controls">{state==='connected' && <button onClick={toggleMute} aria-label={muted?'Unmute microphone':'Mute microphone'} aria-pressed={muted}>{muted?<MicOff size={26}/>:<Mic size={26}/>}<span>{muted?'Unmute':'Mute'}</span></button>}<button className="voice-hangup" onClick={close}><PhoneOff size={26}/><span>{state==='error'?'Close':'End call'}</span></button></div>}<small>{state==='ready'?'Uses your OpenAI API connection. Audio is on during calls.':'Leaving this screen stops the microphone and ends the call.'}</small></footer>
    <audio ref={audio} autoPlay playsInline />
  </div>;
}
