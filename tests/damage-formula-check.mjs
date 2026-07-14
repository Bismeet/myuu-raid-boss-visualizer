import { BattleState } from "../js/core/battle-state.js";
import { Simulator } from "../js/core/simulator.js";
import { calculateBossStats, calculatePokemonStats } from "../js/core/stats.js";
import quickCalcHandler from "../api/quick-calc.js";
import battleDamageHandler from "../api/battle-damage.js";
import {
  emptyStages,
  getStoredPowerLikeBasePower,
  getTotalPositiveStages,
  resolveDynamicMovePower,
} from "../js/core/stages.js";

console.log("Running Damage Formula and Roll Settings checks...");

// Mocks
const basculegion = {
  name: "basculegion-male",
  types: [{ type: { name: "water" } }, { type: { name: "ghost" } }],
  abilities: [{ ability: { name: "adaptability" } }],
  moves: [{ name: "last-respects", power: 50, type: { name: "ghost" }, damage_class: { name: "physical" } }],
  stats: [
    { base_stat: 120, stat: { name: "hp" } },
    { base_stat: 112, stat: { name: "attack" } },
    { base_stat: 65, stat: { name: "defense" } },
    { base_stat: 80, stat: { name: "special-attack" } },
    { base_stat: 75, stat: { name: "special-defense" } },
    { base_stat: 78, stat: { name: "speed" } },
  ]
};

const mewtwo = {
  name: "mewtwo",
  types: [{ type: { name: "psychic" } }],
  abilities: [{ ability: { name: "pressure" } }],
  moves: [],
  stats: [
    { base_stat: 106, stat: { name: "hp" } },
    { base_stat: 110, stat: { name: "attack" } },
    { base_stat: 90, stat: { name: "defense" } },
    { base_stat: 154, stat: { name: "special-attack" } },
    { base_stat: 90, stat: { name: "special-defense" } },
    { base_stat: 130, stat: { name: "speed" } },
  ]
};

function setupState(rollMode = "random") {
  const state = new BattleState();
  state.damageRollMode = rollMode;
  state.team[0].pokemon = basculegion;
  state.team[0].level = 100;
  state.team[0].item = "";
  state.team[0].ability = "adaptability";
  state.team[0].moves = [{ name: "last-respects", power: 50, type: { name: "ghost" }, damage_class: { name: "physical" } }];
  state.team[0].stats = calculatePokemonStats(basculegion, state.team[0]);

  const bossStats = calculateBossStats(mewtwo);
  bossStats.hp = 100000;
  state.setBoss(mewtwo, bossStats);
  state.bossMoves[0] = null; // Do nothing
  state.startBattle();

  return state;
}

// 1. Roll Modes verification
async function testRollModes() {
  // Test Min Roll
  const stateMin = setupState("min");
  await stateMin.executeTurn("use-move", 0, 0, "do-nothing", 0);
  const dmgMin = stateMin.battleLog[0].damageDetails.damage;
  const expectedMin = stateMin.battleLog[0].damageDetails.minDamage;
  if (dmgMin !== expectedMin) {
    throw new Error(`Min mode failed. Got: ${dmgMin}, Expected: ${expectedMin}`);
  }

  // Test Max Roll
  const stateMax = setupState("max");
  await stateMax.executeTurn("use-move", 0, 0, "do-nothing", 0);
  const dmgMax1 = stateMax.battleLog[0].damageDetails.damage;
  const expectedMax = stateMax.battleLog[0].damageDetails.maxDamage;
  if (dmgMax1 !== expectedMax) {
    throw new Error(`Max mode failed. Got: ${dmgMax1}, Expected: ${expectedMax}`);
  }

  // Verify repeated Max Roll hits are identical
  await stateMax.executeTurn("use-move", 0, 0, "do-nothing", 0);
  const dmgMax2 = stateMax.battleLog[1].damageDetails.damage;
  if (dmgMax1 !== dmgMax2) {
    throw new Error(`Max mode should be identical. Got: ${dmgMax1} and ${dmgMax2}`);
  }

  // Test Average Roll
  const stateAvg = setupState("average");
  await stateAvg.executeTurn("use-move", 0, 0, "do-nothing", 0);
  const dmgAvg = stateAvg.battleLog[0].damageDetails.damage;
  const rolls = stateAvg.battleLog[0].damageDetails.minDamage; // let's verify range
  if (dmgAvg <= expectedMin || dmgAvg >= expectedMax) {
    throw new Error(`Average damage should be strictly between min and max. Got: ${dmgAvg}, Min: ${expectedMin}, Max: ${expectedMax}`);
  }

  // Test Random Roll mode varies (most of the time)
  const stateRand = setupState("random");
  const randDmg = [];
  for (let i = 0; i < 6; i++) {
    await stateRand.executeTurn("use-move", 0, 0, "do-nothing", 0);
    randDmg.push(stateRand.battleLog[i].damageDetails.damage);
  }
  const uniqueCount = new Set(randDmg).size;
  console.log("Random damages across 6 turns:", randDmg, "Unique count:", uniqueCount);
  if (uniqueCount <= 1) {
    throw new Error("Random rolls did not produce unique values across 6 attacks.");
  }

  console.log("Damage roll modes verification PASSED.");
}

// 2. STAB Adaptability 2.0x vs 1.5x
async function testSTAB() {
  const stateNormalSTAB = setupState("max");
  stateNormalSTAB.team[0].ability = "none"; // disable Adaptability
  await stateNormalSTAB.executeTurn("use-move", 0, 0, "do-nothing", 0);
  const normalSTABDmg = stateNormalSTAB.battleLog[0].damageDetails.damage;

  const stateAdaptability = setupState("max");
  await stateAdaptability.executeTurn("use-move", 0, 0, "do-nothing", 0);
  const adaptDmg = stateAdaptability.battleLog[0].damageDetails.damage;

  const ratio = adaptDmg / normalSTABDmg;
  console.log(`STAB Damage: Normal: ${normalSTABDmg}, Adaptability: ${adaptDmg}, Ratio: ${ratio.toFixed(2)}`);
  if (Math.abs(ratio - 1.33) > 0.05) { // 2.0 / 1.5 = 1.333
    throw new Error(`Adaptability STAB should be 2.0x compared to 1.5x (ratio should be ~1.33). Got: ${ratio}`);
  }

  console.log("STAB and Adaptability verification PASSED.");
}

// 3. Custom power (Last Respects BP)
async function testCustomPower() {
  const state = setupState("max");
  state.team[0].moves[0].customPower = 300; // override original 50 BP
  await state.executeTurn("use-move", 0, 0, "do-nothing", 0);
  
  const details = state.battleLog[0].playerDamageDetails;
  console.log("Custom power details:", details);
  if (!details || details.usedPower !== 300) {
    throw new Error("Custom power not logged correctly in damage details.");
  }

  console.log("Custom power verification PASSED.");
}

async function runAll() {
  await testRollModes();
  await testSTAB();
  await testCustomPower();
  console.log("All damage formula audit checks completed successfully!");
}

try {
  await runAll();
} catch (e) {
  console.error("Test execution failed:", e);
  process.exit(1);
}

const noBoosts = emptyStages();
const sixAttack = { ...emptyStages(), atk: 6 };
const mixedBoosts = { ...emptyStages(), atk: 6, def: 1, spa: 2, spd: -4 };
if (getStoredPowerLikeBasePower(noBoosts) !== 20) throw new Error("Stored Power at zero boosts must be 20 BP.");
if (getStoredPowerLikeBasePower(sixAttack) !== 140) throw new Error("Stored Power at +6 Attack must be 140 BP.");
if (getTotalPositiveStages(mixedBoosts) !== 9 || getStoredPowerLikeBasePower(mixedBoosts) !== 200) {
  throw new Error("Stored Power did not total positive stages or ignore negative stages correctly.");
}
if (getStoredPowerLikeBasePower({ ...emptyStages(), accuracy: 2, evasion: 1, def: -6 }) !== 80) {
  throw new Error("Stored Power did not include tracked accuracy/evasion boosts.");
}
const storedPowerMove = resolveDynamicMovePower({
  name: "stored-power",
  power: 20,
  type: { name: "psychic" },
  damage_class: { name: "special" },
}, mixedBoosts);
const powerTripMove = resolveDynamicMovePower({
  name: "power-trip",
  power: 20,
  type: { name: "dark" },
  damage_class: { name: "physical" },
}, mixedBoosts);
if (storedPowerMove.customPower !== 200 || powerTripMove.customPower !== 200) {
  throw new Error("Stored Power and Power Trip did not share the dynamic power formula.");
}
if (storedPowerMove.damage_class.name !== "special" || storedPowerMove.type.name !== "psychic") {
  throw new Error("Stored Power must remain a special Psychic move.");
}
if (powerTripMove.damage_class.name !== "physical" || powerTripMove.type.name !== "dark") {
  throw new Error("Power Trip must remain a physical Dark move.");
}

const liveStoredPower = setupState("max");
liveStoredPower.team[0].moves[0] = { ...storedPowerMove, customPower: 20 };
liveStoredPower.teamStages[0] = { ...mixedBoosts };
await liveStoredPower.executeTurn("use-move", 0, 0, "do-nothing", 0);
if (liveStoredPower.battleLog.at(-1).playerDamageDetails.usedPower !== 200) {
  throw new Error("Live Battle did not resolve Stored Power's dynamic base power.");
}
const livePowerTrip = setupState("max");
livePowerTrip.team[0].moves[0] = { ...powerTripMove, customPower: 20 };
livePowerTrip.teamStages[0] = { ...mixedBoosts };
await livePowerTrip.executeTurn("use-move", 0, 0, "do-nothing", 0);
if (livePowerTrip.battleLog.at(-1).playerDamageDetails.usedPower !== 200) {
  throw new Error("Live Battle did not resolve Power Trip's dynamic base power.");
}
const plannedStoredPower = setupState("max");
plannedStoredPower.team[0].moves[0] = { ...storedPowerMove, customPower: 20 };
plannedStoredPower.team[0].stages = { ...mixedBoosts };
plannedStoredPower.plan = [{ turn: 1, slot: 0, action: "stored-power", switchMode: "stay" }];
const plannedRow = new Simulator(plannedStoredPower).run(1)[0];
const plannedStoredPowerBase = setupState("max");
plannedStoredPowerBase.team[0].moves[0] = { ...storedPowerMove, customPower: 20 };
plannedStoredPowerBase.team[0].stages = emptyStages();
plannedStoredPowerBase.plan = [{ turn: 1, slot: 0, action: "stored-power", switchMode: "stay" }];
const plannedBaseRow = new Simulator(plannedStoredPowerBase).run(1)[0];
if (plannedRow.damageMax <= plannedBaseRow.damageMax) {
  throw new Error("Planned Battle Simulator did not resolve Stored Power's dynamic base power.");
}

console.log("Stored Power and Power Trip formula checks passed.");

function responseRecorder() {
  return {
    statusCode: 0,
    payload: null,
    setHeader() {},
    status(code) { this.statusCode = code; return this; },
    json(payload) { this.payload = payload; return this; },
  };
}

const tingLu = {
  name: "ting-lu",
  types: [{ type: { name: "dark" } }, { type: { name: "ground" } }],
  abilities: [{ ability: { name: "vessel-of-ruin" } }],
  stats: [
    ["hp", 155], ["attack", 110], ["defense", 125],
    ["special-attack", 55], ["special-defense", 80], ["speed", 45],
  ].map(([name, base_stat]) => ({ base_stat, stat: { name } })),
};
const megaHeracross = {
  name: "heracross-mega",
  types: [{ type: { name: "bug" } }, { type: { name: "fighting" } }],
  abilities: [{ ability: { name: "skill-link" } }],
  stats: [
    ["hp", 80], ["attack", 185], ["defense", 115],
    ["special-attack", 40], ["special-defense", 105], ["speed", 75],
  ].map(([name, base_stat]) => ({ base_stat, stat: { name } })),
};
const pinMissile = {
  name: "pin-missile",
  power: 25,
  type: { name: "bug" },
  damage_class: { name: "physical" },
  meta: { min_hits: 2, max_hits: 5 },
};
const storedPowerApiMove = {
  name: "stored-power",
  power: 20,
  type: { name: "psychic" },
  damage_class: { name: "special" },
};
const flamethrowerApiMove = {
  name: "flamethrower",
  power: 90,
  type: { name: "fire" },
  damage_class: { name: "special" },
};
const attackerBuild = {
  level: 100,
  nature: "adamant",
  ivs: { hp: 31, atk: 31, def: 31, spa: 31, spd: 31, spe: 31 },
  evs: { hp: 0, atk: 252, def: 0, spa: 0, spd: 0, spe: 0 },
};
const attackerStats = calculatePokemonStats(megaHeracross, attackerBuild);
const originalFetch = globalThis.fetch;
const originalEnv = { ...process.env };
try {
  Object.assign(process.env, {
    BOSS_DEF_MULTIPLIER: "2",
    BOSS_SPD_MULTIPLIER: "2",
    BOSS_LEVEL: "200",
    BOSS_HP_MULTIPLIER: "100",
    MYUU_DAMAGE_CAP: "1000",
  });
  globalThis.fetch = async (url) => ({
    ok: true,
    json: async () => String(url).includes("/move/")
      ? (String(url).includes("stored-power")
        ? storedPowerApiMove
        : String(url).includes("flamethrower") ? flamethrowerApiMove : pinMissile)
      : String(url).includes("ting-lu") ? tingLu : megaHeracross,
  });

  const quick = responseRecorder();
  await quickCalcHandler({
    method: "POST",
    body: {
      boss: "ting-lu",
      attacker: "heracross-mega",
      move: "pin-missile",
      level: 100,
      nature: "adamant",
      ability: "skill-link",
      atkIv: 31,
      atkEv: 252,
      atkStage: 6,
      defenseStage: -4,
      hitCount: 1,
      typeChanges: { forestsCurse: true },
      guardSplitOrder: ["attacker"],
      splitterStats: { attacker: { def: attackerStats.def, spd: attackerStats.spd } },
    },
  }, quick);

  const battle = responseRecorder();
  await battleDamageHandler({
    method: "POST",
    body: {
      direction: "player-to-boss",
      boss: "ting-lu",
      move: "pin-missile",
      customPower: 25,
      hitCount: 1,
      activeSlot: 0,
      teamBaseStats: [attackerStats],
      splitEvents: [{ kind: "guard-split", slot: 0 }],
      player: {
        pokemon: "heracross-mega",
        level: 100,
        ability: "skill-link",
        item: "",
        types: ["bug", "fighting"],
        stages: { atk: 6 },
        atFullHp: true,
      },
      bossState: {
        ability: "vessel-of-ruin",
        types: ["dark", "ground", "grass"],
        stages: { def: -4 },
        atFullHp: true,
      },
    },
  }, battle);

  if (quick.statusCode !== 200 || battle.statusCode !== 200) {
    throw new Error("Quick Calc or Battle private damage endpoint failed.");
  }
  const [quickMin, quickMax] = quick.payload.actualDamageRange
    .split("-")
    .map((value) => Number(value.replaceAll(",", "").trim()));
  if (battle.payload.rolls[0] !== quickMin || battle.payload.rolls.at(-1) !== quickMax) {
    throw new Error("Battle and Quick Calc did not match for the shared raid setup.");
  }
  const allowedBattleKeys = ["effectiveness", "myuuAverage", "myuuRolls", "rolls"].sort().join(",");
  if (Object.keys(battle.payload).sort().join(",") !== allowedBattleKeys) {
    throw new Error("Battle damage response exposed private calculation internals.");
  }

  const quickStoredPower = async (stages) => {
    const response = responseRecorder();
    await quickCalcHandler({
      method: "POST",
      body: {
        boss: "ting-lu",
        attacker: "heracross-mega",
        move: "stored-power",
        level: 100,
        nature: "modest",
        ability: "skill-link",
        spaIv: 31,
        spaEv: 252,
        atkStage: stages.atk,
        attackerDefStage: stages.def,
        spaStage: stages.spa,
        attackerSpdStage: stages.spd,
        speStage: stages.spe,
        accuracyStage: stages.accuracy,
        evasionStage: stages.evasion,
        hitCount: 1,
        typeChanges: { soak: true },
      },
    }, response);
    return response;
  };
  const quickStoredBase = await quickStoredPower(noBoosts);
  const quickStoredBoosted = await quickStoredPower(mixedBoosts);
  const minimum = (range) => Number(range.split("-")[0].replaceAll(",", "").trim());
  if (quickStoredBase.statusCode !== 200 || quickStoredBoosted.statusCode !== 200
    || minimum(quickStoredBoosted.payload.actualDamageRange) <= minimum(quickStoredBase.payload.actualDamageRange)) {
    throw new Error("Quick Calc did not apply Stored Power's dynamic positive-stage power.");
  }
  const battleStoredPower = async (stages) => {
    const response = responseRecorder();
    await battleDamageHandler({
      method: "POST",
      body: {
        direction: "player-to-boss",
        boss: "ting-lu",
        move: "stored-power",
        customPower: 20,
        hitCount: 1,
        activeSlot: 0,
        teamBaseStats: [attackerStats],
        splitEvents: [],
        player: {
          pokemon: "heracross-mega",
          level: 100,
          ability: "skill-link",
          item: "",
          types: ["bug", "fighting"],
          stages,
          atFullHp: true,
        },
        bossState: {
          ability: "vessel-of-ruin",
          types: ["water"],
          stages: emptyStages(),
          atFullHp: true,
        },
      },
    }, response);
    return response;
  };
  const battleStoredBase = await battleStoredPower(noBoosts);
  const battleStoredBoosted = await battleStoredPower(mixedBoosts);
  if (battleStoredBase.statusCode !== 200 || battleStoredBoosted.statusCode !== 200
    || battleStoredBoosted.payload.rolls[0] <= battleStoredBase.payload.rolls[0]) {
    throw new Error("Private Battle damage did not apply Stored Power's dynamic positive-stage power.");
  }

  const quickFireDamage = async (tarShot) => {
    const response = responseRecorder();
    await quickCalcHandler({
      method: "POST",
      body: {
        boss: "ting-lu", attacker: "heracross-mega", move: "flamethrower", level: 100,
        nature: "modest", ability: "skill-link", spaIv: 31, spaEv: 252, hitCount: 1,
        typeChanges: { manualTypesEnabled: true, manualType1: "normal", tarShot },
      },
    }, response);
    return response;
  };
  const quickFireBase = await quickFireDamage(false);
  const quickFireTarShot = await quickFireDamage(true);
  if (minimum(quickFireTarShot.payload.actualDamageRange) < minimum(quickFireBase.payload.actualDamageRange) * 1.99) {
    throw new Error("Private Quick Calc did not apply Tar Shot's Fire damage modifier.");
  }

  const battleFireDamage = async (tarShot) => {
    const response = responseRecorder();
    await battleDamageHandler({
      method: "POST",
      body: {
        direction: "player-to-boss", boss: "ting-lu", move: "flamethrower", moveType: "fire",
        customPower: 90, hitCount: 1, activeSlot: 0, teamBaseStats: [attackerStats], splitEvents: [], tarShot,
        player: { pokemon: "heracross-mega", level: 100, ability: "skill-link", item: "", types: ["bug", "fighting"], stages: emptyStages(), atFullHp: true },
        bossState: { ability: "vessel-of-ruin", types: ["normal"], stages: emptyStages(), atFullHp: true },
      },
    }, response);
    return response;
  };
  const battleFireBase = await battleFireDamage(false);
  const battleFireTarShot = await battleFireDamage(true);
  if (battleFireTarShot.payload.rolls[0] < battleFireBase.payload.rolls[0] * 1.99) {
    throw new Error("Private Battle damage did not apply Tar Shot's Fire damage modifier.");
  }
} finally {
  globalThis.fetch = originalFetch;
  for (const key of Object.keys(process.env)) delete process.env[key];
  Object.assign(process.env, originalEnv);
}

console.log("Quick Calc and Battle private damage parity checks passed.");
