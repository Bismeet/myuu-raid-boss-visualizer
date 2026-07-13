import * as quickCalc from "../js/ui/quick-calc.js";

const {
  QuickCalc,
  QUICK_CALC_GUARD_SPLIT_USERS,
  defaultQuickCalcSplitterStats,
  normalizeGuardSplitOrder,
  normalizeQuickCalcSplitterStats,
  resolveQuickCalcGuardChain,
} = quickCalc;

const expectedDefaults = {
  abra: { def: 5, spd: 5 },
  elgyem: { def: 6, spd: 6 },
  shuckle: { def: 20, spd: 20 },
  shieldon: { def: 7, spd: 7 },
  carbink: { def: 7, spd: 7 },
  custom: { def: 300, spd: 300 },
};

const defaults = defaultQuickCalcSplitterStats();
for (const [key, stats] of Object.entries(expectedDefaults)) {
  if (!QUICK_CALC_GUARD_SPLIT_USERS[key]) throw new Error(`Missing Guard Split user: ${key}`);
  if (defaults[key].def !== stats.def || defaults[key].spd !== stats.spd) {
    throw new Error(`Unexpected default Guard Split stats for ${key}`);
  }
}

const normalized = normalizeQuickCalcSplitterStats({
  abra: { def: 9.6, spd: 0 },
  custom: { def: 450, spd: 451 },
});
if (normalized.abra.def !== 10 || normalized.abra.spd !== 1) {
  throw new Error("Guard Split stats were not normalized to the supported range.");
}
if (normalized.custom.def !== 450 || normalized.custom.spd !== 451) {
  throw new Error("Custom Guard Split defenses were not preserved.");
}

const order = normalizeGuardSplitOrder(["abra", "unknown", "custom", "shuckle"]);
if (order.join(",") !== "abra,custom,shuckle") throw new Error("Guard Split order normalization failed.");

const chain = resolveQuickCalcGuardChain(order, normalized);
if (chain.map(({ key }) => key).join(",") !== order.join(",")) throw new Error("Guard Split chain order changed.");
if (chain[0].def !== 10 || chain[1].def !== 450 || chain[1].spd !== 451) {
  throw new Error("Guard Split chain did not expose the selected splitter defenses.");
}

const cfg = {
  guardSplitOrder: ["abra", "custom"],
  splitterStats: defaults,
  screechCount: 0,
  defenseStage: 0,
  simpleDefense: false,
  metalSoundCount: 0,
  fakeTearsCount: 0,
  spdStage: 0,
  simpleSpd: false,
  magicPowder: false,
  trickOrTreat: false,
  forestsCurse: false,
  soak: false,
  manualTypesEnabled: false,
  manualType1: "steel",
  manualType2: "fighting",
};
const panelContext = {
  cfg,
  guardChain: () => resolveQuickCalcGuardChain(cfg.guardSplitOrder, cfg.splitterStats),
  stageOptions: () => "",
};
const panel = QuickCalc.prototype.setupPanel.call(panelContext);
for (const text of [
  "Guard Splitter Stats",
  "Guard Split Order",
  "Abra Defense",
  "Custom Defense",
  "Def 5 · SpD 5",
  "Def 300 · SpD 300",
  "Add to chain",
]) {
  if (!panel.includes(text)) throw new Error(`Guard Split UI is missing: ${text}`);
}

const payloadContext = {
  cfg,
  guardChain: QuickCalc.prototype.guardChain,
};
const payload = QuickCalc.prototype.guardSplitPayload.call(payloadContext);
if (payload.guardSplitOrder.join(",") !== "abra,custom") throw new Error("Guard Split request order is missing.");
if (payload.splitterStats.abra.def !== 5 || payload.splitterStats.custom.spd !== 300) {
  throw new Error("Guard Split request does not include the visible splitter defenses.");
}
if ("calculateQuickCalcGuardSplits" in quickCalc) {
  throw new Error("Frontend must not calculate sequential boss defense internals.");
}

console.log("Quick Calc Guard Split UI and payload checks passed.");
