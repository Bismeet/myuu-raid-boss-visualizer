import { NATURES, natureModifier, natureDropdownLabel } from "../js/data/natures.js";
import { calculatePokemonStats, calculateBossStats, calculateStat } from "../js/core/stats.js";
import { damageRolls } from "../js/core/damage.js";

// 1. Validate Natures Data
const neutralNatures = ["hardy", "docile", "serious", "bashful", "quirky"];
for (const key of neutralNatures) {
  const nature = NATURES[key];
  if (!nature) throw new Error(`Neutral nature ${key} is missing.`);
  if (nature.increased !== null || nature.decreased !== null) {
    throw new Error(`Neutral nature ${key} should have null increased/decreased stats.`);
  }
  for (const stat of ["atk", "def", "spa", "spd", "spe"]) {
    if (nature.modifiers[stat] !== 1.0) {
      throw new Error(`Neutral nature ${key} should have all modifiers as 1.0.`);
    }
  }
}

// Check some specific active natures
const adamant = NATURES.adamant;
if (!adamant || adamant.increased !== "atk" || adamant.decreased !== "spa" || adamant.modifiers.atk !== 1.1 || adamant.modifiers.spa !== 0.9) {
  throw new Error("Adamant nature configuration is incorrect.");
}

const modest = NATURES.modest;
if (!modest || modest.increased !== "spa" || modest.decreased !== "atk" || modest.modifiers.spa !== 1.1 || modest.modifiers.atk !== 0.9) {
  throw new Error("Modest nature configuration is incorrect.");
}

const jolly = NATURES.jolly;
if (!jolly || jolly.increased !== "spe" || jolly.decreased !== "spa" || jolly.modifiers.spe !== 1.1 || jolly.modifiers.spa !== 0.9) {
  throw new Error("Jolly nature configuration is incorrect.");
}

// 2. Validate Dropdown Labels
if (natureDropdownLabel("adamant") !== "Adamant (+Atk, -SpA)") {
  throw new Error(`Dropdown label for Adamant failed: ${natureDropdownLabel("adamant")}`);
}
if (natureDropdownLabel("Hardy") !== "Hardy (Neutral)") {
  throw new Error(`Dropdown label for Hardy failed: ${natureDropdownLabel("Hardy")}`);
}
if (natureDropdownLabel("invalid-nature") !== "Hardy (Neutral)") {
  throw new Error(`Dropdown label for invalid nature should fallback to Hardy: ${natureDropdownLabel("invalid-nature")}`);
}

// 3. Validate Fallback Safety of natureModifier
if (natureModifier("invalid-nature", "atk") !== 1.0) {
  throw new Error("natureModifier should fallback to 1.0 for invalid nature.");
}
if (natureModifier("Adamant", "atk") !== 1.1) {
  throw new Error("natureModifier should handle uppercase/mixed-case names.");
}

// 4. Validate Stat Formulas on Smeargle
const smeargle = {
  name: "smeargle",
  stats: [
    { base_stat: 55, stat: { name: "hp" } },
    { base_stat: 20, stat: { name: "attack" } },
    { base_stat: 35, stat: { name: "defense" } },
    { base_stat: 20, stat: { name: "special-attack" } },
    { base_stat: 45, stat: { name: "special-defense" } },
    { base_stat: 75, stat: { name: "speed" } },
  ]
};

const buildHardy = {
  level: 100,
  nature: "hardy",
  ivs: { hp: 31, atk: 31, def: 31, spa: 31, spd: 31, spe: 31 },
  evs: { hp: 252, atk: 252, def: 0, spa: 0, spd: 0, spe: 0 },
};

const statsHardy = calculatePokemonStats(smeargle, buildHardy);
if (statsHardy.hp !== 314) throw new Error(`Hardy HP should be 314, got ${statsHardy.hp}`);
if (statsHardy.atk !== 139) throw new Error(`Hardy Atk should be 139, got ${statsHardy.atk}`);
if (statsHardy.spa !== 76) throw new Error(`Hardy SpA should be 76, got ${statsHardy.spa}`);

const buildAdamant = { ...buildHardy, nature: "adamant" };
const statsAdamant = calculatePokemonStats(smeargle, buildAdamant);
if (statsAdamant.hp !== 314) throw new Error(`Adamant HP should be 314 (not modified), got ${statsAdamant.hp}`);
if (statsAdamant.atk !== 152) throw new Error(`Adamant Atk should be 152 (+10%), got ${statsAdamant.atk}`);
if (statsAdamant.spa !== 68) throw new Error(`Adamant SpA should be 68 (-10%), got ${statsAdamant.spa}`);

const buildModest = { ...buildHardy, nature: "modest" };
const statsModest = calculatePokemonStats(smeargle, buildModest);
if (statsModest.atk !== 125) throw new Error(`Modest Atk should be 125 (-10%), got ${statsModest.atk}`);
if (statsModest.spa !== 83) throw new Error(`Modest SpA should be 83 (+10%), got ${statsModest.spa}`);

const buildJolly = { ...buildHardy, nature: "jolly" };
const statsJolly = calculatePokemonStats(smeargle, buildJolly);
if (statsJolly.spe !== 204) throw new Error(`Jolly Spe should be 204 (+10%), got ${statsJolly.spe}`);
if (statsJolly.spa !== 68) throw new Error(`Jolly SpA should be 68 (-10%), got ${statsJolly.spa}`);

// 5. Boss rules
const bossMew = {
  name: "mew",
  stats: [
    { base_stat: 100, stat: { name: "hp" } },
    { base_stat: 100, stat: { name: "attack" } },
    { base_stat: 100, stat: { name: "defense" } },
    { base_stat: 100, stat: { name: "special-attack" } },
    { base_stat: 100, stat: { name: "special-defense" } },
    { base_stat: 100, stat: { name: "speed" } },
  ]
};
const bossStats = calculateBossStats(bossMew);
if (bossStats.def !== 236) {
  throw new Error(`Public boss Defense should be 236, got ${bossStats.def}`);
}
if (bossStats.atk !== 236) {
  throw new Error(`Public boss Attack should be 236, got ${bossStats.atk}`);
}

// 6. Damage Integration (Smeargle Adamant vs Modest)
const movePhysical = { name: "extreme-speed", power: 80, type: { name: "normal" }, damage_class: { name: "physical" } };
const moveSpecial = { name: "swift", power: 60, type: { name: "normal" }, damage_class: { name: "special" } };
const bossDummy = { stats: { hp: 10000, atk: 100, def: 200, spa: 100, spd: 200, spe: 100 }, maxHp: 10000 };
const stagesEmpty = { atk: 0, def: 0, spa: 0, spd: 0, spe: 0, accuracy: 0, evasion: 0, crit: 0 };

const rollsPhysAdamant = damageRolls({
  attacker: { stats: statsAdamant, level: 100, item: "" },
  boss: bossDummy,
  move: movePhysical,
  attackerTypes: ["normal"],
  bossTypes: ["normal"],
  ability: "own-tempo",
  stages: stagesEmpty,
  bossStages: stagesEmpty,
});

const rollsPhysModest = damageRolls({
  attacker: { stats: statsModest, level: 100, item: "" },
  boss: bossDummy,
  move: movePhysical,
  attackerTypes: ["normal"],
  bossTypes: ["normal"],
  ability: "own-tempo",
  stages: stagesEmpty,
  bossStages: stagesEmpty,
});

const rollsSpecAdamant = damageRolls({
  attacker: { stats: statsAdamant, level: 100, item: "" },
  boss: bossDummy,
  move: moveSpecial,
  attackerTypes: ["normal"],
  bossTypes: ["normal"],
  ability: "own-tempo",
  stages: stagesEmpty,
  bossStages: stagesEmpty,
});

const rollsSpecModest = damageRolls({
  attacker: { stats: statsModest, level: 100, item: "" },
  boss: bossDummy,
  move: moveSpecial,
  attackerTypes: ["normal"],
  bossTypes: ["normal"],
  ability: "own-tempo",
  stages: stagesEmpty,
  bossStages: stagesEmpty,
});

console.log("Physical damage (Adamant):", rollsPhysAdamant.min, "-", rollsPhysAdamant.max);
console.log("Physical damage (Modest):", rollsPhysModest.min, "-", rollsPhysModest.max);
console.log("Special damage (Adamant):", rollsSpecAdamant.min, "-", rollsSpecAdamant.max);
console.log("Special damage (Modest):", rollsSpecModest.min, "-", rollsSpecModest.max);

if (rollsPhysAdamant.max <= rollsPhysModest.max) {
  throw new Error("Physical damage under Adamant must be higher than under Modest.");
}
if (rollsSpecModest.max <= rollsSpecAdamant.max) {
  throw new Error("Special damage under Modest must be higher than under Adamant.");
}

console.log("All Pokémon nature checks passed successfully!");
