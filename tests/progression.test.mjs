import test from 'node:test';
import assert from 'node:assert/strict';
import { MISSIONS, UPGRADES } from '../dist/config.js';
import { defaultSave, loadSave, persistSave, purchaseUpgrade, completeMission, SAVE_KEY, BACKUP_KEY } from '../dist/progression.js';

function memoryStorage(initial = {}) {
  const data = new Map(Object.entries(initial));
  return { getItem: key => data.get(key) ?? null, setItem: (key, value) => data.set(key, value), data };
}
const run = (overrides = {}) => ({ mission: MISSIONS[0], status: 'won', stats: { credits: 1000, captured: 10, rockKills: 2, maxCombo: 5 }, ...overrides });

test('SAVE-001: older code cannot overwrite a future-version save after loading its backup',()=>{
  const future=JSON.stringify({version:2,credits:9999,upgrades:{engine:2}});
  const storage=memoryStorage({[SAVE_KEY]:future,[BACKUP_KEY]:JSON.stringify(defaultSave())});
  const save=loadSave(storage);save.settings.sound=false;
  assert.equal(persistSave(save,storage),false);
  assert.equal(storage.getItem(SAVE_KEY),future);
});
test('SAVE-002: half-step multipliers survive results, saving and reward calculation',()=>{
  const result=completeMission(defaultSave(),run({stats:{credits:100,captured:3,maxCombo:1.5}}));
  assert.equal(result.payout.performance,75);assert.equal(result.save.best[1].maxCombo,1.5);
  const storage=memoryStorage();persistSave(result.save,storage);assert.equal(loadSave(storage).best[1].maxCombo,1.5);
});
const freeze = value => {
  Object.freeze(value);
  for (const child of Object.values(value)) if (child && typeof child === 'object' && !Object.isFrozen(child)) freeze(child);
  return value;
};

test('fresh progress is independent and safe without browser storage', () => {
  const a = defaultSave();
  const b = defaultSave();
  a.upgrades.engine = 4;
  a.completed.push(1);
  assert.equal(b.upgrades.engine, 0);
  assert.deepEqual(b.completed, []);
  assert.deepEqual(loadSave(null), b);
  assert.equal(persistSave(b, null), false);
});

test('corrupt main save recovers the last good backup without deleting either record', () => {
  const good = defaultSave(); good.credits = 1234;
  const storage = memoryStorage({ [SAVE_KEY]: '{broken', [BACKUP_KEY]: JSON.stringify(good) });
  assert.equal(loadSave(storage).credits, 1234);
  assert.equal(storage.getItem(SAVE_KEY), '{broken');
  assert.equal(storage.data.size, 2);
});

test('save recovery validates fields, clamps levels and migrates a legacy record', () => {
  const storage = memoryStorage({ [SAVE_KEY]: JSON.stringify({
    version: 0, credits: -50, upgrades: { engine: 100, capacity: 2.7, armour: '3', suction: -3 },
    completed: [2, 2, 400, '1'], unlocked: -5,
    best: { 2: { score: -4, captured: 3.8, maxCombo: 7, objectives: ['captured', 'captured', 'imaginary'] } },
    settings: { sound: false, difficulty: 'extreme', reducedMotion: true }, career: { missions: -1, captured: 30.7 }
  }) });
  const restored = loadSave(storage);
  assert.equal(restored.version, 1);
  assert.equal(restored.credits, 0);
  assert.deepEqual(restored.upgrades, { suction: 0, capacity: 2, armour: 0, engine: 4, processor: 0 });
  assert.deepEqual(restored.completed, [2]);
  assert.equal(restored.unlocked, 3);
  assert.deepEqual(restored.best[2], { score: 0, captured: 3, maxCombo: 7, objectives: ['captured'] });
  assert.deepEqual(restored.settings, { sound: false, difficulty: 'normal', reducedMotion: true });
  assert.deepEqual(restored.career, { captured: 30, missions: 0 });
});

test('unknown versions and unavailable storage recover safely', () => {
  const backup = defaultSave(); backup.credits = 85;
  const storage = memoryStorage({ [SAVE_KEY]: JSON.stringify({ version: 500, credits: 999 }), [BACKUP_KEY]: JSON.stringify(backup) });
  assert.equal(loadSave(storage).credits, 85);
  assert.equal(JSON.parse(storage.getItem(SAVE_KEY)).version, 500);
  const unavailable = { getItem() { throw new Error('blocked'); }, setItem() { throw new Error('quota'); } };
  assert.deepEqual(loadSave(unavailable), defaultSave());
  assert.equal(persistSave(defaultSave(), unavailable), false);
});

test('persist saves a previous valid record before replacing it', () => {
  const storage = memoryStorage();
  const original = defaultSave(); original.credits = 200;
  assert.equal(persistSave(original, storage), true);
  const updated = { ...original, credits: 450 };
  assert.equal(persistSave(updated, storage), true);
  assert.equal(JSON.parse(storage.getItem(SAVE_KEY)).credits, 450);
  assert.equal(JSON.parse(storage.getItem(BACKUP_KEY)).credits, 200);
});

test('purchases spend exactly once, stay immutable, and enforce funds and level limits', () => {
  const original = defaultSave(); original.credits = 500;
  freeze(original);
  const bought = purchaseUpgrade(original, 'engine');
  assert.equal(bought.ok, true);
  assert.equal(bought.save.credits, 0);
  assert.equal(bought.save.upgrades.engine, 1);
  assert.equal(original.credits, 500);
  assert.equal(original.upgrades.engine, 0);
  assert.equal(purchaseUpgrade(bought.save, 'engine').ok, false);
  assert.equal(purchaseUpgrade(original, '__proto__').ok, false);
  const maxed = defaultSave(); maxed.credits = 1_000_000;
  for (const upgrade of UPGRADES) {
    maxed.upgrades[upgrade.id] = upgrade.prices.length;
    assert.equal(purchaseUpgrade(maxed, upgrade.id).ok, false);
  }
});

test('first clear grants transparent payout, unlock, and goal credit without double processing', () => {
  const original = defaultSave(); original.upgrades.processor = 2;
  freeze(original);
  const result = completeMission(original, run());
  assert.deepEqual(result.payout, { collection: 1000, mission: 1050, objectives: 700, performance: 250, total: 3000 });
  assert.equal(result.firstClear, true);
  assert.equal(result.newUnlock, 2);
  assert.deepEqual(result.save.completed, [1]);
  assert.deepEqual(result.save.best[1].objectives, ['captured', 'rockKills']);
  assert.deepEqual(result.save.career, { captured: 10, missions: 1 });
  assert.equal(original.credits, 0);
});

test('replays keep normal earnings but optional goals and first clear pay only once', () => {
  const first = completeMission(defaultSave(), run());
  const again = completeMission(freeze(first.save), run());
  assert.deepEqual(again.payout, { collection: 1000, mission: 550, objectives: 0, performance: 250, total: 1800 });
  assert.equal(again.newUnlock, null);
  assert.equal(again.firstClear, false);
  assert.equal(again.save.credits, 4800);
  assert.equal(again.save.best[1].score, 3000);
  assert.deepEqual(again.save.completed, [1]);
});

test('an optional goal completed on a later replay gets its one-time award', () => {
  const first = completeMission(defaultSave(), run({ stats: { captured: 10, credits: 1000, maxCombo: 1, rockKills: 0 } }));
  assert.equal(first.payout.objectives, 350);
  const next = completeMission(first.save, run());
  assert.equal(next.payout.objectives, 350);
  assert.deepEqual(next.save.best[1].objectives, ['captured', 'rockKills']);
});

test('failed runs retain half collections, with no unlock or objective award', () => {
  const result = completeMission(defaultSave(), run({ status: 'lost', stats: { credits: 1001, captured: 20, rockKills: 5, maxCombo: 20 } }));
  assert.deepEqual(result.payout, { collection: 500, mission: 0, objectives: 0, performance: 0, total: 500 });
  assert.equal(result.save.unlocked, 1);
  assert.deepEqual(result.save.completed, []);
  assert.deepEqual(result.save.best[1].objectives, []);
  assert.equal(result.save.career.captured, 20);
  assert.equal(result.firstClear, false);
});

test('unfinished or unrecognized missions cannot pay, and the boss unlock never exceeds the campaign', () => {
  assert.equal(completeMission(defaultSave(), run({ status: 'playing' })).save.career.missions, 0);
  assert.equal(completeMission(defaultSave(), run({ mission: { id: 99 } })).payout.total, 0);
  const save = defaultSave(); save.unlocked = 5;
  const boss = completeMission(save, run({ mission: MISSIONS[4] }));
  assert.equal(boss.save.unlocked, 5);
  assert.equal(boss.newUnlock, null);
  assert.deepEqual(boss.save.completed, [5]);
});
