import {
  QUICK_CALC_GUARD_SPLIT_USERS,
  calculateQuickCalcGuardSplits,
  defaultQuickCalcSplitterStats,
  normalizeGuardSplitOrder,
  normalizeQuickCalcSplitterStats,
  resolveQuickCalcGuardChain,
} from "../js/ui/quick-calc.js";

const expectedStats = {
  abra: [5, 5],
  elgyem: [6, 6],
  shuckle: [20, 20],
  shieldon: [7, 7],
  carbink: [7, 7],
};

Object.entries(expectedStats).forEach(([key, [def, spd]]) => {
  const splitter = QUICK_CALC_GUARD_SPLIT_USERS[key];
  if (!splitter || splitter.def !== def || splitter.spd !== spd) {
    throw new Error(`${key} must use hard-locked Quick Calc stats ${def}/${spd}.`);
  }
});

const defaultSplitterStats = defaultQuickCalcSplitterStats();
if (defaultSplitterStats.shuckle.def !== 20 || defaultSplitterStats.shuckle.spd !== 20) {
  throw new Error("Editable splitter state must start with the documented defaults.");
}

const normalizedSplitterStats = normalizeQuickCalcSplitterStats({
  abra: { def: 0, spd: 1000 },
  shuckle: { def: 22, spd: 22 },
});
if (normalizedSplitterStats.abra.def !== 1 || normalizedSplitterStats.abra.spd !== 999) {
  throw new Error("Saved splitter stats must clamp to the 1-999 input range.");
}
if (normalizedSplitterStats.elgyem.def !== 6 || normalizedSplitterStats.elgyem.spd !== 6) {
  throw new Error("Missing saved splitter stats must restore their defaults.");
}

const abraThenShuckle = calculateQuickCalcGuardSplits(1000, 1000, [
  QUICK_CALC_GUARD_SPLIT_USERS.abra,
  QUICK_CALC_GUARD_SPLIT_USERS.shuckle,
]);
if (abraThenShuckle.steps[0].def !== 502 || abraThenShuckle.finalDef !== 261) {
  throw new Error(`Expected Abra then Shuckle to produce 502 then 261, got ${abraThenShuckle.steps[0].def} then ${abraThenShuckle.finalDef}.`);
}

const shuckleThenAbra = calculateQuickCalcGuardSplits(1000, 1000, [
  QUICK_CALC_GUARD_SPLIT_USERS.shuckle,
  QUICK_CALC_GUARD_SPLIT_USERS.abra,
]);
if (shuckleThenAbra.finalDef !== 257 || shuckleThenAbra.finalDef === abraThenShuckle.finalDef) {
  throw new Error("Guard Split must calculate sequentially in the selected order.");
}

const restoredOrder = normalizeGuardSplitOrder(["shuckle", "abra", "custom", "shuckle", "missing"]);
if (restoredOrder.join(",") !== "shuckle,abra,custom,shuckle") {
  throw new Error(`Guard Split order normalization failed: ${restoredOrder.join(",")}`);
}

const repeatedShuckle = calculateQuickCalcGuardSplits(1000, 1000, [
  QUICK_CALC_GUARD_SPLIT_USERS.shuckle,
  QUICK_CALC_GUARD_SPLIT_USERS.shuckle,
]);
if (repeatedShuckle.steps.length !== 2 || repeatedShuckle.steps[0].def !== 510 || repeatedShuckle.finalDef !== 265) {
  throw new Error(`Repeated Shuckle splits must run independently, got ${repeatedShuckle.steps.map((step) => step.def).join(" then ")}.`);
}

const customRepeatedChain = resolveQuickCalcGuardChain(
  ["abra", "shuckle", "shuckle", "elgyem"],
  { shuckle: { def: 22, spd: 22 } },
);
const customRepeatedShuckle = calculateQuickCalcGuardSplits(1000, 1000, customRepeatedChain);
if (
  customRepeatedChain[1].def !== 22
  || customRepeatedChain[2].def !== 22
  || customRepeatedShuckle.steps[1].def !== 262
  || customRepeatedShuckle.steps[2].def !== 142
) {
  throw new Error("Every repeated splitter occurrence must resolve the current custom stats.");
}

console.log("Quick Calc Guard Split checks passed.");
