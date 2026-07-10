import { getItemIndex, getMove, getMoveIndex, getPokemon, searchPokemon } from "../api/pokeapi.js";
import { BOSSES, searchBosses } from "../data/bosses.js";
import { NATURES, natureDropdownLabel } from "../data/natures.js";
import { damageRolls } from "../core/damage.js";
import { applyStage, emptyStages, stageMultiplier } from "../core/stages.js";
import { baseStats, calculatePokemonStats } from "../core/stats.js";
import { copyText, displayName, fallbackSprite, spriteUrl, titleCase } from "../utils/format.js";
import { openSearchDropdown, setupSearchDropdownController } from "./search-dropdown.js";

const STORAGE_KEY = "myuu-raid-quick-calc-state";
const LEGACY_STORAGE_KEY = "myuu.quickCalc.saved";
export const MYUU_DAMAGE_CAP = 65535;
const TYPES = [
  "normal", "fire", "water", "electric", "grass", "ice", "fighting", "poison", "ground",
  "flying", "psychic", "bug", "rock", "ghost", "dragon", "dark", "steel", "fairy",
];
const CURATED_ITEMS = [
  "choice-band", "choice-specs", "life-orb", "expert-belt", "muscle-band", "wise-glasses",
  "spell-tag", "black-glasses", "mystic-water", "never-melt-ice", "hard-stone", "silver-powder",
  "scope-lens", "razor-claw", "normal-gem", "ghost-gem", "bug-gem", "ice-gem", "fighting-gem",
];
const RAID_MOVES = [
  "last-respects", "pin-missile", "icicle-spear", "screech", "metal-sound", "fake-tears",
  "guard-split", "stored-power", "power-trip", "rage-fist", "collision-course", "astral-barrage",
];
export const QUICK_CALC_GUARD_SPLIT_USERS = {
  abra: { name: "Abra", def: 5, spd: 5 },
  elgyem: { name: "Elgyem", def: 6, spd: 6 },
  shuckle: { name: "Shuckle", def: 20, spd: 20 },
  shieldon: { name: "Shieldon", def: 7, spd: 7 },
  carbink: { name: "Carbink", def: 7, spd: 7 },
};

export function resolveQuickCalcBossTypes({
  bossTypes = [],
  manualTypesEnabled = false,
  manualType1 = "",
  manualType2 = "",
  magicPowder = false,
  soak = false,
  trickOrTreat = false,
  forestsCurse = false,
} = {}) {
  let types = manualTypesEnabled
    ? [manualType1, manualType2].filter(Boolean)
    : [...bossTypes];

  if (magicPowder) types = ["psychic"];
  if (soak) types = ["water"];
  if (trickOrTreat && !types.includes("ghost")) types = [...types, "ghost"];
  if (forestsCurse && !types.includes("grass")) types = [...types, "grass"];
  return types;
}
const CUSTOM_GUARD_SPLITTER = "custom";
const GUARD_SPLITTER_KEYS = [...Object.keys(QUICK_CALC_GUARD_SPLIT_USERS), CUSTOM_GUARD_SPLITTER];
export const QUICK_CALC_PRESETS = {
  basculegion: {
    label: "Basculegion Last Respects",
    boss: "cobalion",
    attacker: "basculegion-male",
    move: "last-respects",
    nature: "adamant",
    ability: "adaptability",
    item: "choice-band",
    atkEv: 252,
    spaEv: 0,
    atkStage: 6,
    faintedAllies: 4,
    teraType: "ghost",
    terastallized: false,
  },
  heracross: {
    label: "Mega Heracross Pin Missile",
    attacker: "heracross-mega",
    move: "pin-missile",
    nature: "adamant",
    ability: "skill-link",
    item: "choice-band",
    atkEv: 252,
    atkStage: 6,
    hitCount: 5,
  },
  calyrex: {
    label: "Calyrex-Ice Icicle Spear",
    attacker: "calyrex-ice",
    move: "icicle-spear",
    nature: "adamant",
    ability: "as-one-glastrier",
    item: "choice-band",
    atkEv: 252,
    atkStage: 6,
    hitCount: 5,
  },
  smeargle: {
    label: "Smeargle Baton Pass setup",
    attacker: "smeargle",
    move: "stored-power",
    nature: "modest",
    ability: "own-tempo",
    item: "focus-sash",
    spaEv: 252,
    spaStage: 6,
  },
  shuckle: { label: "Shuckle Guard Split", guardSplitOrder: ["shuckle"] },
  elgyem: { label: "Elgyem Guard Split", guardSplitOrder: ["elgyem"] },
  shieldon: { label: "Shieldon Screech", guardSplitOrder: ["shieldon"], screechCount: 3 },
};

const escapeHtml = (value = "") => String(value)
  .replaceAll("&", "&amp;")
  .replaceAll("<", "&lt;")
  .replaceAll(">", "&gt;")
  .replaceAll("\"", "&quot;");
const clamp = (value, min, max) => Math.max(min, Math.min(max, Number(value) || 0));
const slug = (value = "") => value.toLowerCase().trim().replaceAll(" ", "-");
const fmt = (value) => Math.round(Number(value) || 0).toLocaleString();
const percent = (value) => `${(Number(value) || 0).toFixed(2)}%`;
const effectivenessLabel = (value) => `${Number(value || 0).toLocaleString(undefined, { maximumFractionDigits: 2 })}x`;
const prepareMove = (move) => move ? { ...move, basePower: move.power ?? null, customPower: move.power ?? null } : null;
const blankSpread = (value) => ({ hp: value, atk: value, def: value, spa: value, spd: value, spe: value });
const STANDARD_ROLL_MIN = 85;
const STANDARD_ROLL_MAX = 100;
const MYUU_TEST_ROLL_MIN = 70;
const MYUU_TEST_ROLL_MAX = 80;

export function getMyuuDisplayedDamage(rawDamage) {
  const damage = Math.floor(Number(rawDamage) || 0);
  return damage % MYUU_DAMAGE_CAP;
}

export function getMyuuDisplayedDamageRange(rawMin, rawMax) {
  return {
    min: getMyuuDisplayedDamage(rawMin),
    max: getMyuuDisplayedDamage(rawMax),
  };
}

function debounce(fn, delay) {
  let timer = null;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), delay);
  };
}

function generateRollMultipliers(minPercent, maxPercent) {
  const min = clamp(minPercent, 1, 100);
  const max = clamp(maxPercent, 1, 100);
  const start = Math.min(min, max);
  const end = Math.max(min, max);
  return Array.from({ length: Math.floor(end - start) + 1 }, (_, index) => (Math.floor(start) + index) / 100);
}

function normalBossDefense(base) {
  return Math.floor(((2 * base + 31) * 200) / 100) + 5;
}

function bossHpFromBase(baseHp) {
  return Math.max(1, (Number(baseHp) || 1) * 10000);
}

function average(values) {
  return values.length ? values.reduce((total, value) => total + value, 0) / values.length : 0;
}

export function normalizeGuardSplitOrder(order) {
  if (!Array.isArray(order)) return [];
  return order.filter((key) => GUARD_SPLITTER_KEYS.includes(key));
}

export function calculateQuickCalcGuardSplits(startingDef, startingSpd, splitters = []) {
  let currentDef = Math.max(1, Number(startingDef) || 1);
  let currentSpd = Math.max(1, Number(startingSpd) || 1);
  const steps = splitters.map((splitter, index) => {
    currentDef = Math.floor((currentDef + splitter.def) / 2);
    currentSpd = Math.floor((currentSpd + splitter.spd) / 2);
    return { index: index + 1, splitter, def: currentDef, spd: currentSpd };
  });
  return { finalDef: currentDef, finalSpd: currentSpd, steps };
}

function damageClass(move) {
  return move?.damage_class?.name || "physical";
}

function isPhysical(move) {
  return damageClass(move) !== "special";
}

export class QuickCalc {
  constructor(root, state) {
    this.root = root;
    this.state = state;
    this.bossQuery = "";
    this.attackerQuery = "";
    this.moveQuery = "";
    this.itemQuery = "";
    this.globalMoves = null;
    this.globalItems = null;
    this.status = "";
    this.sequence = 0;
    this.bound = false;
    this.renderTimer = null;
    this.resultsTimer = null;
    this.saveTimer = null;
    this.actionLocked = false;
    this.searchTokens = { attacker: 0, move: 0, item: 0 };
    this.cfg = this.defaultConfig();
    this.scheduleQuickCalc = debounce(() => this.renderResultsOnly(), 120);
    this.scheduleQuickCalcSave = debounce(() => this.saveCalc({ silent: true, rerender: false }), 400);
    setupSearchDropdownController(this.root);
    this.bind();
    this.render();
    this.bootstrap();
  }

  defaultConfig() {
    return {
      boss: null,
      attacker: null,
      move: null,
      level: 100,
      nature: "adamant",
      ability: "",
      item: "choice-band",
      teraType: "ghost",
      terastallized: false,
      atkIv: 31,
      atkEv: 252,
      spaIv: 31,
      spaEv: 0,
      atkStage: 0,
      spaStage: 0,
      critStage: 0,
      bossDefMultiplier: 7.8,
      bossSpdMultiplier: 7.8,
      manualBossDef: 3150,
      manualBossSpd: 3150,
      useManualDefense: false,
      guardSplitOrder: [],
      customGuardDef: 300,
      customGuardSpd: 300,
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
      customPowerEnabled: false,
      customPower: 250,
      critical: false,
      rollMode: "all",
      rollRangeMode: "standard",
      customRollMin: 70,
      customRollMax: 80,
      faintedAllies: 4,
      hitCount: 1,
      observedDamage: "",
      observedCrit: false,
      observedMayBeWrapped: false,
      reverseAssumption: "unknown",
      reverse: null,
    };
  }

  async bootstrap() {
    const sequence = ++this.sequence;
    if (await this.loadSavedCalc({ silent: true, rerender: false, sequence })) {
      if (sequence === this.sequence) this.render();
      return;
    }
    if (!this.cfg.boss && this.state.boss) await this.loadBossForSequence(this.state.boss.name, false, sequence);
    if (sequence !== this.sequence) return;
    if (!this.cfg.attacker) {
      const active = this.state.team.find((slot) => slot.pokemon) || null;
      if (active?.pokemon) {
        this.cfg.attacker = active.pokemon;
        this.cfg.level = active.level || 100;
        this.cfg.nature = active.nature || "adamant";
        this.cfg.ability = active.ability || active.pokemon.abilities?.[0]?.ability?.name || "";
        this.cfg.item = active.item || this.cfg.item;
        this.cfg.teraType = active.teraType || active.pokemon.types?.[0]?.type?.name || "normal";
        this.cfg.atkIv = active.ivs?.atk ?? 31;
        this.cfg.atkEv = active.evs?.atk ?? 252;
        this.cfg.spaIv = active.ivs?.spa ?? 31;
        this.cfg.spaEv = active.evs?.spa ?? 0;
        this.cfg.atkStage = active.stages?.atk ?? 0;
        this.cfg.spaStage = active.stages?.spa ?? 0;
        this.cfg.critStage = active.stages?.crit ?? 0;
        this.cfg.move = active.moves?.find(Boolean) || null;
      } else {
        await this.applyPreset("basculegion", false, sequence);
      }
    }
    if (sequence !== this.sequence) return;
    if (!this.cfg.boss) await this.loadBossForSequence("cobalion", false, sequence);
    if (sequence !== this.sequence) return;
    if (!this.cfg.move) await this.loadMoveForSequence("last-respects", false, sequence);
    if (sequence !== this.sequence) return;
    this.render();
  }

  async ensureGlobalMoves() {
    if (this.globalMoves) return this.globalMoves;
    const data = await getMoveIndex();
    this.globalMoves = data.results
      .map(({ name }) => name)
      .filter((name) => !["max-", "g-max-", "shadow-"].some((prefix) => name.startsWith(prefix)) && !name.endsWith("-z") && !name.includes("gmax"))
      .sort();
    return this.globalMoves;
  }

  async ensureGlobalItems() {
    if (this.globalItems) return this.globalItems;
    try {
      const data = await getItemIndex();
      this.globalItems = [...new Set([...CURATED_ITEMS, ...data.results.map(({ name }) => name)])];
    } catch {
      this.globalItems = CURATED_ITEMS;
    }
    return this.globalItems;
  }

  bossBases() {
    return this.cfg.boss ? baseStats(this.cfg.boss) : { hp: 1, atk: 1, def: 1, spa: 1, spd: 1, spe: 1 };
  }

  bossDefenseModel() {
    const bases = this.bossBases();
    const normalDef = normalBossDefense(bases.def);
    const normalSpd = normalBossDefense(bases.spd);
    const startingDef = this.cfg.useManualDefense ? Math.max(1, Number(this.cfg.manualBossDef) || 1) : Math.floor(normalDef * (Number(this.cfg.bossDefMultiplier) || 1));
    const startingSpd = this.cfg.useManualDefense ? Math.max(1, Number(this.cfg.manualBossSpd) || 1) : Math.floor(normalSpd * (Number(this.cfg.bossSpdMultiplier) || 1));
    const split = calculateQuickCalcGuardSplits(startingDef, startingSpd, this.guardChain());
    const log = [
      `Starting Boss Def/SpD: ${fmt(startingDef)} / ${fmt(startingSpd)}`,
      ...split.steps.map(({ index, splitter, def, spd }) => `${index}. ${splitter.name} split using ${fmt(splitter.def)} / ${fmt(splitter.spd)} \u2192 ${fmt(def)} / ${fmt(spd)}`),
    ];
    return { normalDef, normalSpd, startingDef, startingSpd, finalDef: split.finalDef, finalSpd: split.finalSpd, log };
  }

  guardChain() {
    return normalizeGuardSplitOrder(this.cfg.guardSplitOrder).map((key) => {
      if (key === CUSTOM_GUARD_SPLITTER) {
        return {
          key,
          name: "Custom",
          def: Math.max(1, Number(this.cfg.customGuardDef) || 1),
          spd: Math.max(1, Number(this.cfg.customGuardSpd) || 1),
        };
      }
      return { key, ...QUICK_CALC_GUARD_SPLIT_USERS[key] };
    }).filter(Boolean);
  }

  stageModel() {
    const screechDrop = this.cfg.screechCount * (this.cfg.simpleDefense ? -4 : -2);
    const defStage = clamp(Number(this.cfg.defenseStage) + screechDrop, -6, 6);
    const spdDrop = (Number(this.cfg.metalSoundCount) + Number(this.cfg.fakeTearsCount)) * (this.cfg.simpleSpd ? -4 : -2);
    const spdStage = clamp(Number(this.cfg.spdStage) + spdDrop, -6, 6);
    return {
      def: defStage,
      spd: spdStage,
      defDamageEquivalent: 1 / stageMultiplier(defStage),
      spdDamageEquivalent: 1 / stageMultiplier(spdStage),
    };
  }

  bossTypes() {
    return resolveQuickCalcBossTypes({
      bossTypes: this.cfg.boss?.types?.map(({ type }) => type.name) || [],
      manualTypesEnabled: this.cfg.manualTypesEnabled,
      manualType1: this.cfg.manualType1,
      manualType2: this.cfg.manualType2,
      magicPowder: this.cfg.magicPowder,
      soak: this.cfg.soak,
      trickOrTreat: this.cfg.trickOrTreat,
      forestsCurse: this.cfg.forestsCurse,
    });
  }

  attackerBuild() {
    const pokemon = this.cfg.attacker;
    const ivs = blankSpread(31);
    const evs = blankSpread(0);
    ivs.atk = clamp(this.cfg.atkIv, 0, 31);
    ivs.spa = clamp(this.cfg.spaIv, 0, 31);
    evs.atk = clamp(this.cfg.atkEv, 0, 252);
    evs.spa = clamp(this.cfg.spaEv, 0, 252);
    const build = {
      pokemon,
      level: clamp(this.cfg.level, 1, 100),
      nature: this.cfg.nature,
      ability: this.cfg.ability,
      item: this.cfg.item,
      teraType: this.cfg.teraType,
      ivs,
      evs,
      stages: { ...emptyStages(), atk: Number(this.cfg.atkStage) || 0, spa: Number(this.cfg.spaStage) || 0, crit: Number(this.cfg.critStage) || 0 },
      stats: {},
    };
    build.stats = pokemon ? calculatePokemonStats(pokemon, build) : { hp: 1, atk: 1, def: 1, spa: 1, spd: 1, spe: 1 };
    return build;
  }

  selectedMove() {
    if (!this.cfg.move) return null;
    const move = { ...this.cfg.move };
    if (move.name === "last-respects") {
      move.customPower = 50 + clamp(this.cfg.faintedAllies, 0, 5) * 50;
    } else if (this.cfg.customPowerEnabled) {
      move.customPower = Math.max(0, Number(this.cfg.customPower) || 0);
    } else {
      move.customPower = move.customPower ?? move.basePower ?? move.power ?? null;
    }
    return move;
  }

  rollRangeModel() {
    if (this.cfg.rollRangeMode === "myuu-test") {
      return {
        key: "myuu-test",
        label: "Myuu Test 70%-80%",
        min: MYUU_TEST_ROLL_MIN,
        max: MYUU_TEST_ROLL_MAX,
        multipliers: generateRollMultipliers(MYUU_TEST_ROLL_MIN, MYUU_TEST_ROLL_MAX),
      };
    }
    if (this.cfg.rollRangeMode === "custom") {
      const min = clamp(this.cfg.customRollMin, 1, 100);
      const max = clamp(this.cfg.customRollMax, 1, 100);
      const start = Math.min(min, max);
      const end = Math.max(min, max);
      return {
        key: "custom",
        label: `Custom ${fmt(start)}%-${fmt(end)}%`,
        min: start,
        max: end,
        multipliers: generateRollMultipliers(start, end),
      };
    }
    return {
      key: "standard",
      label: "Standard Pokemon 85%-100%",
      min: STANDARD_ROLL_MIN,
      max: STANDARD_ROLL_MAX,
      multipliers: generateRollMultipliers(STANDARD_ROLL_MIN, STANDARD_ROLL_MAX),
    };
  }

  applyRollRange(result, bossMaxHp) {
    const range = this.rollRangeModel();
    if (!result?.baseDamageBeforeModifier) return { ...result, rollRange: range };
    const rolls = range.multipliers.map((random) => Math.floor(
      result.baseDamageBeforeModifier
      * result.criticalModifier
      * random
      * result.stab
      * result.effectiveness
      * result.burnModifier
      * result.itemFinalModifier
      * result.otherModifiers
    ));
    return {
      ...result,
      rolls,
      min: rolls[0] ?? 0,
      max: rolls.at(-1) ?? 0,
      percent: [
        bossMaxHp ? ((rolls[0] ?? 0) / bossMaxHp) * 100 : 0,
        bossMaxHp ? ((rolls.at(-1) ?? 0) / bossMaxHp) * 100 : 0,
      ],
      rollRange: range,
    };
  }

  calculation() {
    const build = this.attackerBuild();
    const move = this.selectedMove();
    const defenses = this.bossDefenseModel();
    const stages = this.stageModel();
    const bases = this.bossBases();
    const boss = {
      stats: {
        hp: bossHpFromBase(bases.hp),
        atk: normalBossDefense(bases.atk),
        def: defenses.finalDef,
        spa: normalBossDefense(bases.spa),
        spd: defenses.finalSpd,
        spe: normalBossDefense(bases.spe),
      },
      maxHp: bossHpFromBase(bases.hp),
    };
    const payload = {
      attacker: build,
      boss,
      move,
      attackerTypes: build.pokemon?.types?.map(({ type }) => type.name) || [],
      bossTypes: this.bossTypes(),
      ability: this.cfg.ability,
      defenderAbility: "",
      defenderHP: boss.maxHp,
      defenderMaxHP: boss.maxHp,
      stages: build.stages,
      bossStages: { ...emptyStages(), def: stages.def, spd: stages.spd },
      critical: Boolean(this.cfg.critical),
      isTerastallized: Boolean(this.cfg.terastallized),
      teraType: this.cfg.teraType || "normal",
    };
    const result = this.applyRollRange(damageRolls(payload), boss.maxHp);
    return { build, move, boss, defenses, stages, payload, result };
  }

  reverseEstimate() {
    const observed = Math.max(0, Math.round(Number(this.cfg.observedDamage) || 0));
    if (!observed || !this.cfg.move || !this.cfg.attacker) return null;
    const calc = this.calculation();
    const physical = isPhysical(calc.move);
    const defenseKey = physical ? "def" : "spd";
    const normalDefense = physical ? calc.defenses.normalDef : calc.defenses.normalSpd;
    const stage = physical ? calc.stages.def : calc.stages.spd;
    const maxSearch = Math.max(100000, Math.ceil(normalDefense * 30));
    let best = null;
    const wrapped = Boolean(this.cfg.observedMayBeWrapped);

    const checkDefense = (defense) => {
      const safeDefense = Math.max(1, Math.min(maxSearch, Math.round(defense)));
      const bossStats = { ...calc.boss.stats, [defenseKey]: safeDefense };
      const result = this.applyRollRange(damageRolls({
        ...calc.payload,
        boss: { stats: bossStats, maxHp: calc.boss.maxHp },
        bossStages: { ...emptyStages(), [defenseKey]: stage },
        critical: Boolean(this.cfg.observedCrit),
      }), calc.boss.maxHp);
      const candidates = this.reverseCandidates(result.rolls, wrapped);
      candidates.forEach(({ damage, displayDamage, compareDamage, label }) => {
        const delta = Math.abs(compareDamage - observed);
        if (!best || delta < best.delta) {
          best = {
            defense: safeDefense,
            damage,
            displayDamage,
            label,
            delta,
            stagedDefense: applyStage(safeDefense, stage),
            observedMayBeWrapped: wrapped,
          };
        }
      });
      return Math.max(...candidates.map(({ damage }) => damage));
    };

    const searchAroundRawTarget = (rawTarget, scanRadius = 220) => {
      let low = 1;
      let high = maxSearch;
      while (low < high) {
        const mid = Math.floor((low + high) / 2);
        const damageAtMid = checkDefense(mid);
        if (damageAtMid > rawTarget) low = mid + 1;
        else high = mid;
      }

      const scanStart = Math.max(1, low - scanRadius);
      const scanEnd = Math.min(maxSearch, low + scanRadius);
      for (let defense = scanStart; defense <= scanEnd; defense += 1) {
        checkDefense(defense);
        if (best?.delta === 0 && this.cfg.reverseAssumption !== "unknown") break;
      }
    };

    if (wrapped) {
      const maxPossibleRaw = checkDefense(1);
      const targets = [];
      for (let target = observed; target <= maxPossibleRaw && targets.length < 16; target += MYUU_DAMAGE_CAP) {
        targets.push(target);
      }
      if (!targets.length) targets.push(observed);
      targets.forEach((target) => searchAroundRawTarget(target, 80));
    } else {
      searchAroundRawTarget(observed);
    }

    if (!best) return null;
    const original = this.invertGuardChain(best.defense, defenseKey);
    return {
      ...best,
      originalDefense: original,
      multiplier: normalDefense ? original / normalDefense : 0,
      defenseKind: physical ? "Def" : "SpD",
    };
  }

  reverseCandidates(rolls, wrapped = false) {
    const mapCandidate = (damage, label) => ({
      damage,
      displayDamage: getMyuuDisplayedDamage(damage),
      compareDamage: wrapped ? getMyuuDisplayedDamage(damage) : damage,
      label,
    });
    if (this.cfg.reverseAssumption === "min") return [mapCandidate(rolls[0], "min")];
    if (this.cfg.reverseAssumption === "max") return [mapCandidate(rolls.at(-1), "max")];
    if (this.cfg.reverseAssumption === "average") return [mapCandidate(Math.round(average(rolls)), "average")];
    return rolls.map((damage, index) => mapCandidate(damage, `roll ${index + 1}`));
  }

  invertGuardChain(finalDefense, defenseKey = "def") {
    let value = Number(finalDefense) || 1;
    [...this.guardChain()].reverse().forEach((user) => {
      value = Math.max(1, (value * 2) - user[defenseKey]);
    });
    return Math.round(value);
  }

  resultSummary(calc) {
    const stage = isPhysical(calc.move) ? Number(this.cfg.atkStage) || 0 : Number(this.cfg.spaStage) || 0;
    const stageText = stage === 0 ? "" : `${stage > 0 ? "+" : ""}${stage} `;
    const itemText = this.cfg.item ? `${titleCase(this.cfg.item)} ` : "";
    const abilityText = this.cfg.ability ? `${titleCase(this.cfg.ability)} ` : "";
    const movePower = calc.move?.customPower ?? calc.move?.basePower ?? calc.move?.power ?? "-";
    return `${stageText}${itemText}${abilityText}${displayName(this.cfg.attacker?.name || "Attacker")} using ${titleCase(calc.move?.name || "Move")} (${movePower} BP) vs Boss ${displayName(this.cfg.boss?.name || "Boss")}`;
  }

  resultText() {
    const calc = this.calculation();
    const displayed = getMyuuDisplayedDamageRange(calc.result.min, calc.result.max);
    const bossTypes = this.bossTypes();
    return [
      this.resultSummary(calc),
      "",
      `Roll Range: ${calc.result.rollRange?.label || this.rollRangeModel().label}`,
      `Effectiveness: ${effectivenessLabel(calc.result.effectiveness)}`,
      `Current Boss Type: ${bossTypes.map(titleCase).join(" / ") || "Unknown"}`,
      "",
      `Raw Damage: ${fmt(calc.result.min)} - ${fmt(calc.result.max)}`,
      `Myuu Displayed Damage: ${fmt(displayed.min)} - ${fmt(displayed.max)}`,
      "",
      `Myuu damage wraps after ${fmt(MYUU_DAMAGE_CAP)}.`,
      "Based on the selected damage roll range.",
    ].join("\n");
  }

  render() {
    clearTimeout(this.renderTimer);
    const calc = this.calculation();
    this.root.innerHTML = `
      <section class="quick-calc" aria-labelledby="quick-calc-title">
        <div class="workspace-heading quick-calc-heading">
          <div>
            <span class="eyebrow">Damage test bench</span>
            <h1 id="quick-calc-title">Quick Calc</h1>
            <p>Fast independent damage checks for raid setup chains, stat drops, type changes, and damage rolls.</p>
          </div>
          <div class="quick-calc-actions">
            <select data-preset aria-label="Apply preset">
              <option value="">Preset</option>
              ${Object.entries(QUICK_CALC_PRESETS).map(([key, preset]) => `<option value="${key}">${escapeHtml(preset.label)}</option>`).join("")}
            </select>
            <button type="button" class="button" data-save-calc>Save Quick Calc</button>
            <button type="button" class="button" data-reset-calc>Reset Quick Calc</button>
          </div>
        </div>

        <div class="quick-calc-grid">
          ${this.attackerPanel(calc)}
          ${this.bossPanel(calc)}
        </div>
        ${this.setupPanel(calc)}
        ${this.movePanel(calc)}
        ${this.resultsPanel(calc)}
        <span class="quick-calc-status" role="status">${escapeHtml(this.status)}</span>
      </section>`;
  }

  attackerPanel(calc) {
    const attacker = this.cfg.attacker;
    const abilities = attacker?.abilities?.map(({ ability }) => ability.name) || [];
    const types = attacker?.types?.map(({ type }) => type.name) || [];
    const physical = isPhysical(calc.move);
    const baseKey = physical ? "atk" : "spa";
    const stage = physical ? this.cfg.atkStage : this.cfg.spaStage;
    return `
      <section class="quick-card" aria-labelledby="quick-attacker-title">
        <div class="quick-card-title">
          <div><span class="eyebrow">Source</span><h2 id="quick-attacker-title">Attacker Panel</h2></div>
          ${attacker ? `<img src="${spriteUrl(attacker.name)}" data-fallback="${fallbackSprite(attacker)}" alt="${displayName(attacker.name)} sprite">` : ""}
        </div>
        <div class="quick-search">
          <label><span>Attacker Pokemon</span><input data-attacker-search value="${escapeHtml(this.attackerQuery || displayName(attacker?.name || ""))}" placeholder="Search attacker..." autocomplete="off" aria-expanded="false"></label>
          <div class="inline-results hidden" data-attacker-results></div>
        </div>
        ${attacker ? `<div class="type-row">${types.map((type) => `<span class="type-badge type-${type}">${type}</span>`).join("")}</div>` : ""}
        <div class="quick-fields four">
          <label><span>Level</span><input type="number" min="1" max="100" data-cfg="level" value="${this.cfg.level}"></label>
          <label><span>Nature</span><select data-cfg="nature">${Object.keys(NATURES).map((key) => `<option value="${key}" ${this.cfg.nature === key ? "selected" : ""}>${natureDropdownLabel(key)}</option>`).join("")}</select></label>
          <label><span>Ability</span><select data-cfg="ability">${[...new Set([this.cfg.ability, ...abilities].filter(Boolean))].map((name) => `<option value="${name}" ${this.cfg.ability === name ? "selected" : ""}>${titleCase(name)}</option>`).join("")}</select></label>
          <div class="quick-search quick-field-search"><label><span>Item</span><input data-item-search value="${escapeHtml(this.itemQuery || titleCase(this.cfg.item || ""))}" placeholder="Search item..." autocomplete="off" aria-expanded="false"></label>
            <div class="inline-results hidden" data-item-results></div>
          </div>
        </div>
        <div class="quick-fields four">
          <label><span>Atk IV</span><input type="number" min="0" max="31" data-cfg="atkIv" value="${this.cfg.atkIv}"></label>
          <label><span>Atk EV</span><input type="number" min="0" max="252" step="4" data-cfg="atkEv" value="${this.cfg.atkEv}"></label>
          <label><span>SpA IV</span><input type="number" min="0" max="31" data-cfg="spaIv" value="${this.cfg.spaIv}"></label>
          <label><span>SpA EV</span><input type="number" min="0" max="252" step="4" data-cfg="spaEv" value="${this.cfg.spaEv}"></label>
        </div>
        <div class="quick-fields five">
          <label><span>Atk stage</span><select data-cfg="atkStage">${this.stageOptions(this.cfg.atkStage)}</select></label>
          <label><span>SpA stage</span><select data-cfg="spaStage">${this.stageOptions(this.cfg.spaStage)}</select></label>
          <label><span>Crit stage</span><select data-cfg="critStage">${[0, 1, 2, 3, 4].map((value) => `<option value="${value}" ${Number(this.cfg.critStage) === value ? "selected" : ""}>+${value}</option>`).join("")}</select></label>
          <label><span>Tera Type</span><select data-cfg="teraType">${TYPES.map((type) => `<option value="${type}" ${this.cfg.teraType === type ? "selected" : ""}>${titleCase(type)}</option>`).join("")}</select></label>
          <label class="quick-check"><input type="checkbox" data-cfg-check="terastallized" ${this.cfg.terastallized ? "checked" : ""}><span>Terastallized</span></label>
        </div>
        <div class="quick-stat-strip">
          <div><span>${baseKey.toUpperCase()} before boosts</span><strong>${fmt(calc.build.stats[baseKey])}</strong></div>
          <div><span>After stage</span><strong>${fmt(applyStage(calc.build.stats[baseKey], stage))}</strong></div>
          <div><span>After ability/item</span><strong>${fmt(calc.result.attackStat || 0)}</strong></div>
        </div>
      </section>`;
  }

  bossPanel(calc) {
    const boss = this.cfg.boss;
    return `
      <section class="quick-card quick-boss-card" aria-labelledby="quick-boss-title">
        <h2 id="quick-boss-title" class="sr-only">Boss / Defender Panel</h2>
        <div class="quick-boss-showcase">
          ${boss
            ? `<img class="quick-boss-sprite-large" src="${spriteUrl(boss.name)}" data-fallback="${fallbackSprite(boss)}" alt="${displayName(boss.name)} sprite">`
            : `<div class="quick-boss-sprite-placeholder" aria-hidden="true">?</div>`}
          <p class="quick-boss-name">${escapeHtml(displayName(boss?.name || "Choose a boss"))}</p>
          <div class="quick-boss-selector-wrap quick-search">
            <label><span>Boss selector</span><input data-boss-search value="${escapeHtml(this.bossQuery || displayName(boss?.name || ""))}" placeholder="Search raid boss..." autocomplete="off" aria-expanded="false"></label>
            <div class="inline-results hidden" data-boss-results></div>
          </div>
        </div>
      </section>`;
  }

  setupPanel(calc) {
    const guardChain = this.guardChain();
    const availableGuardSplitters = Object.keys(QUICK_CALC_GUARD_SPLIT_USERS);
    return `
      <section class="quick-card quick-wide" aria-labelledby="quick-setup-title">
        <div class="quick-card-title compact"><div><span class="eyebrow">Raid modifiers</span><h2 id="quick-setup-title">Myuu Raid Setup</h2></div></div>
        <div class="quick-setup-grid">
          <div class="quick-subpanel">
            <h3>Guard Split Order</h3>
            <p class="quick-guard-help">Add each splitter, then use the controls to set the exact sequential order.</p>
            <div class="quick-guard-add">
              <label><span>Add splitter</span><select data-guard-add-select>
                ${availableGuardSplitters.map((key) => `<option value="${key}">${QUICK_CALC_GUARD_SPLIT_USERS[key].name}</option>`).join("")}
              </select></label>
              <button type="button" class="button" data-add-guard>Add to chain</button>
            </div>
            ${guardChain.length ? `<ol class="quick-guard-chain" aria-label="Selected Guard Split order">
              ${guardChain.map((user, index) => `<li data-guard-row="${index}">
                <span class="quick-guard-position" aria-hidden="true">${index + 1}</span>
                <span class="quick-guard-name"><strong>${escapeHtml(user.name)}</strong></span>
                <span class="quick-guard-actions">
                  <button type="button" data-move-guard="${index}" data-guard-direction="up" aria-label="Move ${escapeHtml(user.name)} up" title="Move up" ${index === 0 ? "disabled" : ""}>\u2191</button>
                  <button type="button" data-move-guard="${index}" data-guard-direction="down" aria-label="Move ${escapeHtml(user.name)} down" title="Move down" ${index === guardChain.length - 1 ? "disabled" : ""}>\u2193</button>
                  <button type="button" class="quick-guard-remove" data-remove-guard="${index}" aria-label="Remove ${escapeHtml(user.name)} from Guard Split order">Remove</button>
                </span>
              </li>`).join("")}
            </ol>` : `<p class="quick-guard-empty">No Guard Split users added.</p>`}
            <div class="quick-log"><strong>${guardChain.length ? `Guard Split chain applied: ${guardChain.map((user) => escapeHtml(user.name)).join(" → ")}` : "No Guard Split chain applied."}</strong></div>
          </div>
          <div class="quick-subpanel">
            <h3>Screech / Defense Drops</h3>
            <div class="quick-fields three">
              <label><span>Screech count</span><select data-cfg="screechCount">${[0, 1, 2, 3].map((value) => `<option value="${value}" ${Number(this.cfg.screechCount) === value ? "selected" : ""}>${value}</option>`).join("")}</select></label>
              <label><span>Defense stage</span><select data-cfg="defenseStage">${this.stageOptions(this.cfg.defenseStage)}</select></label>
              <label class="quick-check"><input type="checkbox" data-cfg-check="simpleDefense" ${this.cfg.simpleDefense ? "checked" : ""}><span>Simple Beam applied</span></label>
            </div>
            <h3>Special Defense Drops</h3>
            <div class="quick-fields four">
              <label><span>Metal Sound</span><select data-cfg="metalSoundCount">${[0, 1, 2, 3].map((value) => `<option value="${value}" ${Number(this.cfg.metalSoundCount) === value ? "selected" : ""}>${value}</option>`).join("")}</select></label>
              <label><span>Fake Tears</span><select data-cfg="fakeTearsCount">${[0, 1, 2, 3].map((value) => `<option value="${value}" ${Number(this.cfg.fakeTearsCount) === value ? "selected" : ""}>${value}</option>`).join("")}</select></label>
              <label><span>SpD stage</span><select data-cfg="spdStage">${this.stageOptions(this.cfg.spdStage)}</select></label>
              <label class="quick-check"><input type="checkbox" data-cfg-check="simpleSpd" ${this.cfg.simpleSpd ? "checked" : ""}><span>Simple Beam applied</span></label>
            </div>
          </div>
          <div class="quick-subpanel">
            <h3>Type Change Moves</h3>
            <div class="quick-toggle-grid">
              <label class="quick-check"><input type="checkbox" data-cfg-check="magicPowder" ${this.cfg.magicPowder ? "checked" : ""}><span>Magic Powder</span></label>
              <label class="quick-check"><input type="checkbox" data-cfg-check="trickOrTreat" ${this.cfg.trickOrTreat ? "checked" : ""}><span>Trick-or-Treat</span></label>
              <label class="quick-check"><input type="checkbox" data-cfg-check="forestsCurse" ${this.cfg.forestsCurse ? "checked" : ""}><span>Forest's Curse</span></label>
              <label class="quick-check"><input type="checkbox" data-cfg-check="soak" ${this.cfg.soak ? "checked" : ""}><span>Soak</span></label>
              <label class="quick-check"><input type="checkbox" data-cfg-check="manualTypesEnabled" ${this.cfg.manualTypesEnabled ? "checked" : ""}><span>Manual boss type editor</span></label>
            </div>
            <div class="quick-fields two">
              <label><span>Manual type 1</span><select data-cfg="manualType1">${TYPES.map((type) => `<option value="${type}" ${this.cfg.manualType1 === type ? "selected" : ""}>${titleCase(type)}</option>`).join("")}</select></label>
              <label><span>Manual type 2</span><select data-cfg="manualType2"><option value="">None</option>${TYPES.map((type) => `<option value="${type}" ${this.cfg.manualType2 === type ? "selected" : ""}>${titleCase(type)}</option>`).join("")}</select></label>
            </div>
          </div>
        </div>
      </section>`;
  }

  movePanel(calc) {
    const move = calc.move;
    const range = this.rollRangeModel();
    const customDisabled = this.cfg.rollRangeMode === "custom" ? "" : "disabled";
    return `
      <section class="quick-card quick-wide" aria-labelledby="quick-move-title">
        <div class="quick-card-title compact"><div><span class="eyebrow">Move and options</span><h2 id="quick-move-title">Move + Damage Options</h2></div></div>
        <div class="quick-move-grid">
          <div class="quick-search">
            <label><span>Move</span><input data-move-search value="${escapeHtml(this.moveQuery || titleCase(move?.name || ""))}" placeholder="Search move..." autocomplete="off" aria-expanded="false"></label>
            <div class="inline-results hidden" data-move-results></div>
          </div>
          <div class="quick-stat-strip">
            <div><span>Category</span><strong>${titleCase(move?.damage_class?.name || "status")}</strong></div>
            <div><span>Type</span><strong>${titleCase(move?.type?.name || "-")}</strong></div>
            <div><span>Base power</span><strong>${move?.basePower ?? move?.power ?? "-"}</strong></div>
            <div><span>Used power</span><strong>${move?.customPower ?? "-"}</strong></div>
          </div>
          <div class="quick-fields four">
            <label class="quick-check"><input type="checkbox" data-cfg-check="customPowerEnabled" ${this.cfg.customPowerEnabled ? "checked" : ""}><span>Custom power override</span></label>
            <label><span>Custom power</span><input type="number" min="0" max="9999" data-cfg="customPower" value="${this.cfg.customPower}"></label>
            <label class="quick-check"><input type="checkbox" data-cfg-check="critical" ${this.cfg.critical ? "checked" : ""}><span>Critical hit</span></label>
            <label><span>Hits</span><input type="number" min="1" max="5" data-cfg="hitCount" value="${this.cfg.hitCount}"></label>
          </div>
          <div class="quick-fields three">
            <label><span>Damage Roll Mode</span><select data-cfg="rollRangeMode">
              <option value="standard" ${this.cfg.rollRangeMode === "standard" ? "selected" : ""}>Standard Pokemon 85%-100%</option>
              <option value="myuu-test" ${this.cfg.rollRangeMode === "myuu-test" ? "selected" : ""}>Myuu Test 70%-80%</option>
              <option value="custom" ${this.cfg.rollRangeMode === "custom" ? "selected" : ""}>Custom</option>
            </select></label>
            <label><span>Custom roll min %</span><input type="number" min="1" max="100" data-cfg="customRollMin" value="${this.cfg.customRollMin}" ${customDisabled}></label>
            <label><span>Custom roll max %</span><input type="number" min="1" max="100" data-cfg="customRollMax" value="${this.cfg.customRollMax}" ${customDisabled}></label>
          </div>
          <div class="quick-fields two">
            <label><span>Fainted allies count</span><input type="number" min="0" max="5" data-cfg="faintedAllies" value="${this.cfg.faintedAllies}"></label>
            <p class="quick-guard-help">Set the number of fainted allies for the selected move.</p>
          </div>
        </div>
      </section>`;
  }

  resultsPanel(calc) {
    const displayed = getMyuuDisplayedDamageRange(calc.result.min, calc.result.max);
    const summary = this.resultSummary(calc);
    const bossTypes = this.bossTypes();
    return `
      <section class="quick-card quick-wide" data-quick-results aria-labelledby="quick-result-title">
        <div class="quick-card-title compact">
          <div><span class="eyebrow">Output</span><h2 id="quick-result-title">Damage Results</h2></div>
          <div class="quick-result-actions">
            <button type="button" class="button" data-copy-result>Copy Result</button>
          </div>
        </div>
        <div class="quick-result-layout">
          <div class="quick-main-result">
            <p class="quick-summary-line">${escapeHtml(summary)}</p>
            <p class="quick-roll-range-line"><span>Roll Range</span><strong>${escapeHtml(calc.result.rollRange?.label || this.rollRangeModel().label)}</strong></p>
            <div class="quick-type-effectiveness" aria-label="Current type effectiveness">
              <div><span>Effectiveness</span><strong>${effectivenessLabel(calc.result.effectiveness)}</strong></div>
              <div><span>Current Boss Type</span><div class="type-row">${bossTypes.map((type) => `<span class="type-badge type-${type}">${escapeHtml(type)}</span>`).join("") || "<em>Unknown</em>"}</div></div>
            </div>
            <div class="quick-simple-results">
              <div><span>Raw Damage</span><strong>${fmt(calc.result.min)} - ${fmt(calc.result.max)}</strong></div>
              <div class="myuu-range"><span>Myuu Displayed Damage</span><strong>${fmt(displayed.min)} - ${fmt(displayed.max)}</strong></div>
            </div>
          </div>
        </div>
      </section>`;
  }

  selectedRolls(rolls) {
    if (this.cfg.rollMode === "min") return [0];
    if (this.cfg.rollMode === "max") return [rolls.length - 1];
    if (this.cfg.rollMode === "average") return [7, 8];
    return rolls.map((_, index) => index);
  }

  stageOptions(selected) {
    return Array.from({ length: 13 }, (_, index) => index - 6)
      .map((value) => `<option value="${value}" ${Number(selected) === value ? "selected" : ""}>${value > 0 ? "+" : ""}${value}</option>`)
      .join("");
  }

  bind() {
    if (this.bound) return;
    this.bound = true;

    this.root.addEventListener("input", (event) => {
      const field = event.target;
      if (field.matches("[data-cfg]")) {
        this.updateConfigField(field);
        this.scheduleQuickCalcSave();
        if (field.dataset.cfg !== "observedDamage") this.scheduleQuickCalc();
      } else if (field.matches("[data-boss-search]")) {
        this.updateBossResults(field);
      } else if (field.matches("[data-attacker-search]")) {
        this.updateAttackerResults(field);
      } else if (field.matches("[data-move-search]")) {
        this.updateMoveResults(field);
      } else if (field.matches("[data-item-search]")) {
        this.updateItemResults(field);
      }
    });

    this.root.addEventListener("focusin", (event) => {
      const field = event.target;
      if (field.matches("[data-boss-search]")) this.updateBossResults(field);
      else if (field.matches("[data-attacker-search]")) this.updateAttackerResults(field);
      else if (field.matches("[data-move-search]")) this.updateMoveResults(field);
      else if (field.matches("[data-item-search]")) this.updateItemResults(field);
    });

    this.root.addEventListener("change", (event) => {
      const field = event.target;
      if (field.matches("[data-cfg]")) {
        this.updateConfigField(field);
        this.scheduleQuickCalcSave();
        if (field.type === "number") this.normalizeConfigField(field);
        if (field.type === "number" || field.dataset.cfg === "observedDamage") this.renderResultsOnly();
        else this.render();
      } else if (field.matches("[data-cfg-check]")) {
        this.cfg[field.dataset.cfgCheck] = field.checked;
        this.cfg.reverse = null;
        this.scheduleQuickCalcSave();
        this.render();
      } else if (field.matches("[data-preset]") && field.value) {
        this.applyPreset(field.value);
      } else if (field.matches("[data-boss-search]")) {
        const name = slug(field.value);
        if (name && !BOSSES.includes(name)) this.loadBoss(name);
      } else if (field.matches("[data-attacker-search]")) {
        const name = slug(field.value);
        if (name) this.loadAttacker(name);
      } else if (field.matches("[data-move-search]")) {
        const name = slug(field.value);
        if (name) this.loadMove(name);
      } else if (field.matches("[data-item-search]")) {
        this.cfg.item = slug(field.value);
        this.itemQuery = "";
        this.cfg.reverse = null;
        this.scheduleQuickCalcSave();
        this.render();
      }
    });

    this.root.addEventListener("blur", (event) => {
      const field = event.target;
      if (field.matches("[data-cfg]") && field.type === "number") {
        this.normalizeConfigField(field);
        this.scheduleQuickCalcSave();
        this.render();
      }
    }, true);

    this.root.addEventListener("click", (event) => {
      const button = event.target.closest("button");
      if (!button || !this.root.contains(button)) return;

      if (button.matches("[data-pick-boss]")) this.loadBoss(button.dataset.pickBoss);
      else if (button.matches("[data-pick-attacker]")) this.loadAttacker(button.dataset.pickAttacker);
      else if (button.matches("[data-pick-move]")) this.loadMove(button.dataset.pickMove);
      else if (button.matches("[data-add-guard]")) {
        const select = this.root.querySelector("[data-guard-add-select]");
        this.addGuardSplitter(select?.value);
      }
      else if (button.matches("[data-move-guard]")) this.moveGuardSplitter(Number(button.dataset.moveGuard), button.dataset.guardDirection);
      else if (button.matches("[data-remove-guard]")) this.removeGuardSplitter(Number(button.dataset.removeGuard));
      else if (button.matches("[data-pick-item]")) {
        this.cfg.item = button.dataset.pickItem;
        this.itemQuery = "";
        this.cfg.reverse = null;
        this.scheduleQuickCalcSave();
        this.render();
      } else if (button.matches("[data-save-calc]")) this.withActionLock(() => this.saveCalc());
      else if (button.matches("[data-reset-calc]")) this.withActionLock(async () => {
        localStorage.removeItem(STORAGE_KEY);
        this.cfg = this.defaultConfig();
        this.status = "Quick Calc reset";
        await this.bootstrap();
      });
      else if (button.matches("[data-copy-result]")) this.withActionLock(async () => {
        await copyText(this.resultText());
        this.status = "Result copied";
        this.render();
      });
      else if (button.matches("[data-export-json]")) this.withActionLock(async () => {
        await copyText(JSON.stringify(this.exportData(), null, 2));
        this.status = "Quick Calc JSON copied";
        this.render();
      });
      else if (button.matches("[data-import-json]")) this.withActionLock(() => this.importFromPrompt());
      else if (button.matches("[data-estimate-defense]")) this.withActionLock(() => {
        this.cfg.reverse = this.reverseEstimate();
        this.status = this.cfg.reverse ? "Reverse estimate updated" : "Enter observed damage before estimating";
        this.scheduleQuickCalcSave();
        this.render();
      });
    });

    this.root.addEventListener("error", (event) => {
      const img = event.target;
      if (img instanceof HTMLImageElement && img.dataset.fallback && img.src !== img.dataset.fallback) {
        img.src = img.dataset.fallback;
      }
    }, true);
  }

  updateConfigField(field) {
    this.cfg[field.dataset.cfg] = field.value;
    this.cfg.reverse = null;
  }

  commitGuardSplitOrder(message) {
    this.cfg.guardSplitOrder = normalizeGuardSplitOrder(this.cfg.guardSplitOrder);
    this.cfg.reverse = null;
    this.status = message;
    this.scheduleQuickCalcSave();
    this.render();
  }

  addGuardSplitter(key) {
    if (!GUARD_SPLITTER_KEYS.includes(key)) return;
    this.cfg.guardSplitOrder = [...this.cfg.guardSplitOrder, key];
    const name = key === CUSTOM_GUARD_SPLITTER ? "Custom" : QUICK_CALC_GUARD_SPLIT_USERS[key].name;
    this.commitGuardSplitOrder(`${name} added to Guard Split order`);
  }

  removeGuardSplitter(index) {
    if (!Number.isInteger(index) || index < 0 || index >= this.cfg.guardSplitOrder.length) return;
    const [key] = this.cfg.guardSplitOrder.splice(index, 1);
    const name = key === CUSTOM_GUARD_SPLITTER ? "Custom" : QUICK_CALC_GUARD_SPLIT_USERS[key]?.name;
    this.commitGuardSplitOrder(`${name || "Splitter"} removed from Guard Split order`);
  }

  moveGuardSplitter(index, direction) {
    const order = [...this.cfg.guardSplitOrder];
    const nextIndex = direction === "up" ? index - 1 : index + 1;
    if (!Number.isInteger(index) || index < 0 || nextIndex < 0 || nextIndex >= order.length) return;
    [order[index], order[nextIndex]] = [order[nextIndex], order[index]];
    this.cfg.guardSplitOrder = order;
    const key = order[nextIndex];
    const name = key === CUSTOM_GUARD_SPLITTER ? "Custom" : QUICK_CALC_GUARD_SPLIT_USERS[key]?.name;
    this.commitGuardSplitOrder(`${name || "Splitter"} moved ${direction}`);
  }

  normalizeConfigField(field) {
    const key = field.dataset.cfg;
    if (!key || field.type !== "number") return;
    if (field.value === "" && key === "observedDamage") {
      this.cfg[key] = "";
      return;
    }
    const defaults = this.defaultConfig();
    const min = field.min === "" ? Number.NEGATIVE_INFINITY : Number(field.min);
    const max = field.max === "" ? Number.POSITIVE_INFINITY : Number(field.max);
    const step = field.step && field.step !== "any" ? Number(field.step) : 0;
    let value = Number(field.value);
    if (!Number.isFinite(value)) value = Number(defaults[key] ?? (Number.isFinite(min) ? min : 0));
    value = Math.max(min, Math.min(max, value));
    if (step >= 1) {
      const base = Number.isFinite(min) ? min : 0;
      value = base + Math.round((value - base) / step) * step;
      value = Math.max(min, Math.min(max, value));
    }
    this.cfg[key] = value;
    if (key === "customRollMin" && value > Number(this.cfg.customRollMax || 0)) {
      this.cfg.customRollMax = value;
      const maxField = this.root.querySelector("[data-cfg='customRollMax']");
      if (maxField) maxField.value = String(value);
    } else if (key === "customRollMax" && value < Number(this.cfg.customRollMin || 0)) {
      this.cfg.customRollMin = value;
      const minField = this.root.querySelector("[data-cfg='customRollMin']");
      if (minField) minField.value = String(value);
    }
    field.value = String(value);
  }

  scheduleRender(delay = 140) {
    clearTimeout(this.renderTimer);
    this.renderTimer = setTimeout(() => this.render(), delay);
  }

  renderResultsOnly() {
    clearTimeout(this.resultsTimer);
    const currentResults = this.root.querySelector("[data-quick-results]");
    if (!currentResults) return;
    const calc = this.calculation();
    const wrapper = document.createElement("div");
    wrapper.innerHTML = this.resultsPanel(calc).trim();
    currentResults.replaceWith(wrapper.firstElementChild);
  }

  async withActionLock(action) {
    if (this.actionLocked) return;
    this.actionLocked = true;
    try {
      await action();
    } finally {
      this.actionLocked = false;
    }
  }

  updateBossResults(input) {
    this.bossQuery = input.value;
    const results = this.root.querySelector("[data-boss-results]");
    if (!results) return;
    const matches = this.bossQuery.trim() ? searchBosses(this.bossQuery, 14) : BOSSES.slice(0, 14);
    openSearchDropdown(input, results);
    results.innerHTML = matches.map((name) => `<button type="button" data-pick-boss="${name}">${displayName(name)}</button>`).join("")
      || `<p>No listed boss found. Try a Pokedex slug.</p>`;
  }

  async updateAttackerResults(input) {
    this.attackerQuery = input.value;
    const results = this.root.querySelector("[data-attacker-results]");
    if (!results) return;
    const token = ++this.searchTokens.attacker;
    openSearchDropdown(input, results);
    if (this.attackerQuery.trim().length < 2) {
      results.innerHTML = "<p>Type at least two characters.</p>";
      return;
    }
    results.innerHTML = "<p>Searching...</p>";
    try {
      const matches = await searchPokemon(this.attackerQuery, 14);
      if (token !== this.searchTokens.attacker) return;
      results.innerHTML = matches.map(({ name }) => `<button type="button" data-pick-attacker="${name}">${displayName(name)}</button>`).join("") || "<p>No Pokemon found.</p>";
    } catch {
      if (token === this.searchTokens.attacker) results.innerHTML = "<p>Search unavailable.</p>";
    }
  }

  async updateMoveResults(input) {
    this.moveQuery = input.value;
    const results = this.root.querySelector("[data-move-results]");
    if (!results) return;
    const token = ++this.searchTokens.move;
    openSearchDropdown(input, results);
    results.innerHTML = "<p>Loading moves...</p>";
    const moves = await this.ensureGlobalMoves();
    if (token !== this.searchTokens.move) return;
    const query = slug(this.moveQuery);
    const matches = query
      ? moves.filter((name) => name.includes(query)).slice(0, 14)
      : [...new Set([...RAID_MOVES, ...moves])].slice(0, 14);
    results.innerHTML = matches.map((name) => `<button type="button" data-pick-move="${name}">${titleCase(name)}${RAID_MOVES.includes(name) ? "<small>Raid pick</small>" : ""}</button>`).join("") || "<p>No move found.</p>";
  }

  async updateItemResults(input) {
    this.itemQuery = input.value;
    const results = this.root.querySelector("[data-item-results]");
    if (!results) return;
    const token = ++this.searchTokens.item;
    openSearchDropdown(input, results);
    const items = await this.ensureGlobalItems();
    if (token !== this.searchTokens.item) return;
    const query = slug(this.itemQuery);
    const matches = query
      ? items.filter((name) => name.includes(query)).slice(0, 14)
      : CURATED_ITEMS.slice(0, 14);
    results.innerHTML = matches.map((name) => `<button type="button" data-pick-item="${name}">${titleCase(name)}${CURATED_ITEMS.includes(name) ? "<small>Raid item</small>" : ""}</button>`).join("") || "<p>No item found.</p>";
  }

  async loadBoss(name, rerender = true) {
    const sequence = rerender ? ++this.sequence : null;
    return this.loadBossForSequence(name, rerender, sequence);
  }

  async loadBossForSequence(name, rerender = true, sequence = null) {
    try {
      const pokemon = await getPokemon(name);
      if (sequence !== null && sequence !== this.sequence) return;
      this.cfg.boss = pokemon;
      const bases = this.bossBases();
      this.cfg.manualBossDef = Math.floor(normalBossDefense(bases.def) * this.cfg.bossDefMultiplier);
      this.cfg.manualBossSpd = Math.floor(normalBossDefense(bases.spd) * this.cfg.bossSpdMultiplier);
      this.cfg.manualType1 = this.cfg.boss.types?.[0]?.type?.name || "normal";
      this.cfg.manualType2 = this.cfg.boss.types?.[1]?.type?.name || "";
      this.bossQuery = "";
      this.cfg.reverse = null;
      this.status = `Loaded boss ${displayName(this.cfg.boss.name)}`;
    } catch (error) {
      this.status = `Could not load boss: ${error.message}`;
    }
    if (rerender) {
      this.scheduleQuickCalcSave();
      this.render();
    }
  }

  async loadAttacker(name, rerender = true) {
    const sequence = rerender ? ++this.sequence : null;
    return this.loadAttackerForSequence(name, rerender, sequence);
  }

  async loadAttackerForSequence(name, rerender = true, sequence = null) {
    try {
      const pokemon = await getPokemon(name);
      if (sequence !== null && sequence !== this.sequence) return;
      this.cfg.attacker = pokemon;
      this.cfg.ability = this.cfg.attacker.abilities?.[0]?.ability?.name || "";
      this.cfg.teraType = this.cfg.attacker.types?.[0]?.type?.name || "normal";
      this.attackerQuery = "";
      this.cfg.reverse = null;
      this.status = `Loaded attacker ${displayName(this.cfg.attacker.name)}`;
    } catch (error) {
      this.status = `Could not load attacker: ${error.message}`;
    }
    if (rerender) {
      this.scheduleQuickCalcSave();
      this.render();
    }
  }

  async loadMove(name, rerender = true) {
    const sequence = rerender ? ++this.sequence : null;
    return this.loadMoveForSequence(name, rerender, sequence);
  }

  async loadMoveForSequence(name, rerender = true, sequence = null) {
    try {
      const move = prepareMove(await getMove(name));
      if (sequence !== null && sequence !== this.sequence) return;
      this.cfg.move = move;
      if (damageClass(this.cfg.move) === "special") {
        this.cfg.nature = "modest";
        this.cfg.spaEv = Math.max(this.cfg.spaEv, 252);
      } else if (damageClass(this.cfg.move) === "physical") {
        this.cfg.nature = "adamant";
        this.cfg.atkEv = Math.max(this.cfg.atkEv, 252);
      }
      this.moveQuery = "";
      this.cfg.reverse = null;
      this.status = `Loaded move ${titleCase(this.cfg.move.name)}`;
    } catch (error) {
      this.status = `Could not load move: ${error.message}`;
    }
    if (rerender) {
      this.scheduleQuickCalcSave();
      this.render();
    }
  }

  async applyPreset(key, rerender = true, existingSequence = null) {
    const preset = QUICK_CALC_PRESETS[key];
    if (!preset) return;
    const sequence = existingSequence ?? ++this.sequence;
    if (preset.boss) await this.loadBossForSequence(preset.boss, false, sequence);
    if (sequence !== this.sequence) return;
    if (preset.attacker) await this.loadAttackerForSequence(preset.attacker, false, sequence);
    if (sequence !== this.sequence) return;
    if (preset.move) await this.loadMoveForSequence(preset.move, false, sequence);
    if (sequence !== this.sequence) return;
    Object.entries(preset).forEach(([field, value]) => {
      if (!["label", "boss", "attacker", "move"].includes(field)) this.cfg[field] = Array.isArray(value) ? [...value] : value;
    });
    this.cfg.guardSplitOrder = normalizeGuardSplitOrder(this.cfg.guardSplitOrder);
    this.cfg.reverse = null;
    this.status = `Applied preset: ${preset.label}`;
    if (rerender) {
      this.scheduleQuickCalcSave();
      this.render();
    }
  }

  exportData() {
    return {
      version: 3,
      config: {
        ...this.cfg,
        boss: this.cfg.boss?.name || null,
        attacker: this.cfg.attacker?.name || null,
        move: this.cfg.move?.name || null,
        reverse: null,
      },
      result: this.resultText(),
    };
  }

  async saveCalc({ silent = false, rerender = true } = {}) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(this.exportData()));
    if (!silent) this.status = "Quick Calc saved";
    if (rerender && !silent) this.render();
  }

  async loadSavedCalc({ silent = false, rerender = true, sequence = null } = {}) {
    try {
      const raw = localStorage.getItem(STORAGE_KEY) || localStorage.getItem(LEGACY_STORAGE_KEY);
      const saved = JSON.parse(raw || "null");
      if (!saved?.config) throw new Error("No saved calc");
      const { boss, attacker, move, guardUsers, customGuardEnabled, ...rest } = saved.config;
      const legacyOrder = Array.isArray(guardUsers) ? guardUsers : [];
      const savedOrder = Array.isArray(rest.guardSplitOrder) ? [...rest.guardSplitOrder] : [...legacyOrder];
      if (!Array.isArray(rest.guardSplitOrder) && customGuardEnabled) savedOrder.push(CUSTOM_GUARD_SPLITTER);
      this.cfg = { ...this.defaultConfig(), ...rest, guardSplitOrder: normalizeGuardSplitOrder(savedOrder) };
      const loadSequence = sequence ?? ++this.sequence;
      if (boss) await this.loadBossForSequence(boss, false, loadSequence);
      if (loadSequence !== this.sequence) return false;
      if (attacker) await this.loadAttackerForSequence(attacker, false, loadSequence);
      if (loadSequence !== this.sequence) return false;
      if (move) await this.loadMoveForSequence(move, false, loadSequence);
      if (loadSequence !== this.sequence) return false;
      Object.assign(this.cfg, rest, { guardSplitOrder: normalizeGuardSplitOrder(savedOrder), reverse: null });
      if (!silent) this.status = "Quick Calc loaded";
      if (rerender) this.render();
      return true;
    } catch (error) {
      if (!silent) this.status = `Load failed: ${error.message}`;
      if (rerender && !silent) this.render();
      return false;
    }
  }

  async importFromPrompt() {
    const text = prompt("Paste exported Quick Calc JSON:");
    if (!text) return;
    try {
      const data = JSON.parse(text);
      if (!data?.config) throw new Error("Missing Quick Calc config");
      localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
      await this.loadSavedCalc({ silent: true, rerender: false });
      this.status = "Quick Calc JSON imported";
      this.render();
    } catch (error) {
      this.status = `Import failed: ${error.message}`;
      this.render();
    }
  }
}
