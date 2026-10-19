import test from 'node:test';
import assert from 'node:assert/strict';
import {Sound} from '../dist/audio.js';
// Unit-level Web Audio boundary. Actual output-device listening is a separate check.
class Param{setValueAtTime(){} exponentialRampToValueAtTime(){} setTargetAtTime(){} cancelScheduledValues(){}}
class AudioNode{
  constructor(){this.gain=new Param();this.frequency=new Param();this.disconnected=false;this.started=[];this.stopped=[];}
  connect(){} disconnect(){this.disconnected=true;} start(t){this.started.push(t);} stop(t){this.stopped.push(t);}
}
class Context{
  constructor(){this.state='running';this.currentTime=1;this.destination={};this.nodes=[];}
  createGain(){const n=new AudioNode();this.nodes.push(n);return n;}
  createOscillator(){const n=new AudioNode();this.nodes.push(n);return n;}
  resume(){this.state='running';return Promise.resolve();}close(){this.state='closed';return Promise.resolve();}
}
test('AUDIO-001: finished voices disconnect, and repeated events have a bounded voice count',()=>{
  const ctx=new Context(),sound=new Sound({createContext:()=>ctx});sound.unlock();
  for(let i=0;i<100;i++)sound.play('capture');
  assert.ok(sound.voices.size<=16);
  for(const n of ctx.nodes)if(n.onended)n.onended();
  assert.equal(sound.voices.size,0);
  assert.ok(ctx.nodes.slice(1).every(n=>n.disconnected));
});
test('AUDIO-002: scene changes and mute cancel every scheduled victory note and beam source',()=>{
  const ctx=new Context(),sound=new Sound({createContext:()=>ctx});sound.unlock();sound.play('win');sound.setBeam(true);
  const oscillators=ctx.nodes.filter(n=>n.started.length);assert.equal(oscillators.length,5);
  sound.stopTransient();assert.equal(sound.voices.size,0);assert.equal(sound.beam,null);
  for(const n of oscillators)assert.ok(n.stopped.length);
  sound.setEnabled(false);sound.play('hit');assert.equal(ctx.nodes.filter(n=>n.started.length).length,5);
});
test('AUDIO-003: a rejected browser resume is reported once without an unhandled rejection',async()=>{
  const ctx=new Context();ctx.state='suspended';ctx.resume=()=>Promise.reject(new Error('device unavailable'));
  const errors=[],sound=new Sound({createContext:()=>ctx,onError:error=>errors.push(error.message)});
  sound.unlock();sound.unlock();await new Promise(resolve=>setImmediate(resolve));
  assert.deepEqual(errors,['device unavailable']);sound.dispose();
});
test('AUDIO-004: an audio-device failure during beam creation cannot stop the game loop',()=>{
  const ctx=new Context(),errors=[],sound=new Sound({createContext:()=>ctx,onError:e=>errors.push(e.message)});sound.unlock();
  ctx.createOscillator=()=>{throw new Error('output device lost');};
  assert.doesNotThrow(()=>sound.setBeam(true));assert.equal(sound.beam,null);assert.deepEqual(errors,['output device lost']);
});
