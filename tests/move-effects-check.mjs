import { BattleState, getEffectiveAbility } from "../js/core/battle-state.js";
import { calculatePokemonStats } from "../js/core/stats.js";
import { emptyStages } from "../js/core/stages.js";

console.log("Running move effects registry tests...");

const smeargle = {
  name: "smeargle",
  types: [{ type: { name: "normal" } }],
  abilities: [{ ability: { name: "own-tempo" } }],
  moves: [
    { move: { name: "speed-swap" } },
    { move: { name: "guard-split" } },
    { move: { name: "power-split" } },
    { move: { name: "swords-dance" } },
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
  abilities: [{ ability: { name: "pressure" } }],
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

// 1. Initialize BattleState
const state = new BattleState();
state.team[0].pokemon = smeargle;
state.team[0].level = 100;
state.team[0].item = "";
state.team[0].moves[0] = { name: "speed-swap", type: { name: "psychic" }, damage_class: { name: "status" } };
state.team[0].moves[1] = { name: "guard-split", type: { name: "psychic" }, damage_class: { name: "status" } };
state.team[0].moves[2] = { name: "power-split", type: { name: "psychic" }, damage_class: { name: "status" } };
state.team[0].moves[3] = { name: "swords-dance", type: { name: "normal" }, damage_class: { name: "status" } };
state.team[0].stats = calculatePokemonStats(smeargle, state.team[0]);

state.team[1].pokemon = smeargle;
state.team[1].level = 100;
state.team[1].item = "";
state.team[1].moves[0] = { name: "belly-drum", type: { name: "normal" }, damage_class: { name: "status" } };
state.team[1].moves[1] = { name: "baton-pass", type: { name: "normal" }, damage_class: { name: "status" } };
state.team[1].moves[2] = { name: "focus-energy", type: { name: "normal" }, damage_class: { name: "status" } };
state.team[1].moves[3] = { name: "unknown-status-move", type: { name: "normal" }, damage_class: { name: "status" } };
state.team[1].stats = calculatePokemonStats(smeargle, state.team[1]);

const bossStats = calculatePokemonStats(mewtwo, { level: 200, nature: "hardy", ivs: { hp: 31, atk: 31, def: 31, spa: 31, spd: 31, spe: 31 }, evs: { hp: 252, atk: 252, def: 252, spa: 252, spd: 252, spe: 252 } });
bossStats.hp = 1060000;
state.setBoss(mewtwo, bossStats);
state.bossMoves[0] = { name: "aerial-ace", power: 60, type: { name: "flying" }, damage_class: { name: "physical" } };

state.startBattle();

// Test A: Initial Speeds
const smeargleSpe = state.team[0].currentStats.spe; // e.g. 186
const bossSpe = state.bossCurrentStats.spe; // e.g. 587
console.log(`Initial Speeds -> Smeargle: ${smeargleSpe}, Boss: ${bossSpe}`);

if (smeargleSpe >= bossSpe) {
  throw new Error("Smeargle speed should be lower than Boss speed initially.");
}

// Test B: Speed Swap execution
// Smeargle (slot 0) uses Speed Swap on Boss
state.executeTurn("use-move", 0, 0, "do-nothing", 0);

const log1 = state.battleLog[0];
console.log("T1 Log notes:", log1.notes);

if (state.team[0].speedOverride !== bossSpe || state.bossSpeedOverride !== smeargleSpe) {
  throw new Error("Speed Swap overrides not set correctly.");
}

console.log(`After Speed Swap -> Smeargle: ${state.team[0].stats.spe}, Boss: ${state.bossStats.spe}`);
if (state.team[0].stats.spe !== bossSpe || state.bossStats.spe !== smeargleSpe) {
  throw new Error("Speed Swap failed to update stats fields.");
}

// Check turn order on next turn (Turn 2). Smeargle should move first now because of Speed Swap!
state.executeTurn("use-move", 3, 0, "do-nothing", 0); // Smeargle uses Swords Dance
const log2 = state.battleLog[1];
console.log(`T2: Player moved first? ${log2.playerMovedFirst}`);
if (!log2.playerMovedFirst) {
  throw new Error("Turn order was not affected by Speed Swap! Player should move first.");
}

// Test C: Guard Split compounding
const originalBossDef = state.bossOriginalStats.def; // e.g. 1009
const initialSmeargleDef = state.team[0].originalStats.def; // e.g. 106

// Execute Guard Split on Turn 3
state.executeTurn("use-move", 1, 0, "do-nothing", 0);
const expectedDef1 = Math.floor((initialSmeargleDef + originalBossDef) / 2);
console.log(`Guard Split 1 Defenses -> Target: ${state.bossCurrentStats.def}, Expected: ${expectedDef1}`);
if (state.bossCurrentStats.def !== expectedDef1) {
  throw new Error(`Guard Split defense mismatch: got ${state.bossCurrentStats.def}, expected ${expectedDef1}`);
}

// Now let's switch to Smeargle 2 (slot 1) to execute a second Guard Split and verify compounding!
state.executeTurn("switch", 0, 1, "do-nothing", 0);
const smeargle2Def = state.team[1].originalStats.def; // e.g. 106

// Execute Guard Split 2 on Turn 5
state.executeTurn("use-move", 0, 0, "do-nothing", 0); // Smeargle 2 uses Belly Drum
state.executeTurn("baton-pass", 1, 0, "do-nothing", 0); // Switch slot 0 back to Smeargle 1 (which resets stat splits!)
state.executeTurn("use-move", 1, 0, "do-nothing", 0); // Smeargle 1 uses Guard Split again

const expectedDef2 = Math.floor((initialSmeargleDef + expectedDef1) / 2);
console.log(`Guard Split 2 Defenses -> Target: ${state.bossCurrentStats.def}, Expected: ${expectedDef2}`);
if (state.bossCurrentStats.def !== expectedDef2) {
  throw new Error(`Compounding Guard Split defense mismatch: got ${state.bossCurrentStats.def}, expected ${expectedDef2}`);
}

// Test D: Power Split compounding
const originalBossAtk = state.bossOriginalStats.atk; // e.g. 507
const smeargleAtk = state.team[0].originalStats.atk; // e.g. 76

state.executeTurn("use-move", 2, 0, "do-nothing", 0); // Smeargle uses Power Split
const expectedAtk1 = Math.floor((smeargleAtk + originalBossAtk) / 2);
console.log(`Power Split 1 Attacks -> Target: ${state.bossCurrentStats.atk}, Expected: ${expectedAtk1}`);
if (state.bossCurrentStats.atk !== expectedAtk1) {
  throw new Error(`Power Split attack mismatch: got ${state.bossCurrentStats.atk}, expected ${expectedAtk1}`);
}

// Test E: Belly Drum and Baton Pass
// Switch to slot 1
state.executeTurn("switch", 0, 1, "do-nothing", 0);
// Belly Drum
const hpBeforeDrum = state.teamHP[1];
state.executeTurn("use-move", 0, 0, "do-nothing", 0);
console.log(`Belly Drum HP check -> Before: ${hpBeforeDrum}, After: ${state.teamHP[1]}`);
if (state.teamStages[1].atk !== 6) {
  throw new Error("Belly Drum failed to maximize Attack stage.");
}

// Baton Pass to slot 0
state.executeTurn("baton-pass", 1, 0, "do-nothing", 0);
console.log(`Baton Pass stage transfer -> Slot 0 Atk stage: ${state.teamStages[0].atk}`);
if (state.teamStages[0].atk !== 6) {
  throw new Error("Baton Pass failed to transfer stages.");
}

// Test F: Unsupported move logging
state.executeTurn("switch", 0, 1, "do-nothing", 0); // back to slot 1
state.executeTurn("use-move", 3, 0, "do-nothing", 0); // uses unknown-status-move
const lastLog = state.battleLog.at(-1);
console.log("Unsupported move log notes:", lastLog.notes);
if (!lastLog.notes.some(n => n.includes("Effect not implemented yet"))) {
  throw new Error("Unsupported move did not log its placeholder message.");
}

// Test G: Screech stages and damage check
// Switch back to slot 0
state.executeTurn("switch", 0, 0, "do-nothing", 0);

// Replace slot 0's move index 3 (Swords Dance) with Screech
state.team[0].moves[3] = { name: "screech", type: { name: "normal" }, damage_class: { name: "status" } };

// Reset boss stages to 0
state.bossStages.def = 0;

// Give Smeargle a physical move to measure damage before and after Screech
state.team[0].moves[0] = { name: "tackle", power: 40, type: { name: "normal" }, damage_class: { name: "physical" } };

// Measure baseline damage in max roll mode
state.damageRollMode = "max";
state.executeTurn("use-move", 0, 0, "do-nothing", 0);
const baseDmg = state.battleLog.at(-1).damageDetails.damage;

// Use Screech 1st time
state.executeTurn("use-move", 3, 0, "do-nothing", 0);
if (state.bossStages.def !== -2) {
  throw new Error(`Screech 1 should lower Def to -2. Got: ${state.bossStages.def}`);
}
if (state.battleLog.at(-1).notes.some(n => n.includes("Effect not implemented yet"))) {
  throw new Error("Screech log showed unimplemented message!");
}

// Use Screech 2nd time
state.executeTurn("use-move", 3, 0, "do-nothing", 0);
if (state.bossStages.def !== -4) {
  throw new Error(`Screech 2 should lower Def to -4. Got: ${state.bossStages.def}`);
}

// Use Screech 3rd time
state.executeTurn("use-move", 3, 0, "do-nothing", 0);
if (state.bossStages.def !== -6) {
  throw new Error(`Screech 3 should lower Def to -6. Got: ${state.bossStages.def}`);
}

// Use Screech 4th time (should cap at -6)
state.executeTurn("use-move", 3, 0, "do-nothing", 0);
if (state.bossStages.def !== -6) {
  throw new Error(`Screech 4 should stay at -6. Got: ${state.bossStages.def}`);
}

// Measure physical damage after Screech
state.executeTurn("use-move", 0, 0, "do-nothing", 0);
const postScreechDmg = state.battleLog.at(-1).damageDetails.damage;

console.log(`Physical Damage -> Before Screech: ${baseDmg}, After Screech: ${postScreechDmg}`);
if (postScreechDmg <= baseDmg) {
  throw new Error(`Physical damage should increase after Screech. Before: ${baseDmg}, After: ${postScreechDmg}`);
}

// Test H: Simple Beam and Simple ability stage changes
function buildSimpleState() {
  const simpleState = new BattleState();
  simpleState.team[0].pokemon = smeargle;
  simpleState.team[0].level = 100;
  simpleState.team[0].item = "";
  simpleState.team[0].ability = "own-tempo";
  simpleState.team[0].moves[0] = { name: "simple-beam", type: { name: "normal" }, damage_class: { name: "status" } };
  simpleState.team[0].moves[1] = { name: "screech", type: { name: "normal" }, damage_class: { name: "status" } };
  simpleState.team[0].moves[2] = { name: "swords-dance", type: { name: "normal" }, damage_class: { name: "status" } };
  simpleState.team[0].moves[3] = { name: "speed-swap", type: { name: "psychic" }, damage_class: { name: "status" } };
  simpleState.team[0].stats = calculatePokemonStats(smeargle, simpleState.team[0]);

  const simpleBossStats = calculatePokemonStats(mewtwo, { level: 200, nature: "hardy", ivs: { hp: 31, atk: 31, def: 31, spa: 31, spd: 31, spe: 31 }, evs: { hp: 252, atk: 252, def: 252, spa: 252, spd: 252, spe: 252 } });
  simpleBossStats.hp = 1060000;
  simpleState.setBoss(mewtwo, simpleBossStats);
  simpleState.bossMoves[0] = { name: "simple-beam", type: { name: "normal" }, damage_class: { name: "status" } };
  simpleState.startBattle();
  return simpleState;
}

const simpleState = buildSimpleState();
simpleState.executeTurn("use-move", 0, 0, "do-nothing", 0);
if (simpleState.abilityOverrides.boss !== "simple") {
  throw new Error("Simple Beam did not set boss ability override to Simple.");
}
if (getEffectiveAbility({ isBoss: true }, simpleState) !== "simple") {
  throw new Error("Boss effective ability should be Simple after Simple Beam.");
}

simpleState.executeTurn("use-move", 1, 0, "do-nothing", 0);
if (simpleState.bossStages.def !== -4) {
  throw new Error(`Screech on a Simple boss should lower Defense by 4. Got: ${simpleState.bossStages.def}`);
}

simpleState.bossStages.def = -4;
simpleState.executeTurn("use-move", 1, 0, "do-nothing", 0);
if (simpleState.bossStages.def !== -6) {
  throw new Error(`Simple stage drops should still cap at -6. Got: ${simpleState.bossStages.def}`);
}

simpleState.startNewBattleFromCurrentSetup();
if (simpleState.abilityOverrides.boss !== null || simpleState.abilityOverrides.player.some(Boolean)) {
  throw new Error("New Battle did not reset ability overrides.");
}

const simpleUserState = buildSimpleState();
simpleUserState.executeTurn("do-nothing", 0, 0, "use-move", 0);
if (getEffectiveAbility({ slotIndex: 0, isBoss: false }, simpleUserState) !== "simple") {
  throw new Error("Boss Simple Beam did not make the active player's effective ability Simple.");
}
simpleUserState.executeTurn("use-move", 2, 0, "do-nothing", 0);
if (simpleUserState.teamStages[0].atk !== 4) {
  throw new Error(`Swords Dance by a Simple user should raise Attack by 4. Got: ${simpleUserState.teamStages[0].atk}`);
}
simpleUserState.executeTurn("use-move", 2, 0, "do-nothing", 0);
if (simpleUserState.teamStages[0].atk !== 6) {
  throw new Error(`Simple stage raises should still cap at +6. Got: ${simpleUserState.teamStages[0].atk}`);
}

const splitState = buildSimpleState();
splitState.abilityOverrides.boss = "simple";
splitState.team[0].moves[0] = { name: "guard-split", type: { name: "psychic" }, damage_class: { name: "status" } };
splitState.team[0].moves[1] = { name: "power-split", type: { name: "psychic" }, damage_class: { name: "status" } };
const splitUserDef = splitState.team[0].currentStats.def;
const splitBossDef = splitState.bossCurrentStats.def;
splitState.executeTurn("use-move", 0, 0, "do-nothing", 0);
const expectedSimpleGuardDef = Math.floor((splitUserDef + splitBossDef) / 2);
if (splitState.bossCurrentStats.def !== expectedSimpleGuardDef) {
  throw new Error("Guard Split should average stats normally even when the boss has Simple.");
}
const splitUserAtk = splitState.team[0].currentStats.atk;
const splitBossAtk = splitState.bossCurrentStats.atk;
splitState.executeTurn("use-move", 1, 0, "do-nothing", 0);
const expectedSimplePowerAtk = Math.floor((splitUserAtk + splitBossAtk) / 2);
if (splitState.bossCurrentStats.atk !== expectedSimplePowerAtk) {
  throw new Error("Power Split should average stats normally even when the boss has Simple.");
}

const speedSwapState = buildSimpleState();
speedSwapState.abilityOverrides.boss = "simple";
const speedSwapUserSpe = speedSwapState.team[0].currentStats.spe;
const speedSwapBossSpe = speedSwapState.bossCurrentStats.spe;
speedSwapState.executeTurn("use-move", 3, 0, "do-nothing", 0);
if (speedSwapState.playerSpeedOverrides[0] !== speedSwapBossSpe || speedSwapState.bossSpeedOverride !== speedSwapUserSpe) {
  throw new Error("Speed Swap should swap raw effective speeds normally when Simple is present.");
}

console.log("All move effects checks passed successfully!");
