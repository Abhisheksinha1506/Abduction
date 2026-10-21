import test from 'node:test';
import assert from 'node:assert/strict';
import { MISSIONS, WORLD } from '../dist/config.js';
import { createGame, stepGame, spawnEntity, releaseLoad, damageUfo, hasLineOfSight, getRemainingPopulation, angleDifference } from '../dist/sim.js';

const DT = 1 / 60;
function arena(options = {}) {
  const game = createGame({ mission: MISSIONS[0], seed: 12, ...options });
  game.entities = [];
  game.projectiles = [];
  game.buildings = [];
  game.populationReserve = 0;
  game.director.nextPlane = 9999;
  game.director.nextTruck = 9999;
  // Keep a living specimen outside the fixture so an otherwise empty arena does not clear.
  spawnEntity(game, 'civilian', 2300, undefined, { timer: 999, spawnGrace: 999 });
  return game;
}
function advance(game, seconds, input = {}) {
  for (let index = 0; index < Math.ceil(seconds / DT); index++) stepGame(game, input, DT);
}
const beam = { beam: true, aimX: 420, aimY: WORLD.ground };

test('narrow touch viewports keep the UFO visible at both edges of the world', () => {
  const game = arena();
  game.viewportWidth = 960;
  Object.assign(game.ufo, { x: WORLD.width - 48, y: 200 });
  advance(game, 3);
  assert.ok(game.ufo.x - game.camera < 960);
  Object.assign(game.ufo, { x: 48, y: 200 });
  advance(game, 3);
  assert.ok(game.ufo.x - game.camera > 0);
  assert.ok(game.camera >= 0);
});

test('lifting a committed defender cancels the shot before release', () => {
  const game = arena();
  Object.assign(game.ufo, { x: 420, y: 350 });
  const defender = spawnEntity(game, 'thrower', 420, undefined, {
    state: 'committed', timer: .001, aimX: 420, aimY: 350,
    aimLocked: true, attackProgress: .9, spawnGrace: 0
  });
  stepGame(game, beam, DT);
  assert.equal(defender.physical, 'lifted');
  assert.equal(defender.state, 'lifted');
  assert.equal(defender.aimLocked, false);
  assert.equal(defender.attackProgress, 0);
  assert.equal(game.projectiles.length, 0);
  assert.equal(game.events.filter(event => event.type === 'shot').length, 0);
});

test('released defenders fall, land stunned, and recover before making decisions', () => {
  const game = arena();
  Object.assign(game.ufo, { x: 420, y: 350 });
  const defender = spawnEntity(game, 'gunner', 420, 500, {
    physical: 'lifted', state: 'lifted', spawnGrace: 0, attackProgress: .8
  });
  game.ufo.load = defender.load;
  assert.equal(releaseLoad(game), 1);
  assert.equal(defender.physical, 'airborne');
  assert.equal(game.ufo.load, 0);
  for (let i = 0; i < 120 && defender.physical === 'airborne'; i++) stepGame(game, {}, DT);
  assert.equal(defender.physical, 'stunned');
  assert.equal(defender.state, 'recover');
  assert.equal(defender.y, WORLD.ground - defender.h / 2);
  advance(game, .5);
  assert.equal(defender.physical, 'stunned');
  assert.equal(game.projectiles.length, 0);
  advance(game, 1.5);
  assert.equal(defender.physical, 'grounded');
  assert.equal(game.events.filter(event => event.type === 'shot').length, 0);
});

test('beam capacity limits simultaneous specimens and gives full feedback', () => {
  const game = arena();
  Object.assign(game.ufo, { x: 420, y: 350 });
  const targets = [410, 420, 430, 440].map(x => spawnEntity(game, 'civilian', x));
  stepGame(game, beam, DT);
  assert.equal(targets.filter(target => target.physical === 'lifted').length, 3);
  assert.equal(game.ufo.load, 30);
  assert.equal(game.beamFeedback, 'BEAM AT CAPACITY');
});

test('retained cargo blocks extraction behind it and can be carried without being collected', () => {
  const game = arena();
  Object.assign(game.ufo, { x: 420, y: 350 });
  const rock = spawnEntity(game, 'rock', 420, 500);
  const civilian = spawnEntity(game, 'civilian', 420);
  stepGame(game, beam, DT);
  assert.equal(rock.physical, 'lifted');
  assert.equal(civilian.physical, 'grounded');
  assert.match(game.beamFeedback, /BLOCKED/);
  advance(game, 1.5, beam);
  assert.equal(rock.carried, true);
  assert.equal(rock.dead, undefined);
  assert.equal(game.stats.captured, 0);
});

test('a hit drops held cargo and grants protection from repeated immediate damage', () => {
  const game = arena();
  const rock = spawnEntity(game, 'rock', 420, 420, { physical: 'lifted', state: 'lifted' });
  game.ufo.load = 18;
  assert.equal(damageUfo(game), true);
  assert.equal(game.ufo.hp, 40);
  assert.equal(game.ufo.load, 0);
  assert.equal(rock.physical, 'airborne');
  assert.equal(damageUfo(game), false);
  assert.equal(game.ufo.hp, 40);
  stepGame(game, beam, DT);
  assert.equal(game.ufo.beamOn, false);
  assert.equal(game.beamFeedback, 'BEAM INTERRUPTED');
});

test('solid buildings and carried cover block perception; broken buildings stop blocking', () => {
  const game = arena();
  const building = { id: 100, x: 400, y: 400, w: 100, h: 150, hp: 3 };
  game.buildings.push(building);
  assert.equal(hasLineOfSight(game, 200, 400, 600, 400), false);
  assert.equal(hasLineOfSight(game, 200, 200, 600, 200), true);
  building.hp = 0;
  assert.equal(hasLineOfSight(game, 200, 400, 600, 400), true);
  const rock = spawnEntity(game, 'rock', 400, 400, { physical: 'lifted' });
  assert.equal(hasLineOfSight(game, 200, 400, 600, 400), false);
  assert.equal(hasLineOfSight(game, 200, 400, 600, 400, { ignoreId: rock.id }), true);
});

test('cover intercepts a fast projectile before it can cross into the UFO', () => {
  const game = arena();
  Object.assign(game.ufo, { x: 600, y: 300 });
  game.buildings.push({ id: 100, x: 400, y: 300, w: 50, h: 100, hp: 3, flash: 0 });
  game.projectiles.push({ x: 200, y: 300, vx: 30000, vy: 0, life: 2, kind: 'bullet', radius: 4, damage: 10 });
  stepGame(game, {}, DT);
  assert.equal(game.ufo.hp, 50);
  assert.equal(game.projectiles.length, 0);
});

test('losing sight during preparation cancels an attack and retains only brief memory', () => {
  const game = arena();
  Object.assign(game.ufo, { x: 600, y: 300 });
  const defender = spawnEntity(game, 'gunner', 300, undefined, {
    state: 'aim', timer: .5, prepareDuration: .8, spawnGrace: 0, memory: 2.2
  });
  game.buildings.push({ id: 100, x: 450, y: 440, w: 100, h: 180, hp: 3, flash: 0 });
  stepGame(game, {}, DT);
  assert.equal(defender.state, 'recover');
  assert.equal(defender.aimLocked, false);
  assert.equal(game.projectiles.length, 0);
  assert.ok(defender.memory > 0 && defender.memory < 2.2);
  advance(game, 2.3);
  assert.equal(defender.memory, 0);
});

test('a committed shot retains its aim when the UFO dodges and fires exactly once', () => {
  const game = arena();
  game.time = 10;
  Object.assign(game.ufo, { x: 650, y: 300 });
  const defender = spawnEntity(game, 'gunner', 420, undefined, {
    state: 'committed', timer: .05, aimX: 420, aimY: 300, aimLocked: true, spawnGrace: 0
  });
  advance(game, .1);
  assert.equal(defender.aimX, 420);
  assert.equal(game.events.filter(event => event.type === 'shot').length, 1);
  assert.equal(game.projectiles.length, 1);
  assert.ok(Math.abs(game.projectiles[0].vx / game.projectiles[0].vy) < .06);
  advance(game, .7);
  assert.equal(game.events.filter(event => event.type === 'shot').length, 1);
});

test('homing has a bounded turn rate and stops tracking after its allowed duration', () => {
  const game = arena();
  Object.assign(game.ufo, { x: 100, y: 500 });
  const projectile = { x: 100, y: 100, vx: 100, vy: 0, speed: 100, life: 5, kind: 'plasma', radius: 8, tracking: .2, turnRate: 1.35 };
  game.projectiles.push(projectile);
  for (let i = 0; i < 14; i++) {
    const oldAngle = Math.atan2(projectile.vy, projectile.vx);
    stepGame(game, {}, DT);
    const newAngle = Math.atan2(projectile.vy, projectile.vx);
    assert.ok(Math.abs(angleDifference(newAngle, oldAngle)) <= projectile.turnRate * DT + 1e-10);
    assert.ok(Math.abs(Math.hypot(projectile.vx, projectile.vy) - 100) < 1e-8);
  }
  assert.equal(projectile.tracking, 0);
  const lockedAngle = Math.atan2(projectile.vy, projectile.vx);
  Object.assign(game.ufo, { x: 1200, y: 100 });
  advance(game, .2);
  assert.equal(Math.atan2(projectile.vy, projectile.vx), lockedAngle);
});

test('the director prevents overlapping homing preparations and creates recovery windows', () => {
  const game = arena({ mission: MISSIONS[2] });
  game.time = 10;
  Object.assign(game.ufo, { x: 420, y: 240, invulnerable: 999 });
  for (const x of [340, 370, 400, 450, 480, 510]) spawnEntity(game, 'agent', x, undefined,
    { timer: 0, thinkTimer: 0, spawnGrace: 0, state: 'patrol' });
  for (let i = 0; i < 180; i++) {
    stepGame(game, {}, DT);
    const preparing = game.entities.filter(entity => entity.kind === 'agent' && ['aim', 'committed'].includes(entity.state));
    assert.ok(preparing.length <= 1);
    assert.ok(game.projectiles.filter(projectile => projectile.kind === 'plasma' && projectile.tracking > 0).length <= 1);
  }
  assert.ok(game.events.some(event => event.type === 'shot'));
  const recovery = arena({ mission: MISSIONS[2] });
  recovery.time = 37;
  spawnEntity(recovery, 'agent', 420, undefined, { timer: 0, thinkTimer: 0, spawnGrace: 0, state: 'patrol' });
  advance(recovery, 3);
  assert.equal(recovery.director.phase, 'recovery');
  assert.equal(recovery.events.some(event => event.type === 'shot'), false);
});

test('new arrivals receive a grace period before starting an attack', () => {
  const game = arena({ mission: MISSIONS[2] });
  game.time = 10;
  const agent = spawnEntity(game, 'agent', 420, undefined, { timer: 0, thinkTimer: 0, state: 'patrol' });
  advance(game, 1);
  assert.ok(agent.spawnGrace > 0);
  assert.notEqual(agent.state, 'aim');
  assert.notEqual(agent.state, 'committed');
  assert.equal(game.projectiles.length, 0);
});

test('aircraft arrive only after a visible warning countdown', () => {
  const game = arena();
  game.time = 10;
  game.director.nextPlane = 0;
  stepGame(game, {}, DT);
  assert.ok(game.director.warning > 2.9);
  assert.ok(game.events.some(event => event.type === 'warning'));
  assert.equal(game.entities.some(entity => entity.kind === 'plane'), false);
  advance(game, 2);
  assert.equal(game.entities.some(entity => entity.kind === 'plane'), false);
  advance(game, 1.2);
  assert.equal(game.entities.some(entity => entity.kind === 'plane'), true);
});

test('finite population is conserved when reserves move into a transport and unload', () => {
  const game = createGame({ mission: MISSIONS[0], seed: 27 });
  assert.equal(getRemainingPopulation(game), MISSIONS[0].population);
  game.time = 13;
  game.director.nextTruck = 0;
  game.director.nextPlane = 999;
  game.ufo.invulnerable = 999;
  stepGame(game, {}, DT);
  assert.equal(getRemainingPopulation(game), MISSIONS[0].population);
  assert.equal(game.populationReserve, 0);
  assert.ok(game.entities.some(entity => entity.kind === 'truck' && entity.passengers === 4));
  advance(game, 10);
  assert.equal(getRemainingPopulation(game), MISSIONS[0].population);
  assert.ok(game.entities.some(entity => entity.kind === 'truck' && entity.passengers === 0));
});

test('dropped cargo defeats ground defenders and increments the cargo challenge', () => {
  const game = arena();
  const defender = spawnEntity(game, 'gunner', 600, undefined, { timer: 999, spawnGrace: 999 });
  spawnEntity(game, 'rock', 600, defender.y - 35, { physical: 'airborne', wasCarried: true, vy: 250 });
  advance(game, .15);
  assert.equal(defender.dead, true);
  assert.equal(game.stats.rockKills, 1);
  assert.equal(game.stats.destroyed, 1);
});

test('boss phases change once per health threshold and preserve an exposed state', () => {
  const game = arena({ mission: MISSIONS[4] });
  game.boss.hp = game.boss.maxHp * .65;
  stepGame(game, {}, DT);
  assert.equal(game.boss.phase, 2);
  assert.equal(game.boss.phaseTransitions, 1);
  advance(game, .5);
  assert.equal(game.boss.phaseTransitions, 1);
  game.boss.hp = game.boss.maxHp * .3;
  stepGame(game, {}, DT);
  assert.equal(game.boss.phase, 3);
  assert.equal(game.boss.phaseTransitions, 2);
  advance(game, .5);
  assert.equal(game.boss.phaseTransitions, 2);
});

test('boss armour deflects cargo while its exposed core takes damage and can end the campaign', () => {
  const guarded = arena({ mission: MISSIONS[4] });
  const rock = spawnEntity(guarded, 'rock', guarded.boss.x, guarded.boss.coreY - 50,
    { physical: 'airborne', wasCarried: true, vy: 200, impactGrace: 0 });
  stepGame(guarded, {}, DT);
  assert.equal(guarded.boss.hp, guarded.boss.maxHp);
  assert.ok(rock.vy < 0);
  const exposed = arena({ mission: MISSIONS[4] });
  Object.assign(exposed.boss, { state: 'exposed', vulnerable: true, timer: 5, hp: 26 });
  spawnEntity(exposed, 'rock', exposed.boss.x, exposed.boss.coreY - 50,
    { physical: 'airborne', wasCarried: true, vy: 200, impactGrace: 0 });
  stepGame(exposed, {}, DT);
  assert.equal(exposed.boss.hp, 0);
  assert.equal(exposed.stats.rockKills, 1);
  assert.equal(exposed.stats.bossHits, 1);
  assert.equal(exposed.status, 'won');
  advance(exposed, 1);
  assert.equal(exposed.events.filter(event => event.type === 'win').length, 1);
});

test('normal missions accept survival or a population clear; the boss requires defeating ATLAS', () => {
  const timed = arena({ mission: { ...MISSIONS[0], duration: .1 } });
  advance(timed, .2);
  assert.equal(timed.status, 'won');
  assert.equal(timed.completedBy, 'survival');
  const clear = arena(); clear.entities = [];
  stepGame(clear, {}, DT);
  assert.equal(clear.status, 'won');
  assert.equal(clear.completedBy, 'clear');
  const boss = arena({ mission: { ...MISSIONS[4], duration: .1 } });
  advance(boss, .2);
  assert.equal(boss.status, 'lost');
  assert.equal(boss.completedBy, 'time');
});

test('all five upgrades change their advertised mechanics', () => {
  const base = arena();
  const improved = arena({ upgrades: { armour: 3, capacity: 4, engine: 4 } });
  assert.equal(improved.ufo.maxHp, base.ufo.maxHp + 30);
  assert.equal(improved.ufo.capacity, base.ufo.capacity + 40);
  advance(base, 1, { moveX: 1 });
  advance(improved, 1, { moveX: 1 });
  assert.ok(improved.ufo.x > base.ufo.x + 100);
  function captureRun(upgrades) {
    const game = arena({ upgrades });
    Object.assign(game.ufo, { x: 420, y: 350 });
    spawnEntity(game, 'civilian', 420);
    for (let i = 0; i < 180 && game.stats.captured === 0; i++) stepGame(game, beam, DT);
    assert.equal(game.stats.captured, 1);
    return { time: game.time, credits: game.stats.credits };
  }
  const ordinary = captureRun({});
  const suction = captureRun({ suction: 4 });
  const processor = captureRun({ processor: 2 });
  assert.ok(suction.time < ordinary.time * .6);
  assert.equal(ordinary.credits, 100);
  assert.equal(processor.credits, 140);
});

test('seeded simulation is reproducible, finite, and clamps flight and beam boundaries', () => {
  const first = arena(); const second = arena();
  for (let i = 0; i < 600; i++) {
    const input = { moveX: i < 300 ? -1 : 1, moveY: -1, aimX: -100000, aimY: 0, beam: i % 3 === 0 };
    stepGame(first, input, DT);
    stepGame(second, input, DT);
  }
  assert.deepEqual(first.ufo, second.ufo);
  assert.ok(first.ufo.x >= 48 && first.ufo.x <= WORLD.width - 48);
  assert.ok(first.ufo.y >= 74 && first.ufo.y <= WORLD.ground - 70);
  assert.ok(Math.abs(first.ufo.beamAngle) <= Math.PI * 40 / 180);
  assert.ok(Object.values(first.ufo).filter(value => typeof value === 'number').every(Number.isFinite));
});

const testShelter = (hp = 3) => ({ id: 999, x: 850, y: WORLD.ground - 60, w: 140, h: 120, hp, maxHp: 3, flash: 0, shelter: true });

test('dropped cargo on civilians and cows does not count toward the hostile cargo challenge', () => {
  const game = arena();
  for (const [kind, x] of [['civilian', 600], ['cow', 900]]) {
    const target = spawnEntity(game, kind, x, undefined, { timer: 999, spawnGrace: 999 });
    spawnEntity(game, 'rock', x, target.y - 35, { physical: 'airborne', wasCarried: true, vy: 250 });
  }
  advance(game, .15);
  assert.equal(game.stats.destroyed, 2);
  assert.equal(game.stats.rockKills, 0);
});

test('beam reports a target too heavy for the remaining capacity', () => {
  const game = arena();
  Object.assign(game.ufo, { x: 420, y: 350 });
  spawnEntity(game, 'civilian', 420);
  spawnEntity(game, 'cow', 425);
  const rock = spawnEntity(game, 'rock', 450);
  stepGame(game, beam, DT);
  assert.equal(game.ufo.load, 22);
  assert.equal(rock.physical, 'grounded');
  assert.equal(game.beamFeedback, 'TARGET TOO HEAVY');
});

test('civilians forced out by a destroyed shelter receive the shelter cooldown', () => {
  const game = arena();
  const shelter = testShelter(1);
  game.buildings = [shelter];
  const civilian = spawnEntity(game, 'civilian', 768, undefined, { state: 'sheltered', shelterId: shelter.id, timer: 50 });
  spawnEntity(game, 'rock', shelter.x, shelter.y - shelter.h / 2 - 40, { physical: 'airborne', wasCarried: true, vy: 300 });
  advance(game, .3);
  assert.equal(shelter.hp, 0);
  assert.equal(civilian.state, 'flee');
  assert.ok(civilian.shelterCooldown > 6, `cooldown ${civilian.shelterCooldown}`);
});

test('a returned charge explosion spares civilians inside a standing shelter', () => {
  const game = arena();
  const shelter = testShelter();
  game.buildings = [shelter];
  const sheltered = spawnEntity(game, 'civilian', 768, undefined, { state: 'sheltered', shelterId: shelter.id, timer: 50 });
  const outside = spawnEntity(game, 'civilian', 700, undefined, { timer: 999, spawnGrace: 999 });
  spawnEntity(game, 'bomb', 728, 520, { physical: 'airborne', wasCarried: true, vy: 400 });
  advance(game, .3);
  assert.equal(outside.dead, true);
  assert.ok(shelter.hp > 0);
  assert.ok(!sheltered.dead);
  assert.equal(sheltered.state, 'sheltered');
});
