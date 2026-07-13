import * as quickCalc from "../js/ui/quick-calc.js";

const removedExports = [
  "MYUU_DAMAGE_CAP",
  "getMyuuDisplayedDamage",
  "getMyuuDisplayedDamageRange",
];

const exposed = removedExports.filter((name) => name in quickCalc);
if (exposed.length) {
  throw new Error(`Quick Calc still exposes private damage-display helpers: ${exposed.join(", ")}`);
}

console.log("Quick Calc damage-display hardening checks passed.");
