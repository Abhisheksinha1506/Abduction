import test from 'node:test';
import assert from 'node:assert/strict';
import {createGame,stepGame} from '../dist/sim.js';
import {MISSIONS} from '../dist/config.js';
import {defaultSave,completeMission,purchaseUpgrade,persistSave,loadSave} from '../dist/progression.js';
const clamp=v=>Math.max(-1,Math.min(1,v));

function flyCampaignMission(game){
  let targetX=2200;
  for(let frame=0;frame<game.mission.duration*60+30&&game.status==='playing';frame++){
    if(Math.abs(game.ufo.x-targetX)<50)targetX=targetX===2200?120:2200;
    stepGame(game,{moveX:Math.sign(targetX-game.ufo.x),moveY:clamp((280-game.ufo.y)*.02),aimX:game.ufo.x,aimY:610,beam:true},1/60);
  }
}

function flyBoss(game){
  let cooldown=0,targetId=null;
  for(let frame=0;frame<180*60+30&&game.status==='playing';frame++){
    cooldown=Math.max(0,cooldown-1/60);
    const held=game.entities.find(e=>['rock','bomb','truck'].includes(e.kind)&&e.physical==='lifted');
    let tx=game.ufo.x,ty=200,beam=cooldown===0;
    if(held&&held.carried){
      tx=game.boss.x;ty=180;
      if(Math.abs(game.ufo.x-tx)<9&&Math.abs(game.ufo.vx)<25&&game.boss.vulnerable&&cooldown===0){beam=false;cooldown=.7;targetId=null;}
    }else{
      let target=game.entities.find(e=>e.id===targetId&&!e.dead&&e.physical!=='airborne');
      if(!target){target=game.entities.filter(e=>['rock','bomb'].includes(e.kind)&&e.physical==='grounded').sort((a,b)=>Math.abs(a.x-game.ufo.x)-Math.abs(b.x-game.ufo.x))[0];targetId=target?.id;}
      if(held){tx=held.x;ty=200;}else if(target){tx=target.x;ty=260;}else{tx=1660;ty=250;}
    }
    stepGame(game,{moveX:clamp((tx-game.ufo.x)*.016-game.ufo.vx*.002),moveY:clamp((ty-game.ufo.y)*.016-game.ufo.vy*.002),aimX:game.ufo.x,aimY:610,beam},1/60);
  }
}

test('a fresh campaign can unlock every mission, buy earned upgrades, beat ATLAS, and reload the ending',()=>{
  let save=defaultSave();
  for(const mission of MISSIONS){
    assert.ok(mission.id<=save.unlocked,'each mission must be earned before starting');
    const game=createGame({mission,upgrades:save.upgrades,seed:42});
    if(mission.boss)flyBoss(game);else flyCampaignMission(game);
    assert.equal(game.status,'won',`mission ${mission.id} must be beatable with legal controls and earned upgrades`);
    assert.ok(game.ufo.hp>0);
    if(mission.boss){assert.equal(game.boss.hp,0);assert.ok(game.stats.bossHits>=4);}
    save=completeMission(save,game).save;
    for(const id of ['engine','suction','armour','capacity']){
      const purchase=purchaseUpgrade(save,id);if(purchase.ok)save=purchase.save;
    }
  }
  assert.deepEqual(save.completed,[1,2,3,4,5]);
  assert.equal(save.unlocked,5);
  assert.ok(save.career.captured>30);
  const memory=new Map(),storage={getItem:key=>memory.get(key)??null,setItem:(key,value)=>memory.set(key,value)};
  assert.equal(persistSave(save,storage),true);
  assert.deepEqual(loadSave(storage),save);
});

test('the boss can be beaten with carried cargo across different encounter seeds',()=>{
  for(const seed of [1,2,3]){
    const game=createGame({mission:MISSIONS[4],seed,upgrades:{suction:2,engine:2,armour:2,capacity:1}});
    flyBoss(game);
    assert.equal(game.status,'won',`seed ${seed}`);
    assert.equal(game.boss.phase,3);
    assert.ok(game.stats.bossHits>=4);
    assert.ok(game.time<180);
  }
});
