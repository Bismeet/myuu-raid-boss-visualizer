import {
  MYUU_DAMAGE_CAP,
  getMyuuDisplayedDamage,
  getMyuuDisplayedDamageRange,
} from "../js/ui/quick-calc.js";

const cases = [
  [70000, 4465],
  [760425, 39540],
  [894618, 42663],
  [65535, 0],
];

cases.forEach(([rawDamage, expected]) => {
  const actual = getMyuuDisplayedDamage(rawDamage);
  if (actual !== expected || actual !== Math.floor(rawDamage) % MYUU_DAMAGE_CAP) {
    throw new Error(`Expected ${rawDamage} to display as ${expected}, got ${actual}.`);
  }
});

const endpointRange = getMyuuDisplayedDamageRange(760425, 894618);
if (endpointRange.min !== 39540 || endpointRange.max !== 42663) {
  throw new Error(`Expected endpoint remainders 39540-42663, got ${endpointRange.min}-${endpointRange.max}.`);
}

console.log("Quick Calc Myuu displayed damage checks passed.");
