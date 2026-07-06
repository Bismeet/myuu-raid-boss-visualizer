export const STAGE_KEYS = ["atk", "def", "spa", "spd", "spe", "accuracy", "evasion", "crit"];
export const emptyStages = () => Object.fromEntries(STAGE_KEYS.map((key) => [key, 0]));

export function stageMultiplier(stage) {
  const value = Math.max(-6, Math.min(6, Number(stage) || 0));
  return value >= 0 ? (2 + value) / 2 : 2 / (2 - value);
}

export function applyStage(stat, stage) {
  return Math.floor(stat * stageMultiplier(stage));
}
