import { damageRolls } from "../js/core/damage.js";
import { typeEffectiveness } from "../js/data/type-chart.js";
import { resolveQuickCalcBossTypes } from "../js/ui/quick-calc.js";

const expectTypes = (actual, expected, label) => {
  if (actual.join(",") !== expected.join(",")) {
    throw new Error(`${label}: expected ${expected.join(" / ")}, got ${actual.join(" / ")}`);
  }
};

const tingLuTypes = resolveQuickCalcBossTypes({
  bossTypes: ["dark", "ground"],
  forestsCurse: true,
});
expectTypes(tingLuTypes, ["dark", "ground", "grass"], "Forest's Curse must append Grass");
if (typeEffectiveness("bug", tingLuTypes) !== 4) {
  throw new Error("Bug against Forest's Curse Ting-Lu must be 4x effective.");
}

const damage = damageRolls({
  attacker: { level: 100, stats: { atk: 300, spa: 100 }, item: "" },
  boss: { stats: { def: 300, spd: 300 }, maxHp: 1000 },
  move: { name: "pin-missile", power: 25, type: { name: "bug" }, damage_class: { name: "physical" } },
  attackerTypes: [],
  bossTypes: tingLuTypes,
  stages: { atk: 0, spa: 0, crit: 0 },
  bossStages: { def: 0, spd: 0 },
});
if (damage.effectiveness !== 4) {
  throw new Error(`Damage calculation must receive the 4x effectiveness, got ${damage.effectiveness}x.`);
}

for (const label of ["Cobalion", "Meltan"]) {
  const types = resolveQuickCalcBossTypes({
    bossTypes: label === "Cobalion" ? ["steel", "fighting"] : ["steel"],
    magicPowder: true,
    trickOrTreat: true,
  });
  expectTypes(types, ["psychic", "ghost"], `${label} type-change chain`);
  if (typeEffectiveness("ghost", types) !== 4) {
    throw new Error(`Ghost against Magic Powder + Trick-or-Treat ${label} must be 4x effective.`);
  }
}

const manualTypes = resolveQuickCalcBossTypes({
  manualTypesEnabled: true,
  manualType1: "dark",
  manualType2: "ground",
  forestsCurse: true,
});
expectTypes(manualTypes, ["dark", "ground"], "Manual boss types must override move-driven type changes");

console.log("Quick Calc type-effectiveness checks passed.");
