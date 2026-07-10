import { damageRolls } from "../js/core/damage.js";
import { applyStage } from "../js/core/stages.js";
import { QUICK_CALC_PRESETS } from "../js/ui/quick-calc.js";

if (QUICK_CALC_PRESETS.heracross.attacker !== "heracross-mega") {
  throw new Error("The Mega Heracross Quick Calc preset must load heracross-mega.");
}
if (QUICK_CALC_PRESETS.heracross.move !== "pin-missile" || QUICK_CALC_PRESETS.heracross.ability !== "skill-link" || QUICK_CALC_PRESETS.heracross.hitCount !== 5) {
  throw new Error("The Mega Heracross preset must use Skill Link and five Pin Missile hits.");
}

if (applyStage(300, -4) !== 100) {
  throw new Error("A -4 Defense stage must reduce a 300 Defense stat to 100.");
}

const payload = {
  attacker: { level: 100, stats: { atk: 1000, spa: 100 }, item: "" },
  boss: { stats: { def: 300, spd: 300 }, maxHp: 1000 },
  move: { name: "pin-missile", power: 25, type: { name: "bug" }, damage_class: { name: "physical" } },
  attackerTypes: [],
  bossTypes: ["dark", "ground", "grass"],
  ability: "skill-link",
  stages: { atk: 6, spa: 0, crit: 0 },
  bossStages: { def: 0, spd: 0 },
};

const atNeutralDefense = damageRolls(payload);
const atMinusFourDefense = damageRolls({ ...payload, bossStages: { def: -4, spd: 0 } });
const damageRatio = atMinusFourDefense.min / atNeutralDefense.min;

if (atNeutralDefense.effectiveness !== 4 || atMinusFourDefense.effectiveness !== 4) {
  throw new Error("Forest's Curse Ting-Lu must retain 4x Bug effectiveness at every Defense stage.");
}
if (damageRatio < 2.9 || damageRatio > 3.1) {
  throw new Error(`A -4 Defense stage should yield about 3x physical damage, got ${damageRatio.toFixed(2)}x.`);
}

console.log("Quick Calc defense-stage and Mega Heracross checks passed.");
