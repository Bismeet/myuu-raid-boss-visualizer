import { BattleState } from "../js/core/battle-state.js";
import { calculatePokemonStats } from "../js/core/stats.js";

console.log("Running New Battle behavior checks...");

const abra = {
  name: "abra",
  types: [{ type: { name: "psychic" } }],
  abilities: [],
  moves: [],
  stats: [
    { base_stat: 25, stat: { name: "hp" } },
    { base_stat: 20, stat: { name: "attack" } },
    { base_stat: 15, stat: { name: "defense" } },
    { base_stat: 105, stat: { name: "special-attack" } },
    { base_stat: 55, stat: { name: "special-defense" } },
    { base_stat: 90, stat: { name: "speed" } },
  ]
};

const mewtwo = {
  name: "mewtwo",
  types: [{ type: { name: "psychic" } }],
  abilities: [],
  moves: [],
  stats: [
    { base_stat: 106, stat: { name: "hp" } },
    { base_stat: 110, stat: { name: "attack" } },
    { base_stat: 90, stat: { name: "defense" } },
    { base_stat: 154, stat: { name: "special-attack" } },
    { base_stat: 90, stat: { name: "special-defense" } },
    { base_stat: 130, stat: { name: "speed" } },
  ]
};

const state = new BattleState();
state.team[0].pokemon = abra;
state.team[0].stats = calculatePokemonStats(abra, state.team[0]);

const bossStats = calculatePokemonStats(mewtwo, { level: 200, nature: "hardy", ivs: { hp: 31, atk: 31, def: 31, spa: 31, spd: 31, spe: 31 }, evs: { hp: 252, atk: 252, def: 252, spa: 252, spd: 252, spe: 252 } });
bossStats.hp = 1060000;
state.setBoss(mewtwo, bossStats);

state.startBattle();

// Mutate some battle-only data to simulate turn execution
state.currentTurn = 5;
state.bossHP = 500000;
state.teamHP[0] = 50;
state.battleLog.push({ turn: 1, pokemon: "abra", notes: ["Testing notes"], playerDamage: 100, bossHPAfter: 999900, playerHPAfter: 50 });
state.consumedItems.player[0] = true;
state.playerSpeedOverrides[0] = 587;
state.bossSpeedOverride = 7;

// Call startNewBattleFromCurrentSetup
state.startNewBattleFromCurrentSetup();

console.log("Post New Battle values:");
console.log("- battleActive:", state.battleActive);
console.log("- currentTurn:", state.currentTurn);
console.log("- bossHP:", state.bossHP);
console.log("- teamHP[0]:", state.teamHP[0]);
console.log("- battleLog length:", state.battleLog.length);
console.log("- playerSpeedOverrides[0]:", state.playerSpeedOverrides[0]);
console.log("- consumedItems.player[0]:", state.consumedItems.player[0]);

if (!state.battleActive) {
  throw new Error("New Battle did not set battleActive to true.");
}
if (state.currentTurn !== 1) {
  throw new Error("New Battle did not reset turn counter to 1.");
}
if (state.bossHP !== 1060000) {
  throw new Error("New Battle did not reset boss HP to max.");
}
if (state.teamHP[0] !== state.team[0].stats.hp) {
  throw new Error("New Battle did not restore player HP.");
}
if (state.battleLog.length !== 0) {
  throw new Error("New Battle did not clear logs.");
}
if (state.playerSpeedOverrides[0] !== null || state.bossSpeedOverride !== null) {
  throw new Error("New Battle did not clear speed overrides.");
}
if (state.consumedItems.player[0] !== false) {
  throw new Error("New Battle did not reset consumed items.");
}
if (state.boss.name !== "mewtwo" || state.team[0].pokemon.name !== "abra") {
  throw new Error("New Battle modified the team or boss setup.");
}
if (state.uiMode !== "battle") {
  throw new Error("New Battle did not set uiMode to battle.");
}

state.resetBattle();
if (state.uiMode !== "builder") {
  throw new Error("Reset Battle did not set uiMode to builder.");
}

state.startBattle();
if (state.uiMode !== "battle") {
  throw new Error("Start Battle did not set uiMode to battle.");
}

console.log("All New Battle behavior checks passed successfully!");
