import {
  QUICK_CALC_GUARD_SPLIT_USERS,
  calculateQuickCalcGuardSplits,
  normalizeGuardSplitOrder,
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
if (restoredOrder.join(",") !== "shuckle,abra,custom") {
  throw new Error(`Guard Split order normalization failed: ${restoredOrder.join(",")}`);
}

console.log("Quick Calc Guard Split checks passed.");
