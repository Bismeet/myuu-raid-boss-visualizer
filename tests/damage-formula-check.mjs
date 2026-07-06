import { BattleState } from "../js/core/battle-state.js";
import { calculatePokemonStats } from "../js/core/stats.js";

console.log("Running Damage Formula and Roll Settings checks...");

// Mocks
const basculegion = {
  name: "basculegion-male",
  types: [{ type: { name: "water" } }, { type: { name: "ghost" } }],
  abilities: [{ ability: { name: "adaptability" } }],
  moves: [{ name: "last-respects", power: 50, type: { name: "ghost" }, damage_class: { name: "physical" } }],
  stats: [
    { base_stat: 120, stat: { name: "hp" } },
    { base_stat: 112, stat: { name: "attack" } },
    { base_stat: 65, stat: { name: "defense" } },
    { base_stat: 80, stat: { name: "special-attack" } },
    { base_stat: 75, stat: { name: "special-defense" } },
    { base_stat: 78, stat: { name: "speed" } },
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

function setupState(rollMode = "random") {
  const state = new BattleState();
  state.damageRollMode = rollMode;
  state.team[0].pokemon = basculegion;
  state.team[0].level = 100;
  state.team[0].item = "";
  state.team[0].ability = "adaptability";
  state.team[0].moves = [{ name: "last-respects", power: 50, type: { name: "ghost" }, damage_class: { name: "physical" } }];
  state.team[0].stats = calculatePokemonStats(basculegion, state.team[0]);

  const bossStats = calculatePokemonStats(mewtwo, { level: 200, nature: "hardy", ivs: { hp: 31, atk: 31, def: 31, spa: 31, spd: 31, spe: 31 }, evs: { hp: 252, atk: 252, def: 252, spa: 252, spd: 252, spe: 252 } });
  bossStats.hp = 1060000;
  state.setBoss(mewtwo, bossStats);
  state.bossMoves[0] = null; // Do nothing
  state.startBattle();

  return state;
}

// 1. Roll Modes verification
async function testRollModes() {
  // Test Min Roll
  const stateMin = setupState("min");
  stateMin.executeTurn("use-move", 0, 0, "do-nothing", 0);
  const dmgMin = stateMin.battleLog[0].damageDetails.damage;
  const expectedMin = stateMin.battleLog[0].damageDetails.minDamage;
  if (dmgMin !== expectedMin) {
    throw new Error(`Min mode failed. Got: ${dmgMin}, Expected: ${expectedMin}`);
  }

  // Test Max Roll
  const stateMax = setupState("max");
  stateMax.executeTurn("use-move", 0, 0, "do-nothing", 0);
  const dmgMax1 = stateMax.battleLog[0].damageDetails.damage;
  const expectedMax = stateMax.battleLog[0].damageDetails.maxDamage;
  if (dmgMax1 !== expectedMax) {
    throw new Error(`Max mode failed. Got: ${dmgMax1}, Expected: ${expectedMax}`);
  }

  // Verify repeated Max Roll hits are identical
  stateMax.executeTurn("use-move", 0, 0, "do-nothing", 0);
  const dmgMax2 = stateMax.battleLog[1].damageDetails.damage;
  if (dmgMax1 !== dmgMax2) {
    throw new Error(`Max mode should be identical. Got: ${dmgMax1} and ${dmgMax2}`);
  }

  // Test Average Roll
  const stateAvg = setupState("average");
  stateAvg.executeTurn("use-move", 0, 0, "do-nothing", 0);
  const dmgAvg = stateAvg.battleLog[0].damageDetails.damage;
  const rolls = stateAvg.battleLog[0].damageDetails.minDamage; // let's verify range
  if (dmgAvg <= expectedMin || dmgAvg >= expectedMax) {
    throw new Error(`Average damage should be strictly between min and max. Got: ${dmgAvg}, Min: ${expectedMin}, Max: ${expectedMax}`);
  }

  // Test Random Roll mode varies (most of the time)
  const stateRand = setupState("random");
  const randDmg = [];
  for (let i = 0; i < 6; i++) {
    stateRand.executeTurn("use-move", 0, 0, "do-nothing", 0);
    randDmg.push(stateRand.battleLog[i].damageDetails.damage);
  }
  const uniqueCount = new Set(randDmg).size;
  console.log("Random damages across 6 turns:", randDmg, "Unique count:", uniqueCount);
  if (uniqueCount <= 1) {
    throw new Error("Random rolls did not produce unique values across 6 attacks.");
  }

  console.log("Damage roll modes verification PASSED.");
}

// 2. STAB Adaptability 2.0x vs 1.5x
async function testSTAB() {
  const stateNormalSTAB = setupState("max");
  stateNormalSTAB.team[0].ability = "none"; // disable Adaptability
  stateNormalSTAB.executeTurn("use-move", 0, 0, "do-nothing", 0);
  const normalSTABDmg = stateNormalSTAB.battleLog[0].damageDetails.damage;

  const stateAdaptability = setupState("max");
  stateAdaptability.executeTurn("use-move", 0, 0, "do-nothing", 0);
  const adaptDmg = stateAdaptability.battleLog[0].damageDetails.damage;

  const ratio = adaptDmg / normalSTABDmg;
  console.log(`STAB Damage: Normal: ${normalSTABDmg}, Adaptability: ${adaptDmg}, Ratio: ${ratio.toFixed(2)}`);
  if (Math.abs(ratio - 1.33) > 0.05) { // 2.0 / 1.5 = 1.333
    throw new Error(`Adaptability STAB should be 2.0x compared to 1.5x (ratio should be ~1.33). Got: ${ratio}`);
  }

  console.log("STAB and Adaptability verification PASSED.");
}

// 3. Custom power (Last Respects BP)
async function testCustomPower() {
  const state = setupState("max");
  state.team[0].moves[0].customPower = 300; // override original 50 BP
  state.executeTurn("use-move", 0, 0, "do-nothing", 0);
  
  const details = state.battleLog[0].playerDamageDetails;
  console.log("Custom power details:", details);
  if (!details || details.usedPower !== 300) {
    throw new Error("Custom power not logged correctly in damage details.");
  }

  console.log("Custom power verification PASSED.");
}

async function runAll() {
  await testRollModes();
  await testSTAB();
  await testCustomPower();
  console.log("All damage formula audit checks completed successfully!");
}

runAll().catch(e => {
  console.error("Test execution failed:", e);
  process.exit(1);
});
