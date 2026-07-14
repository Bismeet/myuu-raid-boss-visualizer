export const STAGE_KEYS = ["atk", "def", "spa", "spd", "spe", "accuracy", "evasion", "crit"];
export const STORED_POWER_STAGE_KEYS = ["atk", "def", "spa", "spd", "spe", "accuracy", "evasion"];
export const emptyStages = () => Object.fromEntries(STAGE_KEYS.map((key) => [key, 0]));

export function getTotalPositiveStages(stages = {}) {
  return STORED_POWER_STAGE_KEYS.reduce(
    (sum, stat) => sum + Math.max(0, Number(stages?.[stat]) || 0),
    0,
  );
}

export function getStoredPowerLikeBasePower(stages = {}) {
  return 20 + (20 * getTotalPositiveStages(stages));
}

export function resolveDynamicMovePower(move, stages = {}, { allowCustomOverride = false } = {}) {
  if (!move || !["stored-power", "power-trip"].includes(move.name) || allowCustomOverride) return move;
  return {
    ...move,
    customPower: getStoredPowerLikeBasePower(stages),
  };
}

export function stageMultiplier(stage) {
  const value = Math.max(-6, Math.min(6, Number(stage) || 0));
  return value >= 0 ? (2 + value) / 2 : 2 / (2 - value);
}

export function applyStage(stat, stage) {
  return Math.floor(stat * stageMultiplier(stage));
}
