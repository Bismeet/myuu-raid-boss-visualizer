import { BattleState } from "../js/core/battle-state.js";
import { SetupPersistence } from "../js/utils/persistence.js";
import { calculatePokemonStats } from "../js/core/stats.js";

console.log("Running persistence hydration validation tests...");

const memory = new Map();
globalThis.localStorage = {
  getItem: (key) => memory.get(key) ?? null,
  setItem: (key, value) => memory.set(key, value),
  removeItem: (key) => memory.delete(key),
};

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

const persistence = new SetupPersistence(state);

// 1. Normal saved setup (no active battle)
persistence.save(false, false); // save setup only
const payload1 = persistence.read();
console.log("Payload 1 battleActive:", payload1.battleActive);

const testState1 = new BattleState();
testState1.team[0].pokemon = abra;
testState1.team[0].stats = calculatePokemonStats(abra, testState1.team[0]);
testState1.setBoss(mewtwo, bossStats);

const testPersist1 = new SetupPersistence(testState1);
await testPersist1.hydrate(payload1);

console.log("Hydrated 1 battleActive:", testState1.battleActive);
console.log("Hydrated 1 needsResume:", testState1.needsResume);
console.log("Hydrated 1 savedBattleBroken:", testState1.savedBattleBroken);
if (testState1.battleActive || testState1.needsResume || testState1.savedBattleBroken) {
  throw new Error("Normal setup hydration should not set battleActive or flags.");
}

// 2. Valid active battle state
persistence.save(false, true); // save full battle
const payload2 = persistence.read();
console.log("Payload 2 fields:", {
  currentTurn: payload2.currentTurn,
  bossHP: payload2.bossHP,
  bossMaxHP: payload2.bossMaxHP,
  teamHP: payload2.teamHP,
  activeSlot: payload2.activeSlot,
  battleLog: payload2.battleLog,
  teamCurrentTypes: payload2.teamCurrentTypes,
  bossCurrentTypes: payload2.bossCurrentTypes,
  battleActive: payload2.battleActive
});

const testState2 = new BattleState();
testState2.team[0].pokemon = abra;
testState2.team[0].stats = calculatePokemonStats(abra, testState2.team[0]);
testState2.setBoss(mewtwo, bossStats);

const testPersist2 = new SetupPersistence(testState2);
await testPersist2.hydrate(payload2);

console.log("Hydrated 2 battleActive:", testState2.battleActive);
console.log("Hydrated 2 needsResume:", testState2.needsResume);
console.log("Hydrated 2 savedBattleBroken:", testState2.savedBattleBroken);
if (!testState2.battleActive || !testState2.needsResume || testState2.savedBattleBroken) {
  throw new Error("Valid active battle hydration should set battleActive and needsResume to true.");
}

// 3. Broken/incomplete active battle state (missing bossHP)
const brokenPayload = {
  ...payload2,
  battle: {
    ...payload2.battle,
    bossHP: null // break the payload
  }
};

const testState3 = new BattleState();
testState3.team[0].pokemon = abra;
testState3.team[0].stats = calculatePokemonStats(abra, testState3.team[0]);
testState3.setBoss(mewtwo, bossStats);

const testPersist3 = new SetupPersistence(testState3);
await testPersist3.hydrate(brokenPayload);

console.log("Hydrated 3 battleActive:", testState3.battleActive);
console.log("Hydrated 3 needsResume:", testState3.needsResume);
console.log("Hydrated 3 savedBattleBroken:", testState3.savedBattleBroken);
if (testState3.battleActive || testState3.needsResume || !testState3.savedBattleBroken) {
  throw new Error("Broken active battle hydration should set battleActive=false and savedBattleBroken=true.");
}

console.log("All persistence validation checks passed successfully!");
