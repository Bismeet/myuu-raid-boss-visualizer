import { calculateBossStats, calculatePokemonStats } from "../js/core/stats.js";
import { BattleState } from "../js/core/battle-state.js";
import { Simulator } from "../js/core/simulator.js";
import { MOVE_EFFECTS } from "../js/data/move-effects.js";

const mewtwo = {
  name: "mewtwo",
  stats: [
    { base_stat: 106, stat: { name: "hp" } },
    { base_stat: 110, stat: { name: "attack" } },
    { base_stat: 90, stat: { name: "defense" } },
    { base_stat: 154, stat: { name: "special-attack" } },
    { base_stat: 90, stat: { name: "special-defense" } },
    { base_stat: 130, stat: { name: "speed" } },
  ],
};

const state = new BattleState();
state.team[0].pokemon = {
  name: "shuckle",
  stats: [
    { base_stat: 20, stat: { name: "hp" } },
    { base_stat: 10, stat: { name: "attack" } },
    { base_stat: 230, stat: { name: "defense" } },
    { base_stat: 10, stat: { name: "special-attack" } },
    { base_stat: 230, stat: { name: "special-defense" } },
    { base_stat: 5, stat: { name: "speed" } },
  ],
};
state.team[0].level = 100;
state.team[0].nature = "hardy";
state.team[0].evs = { hp: 0, atk: 0, def: 0, spa: 0, spd: 0, spe: 0 };
state.team[0].ivs = { hp: 31, atk: 31, def: 31, spa: 31, spd: 31, spe: 31 };
state.team[0].moves[0] = { name: "guard-split", type: { name: "psychic" }, damage_class: { name: "status" } };
state.team[0].stats = calculatePokemonStats(state.team[0].pokemon, state.team[0]);

const publicBossStats = calculateBossStats(mewtwo);
state.boss = mewtwo;
state.bossBaseStats = { ...publicBossStats };
state.bossStats = { ...publicBossStats };
state.startBattle();

const expectedSplit = Math.floor((state.team[0].stats.def + publicBossStats.def) / 2);
MOVE_EFFECTS["guard-split"].apply(state, state.team[0], { isBoss: true }, "player", { notes: [], messages: [] });
if (state.bossStats.def !== expectedSplit || state.bossStats.spd !== expectedSplit) {
  throw new Error("Public fallback Guard Split behavior changed.");
}

state.team[0].stats = calculatePokemonStats(state.team[0].pokemon, state.team[0]);
const simulatorState = {
  boss: mewtwo,
  bossBaseStats: { ...publicBossStats },
  bossStats: null,
  team: [state.team[0]],
  plan: [{ turn: 1, slot: 0, action: "guard-split", switchMode: "stay" }],
};
new Simulator(simulatorState).run(1);
if (simulatorState.bossStats.def !== expectedSplit || simulatorState.bossStats.spd !== expectedSplit) {
  throw new Error("Simulator public fallback Guard Split behavior changed.");
}

console.log("Public boss-stat fallback checks passed.");
