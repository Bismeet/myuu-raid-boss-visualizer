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

const resultContext = {
  calculationPending: false,
  serverError: "",
  serverResult: {
    summary: "Test damage result",
    actualDamageRange: "63,376 - 74,561",
    myuuDamageRange: "63,376 - 9,025",
  },
  resultSummary: () => "Test damage result",
};
const panel = quickCalc.QuickCalc.prototype.resultsPanel.call(resultContext, {});
for (const expected of [
  "Actual Damage",
  "63,376 - 74,561",
  "Myuu Rounded Damage",
  "63,376 - 9,025",
]) {
  if (!panel.includes(expected)) throw new Error(`Quick Calc results are missing: ${expected}`);
}

console.log("Quick Calc actual and Myuu damage display checks passed.");
