import { damageRolls } from "../js/core/damage.js";

const stages = { atk: 0, def: 0, spa: 0, spd: 0, spe: 0, accuracy: 0, evasion: 0, crit: 0 };

function assertSTAB(payload, expectedStab, label) {
  const result = damageRolls(payload);
  if (Math.abs(result.stab - expectedStab) > 0.001) {
    console.error(`FAIL: ${label}. Expected STAB ${expectedStab}, got ${result.stab}`);
    process.exit(1);
  } else {
    console.log(`PASS: ${label} (STAB: ${result.stab})`);
  }
}

console.log("Running Terastallize STAB validation...");

// Case 1: Non-terastallized (Standard STAB)
assertSTAB({
  attacker: { stats: { hp: 100, atk: 100, def: 100, spa: 100, spd: 100, spe: 100 }, level: 100 },
  boss: { stats: { hp: 1000, atk: 100, def: 100, spa: 100, spd: 100, spe: 100 }, maxHp: 1000 },
  move: { name: "shadow-claw", power: 70, type: { name: "ghost" }, damage_class: { name: "physical" } },
  attackerTypes: ["ghost"],
  bossTypes: ["normal"],
  ability: "pressure",
  stages,
  bossStages: stages
}, 1.5, "Standard STAB (matches original type)");

assertSTAB({
  attacker: { stats: { hp: 100, atk: 100, def: 100, spa: 100, spd: 100, spe: 100 }, level: 100 },
  boss: { stats: { hp: 1000, atk: 100, def: 100, spa: 100, spd: 100, spe: 100 }, maxHp: 1000 },
  move: { name: "shadow-claw", power: 70, type: { name: "ghost" }, damage_class: { name: "physical" } },
  attackerTypes: ["ghost"],
  bossTypes: ["normal"],
  ability: "adaptability",
  stages,
  bossStages: stages
}, 2.0, "Standard STAB with Adaptability");

// Case 2: Terastallized, matches original type and Tera type
assertSTAB({
  attacker: {
    stats: { hp: 100, atk: 100, def: 100, spa: 100, spd: 100, spe: 100 },
    level: 100,
    pokemon: { name: "gengar", types: [{ type: { name: "ghost" } }, { type: { name: "poison" } }] }
  },
  boss: { stats: { hp: 1000, atk: 100, def: 100, spa: 100, spd: 100, spe: 100 }, maxHp: 1000 },
  move: { name: "shadow-claw", power: 70, type: { name: "ghost" }, damage_class: { name: "physical" } },
  attackerTypes: ["ghost"],
  bossTypes: ["normal"],
  ability: "pressure",
  stages,
  bossStages: stages,
  isTerastallized: true,
  teraType: "ghost"
}, 2.0, "Tera STAB (matches original type and Tera type)");

assertSTAB({
  attacker: {
    stats: { hp: 100, atk: 100, def: 100, spa: 100, spd: 100, spe: 100 },
    level: 100,
    pokemon: { name: "gengar", types: [{ type: { name: "ghost" } }, { type: { name: "poison" } }] }
  },
  boss: { stats: { hp: 1000, atk: 100, def: 100, spa: 100, spd: 100, spe: 100 }, maxHp: 1000 },
  move: { name: "shadow-claw", power: 70, type: { name: "ghost" }, damage_class: { name: "physical" } },
  attackerTypes: ["ghost"],
  bossTypes: ["normal"],
  ability: "adaptability",
  stages,
  bossStages: stages,
  isTerastallized: true,
  teraType: "ghost"
}, 2.25, "Tera STAB with Adaptability (matches original and Tera)");

// Case 3: Terastallized, matches Tera type but not original type
assertSTAB({
  attacker: {
    stats: { hp: 100, atk: 100, def: 100, spa: 100, spd: 100, spe: 100 },
    level: 100,
    pokemon: { name: "inteleon", types: [{ type: { name: "water" } }] }
  },
  boss: { stats: { hp: 1000, atk: 100, def: 100, spa: 100, spd: 100, spe: 100 }, maxHp: 1000 },
  move: { name: "shadow-claw", power: 70, type: { name: "ghost" }, damage_class: { name: "physical" } },
  attackerTypes: ["ghost"],
  bossTypes: ["normal"],
  ability: "pressure",
  stages,
  bossStages: stages,
  isTerastallized: true,
  teraType: "ghost"
}, 1.5, "Tera STAB (matches Tera type but not original type)");

assertSTAB({
  attacker: {
    stats: { hp: 100, atk: 100, def: 100, spa: 100, spd: 100, spe: 100 },
    level: 100,
    pokemon: { name: "inteleon", types: [{ type: { name: "water" } }] }
  },
  boss: { stats: { hp: 1000, atk: 100, def: 100, spa: 100, spd: 100, spe: 100 }, maxHp: 1000 },
  move: { name: "shadow-claw", power: 70, type: { name: "ghost" }, damage_class: { name: "physical" } },
  attackerTypes: ["ghost"],
  bossTypes: ["normal"],
  ability: "adaptability",
  stages,
  bossStages: stages,
  isTerastallized: true,
  teraType: "ghost"
}, 2.0, "Tera STAB with Adaptability (matches Tera type but not original)");

// Case 4: Terastallized, matches original type but not Tera type
assertSTAB({
  attacker: {
    stats: { hp: 100, atk: 100, def: 100, spa: 100, spd: 100, spe: 100 },
    level: 100,
    pokemon: { name: "inteleon", types: [{ type: { name: "water" } }] }
  },
  boss: { stats: { hp: 1000, atk: 100, def: 100, spa: 100, spd: 100, spe: 100 }, maxHp: 1000 },
  move: { name: "surf", power: 90, type: { name: "water" }, damage_class: { name: "special" } },
  attackerTypes: ["ghost"],
  bossTypes: ["normal"],
  ability: "pressure",
  stages,
  bossStages: stages,
  isTerastallized: true,
  teraType: "ghost"
}, 1.5, "Tera STAB (matches original type but not Tera type)");

assertSTAB({
  attacker: {
    stats: { hp: 100, atk: 100, def: 100, spa: 100, spd: 100, spe: 100 },
    level: 100,
    pokemon: { name: "inteleon", types: [{ type: { name: "water" } }] }
  },
  boss: { stats: { hp: 1000, atk: 100, def: 100, spa: 100, spd: 100, spe: 100 }, maxHp: 1000 },
  move: { name: "surf", power: 90, type: { name: "water" }, damage_class: { name: "special" } },
  attackerTypes: ["ghost"],
  bossTypes: ["normal"],
  ability: "adaptability",
  stages,
  bossStages: stages,
  isTerastallized: true,
  teraType: "ghost"
}, 2.0, "Tera STAB with Adaptability (matches original type but not Tera)");

console.log("All Terastallize STAB checks PASSED successfully!");
