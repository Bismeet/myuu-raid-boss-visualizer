import * as quickCalc from "../js/ui/quick-calc.js";

const removedExports = [
  "QUICK_CALC_GUARD_SPLIT_USERS",
  "defaultQuickCalcSplitterStats",
  "normalizeQuickCalcSplitterStats",
  "resolveQuickCalcGuardChain",
  "calculateQuickCalcGuardSplits",
];

const exposed = removedExports.filter((name) => name in quickCalc);
if (exposed.length) {
  throw new Error(`Quick Calc still exposes private Guard Split helpers: ${exposed.join(", ")}`);
}

console.log("Quick Calc Guard Split hardening checks passed.");
