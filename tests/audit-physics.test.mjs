import test from 'node:test';
import assert from 'node:assert/strict';
import {createGame,spawnEntity,stepGame} from '../dist/sim.js';
import {MISSIONS,WORLD} from '../dist/config.js';
import {moveBody,depenetrate,overlaps as collisionOverlap} from '../dist/collision.js';
const DT=1/60;
function arena(){const g=createGame({mission:MISSIONS[0],seed:41});g.entities=[];g.buildings=[];g.populationReserve=1;g.director.nextTruck=g.director.nextPlane=9999;return g;}
const building=(x=500,w=100)=>({id:999,x,y:550,w,h:120,hp:3,maxHp:3,flash:0,shelter:true});
const overlaps=(a,b)=>Math.abs(a.x-b.x)<(a.w+b.w)/2-.001&&Math.abs(a.y-b.y)<(a.h+b.h)/2-.001;
function advance(g,seconds,input={}){for(let i=0;i<Math.ceil(seconds/DT);i++)stepGame(g,input,DT);}

test('PHYS-001: side contact stops the ship without teleporting it onto the roof',()=>{
  const g=arena();g.buildings=[building(850,140)];Object.assign(g.ufo,{x:743,y:530,vx:400});
  stepGame(g,{moveX:1},DT);
  assert.ok(g.ufo.x<=745.01);assert.ok(Math.abs(g.ufo.y-530)<.01);
});
test('PHYS-002: fast airborne cargo sweeps building sides rather than crossing them',()=>{
  for(const vx of [600,12000,60000]){
    const g=arena();g.buildings=[building()];const e=spawnEntity(g,'rock',400,550,{physical:'airborne',vx,vy:0});
    advance(g,.15);assert.ok(e.x+e.w/2<=450.01,`speed ${vx}`);assert.ok(!overlaps(e,g.buildings[0]));
  }
});
test('PHYS-003: released people land on roofs, recover, and fall if support disappears',()=>{
  const g=arena();g.buildings=[building()];const e=spawnEntity(g,'gunner',500,400,{physical:'airborne',vy:0});
  advance(g,1);assert.ok(e.y+e.h/2<=490.01);assert.equal(e.physical,'stunned');
  g.buildings[0].hp=0;advance(g,.8);assert.ok(e.y>490);assert.ok(e.y+e.h/2<=WORLD.ground+.01);
});
test('PHYS-004: beam cargo obeys the floor and world edges while the UFO hovers low',()=>{
  const g=arena();Object.assign(g.ufo,{x:48,y:540,beamAngle:-.6});const e=spawnEntity(g,'rock',48,590,{physical:'lifted'});
  advance(g,1,{beam:true,aimX:-200,aimY:610});
  assert.ok(e.y+e.h/2<=WORLD.ground+.01);assert.ok(e.x-e.w/2>=-.01);
});
test('PHYS-005: an incoming projectile hits the first surface, including a nearer UFO',()=>{
  const g=arena();Object.assign(g.ufo,{x:300,y:300});g.buildings=[{...building(600),y:300,h:100}];
  g.projectiles=[{x:100,y:300,vx:36000,vy:0,life:2,radius:4,kind:'bullet'}];
  stepGame(g,{},DT);assert.equal(g.ufo.hp,40);
});
test('PHYS-006: a fast projectile cannot skip a hit by ending outside the stage',()=>{
  const g=arena();Object.assign(g.ufo,{x:300,y:300});g.projectiles=[{x:100,y:300,vx:300000,vy:0,life:2,radius:4,kind:'bullet'}];
  stepGame(g,{},DT);assert.equal(g.ufo.hp,40);
});
test('PHYS-007: high-speed dropped cargo cannot tunnel through a defender',()=>{
  const g=arena();const defender=spawnEntity(g,'gunner',600,undefined,{timer:999,spawnGrace:999});
  spawnEntity(g,'rock',600,400,{physical:'airborne',wasCarried:true,vy:30000});
  stepGame(g,{},DT);assert.equal(defender.dead,true);assert.equal(g.stats.rockKills,1);
});
test('PHYS-008: every initial non-sheltered actor spawns outside solid buildings',()=>{
  for(const mission of MISSIONS)for(let seed=1;seed<=10;seed++){
    const g=createGame({mission,seed});for(const e of g.entities)assert.ok(!g.buildings.some(b=>overlaps(e,b)),`${mission.id}/${seed}/${e.kind}`);
  }
});
test('PHYS-009: a lifted rock cannot cut horizontally through a building',()=>{
  const g=arena();g.buildings=[building()];Object.assign(g.ufo,{x:650,y:460});const e=spawnEntity(g,'rock',400,550,{physical:'lifted',carried:true});
  for(let i=0;i<120;i++){stepGame(g,{beam:true,aimX:650,aimY:610},DT);assert.ok(!overlaps(e,g.buildings[0]));}
});
test('AI-001: shelter routing cannot disable collisions with an intervening building',()=>{
  const g=arena();g.ufo.x=100;g.ufo.y=250;g.buildings=[building(500),{...building(750),id:1000}];
  const e=spawnEntity(g,'civilian',400,undefined,{state:'flee',shelterId:1000,timer:5});
  for(let i=0;i<180;i++){stepGame(g,{},DT);assert.ok(!overlaps(e,g.buildings[0]));}
});
test('AI-002: transports stop before blocked roads and unload safely',()=>{
  const g=arena();g.buildings=[building()];const truck=spawnEntity(g,'truck',350,undefined,{state:'enter',direction:1,dropX:700,vx:95,passengers:2});
  for(let i=0;i<300;i++){stepGame(g,{},DT);assert.ok(!overlaps(truck,g.buildings[0]));}
  assert.equal(truck.passengers,0);assert.ok(g.entities.filter(e=>e.collectible).length===2);
});
test('AI-003: a sheltered civilian is protected, counted, and exits when its shelter breaks',()=>{
  const g=arena(),b=building();g.buildings=[b];
  const e=spawnEntity(g,'civilian',439,undefined,{state:'flee',shelterId:b.id,timer:10});
  stepGame(g,{},DT);assert.equal(e.state,'sheltered');assert.equal(b.occupancy,1);
  Object.assign(g.ufo,{x:e.x,y:350});advance(g,.3,{beam:true,aimX:e.x,aimY:610});
  assert.equal(e.state,'sheltered');assert.equal(e.physical,'grounded');
  b.hp=0;stepGame(g,{},DT);assert.equal(e.state,'flee');assert.equal(e.shelterId,null);
});
test('AI-004: an agent follows a blocked last sighting without vibrating against the wall',()=>{
  const g=arena();g.buildings=[building()];Object.assign(g.ufo,{x:800,y:200});
  const agent=spawnEntity(g,'agent',437,undefined,{state:'patrol',memory:2,lastSeenX:700,lastSeenY:200,timer:2,spawnGrace:999});
  advance(g,.7);assert.ok(agent.x<430,'a blocked route must produce movement away from the obstruction');
});
test('PHYS-010: corners, thin walls and overlapping geometry resolve without penetration',()=>{
  const solids=[{x:300,y:450,w:8,h:320,hp:3},{x:345,y:580,w:100,h:20,hp:3},{x:350,y:580,w:80,h:20,hp:3}];
  const body={x:250,y:300,w:24,h:36};moveBody(body,400,400,solids);
  assert.ok(solids.every(s=>!collisionOverlap(body,s)));
  const embedded={x:340,y:580,w:24,h:36};depenetrate(embedded,solids);
  assert.ok(solids.every(s=>!collisionOverlap(embedded,s)));
  const corridor=[{x:400,y:500,w:20,h:220,hp:3},{x:450,y:500,w:20,h:220,hp:3}];
  const actor={x:425,y:300,w:24,h:36};moveBody(actor,0,1000,corridor);
  assert.ok(corridor.every(s=>!collisionOverlap(actor,s)));assert.ok(actor.y+actor.h/2<=610.01);
});
test('PHYS-011: fast aircraft use their actual swept shape for cargo and ship impacts',()=>{
  const g=arena();Object.assign(g.ufo,{x:700,y:200});
  const plane=spawnEntity(g,'plane',100,200,{vx:60000,state:'fly'});
  stepGame(g,{},DT);assert.equal(plane.dead,true);assert.equal(g.ufo.hp,35);
  const clear=arena();Object.assign(clear.ufo,{x:700,y:300});
  spawnEntity(clear,'plane',100,200,{vx:60000,state:'fly'});stepGame(clear,{},DT);assert.equal(clear.ufo.hp,50);
});
test('PHYS-012: seeded gameplay keeps non-scripted bodies outside solid geometry and bounds',()=>{
  for(let seed=1;seed<=10;seed++){
    const g=createGame({mission:MISSIONS[(seed-1)%5],seed,upgrades:{armour:3,engine:4,capacity:4,suction:4}});
    for(let i=0;i<1800&&g.status==='playing';i++){
      stepGame(g,{moveX:Math.sin(i/81),moveY:Math.cos(i/67),beam:i%200<170,aimX:g.ufo.x+Math.sin(i/30)*300,aimY:610},DT);
      assert.ok(!g.buildings.some(b=>b.hp>0&&overlaps(g.ufo,b)));
      for(const e of g.entities){
        if(e.kind==='plane'||(e.kind==='truck'&&['enter','leave'].includes(e.state)))continue;
        assert.ok([e.x,e.y,e.vx,e.vy].every(Number.isFinite));
        assert.ok(e.y+e.h/2<=WORLD.ground+.01);assert.ok(e.x>=e.w/2-.01&&e.x<=WORLD.width-e.w/2+.01);
        assert.ok(!g.buildings.some(b=>b.hp>0&&overlaps(e,b)),`${seed}/${i}/${e.kind}/${e.state}`);
      }
    }
  }
});
