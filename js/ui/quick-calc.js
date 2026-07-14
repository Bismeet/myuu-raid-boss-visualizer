import { getItemIndex, getMove, getMoveIndex, getPokemon, searchPokemon } from "../api/pokeapi.js";
import { BOSSES, searchBosses } from "../data/bosses.js";
import { NATURES, natureDropdownLabel } from "../data/natures.js";
import { applyStage, emptyStages, resolveDynamicMovePower } from "../core/stages.js";
import { calculatePokemonStats } from "../core/stats.js";
import { POKEMON_TYPES, resolveAttackerTypes, resolveDefenderTypes, resolveMoveType, withMoveType } from "../core/type-mechanics.js";
import { typeEffectiveness } from "../data/type-chart.js";
import { displayName, fallbackSprite, spriteUrl, titleCase } from "../utils/format.js";
import { openSearchDropdown, setupSearchDropdownController } from "./search-dropdown.js";

const TYPES = POKEMON_TYPES;
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
  custom: { name: "Custom", def: 300, spd: 300 },
};
const GUARD_SPLITTER_KEYS = Object.keys(QUICK_CALC_GUARD_SPLIT_USERS);

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
  return resolveDefenderTypes(bossTypes, {
    manualTypesEnabled, manualType1, manualType2, magicPowder, soak, trickOrTreat, forestsCurse,
  });
}

export function defaultQuickCalcSplitterStats() {
  return Object.fromEntries(Object.entries(QUICK_CALC_GUARD_SPLIT_USERS).map(([key, splitter]) => [
    key,
    { def: splitter.def, spd: splitter.spd },
  ]));
}

export function normalizeGuardSplitOrder(order) {
  if (!Array.isArray(order)) return [];
  return order.slice(0, 10).filter((key) => GUARD_SPLITTER_KEYS.includes(key));
}

function normalizeSplitterStat(value, fallback) {
  if (value === "" || value === null || value === undefined) return fallback;
  const numericValue = Number(value);
  if (!Number.isFinite(numericValue)) return fallback;
  return Math.max(1, Math.min(999, Math.round(numericValue)));
}

export function normalizeQuickCalcSplitterStats(splitterStats = {}) {
  return Object.fromEntries(Object.entries(QUICK_CALC_GUARD_SPLIT_USERS).map(([key, defaults]) => [
    key,
    {
      def: normalizeSplitterStat(splitterStats?.[key]?.def, defaults.def),
      spd: normalizeSplitterStat(splitterStats?.[key]?.spd, defaults.spd),
    },
  ]));
}

export function resolveQuickCalcGuardChain(order, splitterStats = {}) {
  const normalizedStats = normalizeQuickCalcSplitterStats(splitterStats);
  return normalizeGuardSplitOrder(order).map((key) => ({
    key,
    name: QUICK_CALC_GUARD_SPLIT_USERS[key].name,
    def: normalizedStats[key].def,
    spd: normalizedStats[key].spd,
  }));
}

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
const prepareMove = (move) => move ? { ...move, basePower: move.power ?? null, customPower: move.power ?? null } : null;
const blankSpread = (value) => ({ hp: value, atk: value, def: value, spa: value, spd: value, spe: value });

function debounce(fn, delay) {
  let timer = null;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), delay);
  };
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
    try {
      localStorage.removeItem("myuu-raid-quick-calc-state");
      localStorage.removeItem("myuu.quickCalc.saved");
    } catch {
      // Storage may be unavailable; no Quick Calc state is persisted anymore.
    }
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
    this.requestSequence = 0;
    this.serverResult = null;
    this.serverError = "";
    this.calculationPending = false;
    this.searchTokens = { attacker: 0, move: 0, item: 0 };
    this.cfg = this.defaultConfig();
    this.scheduleQuickCalc = debounce(() => this.refreshServerResult(), 180);
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
      attackerDefStage: 0,
      spaStage: 0,
      attackerSpdStage: 0,
      speStage: 0,
      accuracyStage: 0,
      evasionStage: 0,
      critStage: 0,
      guardSplitOrder: [],
      splitterStats: defaultQuickCalcSplitterStats(),
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
      tarShot: false,
      reflectType: false,
      conversion: false,
      conversionType: "normal",
      conversion2: false,
      conversion2Type: "steel",
      camouflage: false,
      camouflageType: "normal",
      burnUp: false,
      doubleShock: false,
      roost: false,
      electrify: false,
      ionDeluge: false,
      manualTypesEnabled: false,
      manualType1: "steel",
      manualType2: "fighting",
      customPowerEnabled: false,
      customPower: 250,
      critical: false,
      faintedAllies: 4,
      hitCount: 1,
    };
  }

  async bootstrap() {
    const sequence = ++this.sequence;
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
        this.cfg.attackerDefStage = active.stages?.def ?? 0;
        this.cfg.spaStage = active.stages?.spa ?? 0;
        this.cfg.attackerSpdStage = active.stages?.spd ?? 0;
        this.cfg.speStage = active.stages?.spe ?? 0;
        this.cfg.accuracyStage = active.stages?.accuracy ?? 0;
        this.cfg.evasionStage = active.stages?.evasion ?? 0;
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
    this.refreshServerResult();
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

  attackerStages() {
    return {
      ...emptyStages(),
      atk: Number(this.cfg.atkStage) || 0,
      def: Number(this.cfg.attackerDefStage) || 0,
      spa: Number(this.cfg.spaStage) || 0,
      spd: Number(this.cfg.attackerSpdStage) || 0,
      spe: Number(this.cfg.speStage) || 0,
      accuracy: Number(this.cfg.accuracyStage) || 0,
      evasion: Number(this.cfg.evasionStage) || 0,
      crit: Number(this.cfg.critStage) || 0,
    };
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
      stages: this.attackerStages(),
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
    const dynamicMove = resolveDynamicMovePower(move, this.attackerStages(), {
      allowCustomOverride: Boolean(this.cfg.customPowerEnabled),
    });
    return withMoveType(dynamicMove, this.effectiveMoveType());
  }

  effectiveMoveType() {
    return resolveMoveType(this.cfg.move?.type?.name || "normal", {
      electrify: this.cfg.electrify,
      ionDeluge: this.cfg.ionDeluge,
    });
  }

  currentBossTypes() {
    return resolveDefenderTypes(
      this.cfg.boss?.types?.map(({ type }) => type.name) || [],
      this.cfg,
    );
  }

  currentAttackerTypes() {
    const bossTypes = this.currentBossTypes();
    return resolveAttackerTypes(
      this.cfg.attacker?.types?.map(({ type }) => type.name) || [],
      this.cfg,
      { targetTypes: bossTypes, selectedMoveType: this.effectiveMoveType() },
    );
  }

  viewModel() {
    const move = this.selectedMove();
    const bossTypes = this.currentBossTypes();
    const attackerTypes = this.currentAttackerTypes();
    return {
      build: this.attackerBuild(),
      move,
      bossTypes,
      attackerTypes,
      effectiveness: move?.type?.name ? typeEffectiveness(move.type.name, bossTypes) : 1,
    };
  }

  guardChain() {
    return resolveQuickCalcGuardChain(this.cfg.guardSplitOrder, this.cfg.splitterStats);
  }

  guardSplitPayload() {
    const chain = this.guardChain();
    return {
      guardSplitOrder: chain.map(({ key }) => key),
      splitterStats: Object.fromEntries(chain.map(({ key, def, spd }) => [key, { def, spd }])),
    };
  }

  requestPayload() {
    return {
      boss: this.cfg.boss?.name || "",
      attacker: this.cfg.attacker?.name || "",
      move: this.cfg.move?.name || "",
      level: this.cfg.level,
      nature: this.cfg.nature,
      ability: this.cfg.ability,
      item: this.cfg.item,
      teraType: this.cfg.teraType,
      terastallized: this.cfg.terastallized,
      atkIv: this.cfg.atkIv,
      atkEv: this.cfg.atkEv,
      spaIv: this.cfg.spaIv,
      spaEv: this.cfg.spaEv,
      atkStage: this.cfg.atkStage,
      attackerDefStage: this.cfg.attackerDefStage,
      spaStage: this.cfg.spaStage,
      attackerSpdStage: this.cfg.attackerSpdStage,
      speStage: this.cfg.speStage,
      accuracyStage: this.cfg.accuracyStage,
      evasionStage: this.cfg.evasionStage,
      critStage: this.cfg.critStage,
      ...this.guardSplitPayload(),
      screechCount: this.cfg.screechCount,
      defenseStage: this.cfg.defenseStage,
      simpleDefense: this.cfg.simpleDefense,
      metalSoundCount: this.cfg.metalSoundCount,
      fakeTearsCount: this.cfg.fakeTearsCount,
      spdStage: this.cfg.spdStage,
      simpleSpd: this.cfg.simpleSpd,
      typeChanges: {
        magicPowder: this.cfg.magicPowder,
        trickOrTreat: this.cfg.trickOrTreat,
        forestsCurse: this.cfg.forestsCurse,
        soak: this.cfg.soak,
        tarShot: this.cfg.tarShot,
        reflectType: this.cfg.reflectType,
        conversion: this.cfg.conversion,
        conversionType: this.cfg.conversionType,
        conversion2: this.cfg.conversion2,
        conversion2Type: this.cfg.conversion2Type,
        camouflage: this.cfg.camouflage,
        camouflageType: this.cfg.camouflageType,
        burnUp: this.cfg.burnUp,
        doubleShock: this.cfg.doubleShock,
        roost: this.cfg.roost,
        electrify: this.cfg.electrify,
        ionDeluge: this.cfg.ionDeluge,
        manualTypesEnabled: this.cfg.manualTypesEnabled,
        manualType1: this.cfg.manualType1,
        manualType2: this.cfg.manualType2,
      },
      customPowerEnabled: this.cfg.customPowerEnabled,
      customPower: this.cfg.customPower,
      critical: this.cfg.critical,
      faintedAllies: this.cfg.faintedAllies,
      hitCount: this.cfg.hitCount,
    };
  }

  queueServerCalculation() {
    this.requestSequence += 1;
    this.serverResult = null;
    this.serverError = "";
    this.calculationPending = true;
    this.renderResultsOnly();
    this.scheduleQuickCalc();
  }

  async refreshServerResult() {
    const payload = this.requestPayload();
    if (!payload.boss || !payload.attacker || !payload.move) {
      this.calculationPending = false;
      this.serverResult = null;
      this.serverError = "Choose a boss, attacker, and move.";
      this.renderResultsOnly();
      return;
    }

    const requestId = ++this.requestSequence;
    this.calculationPending = true;
    this.serverResult = null;
    this.serverError = "";
    this.renderResultsOnly();
    try {
      const response = await fetch("/api/quick-calc", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await response.json().catch(() => ({}));
      if (requestId !== this.requestSequence) return;
      if (
        !response.ok
        || typeof data.summary !== "string"
        || typeof data.actualDamageRange !== "string"
        || typeof data.myuuDamageRange !== "string"
      ) {
        throw new Error(data.error || "Server calculation unavailable");
      }
      this.serverResult = {
        summary: data.summary,
        actualDamageRange: data.actualDamageRange,
        myuuDamageRange: data.myuuDamageRange,
      };
    } catch {
      if (requestId !== this.requestSequence) return;
      this.serverResult = null;
      this.serverError = "Server calculation unavailable";
    } finally {
      if (requestId === this.requestSequence) {
        this.calculationPending = false;
        this.renderResultsOnly();
      }
    }
  }

  resultSummary(calc) {
    return this.serverResult?.summary
      || `${displayName(this.cfg.attacker?.name || "Attacker")} using ${titleCase(calc.move?.name || "Move")} vs ${displayName(this.cfg.boss?.name || "Boss")}`;
  }

  resultText() {
    const calc = this.viewModel();
    if (!this.serverResult) return this.serverError || "Server calculation unavailable";
    return `${this.resultSummary(calc)}\nActual Damage: ${this.serverResult.actualDamageRange}\nMyuu Rounded Damage: ${this.serverResult.myuuDamageRange}`;
  }

  render() {
    clearTimeout(this.renderTimer);
    const calc = this.viewModel();
    this.root.innerHTML = `
      <section class="quick-calc" aria-labelledby="quick-calc-title">
        <div class="workspace-heading quick-calc-heading">
          <div>
            <span class="eyebrow">Damage test bench</span>
            <h1 id="quick-calc-title">Quick Calc</h1>
            <p>Accurate raid damage is calculated securely by the server.</p>
          </div>
          <div class="quick-calc-actions">
            <select data-preset aria-label="Apply preset">
              <option value="">Preset</option>
              ${Object.entries(QUICK_CALC_PRESETS).map(([key, preset]) => `<option value="${key}">${escapeHtml(preset.label)}</option>`).join("")}
            </select>
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
    const types = calc.attackerTypes || [];
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
        ${attacker ? `<div class="quick-current-types"><span>Current Attacker Type</span><div class="type-row">${types.length ? types.map((type) => `<span class="type-badge type-${type}">${type}</span>`).join("") : `<span class="type-badge type-typeless">typeless</span>`}</div></div>` : ""}
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
        <div class="quick-fields five">
          <label><span>Def stage</span><select data-cfg="attackerDefStage">${this.stageOptions(this.cfg.attackerDefStage)}</select></label>
          <label><span>SpD stage</span><select data-cfg="attackerSpdStage">${this.stageOptions(this.cfg.attackerSpdStage)}</select></label>
          <label><span>Spe stage</span><select data-cfg="speStage">${this.stageOptions(this.cfg.speStage)}</select></label>
          <label><span>Accuracy stage</span><select data-cfg="accuracyStage">${this.stageOptions(this.cfg.accuracyStage)}</select></label>
          <label><span>Evasion stage</span><select data-cfg="evasionStage">${this.stageOptions(this.cfg.evasionStage)}</select></label>
        </div>
        <div class="quick-stat-strip">
          <div><span>${baseKey.toUpperCase()} before boosts</span><strong>${fmt(calc.build.stats[baseKey])}</strong></div>
          <div><span>After stage</span><strong>${fmt(applyStage(calc.build.stats[baseKey], stage))}</strong></div>
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
          ${boss ? `<div class="quick-current-types"><span>Current Boss Type</span><div class="type-row">${calc.bossTypes.length ? calc.bossTypes.map((type) => `<span class="type-badge type-${type}">${type}</span>`).join("") : `<span class="type-badge type-typeless">typeless</span>`}</div></div>` : ""}
          <div class="quick-boss-selector-wrap quick-search">
            <label><span>Boss selector</span><input data-boss-search value="${escapeHtml(this.bossQuery || displayName(boss?.name || ""))}" placeholder="Search raid boss..." autocomplete="off" aria-expanded="false"></label>
            <div class="inline-results hidden" data-boss-results></div>
          </div>
        </div>
      </section>`;
  }

  setupPanel(calc = {}) {
    const guardChain = this.guardChain();
    const currentBossTypes = calc.bossTypes || resolveQuickCalcBossTypes({
      bossTypes: this.cfg?.boss?.types?.map(({ type }) => type.name) || [],
      ...(this.cfg || {}),
    });
    const currentEffectiveness = calc.effectiveness ?? 1;
    return `
      <section class="quick-card quick-wide" aria-labelledby="quick-setup-title">
        <div class="quick-card-title compact"><div><span class="eyebrow">Battle modifiers</span><h2 id="quick-setup-title">Setup</h2></div></div>
        <div class="quick-setup-grid">
          <div class="quick-subpanel">
            <div class="quick-guard-stats-heading">
              <h3>Guard Splitter Stats</h3>
              <button type="button" class="button quick-guard-reset" data-reset-splitter-stats>Reset Splitter Stats</button>
            </div>
            <p class="quick-guard-help">Choose or customize the Defense and Sp. Defense each Guard Split user contributes. Private boss defenses stay on the server.</p>
            <div class="quick-guard-stats" aria-label="Guard Splitter Stats">
              ${Object.entries(QUICK_CALC_GUARD_SPLIT_USERS).map(([key, splitter]) => `
                <div class="quick-guard-stat-row">
                  <strong>${escapeHtml(splitter.name)}</strong>
                  <label><span>Def</span><input type="number" inputmode="numeric" min="1" max="999" step="1" data-splitter="${key}" data-splitter-stat="def" aria-label="${escapeHtml(splitter.name)} Defense" value="${escapeHtml(this.cfg.splitterStats?.[key]?.def ?? splitter.def)}"></label>
                  <label><span>SpD</span><input type="number" inputmode="numeric" min="1" max="999" step="1" data-splitter="${key}" data-splitter-stat="spd" aria-label="${escapeHtml(splitter.name)} Special Defense" value="${escapeHtml(this.cfg.splitterStats?.[key]?.spd ?? splitter.spd)}"></label>
                </div>`).join("")}
            </div>
            <h3 class="quick-guard-order-title">Guard Split Order</h3>
            <p class="quick-guard-help">Add users and arrange them in the exact sequential order.</p>
            <div class="quick-guard-add">
              <label><span>Add splitter</span><select data-guard-add-select>
                ${GUARD_SPLITTER_KEYS.map((key) => `<option value="${key}">${escapeHtml(QUICK_CALC_GUARD_SPLIT_USERS[key].name)}</option>`).join("")}
              </select></label>
              <button type="button" class="button" data-add-guard>Add to chain</button>
            </div>
            ${guardChain.length ? `<ol class="quick-guard-chain" aria-label="Selected Guard Split order">
              ${guardChain.map((user, index) => `<li data-guard-row="${index}">
                <span class="quick-guard-position" aria-hidden="true">${index + 1}</span>
                <span class="quick-guard-name"><strong>${escapeHtml(user.name)}</strong><small>Def ${user.def} · SpD ${user.spd}</small></span>
                <span class="quick-guard-actions">
                  <button type="button" data-move-guard="${index}" data-guard-direction="up" aria-label="Move ${escapeHtml(user.name)} up" title="Move up" ${index === 0 ? "disabled" : ""}>↑</button>
                  <button type="button" data-move-guard="${index}" data-guard-direction="down" aria-label="Move ${escapeHtml(user.name)} down" title="Move down" ${index === guardChain.length - 1 ? "disabled" : ""}>↓</button>
                  <button type="button" class="quick-guard-remove" data-remove-guard="${index}" aria-label="Remove ${escapeHtml(user.name)} from Guard Split order">Remove</button>
                </span>
              </li>`).join("")}
            </ol>` : `<p class="quick-guard-empty">No Guard Split users added.</p>`}
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
              <label class="quick-check"><input type="checkbox" data-cfg-check="tarShot" ${this.cfg.tarShot ? "checked" : ""}><span>Tar Shot</span></label>
              <label class="quick-check"><input type="checkbox" data-cfg-check="manualTypesEnabled" ${this.cfg.manualTypesEnabled ? "checked" : ""}><span>Manual boss type editor</span></label>
            </div>
            <div class="quick-fields two">
              <label><span>Manual type 1</span><select data-cfg="manualType1">${TYPES.map((type) => `<option value="${type}" ${this.cfg.manualType1 === type ? "selected" : ""}>${titleCase(type)}</option>`).join("")}</select></label>
              <label><span>Manual type 2</span><select data-cfg="manualType2"><option value="">None</option>${TYPES.map((type) => `<option value="${type}" ${this.cfg.manualType2 === type ? "selected" : ""}>${titleCase(type)}</option>`).join("")}</select></label>
            </div>
            <div class="quick-type-summary" aria-live="polite">
              <span>Current Boss Type</span>
              <div class="type-row">${currentBossTypes.length ? currentBossTypes.map((type) => `<span class="type-badge type-${type}">${type}</span>`).join("") : `<span class="type-badge type-typeless">typeless</span>`}</div>
              <strong>Effectiveness: ${currentEffectiveness}x</strong>
              ${this.cfg.tarShot ? `<small>Tar Shot applied: Fire damage x2</small>` : ""}
            </div>
            <details class="quick-advanced-type" ${["reflectType", "conversion", "conversion2", "camouflage", "burnUp", "doubleShock", "roost", "electrify", "ionDeluge"].some((key) => this.cfg[key]) ? "open" : ""}>
              <summary>Advanced type mechanics</summary>
              <p class="quick-guard-help">Conversion 2 and Camouflage use the selected manual result because terrain and random type selection are not modeled.</p>
              <div class="quick-toggle-grid">
                <label class="quick-check"><input type="checkbox" data-cfg-check="reflectType" ${this.cfg.reflectType ? "checked" : ""}><span>Reflect Type</span></label>
                <label class="quick-check"><input type="checkbox" data-cfg-check="conversion" ${this.cfg.conversion ? "checked" : ""}><span>Conversion</span></label>
                <label class="quick-check"><input type="checkbox" data-cfg-check="conversion2" ${this.cfg.conversion2 ? "checked" : ""}><span>Conversion 2 (partial)</span></label>
                <label class="quick-check"><input type="checkbox" data-cfg-check="camouflage" ${this.cfg.camouflage ? "checked" : ""}><span>Camouflage (partial)</span></label>
                <label class="quick-check"><input type="checkbox" data-cfg-check="burnUp" ${this.cfg.burnUp ? "checked" : ""}><span>Burn Up used</span></label>
                <label class="quick-check"><input type="checkbox" data-cfg-check="doubleShock" ${this.cfg.doubleShock ? "checked" : ""}><span>Double Shock used</span></label>
                <label class="quick-check"><input type="checkbox" data-cfg-check="roost" ${this.cfg.roost ? "checked" : ""}><span>Roost active this turn</span></label>
                <label class="quick-check"><input type="checkbox" data-cfg-check="electrify" ${this.cfg.electrify ? "checked" : ""}><span>Electrify move override</span></label>
                <label class="quick-check"><input type="checkbox" data-cfg-check="ionDeluge" ${this.cfg.ionDeluge ? "checked" : ""}><span>Ion Deluge active</span></label>
              </div>
              <div class="quick-fields three">
                <label><span>Conversion type</span><select data-cfg="conversionType">${TYPES.map((type) => `<option value="${type}" ${this.cfg.conversionType === type ? "selected" : ""}>${titleCase(type)}</option>`).join("")}</select></label>
                <label><span>Manual Conversion 2 type</span><select data-cfg="conversion2Type">${TYPES.map((type) => `<option value="${type}" ${this.cfg.conversion2Type === type ? "selected" : ""}>${titleCase(type)}</option>`).join("")}</select></label>
                <label><span>Manual Camouflage type</span><select data-cfg="camouflageType">${TYPES.map((type) => `<option value="${type}" ${this.cfg.camouflageType === type ? "selected" : ""}>${titleCase(type)}</option>`).join("")}</select></label>
              </div>
            </details>
          </div>
        </div>
      </section>`;
  }

  movePanel(calc) {
    const move = calc.move;
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
            <div><span>Resolved power</span><strong>${move?.customPower ?? move?.basePower ?? move?.power ?? "-"}</strong></div>
          </div>
          <div class="quick-fields four">
            <label class="quick-check"><input type="checkbox" data-cfg-check="customPowerEnabled" ${this.cfg.customPowerEnabled ? "checked" : ""}><span>Custom power override</span></label>
            <label><span>Custom power</span><input type="number" min="0" max="9999" data-cfg="customPower" value="${this.cfg.customPower}"></label>
            <label class="quick-check"><input type="checkbox" data-cfg-check="critical" ${this.cfg.critical ? "checked" : ""}><span>Critical hit</span></label>
            <label><span>Hits</span><input type="number" min="1" max="5" data-cfg="hitCount" value="${this.cfg.hitCount}"></label>
          </div>
          <div class="quick-fields two">
            <label><span>Fainted allies count</span><input type="number" min="0" max="5" data-cfg="faintedAllies" value="${this.cfg.faintedAllies}"></label>
            <p class="quick-guard-help">Set the number of fainted allies for the selected move.</p>
          </div>
        </div>
      </section>`;
  }

  resultsPanel(calc) {
    const summary = this.resultSummary(calc);
    const resultContent = this.calculationPending
      ? `<div class="quick-simple-results"><div><span>Status</span><strong>Calculating securely...</strong></div></div>`
      : this.serverResult
        ? `<div class="quick-simple-results">
            <div><span>Actual Damage</span><strong>${escapeHtml(this.serverResult.actualDamageRange)}</strong></div>
            <div class="myuu-range"><span>Myuu Rounded Damage</span><strong>${escapeHtml(this.serverResult.myuuDamageRange)}</strong></div>
            <div><span>Effectiveness</span><strong>${calc.effectiveness ?? 1}x</strong></div>
            ${this.cfg?.tarShot ? `<div><span>Tar Shot</span><strong>Fire damage x2</strong></div>` : ""}
          </div>`
        : `<div class="quick-simple-results"><div><span>Status</span><strong>${escapeHtml(this.serverError || "Server calculation unavailable")}</strong></div></div>`;
    return `
      <section class="quick-card quick-wide" data-quick-results aria-labelledby="quick-result-title">
        <div class="quick-card-title compact">
          <div><span class="eyebrow">Output</span><h2 id="quick-result-title">Damage Results</h2></div>
        </div>
        <div class="quick-result-layout">
          <div class="quick-main-result">
            <p class="quick-summary-line">${escapeHtml(summary)}</p>
            ${resultContent}
          </div>
        </div>
      </section>`;
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
      if (field.matches("[data-splitter-stat]")) {
        this.updateSplitterStatField(field);
        this.queueServerCalculation();
      } else if (field.matches("[data-cfg]")) {
        this.updateConfigField(field);
        this.queueServerCalculation();
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
      if (field.matches("[data-splitter-stat]")) {
        this.normalizeSplitterStatField(field);
        this.render();
        this.queueServerCalculation();
      } else if (field.matches("[data-cfg]")) {
        this.updateConfigField(field);
        if (field.type === "number") this.normalizeConfigField(field);
        if (field.type === "number") this.renderResultsOnly();
        else this.render();
        this.queueServerCalculation();
      } else if (field.matches("[data-cfg-check]")) {
        this.cfg[field.dataset.cfgCheck] = field.checked;
        this.render();
        this.queueServerCalculation();
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
        this.render();
        this.queueServerCalculation();
      }
    });

    this.root.addEventListener("blur", (event) => {
      const field = event.target;
      if (field.matches("[data-cfg]") && field.type === "number") {
        this.normalizeConfigField(field);
        this.render();
        this.queueServerCalculation();
      } else if (field.matches("[data-splitter-stat]")) {
        this.normalizeSplitterStatField(field);
        this.render();
        this.queueServerCalculation();
      }
    }, true);

    this.root.addEventListener("click", async (event) => {
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
      else if (button.matches("[data-reset-splitter-stats]")) this.resetSplitterStats();
      else if (button.matches("[data-pick-item]")) {
        this.cfg.item = button.dataset.pickItem;
        this.itemQuery = "";
        this.render();
        this.queueServerCalculation();
      } else if (button.matches("[data-reset-calc]")) {
        this.cfg = this.defaultConfig();
        this.serverResult = null;
        this.serverError = "";
        this.calculationPending = true;
        this.status = "Quick Calc reset";
        await this.bootstrap();
      }
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
  }

  updateSplitterStatField(field) {
    const key = field.dataset.splitter;
    const stat = field.dataset.splitterStat;
    const defaults = QUICK_CALC_GUARD_SPLIT_USERS[key];
    if (!defaults || !["def", "spd"].includes(stat)) return;
    this.cfg.splitterStats ??= defaultQuickCalcSplitterStats();
    this.cfg.splitterStats[key] ??= { def: defaults.def, spd: defaults.spd };
    this.cfg.splitterStats[key][stat] = field.value;
  }

  normalizeSplitterStatField(field) {
    const key = field.dataset.splitter;
    const stat = field.dataset.splitterStat;
    const defaults = QUICK_CALC_GUARD_SPLIT_USERS[key];
    if (!defaults || !["def", "spd"].includes(stat)) return;
    const value = normalizeSplitterStat(field.value, defaults[stat]);
    this.cfg.splitterStats ??= defaultQuickCalcSplitterStats();
    this.cfg.splitterStats[key] ??= { def: defaults.def, spd: defaults.spd };
    this.cfg.splitterStats[key][stat] = value;
    field.value = String(value);
  }

  resetSplitterStats() {
    this.cfg.splitterStats = defaultQuickCalcSplitterStats();
    this.status = "Splitter stats reset to defaults";
    this.render();
    this.queueServerCalculation();
  }

  commitGuardSplitOrder(message) {
    this.cfg.guardSplitOrder = normalizeGuardSplitOrder(this.cfg.guardSplitOrder);
    this.status = message;
    this.render();
    this.queueServerCalculation();
  }

  addGuardSplitter(key) {
    if (!GUARD_SPLITTER_KEYS.includes(key)) return;
    this.cfg.guardSplitOrder = [...this.cfg.guardSplitOrder, key];
    this.commitGuardSplitOrder(`${QUICK_CALC_GUARD_SPLIT_USERS[key].name} added to Guard Split order`);
  }

  removeGuardSplitter(index) {
    if (!Number.isInteger(index) || index < 0 || index >= this.cfg.guardSplitOrder.length) return;
    const [key] = this.cfg.guardSplitOrder.splice(index, 1);
    this.commitGuardSplitOrder(`${QUICK_CALC_GUARD_SPLIT_USERS[key]?.name || "Splitter"} removed from Guard Split order`);
  }

  moveGuardSplitter(index, direction) {
    const order = [...this.cfg.guardSplitOrder];
    const nextIndex = direction === "up" ? index - 1 : index + 1;
    if (!Number.isInteger(index) || index < 0 || nextIndex < 0 || nextIndex >= order.length) return;
    [order[index], order[nextIndex]] = [order[nextIndex], order[index]];
    this.cfg.guardSplitOrder = order;
    const key = order[nextIndex];
    this.commitGuardSplitOrder(`${QUICK_CALC_GUARD_SPLIT_USERS[key]?.name || "Splitter"} moved ${direction}`);
  }

  normalizeConfigField(field) {
    const key = field.dataset.cfg;
    if (!key || field.type !== "number") return;
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
    const calc = this.viewModel();
    const wrapper = document.createElement("div");
    wrapper.innerHTML = this.resultsPanel(calc).trim();
    currentResults.replaceWith(wrapper.firstElementChild);
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
      this.cfg.manualType1 = this.cfg.boss.types?.[0]?.type?.name || "normal";
      this.cfg.manualType2 = this.cfg.boss.types?.[1]?.type?.name || "";
      this.bossQuery = "";
      this.status = `Loaded boss ${displayName(this.cfg.boss.name)}`;
    } catch (error) {
      this.status = `Could not load boss: ${error.message}`;
    }
    if (rerender) {
      this.render();
      this.refreshServerResult();
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
      this.status = `Loaded attacker ${displayName(this.cfg.attacker.name)}`;
    } catch (error) {
      this.status = `Could not load attacker: ${error.message}`;
    }
    if (rerender) {
      this.render();
      this.refreshServerResult();
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
      this.status = `Loaded move ${titleCase(this.cfg.move.name)}`;
    } catch (error) {
      this.status = `Could not load move: ${error.message}`;
    }
    if (rerender) {
      this.render();
      this.refreshServerResult();
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
    this.cfg.splitterStats = normalizeQuickCalcSplitterStats(this.cfg.splitterStats);
    this.status = `Applied preset: ${preset.label}`;
    if (rerender) {
      this.render();
      this.refreshServerResult();
    }
  }
}
