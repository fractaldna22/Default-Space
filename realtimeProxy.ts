import type express from 'express';

type ResolveTokens = (req: express.Request, model: string) => {activeToken?:string;isOpenAI:boolean;validationError?:string|null};
export function registerRealtimeRoute(app: express.Express, getActiveApiTokens: ResolveTokens, transport: typeof fetch = fetch) {
  // WebRTC signaling only: audio travels over the peer connection, never this proxy.
  app.post("/api/realtime/calls", async (req, res) => {
    const model = typeof req.body.model === 'string' ? req.body.model.replace(/^openai\//i, '') : '';
    if (!/^(gpt-realtime(?:-|$)|gpt-4o(?:-mini)?-realtime(?:-|$))/i.test(model)) {
      return res.status(400).json({error:'Choose a GPT Realtime model for live voice chat.'});
    }
    const origin = req.get('origin');
    if (origin) {
      try { if(new URL(origin).host !== req.get('host')) return res.status(403).json({error:'Unexpected request origin.'}); }
      catch { return res.status(403).json({error:'Invalid request origin.'}); }
    }
    const {activeToken,isOpenAI,validationError} = getActiveApiTokens(req, 'openai/' + model);
    if(validationError || !activeToken || !isOpenAI) return res.status(401).json({error:'Add a direct OpenAI API key in Settings → API connections to use live voice.'});
    if(typeof req.body.sdp !== 'string' || !req.body.sdp.startsWith('v=0') || req.body.sdp.length > 65536) return res.status(400).json({error:'A valid voice connection offer is required.'});
    const instructions = typeof req.body.instructions === 'string' ? req.body.instructions : '';
    if(instructions.length > 100000) return res.status(400).json({error:'The voice instructions are too long. Shorten the active instructions or notes.'});
    const voices = ['alloy','ash','ballad','coral','echo','sage','shimmer','verse','marin','cedar'];
    const voice = voices.includes(req.body.voice) ? req.body.voice : 'marin';
    const abort = new AbortController();
    const timer = setTimeout(()=>abort.abort(),25000);
    const disconnect = () => {if(!res.writableEnded) abort.abort();};
    res.on('close', disconnect);
    try {
      const form = new FormData();form.set('sdp',req.body.sdp);
      form.set('session',JSON.stringify({type:'realtime',model,instructions,output_modalities:['audio'],audio:{input:{transcription:{model:'gpt-4o-mini-transcribe'},turn_detection:{type:'server_vad',create_response:true,interrupt_response:true}},output:{voice}}}));
      const upstream = await transport('https://api.openai.com/v1/realtime/calls',{method:'POST',headers:{Authorization:`Bearer ${activeToken}`},body:form,signal:abort.signal});
      if(!upstream.ok) {
        const details = await upstream.json().catch(()=>({}));
        // Never relay authentication errors that may repeat part of the API key.
        const message = upstream.status===401 ? 'The OpenAI API key was rejected. Update it in Settings.' : upstream.status===403 ? 'This key cannot access the selected Realtime model.' : upstream.status===429 ? 'OpenAI usage or rate limit reached. Check your API balance and try again.' : typeof details.error?.message==='string' ? details.error.message.replace(/sk-[A-Za-z0-9_-]+/g,'[redacted]') : 'The selected model could not start a live call.';
        return res.status(upstream.status).json({error:message});
      }
      res.setHeader('Cache-Control','no-store');res.type('application/sdp').send(await upstream.text());
    } catch(error) {if(!res.destroyed) res.status(502).json({error:abort.signal.aborted?'Voice connection timed out. Please try again.':'Could not connect to OpenAI voice. Please try again.'});}
    finally {clearTimeout(timer);res.off('close',disconnect);}
  });

}
