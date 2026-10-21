import { WORLD, EMPTY_UPGRADES } from './config.js';
import { moveBody, depenetrate, supportAt, sweepBox, segmentHit } from './collision.js';

// The entire simulation is independent of the DOM and uses seconds and world units.
const TAU = Math.PI * 2;
const BEAM_LIMIT = Math.PI * 40 / 180;
const GRAVITY = 520;
const PEOPLE = new Set(['civilian', 'thrower', 'gunner', 'agent', 'cow']);
const HOSTILES = new Set(['thrower', 'gunner', 'agent']);
const CARGO = new Set(['rock', 'truck', 'bomb']);
const SHELTER_COOLDOWN = 7;
const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
const randomBetween = (game, a, b) => a + game.random() * (b - a);
const approach = (current, target, speed, dt) => current + (target - current) * (1 - Math.exp(-speed * dt));

export function angleDifference(a, b) {
  return ((a - b + Math.PI) % TAU + TAU) % TAU - Math.PI;
}

function seededRandom(seed) {
  let value = seed >>> 0;
  return () => {
    value += 0x6D2B79F5;
    let t = Math.imul(value ^ value >>> 15, 1 | value);
    t ^= t + Math.imul(t ^ t >>> 7, 61 | t);
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}

function event(game, type, details = {}) {
  game.events.push({ type, ...details });
  if (game.events.length > 128) game.events.splice(0, game.events.length - 128);
}

function label(game, x, y, text, color = '#b6ff80') {
  game.texts.push({ x, y, text, color, life: 1.7 });
  if (game.texts.length > 24) game.texts.shift();
}

function burst(game, x, y, color, count = 12, speed = 110) {
  for (let i = 0; i < count; i++) {
    const angle = randomBetween(game, 0, TAU);
    const velocity = randomBetween(game, speed * .25, speed);
    const life = randomBetween(game, .25, .7);
    game.particles.push({ x, y, vx: Math.cos(angle) * velocity, vy: Math.sin(angle) * velocity,
      life, maxLife: life, color, size: randomBetween(game, 2, 5) });
  }
  if (game.particles.length > 240) game.particles.splice(0, game.particles.length - 240);
}

function segmentIntersectsBox(x1,y1,x2,y2,box,pad=0) {
  return Boolean(segmentHit(x1,y1,x2,y2,box,pad));
}

function movingHit(x1,y1,x2,y2,box,pad=0) {
  const px=box.previousX ?? box.x, py=box.previousY ?? box.y;
  return segmentHit(x1,y1,x2-(box.x-px),y2-(box.y-py),{x:px,y:py,w:box.w,h:box.h},pad);
}

export function hasLineOfSight(game, x1, y1, x2, y2, options = {}) {
  for (const building of game.buildings) {
    if (building.hp > 0 && segmentIntersectsBox(x1, y1, x2, y2, building)) return false;
  }
  if (options.includeCargo !== false) {
    for (const entity of game.entities) {
      if (entity.id !== options.ignoreId && !entity.dead && CARGO.has(entity.kind) &&
          (entity.physical === 'lifted' || entity.physical === 'airborne') &&
          segmentIntersectsBox(x1, y1, x2, y2, entity, -3)) return false;
    }
  }
  return true;
}

const DEFINITIONS = {
  civilian: { w: 22, h: 34, load: 10, hp: 1, collectible: true, value: 100, speed: 64 },
  thrower: { w: 24, h: 36, load: 10, hp: 1, collectible: true, value: 125, speed: 46 },
  gunner: { w: 25, h: 36, load: 10, hp: 1, collectible: true, value: 140, speed: 44 },
  agent: { w: 25, h: 38, load: 12, hp: 1, collectible: true, value: 175, speed: 68 },
  cow: { w: 48, h: 34, load: 12, hp: 1, collectible: true, value: 150, speed: 38 },
  rock: { w: 39, h: 32, load: 18, hp: 6, collectible: false, value: 0, speed: 0 },
  truck: { w: 102, h: 52, load: 30, hp: 5, collectible: false, value: 0, speed: 95 },
  plane: { w: 98, h: 34, load: 100, hp: 1, collectible: false, value: 300, speed: 330 },
  bomb: { w: 28, h: 30, load: 16, hp: 1, collectible: false, value: 0, speed: 0 },
};

export function spawnEntity(game, kind, x, y, extra = {}) {
  const type = DEFINITIONS[kind];
  if (!type) throw new Error(`Unknown entity kind: ${kind}`);
  const entity = {
    ...type, id: ++game.nextId, kind, x, y: y ?? WORLD.ground - type.h / 2,
    vx: 0, vy: 0, state: 'idle', physical: 'grounded', carried: false,
    timer: randomBetween(game, .5, 2.5), thinkTimer: randomBetween(game, 0, .2),
    direction: game.random() < .5 ? -1 : 1, flash: 0, reacquire: 0,
    spawnGrace: 1.5, attackProgress: 0, wasCarried: false, ...extra,
  };
  if (kind !== 'plane' && !(kind === 'truck' && ['enter','leave'].includes(entity.state))) {
    depenetrate(entity,game.buildings,{horizontalOnly:entity.physical==='grounded'});
  }
  entity.previousX=entity.x;entity.previousY=entity.y;
  game.entities.push(entity);
  return entity;
}

function populationKind(game, index) {
  if (index % 7 === 4) return 'cow';
  if (game.mission.threat >= 3 && index % 5 === 3) return 'agent';
  if (game.mission.threat >= 2 && index % 4 === 2) return 'gunner';
  if (index % 4 === 3) return 'thrower';
  return 'civilian';
}

function spawnPopulation(game, x, y, extra = {}) {
  if (game.populationReserve <= 0) return null;
  game.populationReserve--;
  const kind = populationKind(game, game.populationSpawned++);
  return spawnEntity(game, kind, x, y, extra);
}

export function getRemainingPopulation(game) {
  return game.populationReserve + game.entities.reduce((sum, entity) =>
    sum + (!entity.dead && entity.collectible ? 1 : 0) +
    (!entity.dead && entity.kind === 'truck' ? entity.passengers || 0 : 0), 0);
}

export function createGame({ mission, upgrades = EMPTY_UPGRADES, difficulty = 'normal', seed = 1234 }) {
  if (!mission || !Number.isFinite(mission.duration)) throw new Error('A valid mission is required.');
  const levels = {};
  for (const key of Object.keys(EMPTY_UPGRADES)) {
    levels[key] = clamp(Math.floor(Number(upgrades[key]) || 0), 0, key === 'armour' ? 3 : key === 'processor' ? 2 : 4);
  }
  const challenge = difficulty === 'easy' ? .75 : difficulty === 'hard' ? 1.25 : 1;
  const game = {
    time: 0, remaining: mission.duration, status: 'playing', mission, upgrades: levels,
    difficulty, challenge, random: seededRandom(seed), seed, nextId: 0,
    camera: 0, entities: [], projectiles: [], particles: [], texts: [], events: [],
    populationReserve: mission.population, populationSpawned: 0,
    beamFeedback: 'HOLD TO COLLECT', comboTimer: 0, shake: 0,
    ufo: { x: 420, y: 305, w: 70, h: 42, vx: 0, vy: 0, hp: 50 + levels.armour * 10,
      maxHp: 50 + levels.armour * 10, angle: 0, beamAngle: 0, beamOn: false,
      load: 0, capacity: 30 + levels.capacity * 10, invulnerable: 0 },
    stats: { captured: 0, destroyed: 0, rockKills: 0, planesDown: 0, combo: 1,
      maxCombo: 1, credits: 0, bossHits: 0, damageTaken: 0 },
    director: { phase: 'introduce', phaseTimer: 0, warning: 0, warningSide: 'left',
      warningY: 240, nextPlane: mission.id === 1 ? 31 : 19, nextTruck: 13,
      relief: 0, attackCooldown: 0, maxAttacks: 2, threat: 0 },
    buildings: [], boss: null,
  };
  const placements = mission.boss ? [[810, 140, 115], [1280, 150, 150]] :
    [[850, 140, 120], [1460, 175, 155], [2185, 150, 115]];
  for (const [x, w, h] of placements) {
    game.buildings.push({ id: ++game.nextId, x, y: WORLD.ground - h / 2,
      w, h, hp: 3, maxHp: 3, shelter: true, flash: 0, kind: mission.theme });
  }
  const initialCount = Math.min(mission.population - 4, mission.boss ? 10 : 15);
  const spots = [390, 465, 300, 620, 180, 1015, 1120, 1280, 1660, 1775, 1920, 2050, 70, 2300, 530];
  for (let i = 0; i < initialCount; i++) spawnPopulation(game, spots[i % spots.length] + randomBetween(game, -18, 18));
  for (const x of [555, 1070, 1715, 2020]) spawnEntity(game, 'rock', x);
  if (mission.boss) {
    game.boss = { x: 1940, y: 440, w: 190, h: 340, hp: 180, maxHp: 180,
      coreX: 1940, coreY: 385, coreRadius: 46, phase: 1, phaseTransitions: 0,
      state: 'intro', timer: 4, vulnerable: false, flash: 0, telegraphX: 420,
      volleyCount: 0, nextShot: 0 };
    label(game, 490, 220, 'LIFT CARGO. DROP IT ON THE GLOWING CORE.', '#f5c465');
  }
  return game;
}

function updateUfo(game, input, dt) {
  const ufo = game.ufo;
  const speed = 290 + game.upgrades.engine * 43;
  let moveX = clamp(Number(input.moveX) || 0, -1, 1);
  let moveY = clamp(Number(input.moveY) || 0, -1, 1);
  const magnitude = Math.hypot(moveX, moveY);
  if (magnitude > 1) { moveX /= magnitude; moveY /= magnitude; }
  const responsiveness = 7.5 + game.upgrades.engine * .5;
  ufo.vx = approach(ufo.vx, moveX * speed, moveX ? responsiveness : 6.4, dt);
  ufo.vy = approach(ufo.vy, moveY * speed, moveY ? responsiveness : 6.4, dt);
  ufo.previousX=ufo.x;ufo.previousY=ufo.y;
  const contacts=moveBody(ufo,ufo.vx*dt,ufo.vy*dt,game.buildings,
    {limits:{left:48,right:WORLD.width-48,top:74,bottom:WORLD.ground-70}});
  for(const contact of contacts){if(contact.nx)ufo.vx=0;if(contact.ny)ufo.vy=0;}
  ufo.angle = approach(ufo.angle, clamp(ufo.vx / speed * .17, -.17, .17), 9, dt);
  if (Number.isFinite(input.aimX) && Number.isFinite(input.aimY)) {
    const desired = clamp(Math.atan2(input.aimX - ufo.x, Math.max(1, input.aimY - ufo.y)), -BEAM_LIMIT, BEAM_LIMIT);
    ufo.beamAngle = approach(ufo.beamAngle, desired, 10.5, dt);
  }
  ufo.invulnerable = Math.max(0, ufo.invulnerable - dt);
  const viewportWidth = clamp(game.viewportWidth || 1280, 480, WORLD.width);
  game.camera = approach(game.camera, clamp(ufo.x - viewportWidth / 2, 0, WORLD.width - viewportWidth), 5, dt);
}

function cancelAttack(entity) {
  entity.attackProgress = 0;
  entity.aimLocked = false;
  entity.attackReleased = false;
  entity.aimX = undefined;
  entity.aimY = undefined;
}

export function releaseLoad(game) {
  let released = 0;
  for (const entity of game.entities) {
    if (entity.dead || entity.physical !== 'lifted') continue;
    entity.physical = 'airborne';
    entity.state = 'falling';
    entity.carried = false;
    entity.wasCarried = true;
    entity.reacquire = .32;
    entity.vx = game.ufo.vx * .82;
    entity.vy = Math.max(75, game.ufo.vy * .5 + 65);
    entity.harmful = false;
    entity.impactGrace = .18;
    entity.timer = 0;
    cancelAttack(entity);
    released++;
  }
  game.ufo.load = 0;
  if (released) event(game, 'throw', { x: game.ufo.x, y: game.ufo.y, count: released });
  return released;
}

function updateBeam(game, input, dt) {
  const ufo = game.ufo;
  ufo.beamOn = Boolean(input.beam) && ufo.invulnerable < 1.05;
  if (!ufo.beamOn) {
    releaseLoad(game);
    game.beamFeedback = ufo.invulnerable >= 1.05 ? 'BEAM INTERRUPTED' : 'HOLD TO COLLECT';
    return;
  }
  let load = game.entities.reduce((sum, entity) => sum + (!entity.dead && entity.physical === 'lifted' ? entity.load : 0), 0);
  const sx = Math.sin(ufo.beamAngle);
  const sy = Math.cos(ufo.beamAngle);
  let full = false;
  let tooHeavy = false;
  let blocked = false;
  const candidates = game.entities.filter(entity => !entity.dead && entity.kind !== 'plane' && entity.physical !== 'lifted' && entity.state !== 'sheltered')
    .sort((a, b) => distance(ufo, a) - distance(ufo, b));
  for (const entity of candidates) {
    const dx = entity.x - ufo.x;
    const dy = entity.y - (ufo.y + 12);
    const along = dx * sx + dy * sy;
    const across = Math.abs(dx * sy - dy * sx);
    if (along < 18 || along > 450 || across > 19 + along * .068 + entity.w * .25 || entity.reacquire > 0) continue;
    if (entity.kind === 'truck' && Math.abs(entity.vx) > 40 && entity.physical === 'grounded') continue;
    if (!hasLineOfSight(game, ufo.x, ufo.y + 12, entity.x, entity.y, { ignoreId: entity.id })) {
      blocked = true;
      continue;
    }
    if (load + entity.load > ufo.capacity) {
      if (load >= ufo.capacity) full = true;
      else tooHeavy = true;
      continue;
    }
    entity.physical = 'lifted';
    entity.state = 'lifted';
    entity.carried = false;
    entity.wasCarried = true;
    entity.harmful = false;
    entity.vx *= .15;
    entity.vy = 0;
    entity.timer = 0;
    entity.shelterId = null;
    cancelAttack(entity);
    load += entity.load;
    if (entity.kind === 'truck' && entity.passengers) unloadTruck(game, entity, true);
  }
  ufo.load = load;
  game.beamFeedback = full ? 'BEAM AT CAPACITY' : tooHeavy ? 'TARGET TOO HEAVY' :
    blocked ? 'PATH BLOCKED · CHANGE ANGLE' :
    load ? 'RELEASE TO DROP CARGO' : 'SEARCHING FOR CARGO';
}

function addCombo(game) {
  game.stats.streak = (game.stats.streak || 0) + 1;
  game.stats.combo = Math.min(10, 1 + Math.floor(game.stats.streak / 3) * .5);
  game.stats.maxCombo = Math.max(game.stats.maxCombo, game.stats.combo);
  game.comboTimer = 7;
}

function capture(game, entity) {
  if (entity.dead) return;
  entity.dead = true;
  entity.physical = 'captured';
  game.stats.captured++;
  addCombo(game);
  const credits = Math.round(entity.value * game.stats.combo * (1 + game.upgrades.processor * .2));
  game.stats.credits += credits;
  label(game, game.ufo.x + randomBetween(game, -25, 25), game.ufo.y - 45, `+$${credits}`);
  burst(game, entity.x, entity.y, '#b8ff80', 9, 75);
  event(game, 'capture', { kind: entity.kind, x: entity.x, y: entity.y, credits });
}

function updateLifted(game, entity, dt, slot) {
  const ufo = game.ufo;
  const suction = 1 + game.upgrades.suction * .28;
  let tx;
  let ty;
  if (entity.collectible) {
    tx = ufo.x;
    ty = ufo.y + 9;
  } else {
    const separation = 73 + slot * 25 + entity.h * .25;
    tx = ufo.x + Math.sin(ufo.beamAngle) * separation;
    ty = ufo.y + 12 + Math.cos(ufo.beamAngle) * separation;
  }
  const dx = tx - entity.x;
  const dy = ty - entity.y;
  const gap = Math.hypot(dx, dy);
  const pull = (entity.collectible ? 180 : entity.kind === 'truck' ? 125 : 155) * suction;
  // Cargo follows once suspended; uncollected targets still take time to extract.
  const maxStep = (pull + (entity.carried ? Math.hypot(ufo.vx, ufo.vy) : 0)) * dt;
  if (gap > 0) {
    entity.vx = dx / gap * Math.min(pull, gap / dt);
    entity.vy = dy / gap * Math.min(pull, gap / dt);
    const contacts=moveBody(entity,dx/gap*Math.min(gap,maxStep),dy/gap*Math.min(gap,maxStep),game.buildings);
    if(contacts.length)game.beamFeedback='CARGO BLOCKED · CHANGE POSITION';
  }
  entity.carried = !entity.collectible && gap < 25;
  entity.rotation = (entity.rotation || 0) + dt * (entity.collectible ? 1.4 : .3);
  if (entity.collectible && distance(entity, { x: ufo.x, y: ufo.y + 9 }) < 23) capture(game, entity);
}

export function damageUfo(game, amount = 10, source = 'projectile') {
  const ufo = game.ufo;
  if (game.status !== 'playing' || ufo.invulnerable > 0 || !Number.isFinite(amount) || amount <= 0) return false;
  const damage = Math.round(amount * game.challenge);
  ufo.hp = Math.max(0, ufo.hp - damage);
  ufo.invulnerable = 1.5;
  game.director.relief = 2.8;
  game.stats.damageTaken += damage;
  game.stats.combo = 1;
  game.stats.streak = 0;
  game.comboTimer = 0;
  game.shake = .35;
  releaseLoad(game);
  burst(game, ufo.x, ufo.y, '#ff9c70', 18, 160);
  label(game, ufo.x, ufo.y - 35, `−${damage} SHIELD`, '#ff9c86');
  event(game, 'hit', { x: ufo.x, y: ufo.y, damage, source });
  if (ufo.hp <= 0) finishGame(game, false);
  return true;
}

function destroyCharacter(game, entity, cargo) {
  if (entity.dead) return;
  entity.dead = true;
  entity.physical = 'dead';
  cancelAttack(entity);
  game.stats.destroyed++;
  if (cargo && HOSTILES.has(entity.kind)) game.stats.rockKills++;
  addCombo(game);
  const credits = Math.round(45 * game.stats.combo);
  game.stats.credits += credits;
  burst(game, entity.x, entity.y - 7, '#fac275', 12, 100);
  label(game, entity.x, entity.y - 30, cargo ? 'CARGO HIT +$' + credits : '+$' + credits, '#f8cf8d');
  event(game, 'explosion', { x: entity.x, y: entity.y, small: true });
}

function damageBuilding(game, building, amount = 1) {
  if (building.hp <= 0) return;
  building.hp = Math.max(0, building.hp - amount);
  building.flash = .3;
  burst(game, building.x, building.y - building.h / 2, '#a4ad91', 18, 155);
  if (building.hp <= 0) {
    label(game, building.x, building.y - building.h / 2 - 18, 'SHELTER OPEN', '#fac275');
    for (const person of game.entities) {
      if (person.shelterId === building.id) {
        if (person.state === 'sheltered') person.shelterCooldown = SHELTER_COOLDOWN;
        person.shelterId = null;
        person.state = 'flee';
        person.timer = .75;
        person.vx = 0;
        person.spawnGrace = .8;
      }
    }
    event(game, 'explosion', { x: building.x, y: building.y });
  }
}

function unloadTruck(game, truck, airborne = false) {
  const count = truck.passengers || 0;
  truck.passengers = 0;
  for (let i = 0; i < count; i++) {
    const kind = populationKind(game, game.populationSpawned++);
    const person = spawnEntity(game, kind, clamp(truck.x + (i - (count - 1) / 2) * 25, 25, WORLD.width - 25),
      airborne ? truck.y : undefined, { spawnGrace: 2.6, state: airborne ? 'falling' : 'alert', timer: 1.1 });
    if (airborne) {
      person.physical = 'airborne';
      person.vx = randomBetween(game, -60, 60);
      person.vy = -70;
      person.safeLanding = true;
    }
  }
}

function destroyCargo(game, entity, impact = false) {
  if (entity.dead) return;
  if (entity.kind === 'truck') unloadTruck(game, entity, true);
  entity.dead = true;
  entity.physical = 'dead';
  burst(game, entity.x, entity.y, entity.kind === 'bomb' ? '#c2ff84' : '#ffbc72', 20, 185);
  event(game, 'explosion', { x: entity.x, y: entity.y });
  if (entity.kind === 'bomb' && impact) {
    for (const target of game.entities) {
      if (target !== entity && !target.dead && target.collectible && target.state !== 'sheltered' &&
          distance(target, entity) < 90) destroyCharacter(game, target, true);
    }
    for (const building of game.buildings) {
      if (building.hp > 0 && Math.abs(building.x - entity.x) < building.w / 2 + 65 &&
          Math.abs(building.y - entity.y) < building.h / 2 + 65) damageBuilding(game, building, 2);
    }
  }
}

function bossCargoImpact(game, entity, previousX, previousY) {
  const boss = game.boss;
  if (!boss || boss.hp <= 0 || !entity.wasCarried || entity.vy < 70 || entity.bossCooldown > 0) return false;
  const hit=sweepBox({x:previousX,y:previousY,w:entity.w,h:entity.h},entity.x-previousX,entity.y-previousY,
    {x:boss.coreX,y:boss.coreY,w:boss.coreRadius*2,h:70});
  if(!hit)return false;
  if (!boss.vulnerable) {
    entity.vy = -140;
    entity.vx = entity.x < boss.x ? -170 : 170;
    entity.bossCooldown = .7;
    entity.y = boss.coreY - 35 - entity.h/2 - .01;
    label(game, boss.x, boss.y - 165, 'ARMOURED · WAIT FOR THE GLOW', '#e0bd80');
    return true;
  }
  const damage = entity.kind === 'bomb' ? 36 : entity.kind === 'truck' ? 48 : 26;
  boss.hp = Math.max(0, boss.hp - damage);
  boss.flash = .6;
  game.stats.bossHits++;
  game.stats.rockKills++;
  game.stats.credits += 150;
  game.shake = .25;
  burst(game, boss.coreX, boss.coreY, '#caff8b', 26, 220);
  label(game, boss.x, boss.y - 180, `CORE HIT −${damage}`, '#d7ffa0');
  destroyCargo(game, entity, entity.kind === 'bomb');
  if (boss.hp <= 0) {
    burst(game, boss.x, boss.y, '#ffda80', 70, 330);
    event(game, 'explosion', { x: boss.x, y: boss.y, boss: true });
    finishGame(game, true);
  }
  return true;
}

function updateAirborne(game, entity, dt) {
  const previousX=entity.x,previousY=entity.y;
  entity.vy+=GRAVITY*dt;
  const impactVx=entity.vx,impactVy=entity.vy;
  const contacts=moveBody(entity,entity.vx*dt,entity.vy*dt,game.buildings);
  entity.rotation=(entity.rotation||0)+impactVx*dt*.008;
  if(CARGO.has(entity.kind)){
    if(bossCargoImpact(game,entity,previousX,previousY)&&entity.dead)return;
    if(entity.harmful&&entity.impactGrace<=0&&movingHit(previousX,previousY,entity.x,entity.y,game.ufo,entity.w/2)){
      damageUfo(game,10,'boss charge');destroyCargo(game,entity);return;
    }
    if(entity.wasCarried&&impactVy>140){
      for(const target of game.entities){
        if(target===entity||target.dead||!target.collectible||target.physical==='lifted'||target.state==='sheltered')continue;
        const hit=sweepBox({x:previousX,y:previousY,w:entity.w,h:entity.h},entity.x-previousX,entity.y-previousY,target);
        if(hit)destroyCharacter(game,target,true);
      }
    }
    for(const contact of contacts){
      if(!contact.box||!entity.wasCarried||Math.hypot(impactVx,impactVy)<120||entity.impactGrace>0)continue;
      damageBuilding(game,contact.box,entity.kind==='truck'?3:entity.kind==='bomb'?2:1);
      if(entity.kind==='bomb'){destroyCargo(game,entity,true);return;}
      entity.impactGrace=.4;
    }
  }
  const floor=contacts.find(c=>c.ny<0);
  for(const contact of contacts){if(contact.nx)entity.vx=-impactVx*.3;if(contact.ny>0)entity.vy=Math.max(0,entity.vy);}
  if(!floor)return;
  entity.vy=0;entity.harmful=false;
  if(entity.collectible){
    if(impactVy>570&&!entity.safeLanding){destroyCharacter(game,entity,false);return;}
    entity.physical='stunned';entity.state='recover';entity.timer=.8+Math.min(1,impactVy/550);
    entity.vx*=.25;entity.safeLanding=false;
  }else if(entity.kind==='bomb'&&entity.wasCarried&&impactVy>250){destroyCargo(game,entity,true);}
  else{
    entity.physical='grounded';entity.state=entity.kind==='truck'?'stopped':'idle';entity.vx=0;
    if(impactVy>250)burst(game,entity.x,entity.y+entity.h/2,'#c1c8a0',8,80);
    if(entity.kind==='bomb'){entity.fuse=18;label(game,entity.x,entity.y-30,'LIFT & RETURN','#c5ff90');}
  }
}

function nearbyFallingThreat(game, entity) {
  for (const cargo of game.entities) {
    if (cargo.dead || !CARGO.has(cargo.kind) || cargo.physical !== 'airborne' ||
        cargo.vy < 80 || cargo.y >= entity.y - 40) continue;
    const vertical = entity.y - cargo.y;
    const landingTime = (-cargo.vy + Math.sqrt(cargo.vy * cargo.vy + 2 * GRAVITY * vertical)) / GRAVITY;
    const landingX = cargo.x + cargo.vx * landingTime;
    if (landingTime > .3 && landingTime < 1.15 && Math.abs(landingX - entity.x) < 55 + cargo.w / 2) return landingX;
  }
  return null;
}

function shelterEntrance(entity, building) {
  const side=entity.x<building.x?-1:1;
  return {x:building.x+side*((building.w+entity.w)/2+.02),side};
}

function canWalkTo(game,entity,x,ignoredId=null) {
  return !game.buildings.some(b=>b.hp>0&&b.id!==ignoredId&&
    sweepBox(entity,x-entity.x,0,b));
}

function updateCivilian(game, entity, dt) {
  const ufo=game.ufo;entity.timer-=dt;
  const visible=Math.abs(entity.x-ufo.x)<430&&distance(entity,ufo)<560&&
    hasLineOfSight(game,entity.x,entity.y-entity.h/2,ufo.x,ufo.y);
  if(entity.state==='sheltered'){
    entity.vx=0;
    const shelter=game.buildings.find(b=>b.id===entity.shelterId&&b.hp>0);
    if(!shelter||entity.timer<=0){
      entity.shelterId=null;entity.state='flee';entity.timer=2;entity.shelterCooldown=SHELTER_COOLDOWN;
      entity.direction=entity.entranceSide||(entity.x<ufo.x?-1:1);
    }
    return;
  }
  if(visible&&(entity.state==='idle'||entity.state==='walk')){
    entity.state='alert';entity.timer=randomBetween(game,.35,.7);entity.vx=0;
  }
  if(entity.state==='alert'&&entity.timer<=0){
    entity.state='flee';entity.timer=1.8;entity.direction=entity.x<ufo.x?-1:1;
    const shelters=game.buildings.filter(b=>b.hp>0&&b.shelter&&Math.abs(b.x-entity.x)<500&&
      entity.shelterCooldown<=0&&canWalkTo(game,entity,shelterEntrance(entity,b).x,b.id));
    shelters.sort((a,b)=>Math.abs(a.x-entity.x)-Math.abs(b.x-entity.x));
    entity.shelterId=shelters[0]?.id??null;
  }
  if(entity.state==='flee'){
    const shelter=game.buildings.find(b=>b.id===entity.shelterId&&b.hp>0);
    const entrance=shelter?shelterEntrance(entity,shelter):null;
    if(shelter&&canWalkTo(game,entity,entrance.x,shelter.id)){
      entity.direction=entrance.x>entity.x?1:-1;
      if(Math.abs(entrance.x-entity.x)<3){
        entity.state='sheltered';entity.timer=randomBetween(game,5,8);entity.vx=0;entity.entranceSide=entrance.side;return;
      }
    }else{
      if(entity.shelterId){entity.shelterId=null;entity.shelterCooldown=2;entity.direction=entity.x<ufo.x?-1:1;entity.timer=1.8;}
      if(entity.timer<=0){
        if(!visible){entity.state='idle';entity.timer=randomBetween(game,1,3);}
        else{entity.direction=entity.x<ufo.x?-1:1;entity.timer=1.8;}
      }
    }
    entity.vx=entity.direction*entity.speed*(entity.kind==='cow'?1.15:1.5);
    if(entrance&&entity.shelterId)entity.vx=Math.sign(entity.vx)*Math.min(Math.abs(entity.vx),Math.abs(entrance.x-entity.x)/dt);
  }else if(entity.state==='idle'&&entity.timer<=0){
    entity.state='walk';entity.direction=game.random()<.5?-1:1;entity.timer=randomBetween(game,1.2,2.8);
  }else if(entity.state==='walk'){
    entity.vx=entity.direction*entity.speed*.5;
    if(entity.timer<=0){entity.state='idle';entity.timer=randomBetween(game,.8,2);entity.vx=0;}
  }else if(entity.state!=='flee')entity.vx=0;
  moveGroundEntity(game,entity,dt);
}

function moveGroundEntity(game, entity, dt) {
  const contacts=moveBody(entity,entity.vx*dt,0,game.buildings,{horizontalOnly:true});
  if(contacts.some(c=>c.nx)){
    entity.vx=0;entity.direction=contacts.find(c=>c.nx).nx;entity.timer=Math.max(entity.timer,.5);
    if(entity.kind==='agent'){entity.state='patrol';entity.memory=0;entity.timer=.7;entity.blockedUntil=game.time+.8;}
    if(entity.shelterId){entity.shelterId=null;entity.shelterCooldown=2;}
  }
}

function attackAllowed(game, entity) {
  const director = game.director;
  if (director.relief > 0 || director.phase === 'introduce' || director.phase === 'recovery' ||
      director.attackCooldown > 0 || entity.spawnGrace > 0) return false;
  const preparing = game.entities.filter(other => !other.dead && other !== entity &&
    (other.state === 'aim' || other.state === 'committed'));
  const active = game.projectiles.filter(projectile => !projectile.dead);
  if (preparing.length >= director.maxAttacks || active.length + preparing.length >= director.maxAttacks + 2) return false;
  if (director.warning > 0 && (entity.kind === 'agent' || preparing.length > 0)) return false;
  if (game.boss && ['charge', 'volley'].includes(game.boss.state) && entity.kind === 'agent') return false;
  if (entity.kind === 'agent' && (preparing.some(other => other.kind === 'agent') ||
      active.some(projectile => projectile.kind === 'plasma' && projectile.tracking > 0))) return false;
  return true;
}

function aimAtUfo(game, entity) {
  const prediction = entity.kind === 'agent' ? .28 : 0;
  entity.aimX = clamp(game.ufo.x + game.ufo.vx * prediction, 35, WORLD.width - 35);
  entity.aimY = clamp(game.ufo.y + game.ufo.vy * prediction, 65, WORLD.ground - 60);
}

function fire(game, entity) {
  if (entity.attackReleased || entity.physical !== 'grounded' || entity.dead) return;
  entity.attackReleased = true;
  const x = entity.x;
  const y = entity.y - entity.h / 2;
  const dx = entity.aimX - x;
  const dy = entity.aimY - y;
  let projectile;
  if (entity.kind === 'thrower') {
    const travel = clamp(Math.hypot(dx, dy) / 400, .7, 1.35);
    projectile = { x, y, vx: dx / travel, vy: (dy - .5 * 390 * travel * travel) / travel,
      gravity: 390, kind: 'arc', life: 3.3, radius: 8, damage: 10, rotation: 0 };
  } else {
    const speed = entity.kind === 'agent' ? 190 : 340;
    const spread = entity.kind === 'agent' ? .025 : .045;
    const angle = Math.atan2(dy, dx) + randomBetween(game, -spread, spread);
    projectile = { x, y, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed,
      kind: entity.kind === 'agent' ? 'plasma' : 'bullet', life: entity.kind === 'agent' ? 5 : 3,
      radius: entity.kind === 'agent' ? 8 : 4, damage: 10,
      tracking: entity.kind === 'agent' ? 1.8 : 0, turnRate: 1.35, speed };
  }
  projectile.owner = entity.id;
  game.projectiles.push(projectile);
  if (game.projectiles.length > 64) game.projectiles.shift();
  event(game, 'shot', { x, y, kind: projectile.kind });
}

function updateDefender(game, entity, dt) {
  const ufo = game.ufo;
  entity.timer -= dt;
  const range = entity.kind === 'agent' ? 680 : entity.kind === 'gunner' ? 590 : 490;
  const visible = distance(entity, ufo) < range && hasLineOfSight(game, entity.x, entity.y - entity.h / 2, ufo.x, ufo.y);
  if (visible) {
    entity.lastSeenX = ufo.x;
    entity.lastSeenY = ufo.y;
    entity.memory = 2.2;
  } else entity.memory = Math.max(0, (entity.memory || 0) - dt);
  if (entity.state === 'aim' || entity.state === 'committed') {
    entity.vx = 0;
    if (entity.state === 'aim') {
      if (!visible) {
        entity.state = 'recover';
        entity.timer = .45;
        cancelAttack(entity);
        return;
      }
      aimAtUfo(game, entity);
      entity.attackProgress = clamp(1 - entity.timer / entity.prepareDuration, 0, .8);
      if (entity.timer <= 0) {
        entity.state = 'committed';
        entity.timer = entity.kind === 'agent' ? .28 : .22;
        entity.aimLocked = true;
        entity.attackProgress = .9;
      }
    } else if (entity.timer <= 0) {
      fire(game, entity);
      entity.state = 'recover';
      entity.timer = randomBetween(game, 1.4, 2.1) / game.challenge;
      entity.attackProgress = 0;
    }
    return;
  }
  if (entity.state === 'recover') {
    entity.vx = 0;
    if (entity.timer <= 0) { entity.state = 'patrol'; entity.timer = randomBetween(game, .35, .8); }
    return;
  }
  if (entity.state === 'dodge') {
    entity.vx = entity.direction * entity.speed * 1.75;
    moveGroundEntity(game, entity, dt);
    if (entity.timer <= 0) { entity.state = 'patrol'; entity.timer = .4; }
    return;
  }
  if (entity.thinkTimer <= 0) {
    entity.thinkTimer = randomBetween(game, .16, .28);
    const dangerX = nearbyFallingThreat(game, entity);
    if (dangerX !== null && game.random() < (entity.kind === 'agent' ? .8 : .48)) {
      entity.state = 'dodge';
      entity.direction = entity.x < dangerX ? -1 : 1;
      entity.timer = .55;
      return;
    }
    if (visible && entity.timer <= 0 && attackAllowed(game, entity)) {
      entity.state = 'aim';
      entity.prepareDuration = randomBetween(game, .65, 1) / Math.sqrt(game.challenge);
      entity.timer = entity.prepareDuration;
      entity.attackReleased = false;
      entity.aimLocked = false;
      entity.attackProgress = 0;
      entity.direction = ufo.x < entity.x ? -1 : 1;
      aimAtUfo(game, entity);
      game.director.attackCooldown = .48 / game.challenge;
      entity.vx = 0;
      return;
    }
  }
  if (entity.state === 'idle' || entity.state === 'alert') entity.state = 'patrol';
  if (visible && entity.kind === 'gunner') entity.vx = 0;
  else if (entity.kind === 'agent' && entity.memory > 0 && (entity.blockedUntil||0)<=game.time) {
    // Agents reposition based on their last sighting, not hidden live coordinates.
    const separation = entity.lastSeenX - entity.x;
    entity.direction = separation > 0 ? 1 : -1;
    if (Math.abs(separation) < 150) entity.direction *= -1;
    entity.vx = entity.direction * entity.speed * .65;
  } else {
    if (entity.timer <= -2) { entity.direction *= -1; entity.timer = randomBetween(game, .3, 1.1); }
    entity.vx = entity.direction * entity.speed * .5;
  }
  moveGroundEntity(game, entity, dt);
}

function updateTruck(game, entity, dt) {
  if(entity.state==='enter'||entity.state==='leave'){
    entity.vx=entity.direction*(entity.state==='leave'?125:95);
    const contacts=moveBody(entity,entity.vx*dt,0,game.buildings,{allowOutsideX:true});
    const blocked=contacts.some(c=>c.nx);
    if(entity.state==='enter'&&(blocked||Math.abs(entity.x-entity.dropX)<15)){
      entity.state='stopped';entity.vx=0;entity.timer=4.5;entity.unloadTimer=1.3;
      if(blocked)entity.direction*=-1;
    }else if(entity.state==='leave'&&blocked)entity.direction*=-1;
    if(entity.state==='leave'&&(entity.x < -150||entity.x>WORLD.width+150))entity.dead=true;
  }else if(entity.state==='stopped'){
    entity.vx=0;entity.timer-=dt;
    if(entity.passengers){entity.unloadTimer-=dt;if(entity.unloadTimer<=0)unloadTruck(game,entity);}
    if(entity.timer<=0&&!entity.wasCarried)entity.state='leave';
  }
}

function movingBodyHit(body,previousX,previousY,target) {
  const px=target.previousX??target.x,py=target.previousY??target.y;
  return sweepBox({x:previousX,y:previousY,w:body.w,h:body.h},
    body.x-previousX-(target.x-px),body.y-previousY-(target.y-py),{x:px,y:py,w:target.w,h:target.h});
}

function updatePlane(game, entity, dt) {
  const startX=entity.x,startY=entity.y;
  entity.x += entity.vx * dt;
  entity.y += Math.sin(game.time * 2 + entity.id) * dt * 3;
  for (const cargo of game.entities) {
    if (cargo === entity || cargo.dead || !CARGO.has(cargo.kind) || cargo.physical === 'grounded') continue;
    if (movingBodyHit(entity,startX,startY,cargo)) {
      entity.dead = true;
      game.stats.planesDown++;
      game.stats.credits += 300;
      label(game, entity.x, entity.y - 35, 'INTERCEPTED +$300', '#d0ff97');
      burst(game, entity.x, entity.y, '#ffb97b', 28, 210);
      cargo.hp--;
      if (cargo.hp <= 0) destroyCargo(game, cargo);
      event(game, 'explosion', { x: entity.x, y: entity.y });
      return;
    }
  }
  if (movingBodyHit(entity,startX,startY,game.ufo)) {
    damageUfo(game, 15, 'aircraft');
    entity.dead = true;
    burst(game, entity.x, entity.y, '#ffba7d', 18, 190);
  }
  if (entity.x < -200 || entity.x > WORLD.width + 200) entity.dead = true;
}

function updateEntities(game, dt) {
  let cargoSlot = 0;
  // Copy the array so unloaded passengers begin updating on the next tick.
  const count=game.entities.length;
  for(let index=0;index<count;index++){const entity=game.entities[index];entity.previousX=entity.x;entity.previousY=entity.y;}
  for (let index=0;index<count;index++) {
    const entity=game.entities[index];
    if(game.status!=='playing')break;
    if (entity.dead) continue;
    entity.flash = Math.max(0, entity.flash - dt);
    entity.reacquire = Math.max(0, entity.reacquire - dt);
    entity.spawnGrace = Math.max(0, entity.spawnGrace - dt);
    entity.impactGrace = Math.max(0, (entity.impactGrace || 0) - dt);
    entity.bossCooldown = Math.max(0,(entity.bossCooldown||0)-dt);
    entity.shelterCooldown = Math.max(0, (entity.shelterCooldown || 0) - dt);
    entity.thinkTimer -= dt;
    if (entity.physical === 'lifted') {
      cancelAttack(entity);
      updateLifted(game, entity, dt, entity.collectible ? 0 : cargoSlot++);
      continue;
    }
    if (entity.physical === 'airborne') { updateAirborne(game, entity, dt); continue; }
    if(entity.kind!=='plane'&&entity.state!=='sheltered'&&!supportAt(entity,game.buildings)){
      entity.physical='airborne';entity.state='falling';cancelAttack(entity);
      updateAirborne(game,entity,dt);continue;
    }
    if (entity.physical === 'stunned') {
      entity.timer -= dt;
      entity.vx = approach(entity.vx, 0, 10, dt);
      moveBody(entity,entity.vx*dt,0,game.buildings);
      if (entity.timer <= 0) {
        entity.physical = 'grounded';
        entity.state = 'idle';
        entity.timer = .65;
        entity.spawnGrace = .6;
      }
      continue;
    }
    if (entity.kind === 'civilian' || entity.kind === 'cow') updateCivilian(game, entity, dt);
    else if (entity.kind === 'thrower' || entity.kind === 'gunner' || entity.kind === 'agent') updateDefender(game, entity, dt);
    else if (entity.kind === 'truck') updateTruck(game, entity, dt);
    else if (entity.kind === 'plane') updatePlane(game, entity, dt);
    else if (entity.kind === 'bomb' && entity.fuse > 0) {
      entity.fuse -= dt;
      if (entity.fuse <= 0) destroyCargo(game, entity);
    }
  }
}

function updateProjectiles(game, dt) {
  for (const projectile of game.projectiles) {
    if(projectile.dead)continue;
    if(game.status!=='playing')break;
    const previousX=projectile.x,previousY=projectile.y;
    const travel=Math.min(dt,Math.max(0,projectile.life));
    if(projectile.tracking>0){
      const angle=Math.atan2(projectile.vy,projectile.vx),desired=Math.atan2(game.ufo.y-projectile.y,game.ufo.x-projectile.x);
      const turn=projectile.turnRate*Math.min(travel,projectile.tracking);
      const next=angle+clamp(angleDifference(desired,angle),-turn,turn),speed=projectile.speed||Math.hypot(projectile.vx,projectile.vy);
      projectile.vx=Math.cos(next)*speed;projectile.vy=Math.sin(next)*speed;
      projectile.tracking=Math.max(0,projectile.tracking-travel);
    }
    projectile.vy+=(projectile.gravity||0)*travel;projectile.x+=projectile.vx*travel;projectile.y+=projectile.vy*travel;
    projectile.life-=dt;projectile.rotation=(projectile.rotation||0)+dt*7;
    let earliest=null;
    const check=(box,type,moving=false)=>{
      const hit=moving?movingHit(previousX,previousY,projectile.x,projectile.y,box,projectile.radius):segmentHit(previousX,previousY,projectile.x,projectile.y,box,projectile.radius);
      if(hit&&(!earliest||hit.time<earliest.time))earliest={...hit,target:box,type};
    };
    if(travel>0){
      for(const b of game.buildings)if(b.hp>0)check(b,'building');
      for(const cargo of game.entities)if(!cargo.dead&&CARGO.has(cargo.kind)&&cargo.id!==projectile.owner)check(cargo,'cargo',true);
      check(game.ufo,'ufo',true);
    }
    if(earliest){
      projectile.x=previousX+(projectile.x-previousX)*earliest.time;projectile.y=previousY+(projectile.y-previousY)*earliest.time;projectile.dead=true;
      if(earliest.type==='ufo')damageUfo(game,projectile.damage||10,projectile.kind);
      else{
        burst(game,projectile.x,projectile.y,earliest.type==='cargo'?'#cbff92':'#f4bb7d',5,65);
        if(earliest.type==='cargo'){
          earliest.target.flash=.16;
          if(earliest.target.kind==='bomb'&&earliest.target.physical!=='lifted')destroyCargo(game,earliest.target);
        }
      }
    }
    if(projectile.life<=0||projectile.x< -150||projectile.x>WORLD.width+150||projectile.y< -200||projectile.y>WORLD.ground)projectile.dead=true;
  }
}

function spawnTransport(game) {
  if (game.populationReserve <= 0 || game.entities.filter(entity => !entity.dead && entity.kind === 'truck').length >= 2) return;
  const left = game.random() < .5;
  const passengers = Math.min(4, game.populationReserve);
  game.populationReserve -= passengers;
  spawnEntity(game, 'truck', left ? -100 : WORLD.width + 100, undefined, {
    state: 'enter', direction: left ? 1 : -1, passengers,
    dropX: left ? 620 : 1810, vx: left ? 95 : -95,
  });
}

function updateDirector(game, dt) {
  const director = game.director;
  director.relief = Math.max(0, director.relief - dt);
  director.attackCooldown = Math.max(0, director.attackCooldown - dt);
  const cycle = (game.time - 8) % 38;
  director.phase = game.time < 8 ? 'introduce' : cycle < 13 ? 'build' : cycle < 27 ? 'peak' : 'recovery';
  director.phaseTimer = game.time < 8 ? 8 - game.time : cycle < 13 ? 13 - cycle : cycle < 27 ? 27 - cycle : 38 - cycle;
  director.maxAttacks = game.difficulty === 'easy' ? 2 : game.difficulty === 'hard' ? 4 : game.mission.threat >= 3 ? 3 : 2;
  director.threat = game.projectiles.filter(projectile => !projectile.dead).length +
    game.entities.filter(entity => entity.state === 'aim' || entity.state === 'committed').length;
  director.nextTruck -= dt;
  if (director.nextTruck <= 0 && director.phase !== 'peak') {
    spawnTransport(game);
    director.nextTruck = 15;
  }
  // Reserved population arrives promptly when the field has almost been cleared.
  if (game.populationReserve > 0 && game.entities.filter(entity => !entity.dead && entity.collectible).length < 3) {
    director.nextTruck = Math.min(director.nextTruck, 1);
  }
  if (director.warning > 0) {
    director.warning = Math.max(0, director.warning - dt);
    if (director.warning === 0) {
      const left = director.warningSide === 'left';
      const speed = (270 + game.mission.threat * 28) * Math.sqrt(game.challenge);
      spawnEntity(game, 'plane', left ? -130 : WORLD.width + 130, director.warningY,
        { vx: left ? speed : -speed, state: 'fly', direction: left ? 1 : -1 });
      director.relief = Math.max(director.relief, 1.2);
    }
  } else {
    director.nextPlane -= dt;
    if (director.nextPlane <= 0 && director.relief <= 0 && director.phase !== 'introduce' &&
        (!game.boss || game.boss.state === 'recover')) {
      director.warning = 3;
      director.warningSide = game.random() < .5 ? 'left' : 'right';
      director.warningY = randomBetween(game, 175, 355);
      director.nextPlane = randomBetween(game, 17, 24) / Math.sqrt(game.challenge);
      event(game, 'warning', { side: director.warningSide, y: director.warningY });
    }
  }
}

function bossLaunchBomb(game, boss) {
  const count = game.entities.filter(entity => !entity.dead && entity.kind === 'bomb').length;
  if (count >= 8) return;
  const targetX = clamp(boss.telegraphX + randomBetween(game, -120, 120), 150, boss.x - 180);
  const startX = boss.x - 50;
  const startY = boss.y - 155;
  const travel = 1.45;
  const targetY = WORLD.ground - 16;
  spawnEntity(game, 'bomb', startX, startY, { physical: 'airborne', state: 'falling',
    vx: (targetX - startX) / travel,
    vy: (targetY - startY - .5 * GRAVITY * travel * travel) / travel,
    harmful: true, wasCarried: false, impactGrace: .35, fuse: 18 });
  event(game, 'shot', { x: startX, y: startY, kind: 'boss' });
}

function updateBoss(game, dt) {
  const boss = game.boss;
  if (!boss || boss.hp <= 0) return;
  boss.timer -= dt;
  boss.flash = Math.max(0, boss.flash - dt);
  const nextPhase = boss.hp <= boss.maxHp * .3 ? 3 : boss.hp <= boss.maxHp * .65 ? 2 : 1;
  if (nextPhase > boss.phase) {
    boss.phaseTransitions += nextPhase - boss.phase;
    boss.phase = nextPhase;
    label(game, boss.x, boss.y - 210, `ATLAS · PHASE ${boss.phase}`, '#ffca80');
    boss.flash = .7;
  }
  if (boss.state === 'charge') {
    boss.telegraphX = approach(boss.telegraphX, game.ufo.x, 2, dt);
    if (boss.timer <= 0) {
      boss.state = 'volley';
      boss.timer = 1.25 + boss.phase * .18;
      boss.nextShot = 0;
      boss.volleyCount = 0;
    }
  } else if (boss.state === 'volley') {
    boss.nextShot -= dt;
    if (boss.nextShot <= 0 && boss.volleyCount < boss.phase + 1) {
      bossLaunchBomb(game, boss);
      boss.volleyCount++;
      boss.nextShot = .55;
    }
    if (boss.timer <= 0) {
      boss.state = 'exposed';
      boss.vulnerable = true;
      boss.timer = 6.5 - boss.phase * .3;
      game.director.relief = Math.max(game.director.relief, 1);
      label(game, boss.x, boss.y - 200, 'CORE EXPOSED · DROP CARGO', '#ccff95');
    }
  } else if (boss.state === 'exposed') {
    if (boss.timer <= 0) {
      boss.vulnerable = false;
      boss.state = 'recover';
      boss.timer = 2.6 - boss.phase * .2;
    }
  } else if (boss.timer <= 0) {
    boss.state = 'charge';
    boss.vulnerable = false;
    boss.timer = 2.25;
    boss.telegraphX = game.ufo.x;
    event(game, 'warning', { boss: true, x: boss.x });
  }
}

function updateEffects(game, dt) {
  for (const particle of game.particles) {
    particle.life -= dt;
    particle.x += particle.vx * dt;
    particle.y += particle.vy * dt;
    particle.vy += dt * 95;
  }
  game.particles = game.particles.filter(particle => particle.life > 0);
  for (const text of game.texts) { text.life -= dt; text.y -= dt * 26; }
  game.texts = game.texts.filter(text => text.life > 0);
  for (const building of game.buildings) building.flash = Math.max(0, building.flash - dt);
  game.shake = Math.max(0, game.shake - dt);
}

function finishGame(game, won) {
  if (game.status !== 'playing') return;
  game.status = won ? 'won' : 'lost';
  game.ufo.beamOn = false;
  releaseLoad(game);
  game.completedBy = won ? game.boss ? 'boss' : getRemainingPopulation(game) === 0 ? 'clear' : 'survival' :
    game.ufo.hp <= 0 ? 'shield' : 'time';
  event(game, won ? 'win' : 'lose', { credits: game.stats.credits, reason: game.completedBy });
}

function tick(game, input, dt) {
  if (game.status !== 'playing') { updateEffects(game, dt); return; }
  game.time += dt;
  game.remaining = Math.max(0, game.mission.duration - game.time);
  updateUfo(game, input, dt);
  updateDirector(game, dt);
  updateBeam(game, input, dt);
  updateEntities(game, dt);
  if (game.status === 'playing') updateProjectiles(game, dt);
  if (game.status === 'playing') updateBoss(game, dt);
  updateEffects(game, dt);
  for(const building of game.buildings)building.occupancy=0;
  for(const entity of game.entities)if(!entity.dead&&entity.state==='sheltered'){
    const building=game.buildings.find(b=>b.id===entity.shelterId&&b.hp>0);if(building)building.occupancy++;
  }
  game.entities = game.entities.filter(entity => !entity.dead);
  game.projectiles = game.projectiles.filter(projectile => !projectile.dead);
  game.ufo.load = game.entities.reduce((sum, entity) => sum + (entity.physical === 'lifted' ? entity.load : 0), 0);
  game.comboTimer = Math.max(0, game.comboTimer - dt);
  if (game.comboTimer === 0) { game.stats.combo = 1; game.stats.streak = 0; }
  if (game.status === 'playing') {
    if (game.ufo.hp <= 0) finishGame(game, false);
    else if (game.boss ? game.boss.hp <= 0 : getRemainingPopulation(game) === 0 || game.remaining === 0) finishGame(game, true);
    else if (game.remaining === 0) finishGame(game, false);
  }
}

export function stepGame(game, input = {}, dt = 1 / 60) {
  if (!Number.isFinite(dt) || dt <= 0) return game;
  // Cap a suspended tab's catch-up and substep explicit larger test ticks safely.
  const duration = Math.min(.25, dt);
  const steps = Math.max(1, Math.ceil(duration / (1 / 60)));
  for (let i = 0; i < steps; i++) tick(game, input, duration / steps);
  return game;
}
