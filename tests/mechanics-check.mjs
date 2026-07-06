import { RANDOM_ROLLS, damageRolls } from "../js/core/damage.js";
import { calculateStat } from "../js/core/stats.js";
import { Simulator } from "../js/core/simulator.js";

const stages = { atk: 0, def: 0, spa: 0, spd: 0, spe: 0, accuracy: 0, evasion: 0, crit: 0 };
const pokemon = { name: "mew", types: [{ type: { name: "psychic" } }] };
const move = { name: "psychic", power: 90, type: { name: "psychic" }, damage_class: { name: "special" } };
const build = {
  pokemon,
  level: 100,
  ability: "synchronize",
  item: "life-orb",
  stats: { hp: 341, atk: 236, def: 236, spa: 299, spd: 236, spe: 236 },
  stages,
  moves: [move],
};
const state = {
  boss: { types: [{ type: { name: "fighting" } }] },
  bossBaseStats: { hp: 1_000_000, atk: 500, def: 1_000, spa: 500, spd: 1_000, spe: 500 },
  bossStats: null,
  team: [build],
  plan: [
    { turn: 1, slot: 0, action: "guard-split", switchMode: "stay" },
    { turn: 2, slot: 0, action: "psychic", switchMode: "stay" },
  ],
};

const rows = new Simulator(state).run(2);
const rolls = damageRolls({
  attacker: build,
  boss: { stats: state.bossBaseStats, maxHp: 1_000_000 },
  move,
  attackerTypes: ["psychic"],
  bossTypes: ["fighting"],
  ability: build.ability,
  stages,
  bossStages: stages,
});
const noItemRolls = damageRolls({
  attacker: { ...build, item: "" },
  boss: { stats: state.bossBaseStats, maxHp: 1_000_000 },
  move: { ...move, type: { name: "fire" } },
  attackerTypes: ["psychic"],
  bossTypes: ["normal"],
  ability: build.ability,
  stages,
  bossStages: stages,
});
const charcoalRolls = damageRolls({
  attacker: { ...build, item: "charcoal" },
  boss: { stats: state.bossBaseStats, maxHp: 1_000_000 },
  move: { ...move, type: { name: "fire" } },
  attackerTypes: ["psychic"],
  bossTypes: ["normal"],
  ability: build.ability,
  stages,
  bossStages: stages,
});
const scopeLensRolls = damageRolls({
  attacker: { ...build, item: "scope-lens" },
  boss: { stats: state.bossBaseStats, maxHp: 1_000_000 },
  move,
  attackerTypes: ["psychic"],
  bossTypes: ["fighting"],
  ability: build.ability,
  stages,
  bossStages: stages,
});
const customPowerRolls = damageRolls({
  attacker: { ...build, item: "" },
  boss: { stats: state.bossBaseStats, maxHp: 1_000_000 },
  move: { ...move, basePower: 50, customPower: 300 },
  attackerTypes: ["psychic"],
  bossTypes: ["normal"],
  ability: build.ability,
  stages,
  bossStages: stages,
});
const basePowerRolls = damageRolls({
  attacker: { ...build, item: "" },
  boss: { stats: state.bossBaseStats, maxHp: 1_000_000 },
  move: { ...move, basePower: 50, customPower: 50 },
  attackerTypes: ["psychic"],
  bossTypes: ["normal"],
  ability: build.ability,
  stages,
  bossStages: stages,
});
const choiceBandRolls = damageRolls({
  attacker: { ...build, item: "choice-band" },
  boss: { stats: state.bossBaseStats, maxHp: 1_000_000 },
  move: { ...move, damage_class: { name: "physical" } },
  attackerTypes: ["psychic"],
  bossTypes: ["normal"],
  ability: build.ability,
  stages,
  bossStages: stages,
});
const noBandRolls = damageRolls({
  attacker: { ...build, item: "" },
  boss: { stats: state.bossBaseStats, maxHp: 1_000_000 },
  move: { ...move, damage_class: { name: "physical" } },
  attackerTypes: ["psychic"],
  bossTypes: ["normal"],
  ability: build.ability,
  stages,
  bossStages: stages,
});

if (RANDOM_ROLLS.length !== 16 || rolls.rolls.length !== 16) throw new Error("Expected 16 damage rolls.");
if (calculateStat(100, 31, 0, 200, 1, true) !== 672) throw new Error("Level 200 HP formula mismatch.");
if (state.bossStats.def !== 618) throw new Error("Guard Split did not persist.");
if (rows.length !== 2 || rows[1].normal.max <= 0) throw new Error("Simulator did not produce attack damage.");
if (charcoalRolls.max <= noItemRolls.max) throw new Error("Type-boosting item modifier failed.");
if (scopeLensRolls.critStage !== 1) throw new Error("Critical-stage item modifier failed.");
if (customPowerRolls.max <= basePowerRolls.max * 5) throw new Error("Custom move power was not used.");
if (choiceBandRolls.max <= noBandRolls.max) throw new Error("Choice Band attack-stat modifier failed.");
if (rows[1].originalPower !== 90 || rows[1].usedPower !== 90 || rows[1].heldItem !== "life-orb") throw new Error("Summary power/item fields failed.");

console.log("Mechanics checks passed:", {
  rolls: RANDOM_ROLLS.length,
  level200Hp: 672,
  guardSplitDefense: state.bossStats.def,
  damage: rows[1].normalLabel,
});
