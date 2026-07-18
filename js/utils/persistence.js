import { getItem, getMove, getPokemon } from "../api/pokeapi.js";
import { createBuild, normalizeVolatileEffects } from "../core/battle-state.js";
import { calculateBossStats, calculatePokemonStats, calculateRaidBossHP } from "../core/stats.js";
import { NATURES } from "../data/natures.js";
import { emptyStages } from "../core/stages.js";

const prepareMove = (move) => move ? {
  ...move,
  basePower: move.power ?? null,
  customPower: move.power ?? null,
} : null;

export const SETUP_STORAGE_KEY = "myuuRaidDamageVisualizer:v3";
const VERSION = 3;

const cloneRecord = (value, fallback) => ({ ...fallback, ...(value || {}) });
const validSwitchMode = (value) => ["normal", "baton", "stay"].includes(value) ? value : "normal";

export function redactBossDefensesForExport(payload) {
  const safe = JSON.parse(JSON.stringify(payload));
  for (const stats of [
    safe.setup?.boss?.baseStats,
    safe.setup?.boss?.currentStats,
    safe.setup?.manualBossFinalStats,
  ]) {
    if (!stats) continue;
    delete stats.def;
    delete stats.spd;
  }
  return safe;
}

function serializeMove(move) {
  if (!move) return null;
  return {
    name: move.name,
    basePower: move.basePower ?? move.power ?? null,
    customPower: move.customPower ?? move.basePower ?? move.power ?? null,
    type: move.type?.name || "normal",
    category: move.damage_class?.name || "status",
    priority: move.priority ?? 0,
  };
}

function serializeBuild(build) {
  return {
    pokemon: build.pokemon?.name || null,
    level: build.level,
    nature: build.nature,
    ability: build.ability,
    item: build.item,
    metronomeMultiplier: build.metronomeMultiplier || 1,
    moves: build.moves.map(serializeMove),
    evs: { ...build.evs },
    ivs: { ...build.ivs },
    stages: { ...build.stages },
    teraType: build.teraType || (build.pokemon ? (build.pokemon.types[0]?.type?.name || "normal") : "normal"),
  };
}

function fallbackMove(saved) {
  return {
    name: saved.name,
    power: saved.basePower ?? null,
    basePower: saved.basePower ?? null,
    customPower: saved.customPower ?? saved.basePower ?? null,
    type: { name: saved.type || "normal" },
    damage_class: { name: saved.category || "status" },
    priority: saved.priority ?? 0,
  };
}

async function hydrateMove(saved) {
  if (!saved?.name) return null;
  try {
    const move = await getMove(saved.name);
    return {
      ...move,
      basePower: saved.basePower ?? move.power ?? null,
      customPower: saved.customPower ?? saved.basePower ?? move.power ?? null,
    };
  } catch {
    return fallbackMove(saved);
  }
}

async function hydrateBuild(saved) {
  const build = createBuild();
  if (!saved?.pokemon) return build;
  try {
    build.pokemon = await getPokemon(saved.pokemon);
  } catch {
    return build;
  }
  build.level = Math.max(1, Math.min(100, Number(saved.level) || 100));
  let loadedNature = typeof saved.nature === "string" ? saved.nature.toLowerCase() : "";
  if (!NATURES[loadedNature]) {
    loadedNature = typeof build.nature === "string" ? build.nature.toLowerCase() : "hardy";
  }
  if (!NATURES[loadedNature]) {
    loadedNature = "hardy";
  }
  build.nature = loadedNature;
  build.ability = saved.ability || build.pokemon.abilities[0]?.ability.name || "";
  build.item = saved.item || "";
  build.metronomeMultiplier = Math.max(1, Math.min(2, Number(saved.metronomeMultiplier) || 1));
  build.evs = cloneRecord(saved.evs, build.evs);
  build.ivs = cloneRecord(saved.ivs, build.ivs);
  build.stages = cloneRecord(saved.stages, build.stages);
  build.moves = await Promise.all(Array.from({ length: 4 }, (_, index) => hydrateMove(saved.moves?.[index])));
  build.teraType = saved.teraType || (build.pokemon ? (build.pokemon.types[0]?.type?.name || "normal") : "normal");
  if (build.item) {
    try {
      build.itemData = await getItem(build.item);
    } catch {
      build.itemData = null;
    }
  }
  build.stats = calculatePokemonStats(build.pokemon, build);
  return build;
}

// Validate battle state integrity
function isBattleStateValid(battle) {
  if (!battle) return false;
  if (typeof battle.battleActive !== "boolean") return false;
  if (!battle.battleActive) return false;
  
  // Required numeric fields
  if (typeof battle.currentTurn !== "number" || battle.currentTurn < 1 || battle.currentTurn > 22) return false;
  if (typeof battle.bossHP !== "number" || battle.bossHP < 0) return false;
  if (typeof battle.bossMaxHP !== "number" || battle.bossMaxHP <= 0) return false;
  if (typeof battle.activeSlot !== "number" || battle.activeSlot < 0 || battle.activeSlot > 5) return false;
  
  // Required array fields
  if (!Array.isArray(battle.teamHP) || battle.teamHP.length !== 6) return false;
  if (!Array.isArray(battle.battleLog)) return false;
  if (!Array.isArray(battle.bossCurrentTypes)) return false;
  if (!Array.isArray(battle.teamCurrentTypes)) return false;
  
  // All teamHP values must be valid numbers
  for (const hp of battle.teamHP) {
    if (typeof hp !== "number" || hp < 0) return false;
  }
  
  return true;
}

export class SetupPersistence extends EventTarget {
  constructor(state) {
    super();
    this.state = state;
    try {
      localStorage.removeItem("myuuRaidDamageVisualizer:v2");
    } catch {
      // Storage can be unavailable; current saves contain public state only.
    }
    this.lastStatus = "No saved setup found";
    this.timer = null;
    this.attached = false;
  }

  status(message) {
    this.lastStatus = message;
    this.dispatchEvent(new CustomEvent("status", { detail: message }));
  }

  // Version 2: Separate setup and battle state
  serialize(saveFullBattle = true) {
    const isBattle = this.state.battleActive && saveFullBattle;
    
    return {
      version: VERSION,
      savedAt: new Date().toISOString(),
      
      // SEPARATED: Setup state (always saved)
      setup: {
        boss: this.state.boss ? {
          pokemon: this.state.boss.name,
          baseStats: { ...this.state.bossBaseStats },
          currentStats: { ...this.state.bossStats },
        } : null,
        bossMoves: this.state.bossMoves.map(serializeMove),
        team: this.state.team.map(serializeBuild),
        selectedSlot: this.state.activeEditor,
        
        // Manual Overrides
        manualBossOverride: this.state.manualBossOverride,
        manualBossName: this.state.manualBossName,
        manualBossHP: this.state.manualBossHP,
        manualBossMaxHP: this.state.manualBossMaxHP,
        manualBossCurrentTypes: [...this.state.manualBossCurrentTypes],
        manualBossBaseStats: { ...this.state.manualBossBaseStats },
        manualBossFinalStats: { ...this.state.manualBossFinalStats },
        manualBossStages: { ...this.state.manualBossStages },
      },
      
      // SEPARATED: Battle state (only if active battle and saveFullBattle)
      battle: isBattle ? {
        battleActive: true,
        uiMode: this.state.uiMode,
        currentTurn: this.state.currentTurn,
        activeSlot: this.state.activeSlot,
        bossHP: this.state.bossHP,
        bossMaxHP: this.state.bossMaxHP,
        bossCurrentTypes: [...this.state.bossCurrentTypes],
        teamHP: [...this.state.teamHP],
        teamCurrentTypes: this.state.teamCurrentTypes.map((t) => [...t]),
        teamStages: this.state.teamStages.map((s) => ({ ...s })),
        bossStages: { ...this.state.bossStages },
        faintedAlliesCount: this.state.faintedAlliesCount,
        battleLog: [...this.state.battleLog],
        awaitingForcedSwitch: this.state.awaitingForcedSwitch,
        forcedSwitchReason: this.state.forcedSwitchReason || "",
        metronomeMoveChains: this.state.metronomeMoveChains.map((chain) => ({ ...chain })),
        splitEvents: this.state.splitEvents.map((event) => ({ ...event })),
        volatileEffects: JSON.parse(JSON.stringify(this.state.volatileEffects)),
        
        // Speed overrides
        playerSpeedOverrides: [...this.state.playerSpeedOverrides],
        bossSpeedOverride: this.state.bossSpeedOverride,
        battleSpeed: {
          player: [...this.state.battleSpeed.player],
          boss: this.state.battleSpeed.boss
        },
        abilityOverrides: {
          player: [...this.state.abilityOverrides.player],
          boss: this.state.abilityOverrides.boss
        },
        
        // Consumed items
        consumedItems: {
          player: [...this.state.consumedItems.player],
          boss: this.state.consumedItems.boss
        },
        
        // Z-Move Used state
        zMoveUsed: {
          player: [...this.state.zMoveUsed.player],
          boss: this.state.zMoveUsed.boss
        },
        teraUsed: {
          player: this.state.teraUsed.player,
          boss: this.state.teraUsed.boss
        },
        terastallized: {
          player: [...this.state.terastallized.player],
          boss: this.state.terastallized.boss
        },
        
        // Damage Roll Mode
        damageRollMode: this.state.damageRollMode || "random",
        
        // Original and current stats
        bossOriginalStats: this.state.bossOriginalStats ? { ...this.state.bossOriginalStats } : null,
        bossCurrentStats: this.state.bossCurrentStats ? { ...this.state.bossCurrentStats } : null,
        bossStatSources: this.state.bossStatSources ? JSON.parse(JSON.stringify(this.state.bossStatSources)) : null,
        
        // Team stats and sources
        teamOriginalStats: this.state.team.map((slot) => slot.originalStats ? { ...slot.originalStats } : null),
        teamCurrentStats: this.state.team.map((slot) => slot.currentStats ? { ...slot.currentStats } : null),
        teamStatSources: this.state.team.map((slot) => slot.statSources ? JSON.parse(JSON.stringify(slot.statSources)) : null),
        teamSpeedOverrides: this.state.team.map((slot) => slot.speedOverride),
        
        // History for undo
        history: this.state.history.map(s => ({
          currentTurn: s.currentTurn,
          activeSlot: s.activeSlot,
          bossHP: s.bossHP,
          bossMaxHP: s.bossMaxHP,
          bossCurrentTypes: [...s.bossCurrentTypes],
          teamHP: [...s.teamHP],
          teamCurrentTypes: s.teamCurrentTypes.map(t => [...t]),
          teamStages: s.teamStages.map(st => ({ ...st })),
          bossStages: { ...s.bossStages },
          faintedAlliesCount: s.faintedAlliesCount,
          awaitingForcedSwitch: Boolean(s.awaitingForcedSwitch),
          forcedSwitchReason: s.forcedSwitchReason || "",
          metronomeMoveChains: Array.isArray(s.metronomeMoveChains)
            ? s.metronomeMoveChains.map((chain) => ({ ...chain }))
            : [],
          battleLog: [...s.battleLog],
          bossStats: s.bossStats ? { ...s.bossStats } : null,
          teamStats: s.teamStats.map(st => ({ ...st })),
          abilityOverridesSnapshot: s.abilityOverridesSnapshot ? {
            player: [...s.abilityOverridesSnapshot.player],
            boss: s.abilityOverridesSnapshot.boss
          } : null,
          volatileEffectsSnapshot: s.volatileEffectsSnapshot
            ? JSON.parse(JSON.stringify(s.volatileEffectsSnapshot))
            : null,
          splitEventsSnapshot: Array.isArray(s.splitEventsSnapshot)
            ? s.splitEventsSnapshot.map((event) => ({ ...event }))
            : [],
        })),
        
        needsResume: this.state.needsResume,
      } : null,
    };
  }

  save(manual = false, saveFullBattle = true) {
    try {
      localStorage.setItem(SETUP_STORAGE_KEY, JSON.stringify(this.serialize(saveFullBattle)));
      this.status(manual ? "Setup saved" : "Autosaved");
      return true;
    } catch {
      this.status("Save failed: local storage unavailable");
      return false;
    }
  }

  scheduleAutosave() {
    clearTimeout(this.timer);
    this.timer = setTimeout(() => this.save(false), 400);
  }

  attach() {
    if (this.attached) return;
    this.attached = true;
    ["boss", "team", "simulation", "damage-input", "selection"].forEach((event) => {
      this.state.addEventListener(event, () => this.scheduleAutosave());
    });
  }

  read() {
    const raw = localStorage.getItem(SETUP_STORAGE_KEY);
    if (!raw) return null;
    try {
      const payload = JSON.parse(raw);
      return payload;
    } catch {
      return null;
    }
  }

  async hydrate(payload) {
    // Handle version migration
    const version = payload?.version || 1;
    
    // Version 1 format (flat structure) - migrate to v2 structure
    if (version === 1) {
      payload = this.migrateV1ToV2(payload);
    }
    
    if (!payload?.setup?.team || !Array.isArray(payload.setup.team)) {
      throw new Error("Invalid setup schema");
    }

    // Hydrate Setup state (always present)
    const setup = payload.setup;
    
    const team = await Promise.all(Array.from({ length: 6 }, (_, index) => hydrateBuild(setup.team[index])));
    this.state.team = team;
    this.state.activeEditor = Math.max(0, Math.min(5, Number(setup.selectedSlot) || 0));

    this.state.boss = null;
    this.state.bossBaseStats = null;
    this.state.bossStats = null;
    if (setup.boss?.pokemon) {
      try {
        this.state.boss = await getPokemon(setup.boss.pokemon);
        const calculated = calculateBossStats(this.state.boss);
        const manualOverride = Boolean(setup.manualBossOverride);
        this.state.bossBaseStats = manualOverride ? cloneRecord(setup.boss.baseStats, calculated) : calculated;
        this.state.bossStats = manualOverride ? cloneRecord(setup.boss.currentStats, this.state.bossBaseStats) : { ...calculated };
        this.state.bossAbility = this.state.boss?.abilities?.[0]?.ability.name || "";
      } catch {
        // The default boss loader will recover if the API is temporarily unavailable.
      }
    }

    // Hydrate boss moves
    this.state.bossMoves = [null, null, null, null];
    if (Array.isArray(setup.bossMoves)) {
      this.state.bossMoves = await Promise.all(
        Array.from({ length: 4 }, (_, index) => hydrateMove(setup.bossMoves[index]))
      );
    } else if (this.state.boss) {
      const learnset = this.state.boss.moves.map(({ move }) => move.name).sort();
      const defaultMoves = learnset.slice(0, 4);
      for (let i = 0; i < 4; i++) {
        if (defaultMoves[i]) {
          try {
            this.state.bossMoves[i] = prepareMove(await getMove(defaultMoves[i]));
          } catch {
            this.state.bossMoves[i] = null;
          }
        }
      }
    }

    // Hydrate Manual Overrides
    this.state.manualBossOverride = !!setup.manualBossOverride;
    this.state.manualBossName = setup.manualBossName || "";
    this.state.manualBossHP = Number(setup.manualBossHP) || 0;
    this.state.manualBossMaxHP = Number(setup.manualBossMaxHP) || 0;
    this.state.manualBossCurrentTypes = Array.isArray(setup.manualBossCurrentTypes) ? [...setup.manualBossCurrentTypes] : [];
    this.state.manualBossBaseStats = setup.manualBossBaseStats ? { ...setup.manualBossBaseStats } : { hp: 0, atk: 0, def: 0, spa: 0, spd: 0, spe: 0 };
    this.state.manualBossFinalStats = cloneRecord(
      setup.manualBossFinalStats,
      this.state.bossStats || { atk: 0, def: 0, spa: 0, spd: 0, spe: 0 },
    );
    this.state.manualBossStages = setup.manualBossStages ? { ...setup.manualBossStages } : emptyStages();

    if (this.state.boss && !this.state.manualBossOverride) {
      const raidHp = calculateRaidBossHP(this.state.boss);
      this.state.manualBossName = this.state.boss.name;
      this.state.manualBossHP = raidHp;
      this.state.manualBossMaxHP = raidHp;
      this.state.manualBossCurrentTypes = this.state.boss.types.map(({ type }) => type.name);
      this.state.manualBossBaseStats = {
        hp: this.state.boss.stats.find(s => s.stat.name === "hp")?.base_stat || 0,
        atk: this.state.boss.stats.find(s => s.stat.name === "attack")?.base_stat || 0,
        def: this.state.boss.stats.find(s => s.stat.name === "defense")?.base_stat || 0,
        spa: this.state.boss.stats.find(s => s.stat.name === "special-attack")?.base_stat || 0,
        spd: this.state.boss.stats.find(s => s.stat.name === "special-defense")?.base_stat || 0,
        spe: this.state.boss.stats.find(s => s.stat.name === "speed")?.base_stat || 0,
      };
      this.state.manualBossFinalStats = {
        atk: this.state.bossStats ? this.state.bossStats.atk : 0,
        def: this.state.bossStats ? this.state.bossStats.def : 0,
        spa: this.state.bossStats ? this.state.bossStats.spa : 0,
        spd: this.state.bossStats ? this.state.bossStats.spd : 0,
        spe: this.state.bossStats ? this.state.bossStats.spe : 0,
      };
      this.state.manualBossStages = emptyStages();
    }

    // Validate and hydrate Battle state (can be null)
    const battle = payload.battle;
    
    if (battle && isBattleStateValid(battle)) {
      // Valid battle state - hydrate it
      this.state.battleActive = true;
      this.state.needsResume = true;
      this.state.uiMode = battle.uiMode || "battle";
      this.state.currentTurn = Math.max(1, Math.min(22, Number(battle.currentTurn) || 1));
      this.state.activeSlot = Math.max(0, Math.min(5, Number(battle.activeSlot) || 0));
      const savedBossMaxHp = Math.max(1, Number(battle.bossMaxHP) || 1);
      const raidBossMaxHp = this.state.boss && !this.state.manualBossOverride
        ? calculateRaidBossHP(this.state.boss)
        : savedBossMaxHp;
      const migrateBossHp = (value) => {
        const savedHp = Number(value);
        if (!Number.isFinite(savedHp)) return raidBossMaxHp;
        return Math.max(0, raidBossMaxHp - Math.max(0, savedBossMaxHp - savedHp));
      };
      this.state.bossHP = migrateBossHp(battle.bossHP);
      this.state.bossMaxHP = raidBossMaxHp;
      this.state.bossCurrentTypes = [...battle.bossCurrentTypes];
      this.state.teamHP = [...battle.teamHP];
      this.state.teamCurrentTypes = battle.teamCurrentTypes.map((t) => [...t]);
      this.state.teamStages = Array.isArray(battle.teamStages) ? battle.teamStages.map((s) => ({ ...s })) : Array.from({ length: 6 }, () => emptyStages());
      this.state.bossStages = battle.bossStages ? { ...battle.bossStages } : emptyStages();
      this.state.faintedAlliesCount = Math.max(0, Number(battle.faintedAlliesCount) || 0);
      this.state.battleLog = Array.isArray(battle.battleLog)
        ? battle.battleLog.map((turn) => ({
            ...turn,
            bossHPBefore: migrateBossHp(turn.bossHPBefore),
            bossHPAfter: migrateBossHp(turn.bossHPAfter),
          }))
        : [];
      this.state.awaitingForcedSwitch = Boolean(battle.awaitingForcedSwitch);
      this.state.forcedSwitchReason = battle.forcedSwitchReason || "";
      this.state.metronomeMoveChains = Array.from({ length: 6 }, (_, index) => ({
        moveName: String(battle.metronomeMoveChains?.[index]?.moveName || ""),
        consecutiveUses: Math.max(0, Number(battle.metronomeMoveChains?.[index]?.consecutiveUses) || 0),
      }));
      this.state.splitEvents = Array.isArray(battle.splitEvents)
        ? battle.splitEvents.map((event) => ({ kind: event.kind, slot: Number(event.slot) || 0 }))
        : [];
      this.state.volatileEffects = normalizeVolatileEffects(battle.volatileEffects);
      
      // Speed overrides
      this.state.playerSpeedOverrides = Array.isArray(battle.playerSpeedOverrides) ? [...battle.playerSpeedOverrides] : [null, null, null, null, null, null];
      this.state.bossSpeedOverride = battle.bossSpeedOverride !== undefined ? battle.bossSpeedOverride : null;
      this.state.battleSpeed = {
        player: Array.isArray(battle.battleSpeed?.player) ? [...battle.battleSpeed.player] : [null, null, null, null, null, null],
        boss: battle.battleSpeed?.boss !== undefined ? battle.battleSpeed.boss : null
      };
      this.state.abilityOverrides = {
        player: Array.isArray(battle.abilityOverrides?.player) ? [...battle.abilityOverrides.player] : [null, null, null, null, null, null],
        boss: battle.abilityOverrides?.boss || null
      };
      
      // Consumed items
      this.state.consumedItems = {
        player: Array.isArray(battle.consumedItems?.player) ? [...battle.consumedItems.player] : [false, false, false, false, false, false],
        boss: !!battle.consumedItems?.boss
      };
      
      // Z-Move Used state
      this.state.zMoveUsed = {
        player: Array.isArray(battle.zMoveUsed?.player) ? [...battle.zMoveUsed.player] : [false, false, false, false, false, false],
        boss: !!battle.zMoveUsed?.boss
      };
      
      // Terastallize state
      this.state.teraUsed = {
        player: !!battle.teraUsed?.player,
        boss: !!battle.teraUsed?.boss
      };
      this.state.terastallized = {
        player: Array.isArray(battle.terastallized?.player) ? [...battle.terastallized.player] : [false, false, false, false, false, false],
        boss: !!battle.terastallized?.boss
      };
      
      // Damage Roll Mode
      this.state.damageRollMode = battle.damageRollMode || localStorage.getItem("myuu_raid_damage_roll_mode") || "random";
      
      // Stats tracking
      this.state.bossOriginalStats = battle.bossOriginalStats ? { ...battle.bossOriginalStats } : null;
      this.state.bossCurrentStats = battle.bossCurrentStats ? { ...battle.bossCurrentStats } : null;
      this.state.bossStatSources = battle.bossStatSources ? JSON.parse(JSON.stringify(battle.bossStatSources)) : null;

      // Team stats
      this.state.team.forEach((slot, idx) => {
        if (battle.teamOriginalStats?.[idx]) slot.originalStats = { ...battle.teamOriginalStats[idx] };
        if (battle.teamCurrentStats?.[idx]) slot.currentStats = { ...battle.teamCurrentStats[idx] };
        if (battle.teamStatSources?.[idx]) slot.statSources = JSON.parse(JSON.stringify(battle.teamStatSources[idx]));
        slot.speedOverride = battle.teamSpeedOverrides?.[idx];
      });
      
      // History
      this.state.history = Array.isArray(battle.history)
        ? battle.history.map((snapshot) => ({
            ...snapshot,
            bossHP: migrateBossHp(snapshot.bossHP),
            bossMaxHP: raidBossMaxHp,
            battleLog: Array.isArray(snapshot.battleLog)
              ? snapshot.battleLog.map((turn) => ({
                  ...turn,
                  bossHPBefore: migrateBossHp(turn.bossHPBefore),
                  bossHPAfter: migrateBossHp(turn.bossHPAfter),
                }))
              : [],
          }))
        : [];
      
    } else {
      // No valid battle state - initialize fresh battle state (but keep setup)
      this.state.battleActive = false;
      this.state.savedBattleBroken = !!battle?.battleActive; // Mark broken if there was supposed to be a battle
      this.state.uiMode = "builder";
      this.state.currentTurn = 1;
      this.state.activeSlot = 0;
      this.state.bossHP = 0;
      this.state.bossMaxHP = 0;
      this.state.bossCurrentTypes = this.state.boss ? this.state.boss.types.map(({ type }) => type.name) : [];
      this.state.teamHP = [0, 0, 0, 0, 0, 0];
      this.state.teamCurrentTypes = this.state.team.map((slot) =>
        slot.pokemon ? slot.pokemon.types.map(({ type }) => type.name) : []
      );
      this.state.teamStages = Array.from({ length: 6 }, () => emptyStages());
      this.state.bossStages = emptyStages();
      this.state.faintedAlliesCount = 0;
      this.state.battleLog = [];
      this.state.history = [];
      this.state.needsResume = false;
      this.state.teraUsed = {
        player: false,
        boss: false
      };
      this.state.terastallized = {
        player: [false, false, false, false, false, false],
        boss: false
      };
      this.state.playerSpeedOverrides = [null, null, null, null, null, null];
      this.state.bossSpeedOverride = null;
      this.state.battleSpeed = {
        player: [null, null, null, null, null, null],
        boss: null
      };
      this.state.abilityOverrides = {
        player: [null, null, null, null, null, null],
        boss: null
      };
      this.state.consumedItems = {
        player: [false, false, false, false, false, false],
        boss: false
      };
      this.state.zMoveUsed = {
        player: [false, false, false, false, false, false],
        boss: false
      };
      this.state.awaitingForcedSwitch = false;
      this.state.forcedSwitchReason = "";
      this.state.metronomeMoveChains = Array.from({ length: 6 }, () => ({ moveName: "", consecutiveUses: 0 }));
      this.state.splitEvents = [];
      this.state.volatileEffects = normalizeVolatileEffects();
      this.state.damageRollMode = localStorage.getItem("myuu_raid_damage_roll_mode") || "random";
    }

    this.state.results = [];
    this.state.cursor = 0;
  }

  // Migrate v1 format to v2 format
  migrateV1ToV2(v1Payload) {
    return {
      version: VERSION,
      savedAt: v1Payload.savedAt || new Date().toISOString(),
      setup: {
        boss: v1Payload.boss,
        bossMoves: v1Payload.bossMoves,
        team: v1Payload.team,
        selectedSlot: v1Payload.selectedSlot,
        manualBossOverride: v1Payload.manualBossOverride,
        manualBossName: v1Payload.manualBossName,
        manualBossHP: v1Payload.manualBossHP,
        manualBossMaxHP: v1Payload.manualBossMaxHP,
        manualBossCurrentTypes: v1Payload.manualBossCurrentTypes,
        manualBossBaseStats: v1Payload.manualBossBaseStats,
        manualBossFinalStats: v1Payload.manualBossFinalStats,
        manualBossStages: v1Payload.manualBossStages,
      },
      battle: v1Payload.battleActive ? v1Payload : null,
    };
  }

  async load(startup = false) {
    try {
      const payload = this.read();
      if (!payload) {
        this.status("No saved setup found");
        return false;
      }
      this.status("Loading saved setup…");
      await this.hydrate(payload);
      this.status("Loaded saved setup");
      if (!startup) this.state.emit("restore");
      return true;
    } catch {
      this.status("Saved setup could not be loaded");
      return false;
    }
  }

  async importJson(text) {
    try {
      const payload = JSON.parse(text);
      if (!payload?.setup?.team || !Array.isArray(payload.setup.team)) throw new Error();
      await this.hydrate(payload);
      localStorage.setItem(SETUP_STORAGE_KEY, JSON.stringify(this.serialize()));
      this.state.emit("restore");
      this.status("Imported setup");
      return true;
    } catch {
      this.status("Import failed: invalid setup JSON");
      return false;
    }
  }

  exportJson() {
    // Setup exports intentionally omit live battle state and boss final defenses.
    return JSON.stringify(redactBossDefensesForExport(this.serialize(false)), null, 2);
  }

  clear() {
    localStorage.removeItem(SETUP_STORAGE_KEY);
    this.status("Saved setup cleared");
  }
}
