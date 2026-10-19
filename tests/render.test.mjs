import test from 'node:test';
import assert from 'node:assert/strict';
import {createGame,stepGame,spawnEntity} from '../dist/sim.js';
import {render} from '../dist/render.js';
import {MISSIONS} from '../dist/config.js';

// Validate the simulation/Canvas contract without a browser. This is not visual QA.
function checkedContext(){
  let depth=0,draws=0;
  const gradient={addColorStop(offset,color){assert.ok(Number.isFinite(offset));assert.equal(typeof color,'string');}};
  const numericMethods=new Set(['translate','scale','rotate','moveTo','lineTo','ellipse','arc','rect','roundRect','fillRect','strokeRect','bezierCurveTo','quadraticCurveTo','createLinearGradient','createRadialGradient']);
  const context=new Proxy({}, {get(target,key){
    if(key in target)return target[key];
    if(key==='save')return ()=>depth++;
    if(key==='restore')return ()=>{assert.ok(depth>0,'canvas restore must have a matching save');depth--;};
    if(key==='measureText')return text=>({width:String(text).length*7});
    return (...args)=>{draws++;if(numericMethods.has(key))for(const arg of args){if(typeof arg==='number')assert.ok(Number.isFinite(arg),`${key} received a nonfinite number`);}return key.startsWith('create')?gradient:undefined;};
  }});
  return {context,check(){assert.equal(depth,0,'render must restore canvas transforms and styles');assert.ok(draws>100);}};
}

test('all scene themes and physical states render with finite geometry and balanced transforms',()=>{
  for(const mission of MISSIONS){
    const game=createGame({mission,seed:811});
    spawnEntity(game,'truck',650,500,{physical:'airborne',vx:120,vy:250});
    spawnEntity(game,'bomb',750,400,{physical:'lifted',carried:true});
    spawnEntity(game,'plane',800,250,{vx:300});
    spawnEntity(game,'agent',950,590,{physical:'stunned',timer:1});
    for(let frame=0;frame<600;frame++)stepGame(game,{beam:true,moveX:.25,aimX:game.ufo.x,aimY:610},1/60);
    game.director.warning=2;
    if(game.boss){game.boss.vulnerable=true;game.boss.state='exposed';}
    for(const reducedMotion of [false,true]){
      const c=checkedContext();render(c.context,game,{width:1280,height:720,time:10,reducedMotion});c.check();
    }
  }
});
