import {test} from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import {once} from 'node:events';
import {encodeMonoWav,isRealtimeModel} from './src/utils/voice';
import {registerRealtimeRoute} from './realtimeProxy';

test('recording encoder produces valid mono PCM WAV, downmixes stereo and clamps samples',()=>{
  const wav=Buffer.from(encodeMonoWav([new Float32Array([-2,0,2,.5]),new Float32Array([-2,0,2,-.5])],24000));
  assert.equal(wav.toString('ascii',0,4),'RIFF');assert.equal(wav.toString('ascii',8,12),'WAVE');
  assert.equal(wav.readUInt32LE(4),wav.length-8);assert.equal(wav.readUInt16LE(22),1);
  assert.equal(wav.readUInt32LE(24),24000);assert.equal(wav.readUInt32LE(28),48000);
  assert.equal(wav.readUInt32LE(40),8);assert.equal(wav.readInt16LE(44),-32768);assert.equal(wav.readInt16LE(48),32767);assert.equal(wav.readInt16LE(50),0);
  assert.throws(()=>encodeMonoWav([],24000),/empty/);
});
test('live call eligibility includes dated and mini realtime models, excludes audio and other providers',()=>{
  for(const model of ['openai/gpt-realtime-2.1','gpt-realtime-2025-08-28','gpt-4o-mini-realtime-preview']) assert.ok(isRealtimeModel(model));
  for(const model of ['openai/gpt-audio-1.5','gpt-4.1','other/gpt-realtime','gpt-realtimex']) assert.equal(isRealtimeModel(model),false);
});
test('voice proxy preserves selected model and SDP, validates requests and never reflects a key',async()=>{
  const app=express();app.use(express.json());
  const sent:any[]=[];let upstreamStatus=201;
  registerRealtimeRoute(app,req=>({activeToken:req.get('x-openai-token'),isOpenAI:!!req.get('x-openai-token')}),async(url,options)=>{
    sent.push({url,options});
    return upstreamStatus===201?new Response('v=0\r\nanswer',{status:201}):new Response(JSON.stringify({error:{message:'Incorrect API key provided: sk-test-secret'}}),{status:upstreamStatus});
  });
  const server=app.listen(0,'127.0.0.1');await once(server,'listening');
  const address=server.address() as {port:number};const base=`http://127.0.0.1:${address.port}`;
  const call=(body:any,key='fake-test-key',origin?:string)=>fetch(base+'/api/realtime/calls',{method:'POST',headers:{'Content-Type':'application/json','x-openai-token':key,...(origin?{origin}:{})},body:JSON.stringify(body)});
  const payload={model:'openai/gpt-realtime-2025-08-28',sdp:'v=0\r\no=test',instructions:'Speak warmly',voice:'verse'};
  try {
    const response=await call(payload);assert.equal(response.status,200);assert.equal(await response.text(),'v=0\r\nanswer');
    assert.equal(response.headers.get('cache-control'),'no-store');
    const form=sent[0].options.body as FormData;const session=JSON.parse(form.get('session') as string);
    assert.equal(form.get('sdp'),payload.sdp);assert.equal(session.model,'gpt-realtime-2025-08-28');assert.equal(session.instructions,payload.instructions);
    assert.deepEqual(session.output_modalities,['audio']);assert.equal(session.audio.output.voice,'verse');
    assert.equal(session.audio.input.turn_detection.interrupt_response,true);assert.ok(session.audio.input.transcription.model);
    assert.equal((await call({...payload,model:'gpt-audio'})).status,400);
    assert.equal((await call(payload,'')).status,401);
    assert.equal((await call(payload,'fake-test-key','https://unrelated.example')).status,403);
    assert.equal((await call({...payload,sdp:'bad'})).status,400);assert.equal(sent.length,1);
    upstreamStatus=401;const rejected=await call(payload);assert.equal(rejected.status,401);assert.doesNotMatch(await rejected.text(),/sk-test-secret/);
    upstreamStatus=400;assert.doesNotMatch(await (await call(payload)).text(),/sk-test-secret/);
  } finally {server.closeAllConnections();await new Promise<void>(resolve=>server.close(()=>resolve()));}
});
