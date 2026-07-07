import { BattleState } from "../js/core/battle-state.js";
import { calculatePokemonStats, calculateBossStats } from "../js/core/stats.js";
import { emptyStages } from "../js/core/stages.js";
import { damageRolls } from "../js/core/damage.js";

const smeargle = {
  name: "smeargle",
  types: [{ type: { name: "normal" } }],
  abilities: [{ ability: { name: "own-tempo" } }],
  moves: [
    { move: { name: "extreme-speed" } }
  ],
  stats: [
    { base_stat: 55, stat: { name: "hp" } },
    { base_stat: 20, stat: { name: "attack" } },
    { base_stat: 35, stat: { name: "defense" } },
    { base_stat: 20, stat: { name: "special-attack" } },
    { base_stat: 45, stat: { name: "special-defense" } },
    { base_stat: 75, stat: { name: "speed" } },
  ]
};

const mewtwo = {
  name: "mewtwo",
  types: [{ type: { name: "psychic" } }],
  abilities: [],
  moves: [
    { move: { name: "psystrike" } }
  ],
  stats: [
    { base_stat: 106, stat: { name: "hp" } },
    { base_stat: 110, stat: { name: "attack" } },
    { base_stat: 90, stat: { name: "defense" } },
    { base_stat: 154, stat: { name: "special-attack" } },
    { base_stat: 90, stat: { name: "special-defense" } },
    { base_stat: 130, stat: { name: "speed" } },
  ]
};

console.log("Running mechanics upgrade checks...");

const state = new BattleState();

// Initialize team
state.team[0].pokemon = smeargle;
state.team[0].level = 100;
state.team[0].ability = "own-tempo";
state.team[0].item = "life-orb";
state.team[0].moves[0] = { name: "extreme-speed", power: 80, type: { name: "normal" }, damage_class: { name: "physical" } };
state.team[0].stats = calculatePokemonStats(smeargle, state.team[0]);

// Initialize boss
const bossStats = calculateBossStats(mewtwo);
state.boss = mewtwo;
state.bossBaseStats = { ...bossStats };
state.bossStats = { ...bossStats };
state.bossMoves[0] = { name: "psystrike", power: 100, type: { name: "psychic" }, damage_class: { name: "special" } };

// 1. Validate Item Registry Hooks inside damage calculator
const basePayload = {
  attacker: state.team[0],
  boss: { stats: state.bossStats, maxHp: state.bossStats.hp },
  move: state.team[0].moves[0],
  attackerTypes: ["normal"],
  bossTypes: ["psychic"],
  ability: "own-tempo",
  stages: emptyStages(),
  bossStages: emptyStages()
};

// Check Life Orb modifier (1.3x)
const resLifeOrb = damageRolls(basePayload);
if (!resLifeOrb.itemNotes.some(n => n.includes("Life Orb: 1.3x"))) {
  throw new Error("Life Orb modifier not detected in damage calculation.");
}
console.log("Verified Life Orb damage multiplier via registry hooks.");

// Check Choice Band (1.5x)
state.team[0].item = "choice-band";
const resChoiceBand = damageRolls(basePayload);
if (!resChoiceBand.itemNotes.some(n => n.includes("Choice Band: Atk 1.5x"))) {
  throw new Error("Choice Band modifier not detected.");
}
console.log("Verified Choice Band attack stat multiplier via registry hooks.");

// 2. Validate Move Validations & Turn Execution
state.startBattle();

// Attempting to execute with empty slot move index (should fail)
try {
  state.executeTurn("use-move", 1, 0, "do-nothing", 0);
  throw new Error("Should have thrown error for empty move slot.");
} catch (err) {
  if (!err.message.includes("No move selected")) {
    throw new Error(`Unexpected error message for empty move slot: ${err.message}`);
  }
}
console.log("Verified validation: block empty move execution.");

// 3. Validate Turn-end Healing Resolution
// Setup Leftovers
state.team[0].item = "leftovers";
state.teamHP[0] = 100; // Damaged HP
state.executeTurn("use-move", 0, 0, "do-nothing", 0);

const leftoversHealLog = state.battleLog.at(-1).notes.find(n => n.includes("Leftovers"));
if (!leftoversHealLog) {
  throw new Error("Leftovers healing not resolved or logged at turn end.");
}
console.log(`Verified Leftovers healing: ${leftoversHealLog}`);

// Setup Shell Bell
state.resetBattle();
state.startBattle();
state.team[0].item = "shell-bell";
state.teamHP[0] = 100; // Damaged HP
state.executeTurn("use-move", 0, 0, "do-nothing", 0);

const shellBellLog = state.battleLog.at(-1).notes.find(n => n.includes("Shell Bell"));
if (!shellBellLog) {
  throw new Error("Shell Bell healing not resolved or logged.");
}
console.log(`Verified Shell Bell healing: ${shellBellLog}`);

// Setup Sitrus Berry
state.resetBattle();
state.startBattle();
state.team[0].item = "sitrus-berry";
state.teamHP[0] = Math.floor(state.team[0].stats.hp / 3); // Under 50% HP
const hpBeforeSitrus = state.teamHP[0];
state.executeTurn("use-move", 0, 0, "do-nothing", 0);

const sitrusLog = state.battleLog.at(-1).notes.find(n => n.includes("Sitrus Berry"));
if (!sitrusLog) {
  throw new Error("Sitrus Berry not consumed or resolved.");
}
if (state.team[0].item !== "sitrus-berry") {
  throw new Error("Sitrus Berry should remain selected in Team Builder after battle consumption.");
}
if (!state.consumedItems.player[0]) {
  throw new Error("Sitrus Berry was not marked consumed in battle state.");
}
console.log(`Verified Sitrus Berry consumption: ${sitrusLog}`);

// Setup Oran Berry
state.resetBattle();
state.startBattle();
state.team[0].item = "oran-berry";
state.teamHP[0] = Math.floor(state.team[0].stats.hp / 3); // Under 50% HP
state.executeTurn("use-move", 0, 0, "do-nothing", 0);

const oranLog = state.battleLog.at(-1).notes.find(n => n.includes("Oran Berry"));
if (!oranLog) {
  throw new Error("Oran Berry not consumed or resolved.");
}
if (state.team[0].item !== "oran-berry") {
  throw new Error("Oran Berry should remain selected in Team Builder after battle consumption.");
}
if (!state.consumedItems.player[0]) {
  throw new Error("Oran Berry was not marked consumed in battle state.");
}
console.log(`Verified Oran Berry consumption: ${oranLog}`);

// Setup Type Gem
state.resetBattle();
state.startBattle();
state.team[0].item = "normal-gem";
state.executeTurn("use-move", 0, 0, "do-nothing", 0);
const gemLog = state.battleLog.at(-1).notes.find(n => n.includes("Normal Gem"));
if (!gemLog) {
  throw new Error("Normal Gem consumption was not logged.");
}
if (state.team[0].item !== "normal-gem") {
  throw new Error("Normal Gem should remain selected in Team Builder after battle consumption.");
}
if (!state.consumedItems.player[0]) {
  throw new Error("Normal Gem was not marked consumed in battle state.");
}
console.log(`Verified Normal Gem battle-only consumption: ${gemLog}`);

// Setup Focus Sash
state.resetBattle();
state.startBattle();
state.team[0].item = "focus-sash";
// Mewtwo attacks back and does massive damage
state.executeTurn("use-move", 0, 0, "use-move", 0);

const sashLog = state.battleLog.at(-1).notes.find(n => n.includes("Focus Sash"));
if (!sashLog) {
  throw new Error("Focus Sash was not triggered.");
}
if (state.teamHP[0] !== 1) {
  throw new Error(`Focus Sash did not preserve HP to 1, got ${state.teamHP[0]}`);
}
if (state.team[0].item !== "focus-sash") {
  throw new Error("Focus Sash should remain selected in Team Builder after battle consumption.");
}
if (!state.consumedItems.player[0]) {
  throw new Error("Focus Sash was not marked consumed in battle state.");
}
console.log(`Verified Focus Sash preservation: ${sashLog}`);

// 4. Validate Manual Boss Overrides
state.resetBattle();
state.manualBossOverride = true;
state.manualBossName = "custom-mewtwo";
state.manualBossHP = 9999;
state.manualBossMaxHP = 9999;
state.manualBossCurrentTypes = ["dragon", "fire"];
state.manualBossBaseStats = { hp: 9999, atk: 100, def: 800, spa: 100, spd: 900, spe: 100 };
state.manualBossFinalStats = { atk: 100, def: 800, spa: 100, spd: 900, spe: 100 };
state.manualBossStages = emptyStages();

state.startBattle();
if (state.bossHP !== 9999 || state.bossMaxHP !== 9999) {
  throw new Error(`Boss override HP did not persist on startBattle, got ${state.bossHP}`);
}
if (state.bossCurrentTypes.length !== 2 || state.bossCurrentTypes[0] !== "dragon") {
  throw new Error(`Boss override types did not persist on startBattle, got ${state.bossCurrentTypes}`);
}
if (state.bossStats.def !== 800) {
  throw new Error(`Boss override stats did not persist on startBattle, got ${state.bossStats.def}`);
}
console.log("Verified manual boss dossier overrides (HP, types, and stats) persist successfully through startBattle.");

console.log("All mechanics and overrides checks passed successfully!");
