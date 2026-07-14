import { BattleState } from "../js/core/battle-state.js";
import { calculateBossStats, calculatePokemonStats } from "../js/core/stats.js";

console.log("Running Sturdy and Z-Move Upgrade checks...");

// Helper mock pokemon
const shieldon = {
  name: "shieldon",
  types: [{ type: { name: "rock" } }, { type: { name: "steel" } }],
  abilities: [{ ability: { name: "Sturdy" } }], // Test mixed case name normalization
  moves: [{ name: "tackle", power: 40, type: { name: "normal" }, damage_class: { name: "physical" } }],
  stats: [
    { base_stat: 30, stat: { name: "hp" } },
    { base_stat: 42, stat: { name: "attack" } },
    { base_stat: 118, stat: { name: "defense" } },
    { base_stat: 42, stat: { name: "special-attack" } },
    { base_stat: 88, stat: { name: "special-defense" } },
    { base_stat: 30, stat: { name: "speed" } },
  ]
};

const smeargle = {
  name: "smeargle",
  types: [{ type: { name: "normal" } }],
  abilities: [{ ability: { name: "own-tempo" } }],
  moves: [{ name: "belly-drum", power: null, type: { name: "normal" }, damage_class: { name: "status" } }],
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

// ----------------------------------------------------
// Test 1: Sturdy & Focus Sash Logic
// ----------------------------------------------------
async function testSturdyAndSash() {
  const state = new BattleState();
  state.team[0].pokemon = shieldon;
  state.team[0].level = 100;
  state.team[0].item = "";
  state.team[0].ability = "Sturdy "; // Test trailing space and capitalization normalization
  state.team[0].moves = [{ name: "tackle", power: 40, type: { name: "normal" }, damage_class: { name: "physical" } }];
  state.team[0].stats = calculatePokemonStats(shieldon, state.team[0]);

  const bossStats = calculateBossStats(mewtwo);
  state.setBoss(mewtwo, bossStats);
  state.bossMoves[0] = { name: "close-combat", power: 120, type: { name: "fighting" }, damage_class: { name: "physical" } };

  state.startBattle();

  // Turn 1: Mewtwo attacks Shieldon. Sturdy should activate!
  await state.executeTurn("use-move", 0, 0, "use-move", 0);
  const log1 = state.battleLog[0];
  console.log("Sturdy T1 Log notes:", log1.notes);

  if (state.teamHP[0] !== 1) {
    throw new Error(`Shieldon should survive at 1 HP using Sturdy. Current HP: ${state.teamHP[0]}`);
  }
  if (!log1.notes.some(n => n.includes("Sturdy activated"))) {
    throw new Error("Log notes should mention Sturdy activation.");
  }

  // Turn 2: Mewtwo attacks Shieldon again. Since HP is not full, it faints.
  await state.executeTurn("use-move", 0, 0, "use-move", 0);
  const log2 = state.battleLog[1];
  console.log("Sturdy T2 Log notes:", log2.notes);

  if (state.teamHP[0] !== 0) {
    throw new Error("Shieldon should fainted on T2.");
  }
  if (!log2.notes.some(n => n.includes("fainted"))) {
    throw new Error("Log notes should mention Shieldon fainted.");
  }
  console.log("Sturdy survival checks PASSED.");

  // Test 1b: Sturdy + Focus Sash interaction (Sturdy takes priority, sash is not consumed)
  const state2 = new BattleState();
  state2.team[0].pokemon = shieldon;
  state2.team[0].level = 100;
  state2.team[0].item = "focus-sash";
  state2.team[0].ability = "sturdy";
  state2.team[0].moves = [{ name: "tackle", power: 40, type: { name: "normal" }, damage_class: { name: "physical" } }];
  state2.team[0].stats = calculatePokemonStats(shieldon, state2.team[0]);
  state2.setBoss(mewtwo, bossStats);
  state2.bossMoves[0] = { name: "close-combat", power: 120, type: { name: "fighting" }, damage_class: { name: "physical" } };
  state2.startBattle();

  await state2.executeTurn("use-move", 0, 0, "use-move", 0);
  const log3 = state2.battleLog[0];
  console.log("Sturdy+Sash T1 Log notes:", log3.notes);

  if (state2.teamHP[0] !== 1) {
    throw new Error("Shieldon should survive on Sturdy.");
  }
  if (state2.team[0].item !== "focus-sash") {
    throw new Error("Focus Sash should NOT be consumed because Sturdy activated first.");
  }
  console.log("Sturdy + Sash interaction checks PASSED.");
}

// ----------------------------------------------------
// Test 2: Z-Belly Drum Test
// ----------------------------------------------------
async function testZBellyDrum() {
  const state = new BattleState();
  state.team[0].pokemon = smeargle;
  state.team[0].level = 100;
  state.team[0].item = "normalium-z";
  state.team[0].ability = "own-tempo";
  state.team[0].moves = [{ name: "belly-drum", power: null, type: { name: "normal" }, damage_class: { name: "status" } }];
  state.team[0].stats = calculatePokemonStats(smeargle, state.team[0]);

  const bossStats = calculateBossStats(mewtwo);
  state.setBoss(mewtwo, bossStats);
  // Boss does nothing
  state.bossMoves[0] = null;

  state.startBattle();

  // Set Smeargle's HP to 1 before turn execution
  state.teamHP[0] = 1;
  const maxHP = state.team[0].stats.hp;

  // Execute Z-Belly Drum
  await state.executeTurn("use-z-move", 0, 0, "do-nothing", 0);
  const log1 = state.battleLog[0];
  console.log("Z-Belly Drum Log notes:", log1.notes);

  const expectedHP = maxHP - Math.floor(maxHP / 2);
  if (state.teamHP[0] !== expectedHP) {
    throw new Error(`Z-Belly Drum failed to heal then cut HP. Got: ${state.teamHP[0]}, Expected: ${expectedHP}`);
  }

  if (state.teamStages[0].atk !== 6) {
    throw new Error(`Attack stage should be maximized (+6). Got: ${state.teamStages[0].atk}`);
  }

  if (state.zMoveUsed.player[0] !== true) {
    throw new Error("Z-Move should be marked as used.");
  }
  if (state.team[0].item !== "normalium-z") {
    throw new Error("Normalium Z should remain selected in Team Builder after Z-Move use.");
  }

  console.log("Z-Belly Drum mechanics checks PASSED.");
}

async function runAll() {
  await testSturdyAndSash();
  await testZBellyDrum();
  console.log("All sturdy-zmove checks completed successfully!");
}

runAll().catch(e => {
  console.error("Test execution failed:", e);
  process.exit(1);
});
