import { EMPTY_UPGRADES, MISSIONS, UPGRADES } from './config.js';

/** Local progress is deliberately independent of the browser and simulation. */
export const SAVE_KEY = 'abduction.midnight-harvest.v1';
export const BACKUP_KEY = `${SAVE_KEY}.backup`;
const MAX_VALUE = 1_000_000_000;
const maxMission = Math.max(...MISSIONS.map(mission => mission.id));
const isRecord = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const boundedInteger = (value, fallback = 0, maximum = MAX_VALUE) =>
  typeof value === 'number' && Number.isFinite(value)
    ? Math.min(maximum, Math.max(0, Math.floor(value))) : fallback;
const boundedMultiplier = value => typeof value === 'number' && Number.isFinite(value)
  ? Math.min(10, Math.max(0, Math.floor(value * 2) / 2)) : 0;

export function defaultSave() {
  return {
    version: 1,
    credits: 0,
    upgrades: { ...EMPTY_UPGRADES },
    unlocked: 1,
    completed: [],
    best: {},
    settings: { sound: true, difficulty: 'normal', reducedMotion: false },
    career: { captured: 0, missions: 0 }
  };
}

/** Repairs individual fields; unknown future versions are never overwritten by loading. */
function normalizeSave(value) {
  if (!isRecord(value)) return null;
  if (value.version !== undefined && value.version !== 0 && value.version !== 1) return null;
  // A JSON object unrelated to this game is not a recoverable progress record.
  if (!['credits', 'upgrades', 'unlocked', 'completed', 'best'].some(key => key in value)) return null;
  const save = defaultSave();
  save.credits = boundedInteger(value.credits);
  for (const upgrade of UPGRADES) {
    save.upgrades[upgrade.id] = boundedInteger(value.upgrades?.[upgrade.id], 0, upgrade.prices.length);
  }
  if (Array.isArray(value.completed)) {
    save.completed = [...new Set(value.completed.filter(id =>
      Number.isInteger(id) && MISSIONS.some(mission => mission.id === id)))].sort((a, b) => a - b);
  }
  save.unlocked = Math.max(1, boundedInteger(value.unlocked, 1, maxMission),
    ...save.completed.map(id => Math.min(maxMission, id + 1)));
  for (const mission of MISSIONS) {
    const best = value.best?.[mission.id];
    if (!isRecord(best)) continue;
    save.best[mission.id] = {
      score: boundedInteger(best.score),
      captured: boundedInteger(best.captured),
      maxCombo: boundedMultiplier(best.maxCombo),
      objectives: Array.isArray(best.objectives)
        ? [...new Set(best.objectives.filter(key => mission.goals.some(goal => goal.key === key)))] : []
    };
  }
  if (isRecord(value.settings)) {
    if (typeof value.settings.sound === 'boolean') save.settings.sound = value.settings.sound;
    if (typeof value.settings.reducedMotion === 'boolean') save.settings.reducedMotion = value.settings.reducedMotion;
    if (['easy', 'normal', 'hard'].includes(value.settings.difficulty)) save.settings.difficulty = value.settings.difficulty;
  }
  save.career.captured = boundedInteger(value.career?.captured);
  save.career.missions = boundedInteger(value.career?.missions);
  return save;
}

function getStorage(storage) {
  if (storage !== undefined) return storage;
  try { return globalThis.localStorage; } catch { return null; }
}

function readSave(storage, key) {
  try {
    const text = storage?.getItem(key);
    return typeof text === 'string' ? normalizeSave(JSON.parse(text)) : null;
  } catch { return null; }
}

/** Falls back to the last valid backup, then fresh progress; never deletes stored data. */
export function loadSave(storage) {
  const target = getStorage(storage);
  return readSave(target, SAVE_KEY) ?? readSave(target, BACKUP_KEY) ?? defaultSave();
}

/** Keep the previous valid save before replacing the main record. Returns false on failure. */
export function persistSave(save, storage) {
  const target = getStorage(storage);
  const normalized = normalizeSave(save);
  if (!target || !normalized) return false;
  // Loading an older backup is safe; writing over a newer schema is not.
  const unsupported = key => {
    let text;
    try { text = target.getItem(key); } catch { return true; }
    try {
      const record = JSON.parse(text);
      return isRecord(record) && record.version !== undefined && ![0,1].includes(record.version);
    } catch { return false; }
  };
  if (unsupported(SAVE_KEY)) return false;
  const previous = readSave(target, SAVE_KEY);
  const backup = previous ?? readSave(target, BACKUP_KEY) ?? normalized;
  if (!unsupported(BACKUP_KEY)) {
    try { target.setItem(BACKUP_KEY, JSON.stringify(backup)); } catch { /* Main save may still fit. */ }
  }
  try {
    target.setItem(SAVE_KEY, JSON.stringify(normalized));
    return true;
  } catch { return false; }
}

/** Purchases are immutable and cannot exceed an upgrade's final level. */
export function purchaseUpgrade(previous, id) {
  const save = normalizeSave(previous) ?? defaultSave();
  const upgrade = UPGRADES.find(item => item.id === id);
  if (!upgrade) return { ok: false, reason: 'Unknown upgrade.', save };
  const level = save.upgrades[id];
  if (level >= upgrade.prices.length) return { ok: false, reason: 'Fully upgraded.', save };
  const price = upgrade.prices[level];
  if (save.credits < price) return { ok: false, reason: 'Not enough credits.', save };
  save.credits -= price;
  save.upgrades[id] += 1;
  return { ok: true, reason: null, save };
}

/**
 * Settle one finished run. The app calls this once per results screen.
 * Engine credits already include processor bonuses. Repeat clears earn the regular
 * mission and performance rewards; first-clear and optional goal bonuses pay once.
 */
export function completeMission(previous, game) {
  const save = normalizeSave(previous) ?? defaultSave();
  const payout = { collection: 0, mission: 0, objectives: 0, performance: 0, total: 0 };
  const mission = MISSIONS.find(item => item.id === game?.mission?.id);
  if (!mission || !['won', 'lost'].includes(game?.status)) {
    return { save, payout, newUnlock: null, firstClear: false };
  }
  const won = game.status === 'won';
  const stats = isRecord(game.stats) ? game.stats : {};
  const firstClear = won && !save.completed.includes(mission.id);
  const priorBest = save.best[mission.id] ?? { score: 0, captured: 0, maxCombo: 0, objectives: [] };
  const achieved = won ? mission.goals.filter(goal => boundedInteger(stats[goal.key]) >= goal.target) : [];
  const newlyAchieved = achieved.filter(goal => !priorBest.objectives.includes(goal.key));
  payout.collection = Math.floor(boundedInteger(stats.credits) * (won ? 1 : 0.5));
  payout.mission = won ? 400 + mission.id * 150 + (firstClear ? 500 : 0) : 0;
  payout.objectives = newlyAchieved.length * 350;
  payout.performance = won ? boundedMultiplier(stats.maxCombo) * 50 : 0;
  payout.total = payout.collection + payout.mission + payout.objectives + payout.performance;
  save.credits = boundedInteger(save.credits + payout.total);
  save.career.captured = boundedInteger(save.career.captured + boundedInteger(stats.captured));
  save.career.missions = boundedInteger(save.career.missions + 1);
  save.best[mission.id] = {
    score: Math.max(priorBest.score, payout.total),
    captured: Math.max(priorBest.captured, boundedInteger(stats.captured)),
    maxCombo: Math.max(priorBest.maxCombo, boundedMultiplier(stats.maxCombo)),
    objectives: [...new Set([...priorBest.objectives, ...achieved.map(goal => goal.key)])]
  };
  let newUnlock = null;
  if (won) {
    if (firstClear) save.completed = [...save.completed, mission.id].sort((a, b) => a - b);
    const next = Math.min(maxMission, mission.id + 1);
    if (next > save.unlocked) {
      save.unlocked = next;
      newUnlock = next;
    }
  }
  return { save, payout, newUnlock, firstClear };
}
