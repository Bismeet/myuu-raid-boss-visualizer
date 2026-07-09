import { calculateBossStats } from "../js/core/stats.js";
import { BattleState } from "../js/core/battle-state.js";
import { Simulator } from "../js/core/simulator.js";
import { MOVE_EFFECTS } from "../js/data/move-effects.js";
import { calculatePokemonStats } from "../js/core/stats.js";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const mewtwo = {
  name: "mewtwo",
  stats: [
    { base_stat: 106, stat: { name: "hp" } },
    { base_stat: 110, stat: { name: "attack" } },
    { base_stat: 90, stat: { name: "defense" } },
    { base_stat: 154, stat: { name: "special-attack" } },
    { base_stat: 90, stat: { name: "special-defense" } },
    { base_stat: 130, stat: { name: "speed" } },
  ]
};

const latias = {
  name: "latias",
  stats: [
    { base_stat: 80, stat: { name: "hp" } },
    { base_stat: 80, stat: { name: "attack" } },
    { base_stat: 90, stat: { name: "defense" } },
    { base_stat: 110, stat: { name: "special-attack" } },
    { base_stat: 130, stat: { name: "special-defense" } },
    { base_stat: 110, stat: { name: "speed" } },
  ]
};

console.log("Running boss defensive scaling checks...");

// 1. Boss HP >= 1,000,000 gets Def = 6300, SpD = 6300
const statsMewtwo = calculateBossStats(mewtwo);
if (statsMewtwo.hp !== 1060000) {
  throw new Error(`Expected Mewtwo HP to be 1060000, got ${statsMewtwo.hp}`);
}
if (statsMewtwo.def !== 6300 || statsMewtwo.spd !== 6300) {
  throw new Error(`Expected Mewtwo Def/SpD to be 6300, got Def=${statsMewtwo.def}, SpD=${statsMewtwo.spd}`);
}
console.log("✓ Verified boss with HP >= 1,000,000 gets Def/SpD = 6300");

// 2. Boss HP < 1,000,000 gets Def = 3150, SpD = 3150
const statsLatias = calculateBossStats(latias);
if (statsLatias.hp !== 800000) {
  throw new Error(`Expected Latias HP to be 800000, got ${statsLatias.hp}`);
}
if (statsLatias.def !== 3150 || statsLatias.spd !== 3150) {
  throw new Error(`Expected Latias Def/SpD to be 3150, got Def=${statsLatias.def}, SpD=${statsLatias.spd}`);
}
console.log("✓ Verified boss with HP < 1,000,000 gets Def/SpD = 3150");

// 3. No code path still uses 2.617
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.join(__dirname, "..");

function searchDirectory(dir) {
  const files = fs.readdirSync(dir);
  for (const file of files) {
    const fullPath = path.join(dir, file);
    if (file === "node_modules" || file === ".git" || file === ".agents") continue;
    const stat = fs.statSync(fullPath);
    if (stat.isDirectory()) {
      searchDirectory(fullPath);
    } else if (file.endsWith(".js") || file.endsWith(".mjs") || file.endsWith(".html") || file.endsWith(".css")) {
      const content = fs.readFileSync(fullPath, "utf8");
      const target = "2." + "617";
      // Skip the test file itself when auditing to avoid false positive
      if (fullPath === fileURLToPath(import.meta.url)) continue;
      if (content.includes(target)) {
        throw new Error(`File ${fullPath} still contains the old multiplier '${target}'`);
      }
    }
  }
}
searchDirectory(projectRoot);
console.log("✓ Verified no codebase files contain references to the old '2.617' multiplier");

// 4. Guard Split uses 6300/3150 starting values
const state = new BattleState();
state.team[0].pokemon = {
  name: "shuckle",
  stats: [
    { base_stat: 20, stat: { name: "hp" } },
    { base_stat: 10, stat: { name: "attack" } },
    { base_stat: 230, stat: { name: "defense" } },
    { base_stat: 10, stat: { name: "special-attack" } },
    { base_stat: 230, stat: { name: "special-defense" } },
    { base_stat: 5, stat: { name: "speed" } }
  ]
};
state.team[0].level = 100;
state.team[0].nature = "hardy";
state.team[0].evs = { hp: 0, atk: 0, def: 0, spa: 0, spd: 0, spe: 0 };
state.team[0].ivs = { hp: 31, atk: 31, def: 31, spa: 31, spd: 31, spe: 31 };
state.team[0].moves[0] = { name: "guard-split", type: { name: "psychic" }, damage_class: { name: "status" } };
state.team[0].stats = calculatePokemonStats(state.team[0].pokemon, state.team[0]);

// Shuckle Def = 496
if (state.team[0].stats.def !== 496) {
  throw new Error(`Expected Shuckle defense to be 496, got ${state.team[0].stats.def}`);
}

state.boss = mewtwo;
state.bossBaseStats = calculateBossStats(mewtwo);
state.bossStats = { ...state.bossBaseStats };
state.startBattle();

// Apply Guard Split directly on active BattleState
const turnLog = { notes: [], messages: [] };
MOVE_EFFECTS["guard-split"].apply(state, state.team[0], { isBoss: true }, "player", turnLog);

// Expected average = Math.floor((496 + 6300) / 2) = 3398
if (state.bossStats.def !== 3398 || state.bossStats.spd !== 3398) {
  throw new Error(`Expected Guard-Split boss Def/SpD to be 3398, got Def=${state.bossStats.def}, SpD=${state.bossStats.spd}`);
}

// Test Guard Split in the Simulator
// Reset Shuckle's stats back to original values so we don't carry over the Guard Split result
state.team[0].stats = calculatePokemonStats(state.team[0].pokemon, state.team[0]);

const simulatorState = {
  boss: mewtwo,
  bossBaseStats: calculateBossStats(mewtwo),
  bossStats: null,
  team: [state.team[0]],
  plan: [
    { turn: 1, slot: 0, action: "guard-split", switchMode: "stay" }
  ]
};
new Simulator(simulatorState).run(1);
if (simulatorState.bossStats.def !== 3398 || simulatorState.bossStats.spd !== 3398) {
  throw new Error(`Expected simulator Guard Split Def/SpD to be 3398, got Def=${simulatorState.bossStats.def}, SpD=${simulatorState.bossStats.spd}`);
}
console.log("✓ Verified Guard Split calculations use correct 6300/3150 starting values");

// 5. Manual boss override bypasses this rule
state.resetBattle();
state.manualBossOverride = true;
state.manualBossName = "overridden-boss";
state.manualBossHP = 2000000;
state.manualBossMaxHP = 2000000;
state.manualBossCurrentTypes = ["dragon"];
state.manualBossBaseStats = { hp: 2000000, atk: 100, def: 500, spa: 100, spd: 500, spe: 100 };
state.manualBossFinalStats = { atk: 100, def: 500, spa: 100, spd: 500, spe: 100 };
state.startBattle();

if (state.bossStats.def !== 500 || state.bossStats.spd !== 500) {
  throw new Error(`Expected manual override stats Def/SpD to be 500, got Def=${state.bossStats.def}, SpD=${state.bossStats.spd}`);
}
console.log("✓ Verified manual boss override bypasses HP scaling rules");

console.log("All boss scaling checks passed successfully!");
