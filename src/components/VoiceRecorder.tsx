import { useEffect, useRef, useState } from 'react';
import { Mic, Square, X } from 'lucide-react';
import { microphoneError, requireMicrophone } from '../utils/voice';

export function VoiceRecorder({ onClip, onClose, onError }: {
  onClip: (file: File) => Promise<void>; onClose: () => void; onError: (message: string) => void;
}) {
  const [status, setStatus] = useState<'ready'|'starting'|'recording'|'processing'>('ready');
  const [seconds, setSeconds] = useState(0);
  const recorder = useRef<MediaRecorder>(null);
  const stream = useRef<MediaStream>(null);
  const cancelled = useRef(false);
  const mounted = useRef(true);
  const timer = useRef<ReturnType<typeof setInterval>>(null);
  useEffect(() => {
    mounted.current = true; cancelled.current = false;
    return () => {
      mounted.current = false; cancelled.current = true;
      clearInterval(timer.current);
      if (recorder.current?.state === 'recording') recorder.current.stop();
      stream.current?.getTracks().forEach(track => track.stop());
    };
  }, []);
  const stop = () => {
    clearInterval(timer.current);
    if (recorder.current?.state === 'recording') recorder.current.stop();
    stream.current?.getTracks().forEach(track => track.stop());
    setStatus('processing');
  };
  const start = async () => {
    setStatus('starting');
    try {
      requireMicrophone();
      if (typeof MediaRecorder === 'undefined') throw new Error('Voice recording is not supported in this browser. You can attach an audio file instead.');
      const media = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
      if (!mounted.current) { media.getTracks().forEach(track => track.stop()); return; }
      stream.current = media;
      const mimeType = ['audio/webm;codecs=opus','audio/mp4','audio/ogg;codecs=opus'].find(type => MediaRecorder.isTypeSupported(type));
      const capture = new MediaRecorder(media, mimeType ? { mimeType } : undefined);
      recorder.current = capture;
      const chunks: Blob[] = [];
      capture.ondataavailable = event => { if(event.data.size) chunks.push(event.data); };
      capture.onerror = () => { cancelled.current = true; stop(); onError('Recording stopped unexpectedly. Please try again.'); onClose(); };
      capture.onstop = async () => {
        clearInterval(timer.current); media.getTracks().forEach(track => track.stop());
        if (cancelled.current || !mounted.current) return;
        setStatus('processing');
        try {
          const blob = new Blob(chunks, {type:capture.mimeType});
          if (blob.size < 100) throw new Error('The recording was too short. Please try again.');
          await onClip(new File([blob], `Voice clip ${new Date().toLocaleTimeString()}.wav`, {type:blob.type}));
        } catch (error) { onError(microphoneError(error)); }
        finally { if(mounted.current) onClose(); }
      };
      capture.start(250); setStatus('recording');
      const started = Date.now();
      timer.current = setInterval(() => {
        const elapsed = Math.floor((Date.now()-started)/1000); setSeconds(elapsed);
        if(elapsed >= 300) stop();
      }, 250);
    } catch (error) {
      stream.current?.getTracks().forEach(track => track.stop());
      if(mounted.current) { onError(microphoneError(error)); onClose(); }
    }
  };
  return <div className="voice-record-panel" role="group" aria-label="Voice clip recorder">
    <div><strong>{status === 'recording' ? 'Recording voice clip' : status === 'processing' ? 'Preparing your clip…' : status === 'starting' ? 'Waiting for microphone…' : 'Record a voice clip'}</strong><span aria-live="polite">{status === 'recording' ? `${Math.floor(seconds/60)}:${String(seconds%60).padStart(2,'0')} · 5 minute limit` : 'Review the clip before you send it.'}</span></div>
    {status === 'ready' && <button type="button" onClick={start} aria-label="Start recording"><Mic size={22}/></button>}
    {status === 'recording' && <button type="button" onClick={stop} aria-label="Stop recording" className="record-stop"><Square size={20}/></button>}
    <button type="button" onClick={() => {cancelled.current=true; onClose();}} aria-label="Cancel recording" disabled={status==='processing'}><X size={22}/></button>
  </div>;
}
