const BADGE_STATS = [
  ["atk", "Atk"],
  ["def", "Def"],
  ["spa", "SpA"],
  ["spd", "SpD"],
  ["spe", "Spe"],
];

function escapeAttribute(value) {
  return String(value).replace(/[&<>\"]/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    "\"": "&quot;",
  }[character]));
}

export function getStageBadges(stages = {}) {
  return BADGE_STATS.flatMap(([stat, label]) => {
    const stage = Math.max(-6, Math.min(6, Number(stages?.[stat]) || 0));
    return stage === 0 ? [] : [{ stat, label, stage, text: `${stage > 0 ? "+" : ""}${stage} ${label}` }];
  });
}

export function renderStageBadges(stages, { side = "player", label = "Stat stage changes" } = {}) {
  const badges = getStageBadges(stages);
  if (!badges.length) return "";
  return `<div class="battle-stage-badges ${side === "boss" ? "boss-stage-badges" : "player-stage-badges"}" role="list" aria-label="${escapeAttribute(label)}">
    ${badges.map((badge) => `<span class="stage-badge ${badge.stage > 0 ? "positive" : "negative"}" role="listitem" data-stage-stat="${badge.stat}">${badge.text}</span>`).join("")}
  </div>`;
}
