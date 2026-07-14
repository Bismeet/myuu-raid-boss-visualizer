import { BattleState } from "../js/core/battle-state.js";
import { calculateBossStats, calculatePokemonStats } from "../js/core/stats.js";
import { getStageBadges, renderStageBadges } from "../js/ui/stage-badges.js";

const pokemon = (name, ability = "simple") => ({
  name,
  types: [{ type: { name: "normal" } }],
  abilities: [{ ability: { name: ability } }],
  stats: [
    ["hp", 100], ["attack", 100], ["defense", 100],
    ["special-attack", 100], ["special-defense", 100], ["speed", 100],
  ].map(([statName, base_stat]) => ({ base_stat, stat: { name: statName } })),
});

const player = pokemon("test-player");
const boss = pokemon("test-boss", "pressure");
const state = new BattleState();
for (const slot of [0, 1]) {
  state.team[slot].pokemon = player;
  state.team[slot].ability = slot === 0 ? "simple" : "pressure";
  state.team[slot].stats = calculatePokemonStats(player, state.team[slot]);
}
state.team[0].moves[0] = {
  name: "close-combat",
  power: 120,
  type: { name: "fighting" },
  damage_class: { name: "physical" },
};
const bossStats = calculateBossStats(boss);
bossStats.hp = 100000;
state.setBoss(boss, bossStats);
state.startBattle();
state.damageRollMode = "min";

await state.executeTurn("use-move", 0, 0, "do-nothing", 0);
if (state.teamStages[0].def !== -2 || state.teamStages[0].spd !== -2) {
  throw new Error("Simple did not double Close Combat's self-drops.");
}
const sampleBadges = getStageBadges({ atk: 6, def: -1, spa: 2, spd: 0, spe: 0 });
if (sampleBadges.map(({ text }) => text).join(",") !== "+6 Atk,-1 Def,+2 SpA") {
  throw new Error("Stage badge labels did not match the requested compact format.");
}
if (renderStageBadges({ atk: 0, def: 0, spa: 0, spd: 0, spe: 0 }) !== "") {
  throw new Error("Zero stat stages must remain hidden.");
}
const liveBadgeHtml = renderStageBadges(state.teamStages[0]);
if (!liveBadgeHtml.includes("-2 Def") || !liveBadgeHtml.includes("-2 SpD") || liveBadgeHtml.includes("+0")) {
  throw new Error("Stage badges did not update from the live post-move stage state.");
}

state.volatileEffects.ingrain[0] = true;
state.volatileEffects.octolock = { target: "player", targetSlot: 0, source: "boss", active: true };
state.recordSplitEvent("guard-split", 0);
const snapshot = state.createSnapshot();
state.volatileEffects.ingrain[0] = false;
state.volatileEffects.octolock = null;
state.splitEvents = [];
state.history.push(snapshot);
state.undoLastTurn();
if (!state.volatileEffects.ingrain[0] || !state.volatileEffects.octolock?.active || state.splitEvents.length !== 1) {
  throw new Error("Undo did not restore volatile and private split-event state.");
}

state.teamHP[0] = 0;
state.awaitingForcedSwitch = true;
state.executeForcedSwitch(1);
if (state.awaitingForcedSwitch || state.activeSlot !== 1 || state.isResolvingTurn) {
  throw new Error("Forced switching did not return the battle to an interactive state.");
}

console.log("Battle state checks passed.");
