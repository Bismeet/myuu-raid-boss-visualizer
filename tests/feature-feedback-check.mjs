import {
  BattleState,
  createBuild,
  formatDamagePercent,
  halveBossOffensiveStats,
  isItemConsumed,
  metronomeMultiplierForUse,
} from "../js/core/battle-state.js";
import { getLastRespectsBasePower } from "../js/core/stages.js";
import { calculateBossStats, calculatePokemonStats } from "../js/core/stats.js";
import { ITEM_EFFECTS } from "../js/data/item-effects.js";
import { QUICK_CALC_PRESETS } from "../js/ui/quick-calc.js";
import { RAID_PICK_MOVES } from "../js/ui/team-builder.js";
import { redactBossDefensesForExport } from "../js/utils/persistence.js";

const stages = () => ({ atk: 0, def: 0, spa: 0, spd: 0, spe: 0, accuracy: 0, evasion: 0, crit: 0 });
const statRows = ({ hp, atk, def, spa, spd, spe }) => [
  ["hp", hp], ["attack", atk], ["defense", def], ["special-attack", spa], ["special-defense", spd], ["speed", spe],
].map(([name, base_stat]) => ({ stat: { name }, base_stat }));

function pokemon(name, values, types = ["normal"], ability = "pressure") {
  return {
    name,
    types: types.map((type) => ({ type: { name: type } })),
    abilities: [{ ability: { name: ability } }],
    stats: statRows(values),
  };
}

function move(name, power, damageClass = "physical", type = "normal") {
  return {
    name,
    power,
    basePower: power,
    customPower: power,
    type: { name: type },
    damage_class: { name: damageClass },
    priority: 0,
  };
}

function buildFor(mon, { item = "", ability = "", moves = [] } = {}) {
  const build = createBuild();
  Object.assign(build, {
    pokemon: mon,
    level: 100,
    nature: "hardy",
    ability: ability || mon.abilities[0].ability.name,
    item,
    moves: [...moves, null, null, null].slice(0, 4),
    stages: stages(),
  });
  build.stats = calculatePokemonStats(mon, build);
  return build;
}

function setupBattle({ item = "", playerMoves = [move("tackle", 40)], bossMoves = [], bossHP = 10_000, leadName = "shuckle" } = {}) {
  const boss = pokemon("test-boss", { hp: 120, atk: 200, def: 200, spa: 200, spd: 200, spe: 200 }, ["normal"]);
  const lead = pokemon(leadName, { hp: 200, atk: 100, def: 180, spa: 100, spd: 180, spe: 20 }, ["bug", "rock"], "sturdy");
  const reserve = pokemon("smeargle", { hp: 180, atk: 100, def: 100, spa: 100, spd: 100, spe: 100 });
  const state = new BattleState();
  state.setBoss(boss, calculateBossStats(boss));
  state.team[0] = buildFor(lead, { item, moves: playerMoves });
  state.team[1] = buildFor(reserve, { moves: [move("tackle", 40)] });
  state.bossMoves = [...bossMoves, null, null, null].slice(0, 4);
  state.manualBossOverride = true;
  state.manualBossName = boss.name;
  state.manualBossHP = bossHP;
  state.manualBossMaxHP = bossHP;
  state.manualBossCurrentTypes = ["normal"];
  state.manualBossBaseStats = { hp: 120, atk: 200, def: 200, spa: 200, spd: 200, spe: 200 };
  state.manualBossFinalStats = { atk: 200, def: 200, spa: 200, spd: 200, spe: 200 };
  state.manualBossStages = stages();
  state.startBattle();
  state.damageRollMode = "max";
  return state;
}

if (QUICK_CALC_PRESETS.heracross.item !== "heracronite" || QUICK_CALC_PRESETS.heracross.atkStage !== 6) {
  throw new Error("Mega Heracross must use Heracronite and the +6 raid setup stage.");
}
if (QUICK_CALC_PRESETS.calyrex.teraType !== "ice") {
  throw new Error("Calyrex-Ice must use Ice Tera.");
}
for (const supportKey of ["shuckle", "elgyem", "shieldon", "smeargle"]) {
  if (supportKey in QUICK_CALC_PRESETS) throw new Error(`${supportKey} must not be a damage dealer preset.`);
}

for (const raidMove of ["magic-powder", "trick-or-treat", "belly-drum", "screech", "charm"]) {
  if (!RAID_PICK_MOVES.includes(raidMove)) throw new Error(`${raidMove} is missing from Team Builder raid picks.`);
}
if (!ITEM_EFFECTS.metronome || !ITEM_EFFECTS["eject-button"]) {
  throw new Error("Metronome and Eject Button must exist in the item registry.");
}
for (const [use, expected] of [[1, 1], [2, 1.2], [3, 1.4], [4, 1.6], [5, 1.8], [6, 2], [9, 2]]) {
  if (metronomeMultiplierForUse(use) !== expected) throw new Error(`Metronome multiplier failed on use ${use}.`);
}

for (const [fainted, expected] of [[0, 50], [1, 100], [4, 250], [5, 300]]) {
  if (getLastRespectsBasePower(fainted) !== expected) throw new Error(`Last Respects BP failed at ${fainted} fainted allies.`);
}

const offense = halveBossOffensiveStats({ atk: 201, def: 444, spa: 199, spd: 555, spe: 99 });
if (offense.atk !== 100 || offense.spa !== 99 || offense.def !== 444 || offense.spd !== 555) {
  throw new Error("Boss offense halving changed the wrong stats.");
}

const ejectState = setupBattle({
  item: "eject-button",
  bossMoves: [move("water-gun", 40, "special", "water")],
});
await ejectState.executeTurn("use-move", 0, 0, "use-move", 0);
const ejectLog = ejectState.battleLog[0];
if (!ejectState.awaitingForcedSwitch || ejectState.forcedSwitchReason !== "eject-button") {
  throw new Error("Eject Button did not open forced switch selection.");
}
if (!isItemConsumed({ slotIndex: 0 }, ejectState) || ejectState.team[0].item !== "eject-button") {
  throw new Error("Eject Button consumption leaked into Team Builder state.");
}
if (!ejectLog.messages.some((line) => line.includes("is switched out with the Eject Button"))) {
  throw new Error("Eject Button activation was not logged.");
}
if (!ejectLog.messages.some((line) => /lost [\d,]+ HP \(\d+\.\d%\)!/.test(line))) {
  throw new Error("Player damage log is missing its number and percentage.");
}
ejectState.executeForcedSwitch(1);
if (ejectState.activeSlot !== 1 || ejectState.awaitingForcedSwitch) throw new Error("Eject Button switch did not complete.");
if (ejectState.battleLog.at(-1).bossAction === "do-nothing") throw new Error("Forced switch selection must not invent a boss action.");

const statusEjectState = setupBattle({
  item: "eject-button",
  bossMoves: [move("charm", null, "status", "fairy")],
});
await statusEjectState.executeTurn("use-move", 0, 0, "use-move", 0);
if (statusEjectState.awaitingForcedSwitch || isItemConsumed({ slotIndex: 0 }, statusEjectState)) {
  throw new Error("Eject Button must not activate on status moves.");
}

const custapTimingState = setupBattle({
  leadName: "carbink",
  item: "custap-berry",
  playerMoves: [move("guard-split", null, "status", "psychic")],
  bossMoves: [move("ice-punch", 9999, "physical", "ice")],
});
await custapTimingState.executeTurn("use-move", 0, 0, "use-move", 0);
const custapDamageTurn = custapTimingState.battleLog[0];
if (custapDamageTurn.playerMovedFirst) throw new Error("Full-HP Carbink should move after the faster boss.");
if (custapTimingState.teamHP[0] !== 1) throw new Error("Carbink should survive the first hit at 1 HP with Sturdy.");
if (custapDamageTurn.messages.some((line) => line.includes("Custap Berry")) || isItemConsumed({ slotIndex: 0 }, custapTimingState)) {
  throw new Error("Custap Berry activated after damage during the same turn.");
}
await custapTimingState.executeTurn("use-move", 0, 0, "use-move", 0);
const custapNextTurn = custapTimingState.battleLog[1];
if (!custapNextTurn.playerMovedFirst) throw new Error("Custap Berry should give Carbink priority on the next turn.");
if (!custapNextTurn.messages.some((line) => line.includes("Custap Berry activated"))
  || !custapNextTurn.messages.some((line) => line.includes("moved first with priority +1"))) {
  throw new Error("Next-turn Custap activation logging is missing.");
}
if (!isItemConsumed({ slotIndex: 0 }, custapTimingState) || custapTimingState.team[0].item !== "custap-berry") {
  throw new Error("Custap consumption must remain battle-local.");
}

const lastRespectsState = setupBattle({ playerMoves: [move("last-respects", 50, "physical", "ghost")] });
lastRespectsState.bossCurrentTypes = ["psychic"];
lastRespectsState.faintedAlliesCount = 4;
await lastRespectsState.executeTurn("use-move", 0, 0, "do-nothing", 0);
const lastRespectsLog = lastRespectsState.battleLog[0];
if (lastRespectsLog.playerDamageDetails.usedPower !== 250) throw new Error("Battle Last Respects did not use 250 BP.");
if (!lastRespectsLog.messages.some((line) => /Boss .* lost [\d,]+ HP \(\d+\.\d%\)!/.test(line))) {
  throw new Error("Boss damage log is missing its number and percentage.");
}

const metronomeState = setupBattle({ item: "metronome", playerMoves: [move("tackle", 40)] });
await metronomeState.executeTurn("use-move", 0, 0, "do-nothing", 0);
await metronomeState.executeTurn("use-move", 0, 0, "do-nothing", 0);
const firstMetronomeDamage = metronomeState.battleLog[0].playerDamage;
const secondMetronomeLog = metronomeState.battleLog[1];
if (secondMetronomeLog.playerDamage <= firstMetronomeDamage) throw new Error("Metronome did not boost the repeated move.");
if (secondMetronomeLog.playerDamageDetails.metronomeMultiplier !== 1.2) throw new Error("Metronome's second use must be 1.2x.");
if (!secondMetronomeLog.messages.some((line) => line.includes("Metronome boosted") && line.includes("1.2x"))) {
  throw new Error("Metronome multiplier is missing from the battle log.");
}
if (isItemConsumed({ slotIndex: 0 }, metronomeState)) throw new Error("Metronome must not be consumed.");

const simpleState = setupBattle({ playerMoves: [move("simple-beam", null, "status", "normal"), move("charm", null, "status", "fairy")] });
await simpleState.executeTurn("use-move", 0, 0, "do-nothing", 0);
await simpleState.executeTurn("use-move", 1, 0, "do-nothing", 0);
const charmLog = simpleState.battleLog[1];
if (!charmLog.messages.some((line) => line.includes("Attack severely fell"))) throw new Error("Charm + Simple must log severely fell.");
if (!charmLog.messages.some((line) => line.includes("Simple doubled the stat change"))) throw new Error("Charm + Simple note is missing.");

const invalidBossActionState = setupBattle({ bossMoves: [] });
await invalidBossActionState.executeTurn("use-move", 0, 0, "use-move", 0);
const invalidBossLog = invalidBossActionState.battleLog[0];
if (invalidBossLog.messages.some((line) => line.toLowerCase().includes("did nothing"))) {
  throw new Error("An unavailable boss move was incorrectly logged as did nothing.");
}
if (!invalidBossLog.messages.some((line) => line.toLowerCase().includes("could not move"))) {
  throw new Error("An unavailable boss move did not log its real reason.");
}

const faintedBossState = setupBattle({ playerMoves: [move("final-blow", 9999)], bossMoves: [move("tackle", 40)], bossHP: 10 });
faintedBossState.team[0].currentStats.spe = 999;
await faintedBossState.executeTurn("use-move", 0, 0, "use-move", 0);
const faintedBossLog = faintedBossState.battleLog[0];
if (faintedBossLog.bossAction !== "fainted-before-action") throw new Error("Boss faint-before-action state was not recorded.");
if (faintedBossLog.messages.some((line) => line.toLowerCase().includes("did nothing"))) {
  throw new Error("A fainted boss was incorrectly logged as doing nothing.");
}

if (formatDamagePercent(60, 314) !== "19.1") throw new Error("Damage percent formatting is incorrect.");

const safeExport = redactBossDefensesForExport({
  setup: {
    boss: {
      baseStats: { atk: 1, def: 2, spa: 3, spd: 4 },
      currentStats: { atk: 5, def: 6, spa: 7, spd: 8 },
    },
    manualBossFinalStats: { atk: 9, def: 10, spa: 11, spd: 12 },
  },
});
if (safeExport.setup.boss.baseStats.def !== undefined
  || safeExport.setup.boss.currentStats.spd !== undefined
  || safeExport.setup.manualBossFinalStats.def !== undefined) {
  throw new Error("Boss final defenses leaked into the setup export.");
}

console.log("Feature feedback batch checks passed.");
