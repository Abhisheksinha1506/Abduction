import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import * as config from '../dist/config.js';
import * as sim from '../dist/sim.js';
import * as progression from '../dist/progression.js';

// Execute the real client and simulation against a minimal DOM/audio boundary.
// Layout and actual browser behavior are verified separately in the browser.
function client({width=1280,height=720,dpr=1,canvasAvailable=true,observer=true}={}){
  const registry=new Map(),raf=[],timers=new Map(),logs=[],renders=[];
  let document;
  class Element{
    constructor(id='',tag='div'){this.id=id;this.tagName=tag;this.style={};this.listeners={};this.attributes={};this.controls=[];this.captures=new Set();this.isConnected=true;this.width=1280;this.height=720;const classes=new Set();this.classList={add:x=>classes.add(x),remove:x=>classes.delete(x),contains:x=>classes.has(x),toggle:(x,v)=>v?classes.add(x):classes.delete(x)};}
    set innerHTML(value){this.html=value;this.controls=[];for(const m of value.matchAll(/<(button|select|input|div)\b([^>]*)>/g)){
      const id=m[2].match(/id="([^"]+)"/)?.[1]||'',element=new Element(id,m[1]);
      element.disabled=/\bdisabled\b/.test(m[2]);if(id)registry.set(id,element);if(m[1]!=='div')this.controls.push(element);
    }}
    get innerHTML(){return this.html;}
    get firstElementChild(){return this.child??=new Element();}
    addEventListener(type,handler){(this.listeners[type]??=[]).push(handler);}
    emit(type,event={}){const e={target:this,currentTarget:this,button:0,pointerId:1,pointerType:'mouse',preventDefault(){this.prevented=true;},...event};for(const handler of this.listeners[type]||[])handler(e);return e;}
    getBoundingClientRect(){const w=this.id==='game'?parseFloat(this.style.width)||width:width,h=this.id==='game'?parseFloat(this.style.height)||height:height;return {left:(width-w)/2,top:(height-h)/2,width:w,height:h};}
    setAttribute(name,value){this.attributes[name]=value;}getAttribute(name){return this.attributes[name]??null;}
    getContext(){return canvasAvailable?{setTransform(){}}:null;}
    focus(){document.activeElement=this;}
    querySelector(){return this.controls[0]??null;}
    querySelectorAll(){return this.controls.filter(e=>!e.disabled);}
    contains(e){return this.controls.includes(e);}
    matches(selector){return selector.split(',').some(s=>s===this.tagName);}
    setPointerCapture(id){this.captures.add(id);}hasPointerCapture(id){return this.captures.has(id);}releasePointerCapture(id){this.captures.delete(id);}
  }
  for(const match of readFileSync(new URL('../dist/index.html',import.meta.url),'utf8').matchAll(/id="([^"]+)"/g))registry.set(match[1],new Element(match[1],match[1]==='game'?'canvas':'div'));
  const wrap=registry.get('game-wrap');wrap.clientWidth=width;wrap.clientHeight=height;
  const outside=[new Element('header'),new Element('footer')];
  document=new Element('document');document.activeElement=document;document.getElementById=id=>registry.get(id);document.querySelectorAll=()=>outside;
  const window=new Element('window');window.devicePixelRatio=dpr;window.location={reload(){}};
  class SilentSound{unlock(){}setEnabled(){}setBeam(){}play(){}stopTransient(){}dispose(){}}
  const storage=new Map();
  const context=vm.createContext({document,window,console:{error:(...v)=>logs.push(v),warn:(...v)=>logs.push(v)},Date,Math,Set,
    localStorage:{getItem:k=>storage.get(k)??null,setItem:(k,v)=>storage.set(k,v)},
    requestAnimationFrame:callback=>raf.push(callback),setTimeout:callback=>{const id=timers.size+1;timers.set(id,callback);return id;},clearTimeout:id=>timers.delete(id),
    ...(observer?{ResizeObserver:class{observe(){}}}:{}),
    dependencies:{config,sim,progression,render:{render:(...args)=>renders.push(args[2])},audio:{Sound:SilentSound}}});
  let source=readFileSync(new URL('../dist/app.js',import.meta.url),'utf8');
  source=source.replace(/import\s*\{([^}]+)\}\s*from\s*['"]\.\/([^'"]+)\.js['"];?/g,(_,names,module)=>`const {${names}}=dependencies.${module};`);
  source+='\nglobalThis.audit={startGame,openModal,closeModal,resetInput,resizeCanvas,frame,showHome,showMissions,get state(){return {scene,paused,modal,game,pointer,touch,stickPointer,beamPointer:typeof beamPointer==="undefined"?null:beamPointer,canvasPointer:typeof canvasPointer==="undefined"?null:canvasPointer,viewportWidth:typeof viewportWidth==="undefined"?canvas.width:viewportWidth,frameFailed:typeof frameFailed==="undefined"?false:frameFailed,save};}};';
  vm.runInContext(source,context,{filename:'app.js'});
  return {api:context.audit,window,document,registry,outside,logs,renders,flush(){for(const callback of raf.splice(0))callback(0);}};
}

test('UI-001: Escape closes settings even when its select has focus; nested settings return to pause',()=>{
  const c=client();c.api.openModal('settings');c.flush();const select=c.registry.get('difficulty-select');select.focus();
  c.window.emit('keydown',{key:'Escape',target:select});assert.equal(c.api.state.modal,null);
  c.api.startGame();c.api.openModal('pause');c.api.openModal('settings');c.api.closeModal();
  assert.equal(c.api.state.modal,'pause');assert.equal(c.api.state.paused,true);
  c.api.closeModal();assert.equal(c.api.state.paused,false);assert.equal(c.document.activeElement.id,'game');
});
test('UI-002: modal focus wraps within the dialog and isolates header/footer actions',()=>{
  const c=client();c.api.openModal('settings');c.flush();const modal=c.registry.get('modal-layer'),first=modal.controls[0],last=modal.controls.at(-1);first.focus();
  c.window.emit('keydown',{key:'Tab',shiftKey:true,target:first});assert.equal(c.document.activeElement,last);
  assert.ok(c.outside.every(e=>e.inert));c.api.closeModal();assert.ok(c.outside.every(e=>!e.inert));
});
test('UI-003: unrelated fingers and right clicks cannot interrupt a mouse beam',()=>{
  const c=client();c.api.startGame();const canvas=c.registry.get('game');
  canvas.emit('pointerdown',{button:2,pointerId:1,clientX:600,clientY:600});assert.equal(c.api.state.pointer.down,false);
  canvas.emit('pointerdown',{button:0,pointerId:1,clientX:600,clientY:600});
  c.window.emit('pointerup',{pointerId:2});assert.equal(c.api.state.pointer.down,true);
  canvas.emit('lostpointercapture',{pointerId:1});assert.equal(c.api.state.pointer.down,false);
});
test('UI-004: pause clears touch ownership so a held finger cannot restart motion on resume',()=>{
  const c=client();c.api.startGame();const stick=c.registry.get('touch-stick');
  stick.emit('pointerdown',{pointerId:9,clientX:100,clientY:100});assert.equal(c.api.state.stickPointer,9);
  c.api.openModal('pause');c.api.closeModal();stick.emit('pointermove',{pointerId:9,clientX:500,clientY:500});
  assert.equal(c.api.state.touch.x,0);assert.equal(c.api.state.touch.y,0);assert.equal(c.api.state.stickPointer,null);
});
test('UI-005: retina and ultrawide pointer coordinates use drawable logical pixels, not backing pixels',()=>{
  const c=client({width:5000,height:500,dpr:2});c.api.startGame();const canvas=c.registry.get('game'),r=canvas.getBoundingClientRect();
  canvas.emit('pointermove',{clientX:r.left+r.width/2,clientY:r.top+r.height/2});
  assert.equal(c.api.state.viewportWidth,2400);assert.equal(canvas.width,Math.round(r.width*2));
  assert.ok(Math.abs(c.api.state.pointer.x-1200)<.001);assert.ok(Math.abs(c.api.state.pointer.y-360)<.001);
});
test('UI-006: pause freezes both gameplay time and animation time; resize fallback can start',()=>{
  const c=client({observer:false});c.api.startGame();c.api.frame(1000);c.api.openModal('pause');const time=c.api.state.game.time;
  c.api.frame(5000);assert.equal(c.api.state.game.time,time);assert.equal(c.renders.at(-1).time,time);
});
test('CRASH-001: missing Canvas support produces a visible recovery screen and reports the cause',()=>{
  const c=client({canvasAvailable:false});assert.equal(c.api.state.frameFailed,true);
  assert.match(c.registry.get('screen').innerHTML,/Reload game/);assert.equal(c.logs.length,1);
});
