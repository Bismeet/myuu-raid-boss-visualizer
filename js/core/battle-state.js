import {
  emptyStages,
  getStoredPowerLikeBasePower as storedPowerLikeBasePowerFromStages,
  getTotalPositiveStages as totalPositiveStagesFromStages,
  resolveDynamicMovePower,
} from "./stages.js";
import { calculatePokemonStats, calculateRaidBossHP } from "./stats.js";
import { damageRolls } from "./damage.js";
import { displayName, titleCase, getBossDisplayName } from "../utils/format.js";
import { ITEM_EFFECTS } from "../data/item-effects.js";
import { MOVE_EFFECTS, applyDamagingMoveAfterEffects } from "../data/move-effects.js";
import { POKEMON_TYPES, addType, removeType, resolveMoveType, withMoveType } from "./type-mechanics.js";
import { typeEffectiveness } from "../data/type-chart.js";

const blankStats = () => ({ hp: 0, atk: 0, def: 0, spa: 0, spd: 0, spe: 0 });
const blankSpread = (value) => ({ hp: value, atk: value, def: value, spa: value, spd: value, spe: value });
const freshMoveChains = () => Array.from({ length: 6 }, () => ({ moveName: "", consecutiveUses: 0 }));

export function halveBossOffensiveStats(stats = {}) {
  return {
    ...stats,
    atk: Math.floor((Number(stats.atk) || 0) / 2),
    spa: Math.floor((Number(stats.spa) || 0) / 2),
  };
}

export function metronomeMultiplierForUse(consecutiveUses = 1) {
  return Math.min(1 + (0.2 * Math.max(0, (Number(consecutiveUses) || 1) - 1)), 2);
}

export function formatDamagePercent(damage, maxHP) {
  if (!(Number(maxHP) > 0)) return "0.0";
  return ((Math.max(0, Number(damage) || 0) / Number(maxHP)) * 100).toFixed(1);
}
const freshVolatileEffects = () => ({
  octolock: null,
  ingrain: [false, false, false, false, false, false],
  ingrainBoss: false,
  tarShot: { player: [false, false, false, false, false, false], boss: false },
  roost: { player: [null, null, null, null, null, null], boss: null },
  electrifyTarget: null,
  ionDeluge: false,
  lastMoveType: { player: null, boss: null },
  trickRoomTurns: 0,
});

export function normalizeVolatileEffects(value = {}) {
  const fresh = freshVolatileEffects();
  return {
    octolock: value.octolock ? { ...value.octolock } : null,
    ingrain: Array.isArray(value.ingrain) ? fresh.ingrain.map((fallback, index) => Boolean(value.ingrain[index] ?? fallback)) : fresh.ingrain,
    ingrainBoss: Boolean(value.ingrainBoss),
    tarShot: {
      player: Array.isArray(value.tarShot?.player)
        ? fresh.tarShot.player.map((fallback, index) => Boolean(value.tarShot.player[index] ?? fallback))
        : fresh.tarShot.player,
      boss: Boolean(value.tarShot?.boss),
    },
    roost: {
      player: Array.isArray(value.roost?.player)
        ? fresh.roost.player.map((fallback, index) => Array.isArray(value.roost.player[index]) ? [...value.roost.player[index]] : fallback)
        : fresh.roost.player,
      boss: Array.isArray(value.roost?.boss) ? [...value.roost.boss] : null,
    },
    electrifyTarget: ["player", "boss"].includes(value.electrifyTarget) ? value.electrifyTarget : null,
    ionDeluge: Boolean(value.ionDeluge),
    lastMoveType: {
      player: value.lastMoveType?.player || null,
      boss: value.lastMoveType?.boss || null,
    },
    trickRoomTurns: Math.max(0, Math.min(5, Number(value.trickRoomTurns) || 0)),
  };
}

export function normalizeAbility(ability) {
  return (ability || "").toLowerCase().trim().replaceAll(" ", "-");
}

export function selectDamageFromRolls(rolls, mode = "random") {
  if (!Array.isArray(rolls) || rolls.length === 0) {
    return { damage: 0, rollPercent: 1.0, index: 15 };
  }

  let index = 15;
  if (mode === "min") {
    index = 0;
  } else if (mode === "max") {
    index = rolls.length - 1;
  } else if (mode === "average") {
    const avgDamage = Math.round(rolls.reduce((a, b) => a + b, 0) / rolls.length);
    return { damage: avgDamage, rollPercent: 0.925, index: 7 };
  } else {
    index = Math.floor(Math.random() * rolls.length);
  }

  const damage = rolls[index];
  const rollPercent = (85 + index) / 100;
  return { damage, rollPercent, index };
}

export function createBuild() {
  return {
    pokemon: null,
    level: 100,
    nature: "adamant",
    ability: "",
    item: "",
    itemData: null,
    metronomeMultiplier: 1,
    moves: [null, null, null, null],
    evs: blankSpread(0),
    ivs: blankSpread(31),
    stages: emptyStages(),
    stats: blankStats(),
    teraType: "normal",
  };
}

export class BattleState extends EventTarget {
  constructor() {
    super();
    this.boss = null;
    this.bossBaseStats = null;
    this.bossStats = null;
    this.team = Array.from({ length: 6 }, createBuild);
    this.activeEditor = 0;

    // Live Battle State
    this.battleActive = false;
    this.currentTurn = 1;
    this.activeSlot = 0;
    this.bossHP = 0;
    this.bossMaxHP = 0;
    this.bossCurrentTypes = [];
    this.teamHP = [0, 0, 0, 0, 0, 0];
    this.teamCurrentTypes = [];
    this.teamStages = Array.from({ length: 6 }, () => emptyStages());
    this.bossStages = emptyStages();
    this.bossMoves = [null, null, null, null];
    this.bossAbility = "";
    this.faintedAlliesCount = 0;
    this.battleLog = [];
    this.history = [];

    // Speed Overrides and Consumed Items
    this.playerSpeedOverrides = [null, null, null, null, null, null];
    this.bossSpeedOverride = null;
    this.battleSpeed = {
      player: [null, null, null, null, null, null],
      boss: null
    };
    this.abilityOverrides = {
      player: [null, null, null, null, null, null],
      boss: null
    };
    this.consumedItems = {
      player: [false, false, false, false, false, false],
      boss: false
    };
    this.zMoveUsed = {
      player: [false, false, false, false, false, false],
      boss: false
    };
    this.teraUsed = {
      player: false,
      boss: false
    };
    this.terastallized = {
      player: [false, false, false, false, false, false],
      boss: false
    };
    this.damageRollMode = "random";
    this.privateDamageResolver = null;
    this.splitEvents = [];
    this.volatileEffects = freshVolatileEffects();

    this.savedBattleBroken = false;
    this.needsResume = false;
    this.uiMode = "builder";
    this.isResolvingTurn = false;

    // Manual Overrides
    this.manualBossOverride = false;
    this.manualBossName = "";
    this.manualBossHP = 0;
    this.manualBossMaxHP = 0;
    this.manualBossCurrentTypes = [];
    this.manualBossBaseStats = { hp: 0, atk: 0, def: 0, spa: 0, spd: 0, spe: 0 };
    this.manualBossFinalStats = { atk: 0, def: 0, spa: 0, spd: 0, spe: 0 };
    this.manualBossStages = emptyStages();
    this.awaitingForcedSwitch = false;
    this.forcedSwitchReason = "";
    this.metronomeMoveChains = freshMoveChains();

    // Fallback/Legacy plan array to prevent crashes in un-migrated code
    this.plan = Array.from({ length: 21 }, (_, index) => ({
      turn: index + 1,
      slot: 0,
      action: "",
      switchMode: index ? "normal" : "stay",
    }));
    this.results = [];
    this.cursor = 0;
  }

  emit(type = "change") {
    this.dispatchEvent(new CustomEvent(type, { detail: this }));
  }

  setBoss(pokemon, stats) {
    this.boss = pokemon;
    this.bossBaseStats = { ...stats };
    this.bossStats = { ...stats };
    this.bossCurrentTypes = pokemon ? pokemon.types.map(({ type }) => type.name) : [];
    this.bossMoves = [null, null, null, null];
    this.bossAbility = pokemon?.abilities?.[0]?.ability.name || "";
    
    // Prefill manual override fields
    this.manualBossOverride = false;
    this.manualBossName = pokemon ? pokemon.name : "";
    const raidHp = pokemon ? calculateRaidBossHP(pokemon) : 0;
    this.manualBossHP = raidHp;
    this.manualBossMaxHP = raidHp;
    this.manualBossCurrentTypes = pokemon ? pokemon.types.map(({ type }) => type.name) : [];
    this.manualBossBaseStats = {
      hp: pokemon ? (pokemon.stats.find(s => s.stat.name === "hp")?.base_stat || 0) : 0,
      atk: pokemon ? (pokemon.stats.find(s => s.stat.name === "attack")?.base_stat || 0) : 0,
      def: pokemon ? (pokemon.stats.find(s => s.stat.name === "defense")?.base_stat || 0) : 0,
      spa: pokemon ? (pokemon.stats.find(s => s.stat.name === "special-attack")?.base_stat || 0) : 0,
      spd: pokemon ? (pokemon.stats.find(s => s.stat.name === "special-defense")?.base_stat || 0) : 0,
      spe: pokemon ? (pokemon.stats.find(s => s.stat.name === "speed")?.base_stat || 0) : 0,
    };
    this.manualBossFinalStats = {
      atk: stats ? stats.atk : 0,
      def: stats ? stats.def : 0,
      spa: stats ? stats.spa : 0,
      spd: stats ? stats.spd : 0,
      spe: stats ? stats.spe : 0,
    };
    this.manualBossStages = emptyStages();

    this.resetSimulation();
    this.emit("boss");
  }

  updateBuild(index, patch) {
    Object.assign(this.team[index], patch);
    this.emit("team");
  }

  resetSimulation() {
    if (this.bossBaseStats) this.bossStats = { ...this.bossBaseStats };
    this.results = [];
    this.cursor = 0;
    this.emit("simulation");
  }

  // Live Battle API
  startBattle() {
    if (!this.boss) {
      throw new Error("Cannot start battle: Boss not loaded.");
    }
    const hasAttacker = this.team.some((slot) => slot.pokemon);
    if (!hasAttacker) {
      throw new Error("Cannot start battle: Strike team is empty.");
    }

    // Lead active slot is the first non-empty slot
    const leadIndex = this.team.findIndex((slot) => slot.pokemon);
    this.activeSlot = leadIndex >= 0 ? leadIndex : 0;

    this.currentTurn = 1;

    if (this.manualBossOverride) {
      this.bossMaxHP = this.manualBossMaxHP;
      this.bossHP = this.manualBossHP;
      this.bossCurrentTypes = [...this.manualBossCurrentTypes];
      this.bossStats = {
        hp: this.manualBossBaseStats.hp,
        atk: this.manualBossFinalStats.atk,
        def: this.manualBossFinalStats.def,
        spa: this.manualBossFinalStats.spa,
        spd: this.manualBossFinalStats.spd,
        spe: this.manualBossFinalStats.spe,
      };
      this.bossStages = { ...this.manualBossStages };
    } else {
      this.bossMaxHP = calculateRaidBossHP(this.boss);
      this.bossHP = this.bossMaxHP;
      if (!this.bossCurrentTypes || this.bossCurrentTypes.length === 0) {
        this.bossCurrentTypes = this.boss && this.boss.types ? this.boss.types.map(({ type }) => type.name) : [];
      }
    }

    this.teamHP = this.team.map((slot) => (slot.pokemon ? slot.stats.hp : 0));
    this.teamCurrentTypes = this.team.map((slot) =>
      slot.pokemon ? (slot.pokemon.types || []).map(({ type }) => type.name) : []
    );
    this.teamStages = this.team.map((slot) => ({ ...slot.stages }));
    if (!this.manualBossOverride) {
      this.bossStages = emptyStages();
    }
    this.faintedAlliesCount = 0;
    this.battleLog = [];
    this.history = [];
    this.battleActive = true;
    this.uiMode = "battle";
    this.isResolvingTurn = false;
    this.awaitingForcedSwitch = false;
    this.forcedSwitchReason = "";
    this.metronomeMoveChains = freshMoveChains();
    this.splitEvents = [];
    this.volatileEffects = freshVolatileEffects();

    this.playerSpeedOverrides = [null, null, null, null, null, null];
    this.bossSpeedOverride = null;
    this.battleSpeed = {
      player: [null, null, null, null, null, null],
      boss: null
    };
    this.abilityOverrides = {
      player: [null, null, null, null, null, null],
      boss: null
    };
    this.consumedItems = {
      player: [false, false, false, false, false, false],
      boss: false
    };
    this.zMoveUsed = {
      player: [false, false, false, false, false, false],
      boss: false
    };
    this.teraUsed = {
      player: false,
      boss: false
    };
    this.terastallized = {
      player: [false, false, false, false, false, false],
      boss: false
    };

    if (!this.manualBossOverride && this.bossBaseStats) {
      this.bossStats = { ...this.bossBaseStats };
    }

    // Capture original/current stats and sources
    this.team.forEach((slot) => {
      if (slot.pokemon) {
        slot.originalStats = {
          atk: slot.stats.atk,
          def: slot.stats.def,
          spa: slot.stats.spa,
          spd: slot.stats.spd,
          spe: slot.stats.spe,
        };
        slot.currentStats = { ...slot.originalStats };
        slot.statSources = {
          atk: ["Base"],
          def: ["Base"],
          spa: ["Base"],
          spd: ["Base"],
          spe: ["Base"],
        };
        slot.speedOverride = null;
      }
    });

    this.bossOriginalStats = halveBossOffensiveStats({
      atk: this.bossStats.atk,
      def: this.bossStats.def,
      spa: this.bossStats.spa,
      spd: this.bossStats.spd,
      spe: this.bossStats.spe,
    });
    this.bossCurrentStats = { ...this.bossOriginalStats };
    this.bossStatSources = {
      atk: [this.manualBossOverride ? "Manual override" : "Public fallback"],
      def: [this.manualBossOverride ? "Manual override" : "Public fallback"],
      spa: [this.manualBossOverride ? "Manual override" : "Public fallback"],
      spd: [this.manualBossOverride ? "Manual override" : "Public fallback"],
      spe: [this.manualBossOverride ? "Manual override" : "Public fallback"],
    };
    this.bossSpeedOverride = null;

    this.emit("simulation");
    this.emit("team");
  }

  startNewBattleFromCurrentSetup() {
    this.needsResume = false;
    this.savedBattleBroken = false;
    this.startBattle();
    // Explicitly set battle mode after starting
    this.battleActive = true;
    this.uiMode = "battle";
  }

  resetBattleOnly() {
    this.resetBattle();
  }

  resetBattle() {
    this.battleActive = false;
    this.uiMode = "builder";
    this.isResolvingTurn = false;
    this.currentTurn = 1;
    this.activeSlot = 0;
    this.needsResume = false;
    this.savedBattleBroken = false;
    this.zMoveUsed = {
      player: [false, false, false, false, false, false],
      boss: false
    };
    this.teraUsed = {
      player: false,
      boss: false
    };
    this.terastallized = {
      player: [false, false, false, false, false, false],
      boss: false
    };

    if (this.manualBossOverride) {
      this.bossHP = this.manualBossHP;
      this.bossMaxHP = this.manualBossMaxHP;
      this.bossCurrentTypes = [...this.manualBossCurrentTypes];
      this.bossStats = {
        hp: this.manualBossBaseStats.hp,
        atk: this.manualBossFinalStats.atk,
        def: this.manualBossFinalStats.def,
        spa: this.manualBossFinalStats.spa,
        spd: this.manualBossFinalStats.spd,
        spe: this.manualBossFinalStats.spe,
      };
      this.bossStages = { ...this.manualBossStages };
    } else {
      this.bossHP = 0;
      this.bossMaxHP = 0;
      this.bossCurrentTypes = [];
      this.bossStages = emptyStages();
      if (this.bossBaseStats) {
        this.bossStats = { ...this.bossBaseStats };
      }
    }

    this.teamHP = [0, 0, 0, 0, 0, 0];
    this.teamCurrentTypes = [];
    this.teamStages = Array.from({ length: 6 }, () => emptyStages());
    this.faintedAlliesCount = 0;
    this.battleLog = [];
    this.history = [];
    this.awaitingForcedSwitch = false;
    this.forcedSwitchReason = "";
    this.metronomeMoveChains = freshMoveChains();
    this.splitEvents = [];
    this.volatileEffects = freshVolatileEffects();
    this.team.forEach((slot) => {
      if (slot.pokemon) {
        slot.stats = calculatePokemonStats(slot.pokemon, slot);
        slot.originalStats = {
          atk: slot.stats.atk,
          def: slot.stats.def,
          spa: slot.stats.spa,
          spd: slot.stats.spd,
          spe: slot.stats.spe,
        };
        slot.currentStats = { ...slot.originalStats };
        slot.statSources = {
          atk: ["Base"],
          def: ["Base"],
          spa: ["Base"],
          spd: ["Base"],
          spe: ["Base"],
        };
        slot.speedOverride = null;
      }
    });

    this.bossOriginalStats = null;
    this.bossCurrentStats = null;
    this.bossStatSources = null;
    this.bossSpeedOverride = null;
    this.playerSpeedOverrides = [null, null, null, null, null, null];
    this.battleSpeed = {
      player: [null, null, null, null, null, null],
      boss: null
    };
    this.abilityOverrides = {
      player: [null, null, null, null, null, null],
      boss: null
    };
    this.consumedItems = {
      player: [false, false, false, false, false, false],
      boss: false
    };

    this.emit("simulation");
    this.emit("team");
  }

  resetSlotStats(idx) {
    const slot = this.team[idx];
    if (slot && slot.pokemon && slot.originalStats) {
      slot.currentStats = { ...slot.originalStats };
      slot.statSources = {
        atk: ["Base"],
        def: ["Base"],
        spa: ["Base"],
        spd: ["Base"],
        spe: ["Base"],
      };
      this.playerSpeedOverrides[idx] = null;
      if (this.battleSpeed) {
        this.battleSpeed.player[idx] = null;
      }
      if (this.abilityOverrides) {
        this.abilityOverrides.player[idx] = null;
      }
      slot.speedOverride = null;
      slot.stats = {
        hp: slot.originalStats.hp ?? slot.stats.hp,
        atk: slot.originalStats.atk,
        def: slot.originalStats.def,
        spa: slot.originalStats.spa,
        spd: slot.originalStats.spd,
        spe: slot.originalStats.spe,
      };
    }
  }

  createSnapshot() {
    return {
      currentTurn: this.currentTurn,
      activeSlot: this.activeSlot,
      bossHP: this.bossHP,
      bossMaxHP: this.bossMaxHP,
      bossCurrentTypes: [...this.bossCurrentTypes],
      teamHP: [...this.teamHP],
      teamCurrentTypes: this.teamCurrentTypes.map((t) => [...t]),
      teamStages: this.teamStages.map((s) => ({ ...s })),
      bossStages: { ...this.bossStages },
      faintedAlliesCount: this.faintedAlliesCount,
      awaitingForcedSwitch: this.awaitingForcedSwitch,
      forcedSwitchReason: this.forcedSwitchReason,
      metronomeMoveChains: this.metronomeMoveChains.map((chain) => ({ ...chain })),
      battleLog: [...this.battleLog],
      bossStats: this.bossStats ? { ...this.bossStats } : null,
      teamStats: this.team.map((slot) => ({ ...slot.stats })),
      bossOriginalStats: this.bossOriginalStats ? { ...this.bossOriginalStats } : null,
      bossCurrentStats: this.bossCurrentStats ? { ...this.bossCurrentStats } : null,
      bossStatSources: this.bossStatSources ? JSON.parse(JSON.stringify(this.bossStatSources)) : null,
      bossSpeedOverride: this.bossSpeedOverride,
      teamOriginalStats: this.team.map((slot) => slot.originalStats ? { ...slot.originalStats } : null),
      teamCurrentStats: this.team.map((slot) => slot.currentStats ? { ...slot.currentStats } : null),
      teamStatSources: this.team.map((slot) => slot.statSources ? JSON.parse(JSON.stringify(slot.statSources)) : null),
      teamSpeedOverrides: this.team.map((slot) => slot.speedOverride),
      playerSpeedOverridesSnapshot: [...this.playerSpeedOverrides],
      consumedItemsSnapshot: {
        player: [...this.consumedItems.player],
        boss: this.consumedItems.boss
      },
      zMoveUsedSnapshot: {
        player: [...this.zMoveUsed.player],
        boss: this.zMoveUsed.boss
      },
      teraUsedSnapshot: {
        player: this.teraUsed.player,
        boss: this.teraUsed.boss
      },
      terastallizedSnapshot: {
        player: [...this.terastallized.player],
        boss: this.terastallized.boss
      },
      battleSpeedSnapshot: {
        player: [...this.battleSpeed.player],
        boss: this.battleSpeed.boss
      },
      abilityOverridesSnapshot: {
        player: [...this.abilityOverrides.player],
        boss: this.abilityOverrides.boss
      },
      splitEventsSnapshot: this.splitEvents.map((event) => ({ ...event })),
      volatileEffectsSnapshot: JSON.parse(JSON.stringify(this.volatileEffects)),
      damageRollMode: this.damageRollMode
    };
  }

  undoLastTurn() {
    if (!this.battleActive || this.history.length === 0) return;

    const snapshot = this.history.pop();

    this.currentTurn = snapshot.currentTurn;
    this.activeSlot = snapshot.activeSlot;
    this.bossHP = snapshot.bossHP;
    this.bossMaxHP = snapshot.bossMaxHP;
    this.bossCurrentTypes = [...snapshot.bossCurrentTypes];
    this.teamHP = [...snapshot.teamHP];
    this.teamCurrentTypes = snapshot.teamCurrentTypes.map((t) => [...t]);
    this.teamStages = snapshot.teamStages.map((s) => ({ ...s }));
    this.bossStages = { ...snapshot.bossStages };
    this.faintedAlliesCount = snapshot.faintedAlliesCount;
    this.awaitingForcedSwitch = Boolean(snapshot.awaitingForcedSwitch);
    this.forcedSwitchReason = snapshot.forcedSwitchReason || "";
    this.metronomeMoveChains = Array.isArray(snapshot.metronomeMoveChains)
      ? freshMoveChains().map((fallback, index) => ({ ...fallback, ...snapshot.metronomeMoveChains[index] }))
      : freshMoveChains();
    this.battleLog = [...snapshot.battleLog];

    if (snapshot.bossStats) {
      this.bossStats = { ...snapshot.bossStats };
    }

    snapshot.teamStats.forEach((stats, idx) => {
      if (this.team[idx]) {
        this.team[idx].stats = { ...stats };
      }
    });

    if (snapshot.bossOriginalStats) this.bossOriginalStats = { ...snapshot.bossOriginalStats };
    if (snapshot.bossCurrentStats) this.bossCurrentStats = { ...snapshot.bossCurrentStats };
    if (snapshot.bossStatSources) this.bossStatSources = JSON.parse(JSON.stringify(snapshot.bossStatSources));
    this.bossSpeedOverride = snapshot.bossSpeedOverride;

    this.team.forEach((slot, idx) => {
      if (slot) {
        if (snapshot.teamOriginalStats[idx]) slot.originalStats = { ...snapshot.teamOriginalStats[idx] };
        if (snapshot.teamCurrentStats[idx]) slot.currentStats = { ...snapshot.teamCurrentStats[idx] };
        if (snapshot.teamStatSources[idx]) slot.statSources = JSON.parse(JSON.stringify(snapshot.teamStatSources[idx]));
        slot.speedOverride = snapshot.teamSpeedOverrides[idx];
      }
    });

    if (snapshot.playerSpeedOverridesSnapshot) this.playerSpeedOverrides = [...snapshot.playerSpeedOverridesSnapshot];
    if (snapshot.consumedItemsSnapshot) {
      this.consumedItems = {
        player: [...snapshot.consumedItemsSnapshot.player],
        boss: snapshot.consumedItemsSnapshot.boss
      };
    }
    if (snapshot.zMoveUsedSnapshot) {
      this.zMoveUsed = {
        player: [...snapshot.zMoveUsedSnapshot.player],
        boss: snapshot.zMoveUsedSnapshot.boss
      };
    }
    if (snapshot.teraUsedSnapshot) {
      this.teraUsed = {
        player: snapshot.teraUsedSnapshot.player,
        boss: snapshot.teraUsedSnapshot.boss
      };
    }
    if (snapshot.terastallizedSnapshot) {
      this.terastallized = {
        player: [...snapshot.terastallizedSnapshot.player],
        boss: snapshot.terastallizedSnapshot.boss
      };
    }
    if (snapshot.battleSpeedSnapshot) {
      this.battleSpeed = {
        player: [...snapshot.battleSpeedSnapshot.player],
        boss: snapshot.battleSpeedSnapshot.boss
      };
    }
    if (snapshot.abilityOverridesSnapshot) {
      this.abilityOverrides = {
        player: [...snapshot.abilityOverridesSnapshot.player],
        boss: snapshot.abilityOverridesSnapshot.boss
      };
    }
    this.splitEvents = Array.isArray(snapshot.splitEventsSnapshot)
      ? snapshot.splitEventsSnapshot.map((event) => ({ ...event }))
      : [];
    this.volatileEffects = normalizeVolatileEffects(snapshot.volatileEffectsSnapshot);
    if (snapshot.damageRollMode !== undefined) {
      this.damageRollMode = snapshot.damageRollMode;
    }

    this.emit("simulation");
    this.emit("team");
  }

  recordSplitEvent(kind, slot = this.activeSlot) {
    this.splitEvents.push({ kind, slot });
  }

  clearPlayerVolatileEffects(slot) {
    this.volatileEffects.ingrain[slot] = false;
    this.volatileEffects.tarShot.player[slot] = false;
    this.volatileEffects.roost.player[slot] = null;
    if (this.volatileEffects.octolock?.target === "player"
      && this.volatileEffects.octolock.targetSlot === slot) {
      this.volatileEffects.octolock = null;
    }
  }

  buildPrivateDamageRequest(direction, currentActive, move, attackerAbility, defenderAbility, attackerItem = "") {
    const maxHits = Number(move?.meta?.max_hits);
    const hitCount = normalizeAbility(attackerAbility) === "skill-link" && Number.isFinite(maxHits) && maxHits > 1
      ? Math.min(5, maxHits)
      : 1;
    const publicFallbackStats = { atk: 1, def: 1, spa: 1, spd: 1, spe: 1 };
    const teamBaseStats = this.team.map((slot) => {
      const stats = slot.originalStats || slot.stats;
      if (!slot.pokemon || !stats) return { ...publicFallbackStats };
      return Object.fromEntries(Object.keys(publicFallbackStats).map((key) => [key, Math.max(1, Number(stats[key]) || 1)]));
    });

    return {
      direction,
      boss: this.boss.name,
      move: move.name,
      moveType: move.type?.name || "normal",
      customPower: move.customPower ?? move.basePower ?? move.power ?? null,
      hitCount,
      faintedAllies: this.faintedAlliesCount,
      activeSlot: this.activeSlot,
      teamBaseStats,
      splitEvents: this.splitEvents.map((event) => ({ ...event })),
      tarShot: direction === "player-to-boss"
        ? this.volatileEffects.tarShot.boss
        : this.volatileEffects.tarShot.player[this.activeSlot],
      player: {
        pokemon: currentActive.pokemon.name,
        level: currentActive.level,
        ability: direction === "player-to-boss" ? attackerAbility : defenderAbility,
        item: direction === "player-to-boss" ? attackerItem : getEffectiveItem({ slotIndex: this.activeSlot, item: currentActive.item }, this),
        teraType: currentActive.teraType || "normal",
        terastallized: this.terastallized.player[this.activeSlot],
        types: [...this.teamCurrentTypes[this.activeSlot]],
        stages: { ...this.teamStages[this.activeSlot] },
        atFullHp: this.teamHP[this.activeSlot] === currentActive.stats.hp,
        metronomeMultiplier: Number(currentActive.battleMetronomeMultiplier) || 1,
      },
      bossState: {
        ability: direction === "player-to-boss" ? defenderAbility : attackerAbility,
        types: [...this.bossCurrentTypes],
        stages: { ...this.bossStages },
        atFullHp: this.bossHP === this.bossMaxHP,
      },
    };
  }

  async resolveDamage(localPayload, request) {
    if (!this.privateDamageResolver || this.manualBossOverride) return damageRolls(localPayload);
    const safeResult = await this.privateDamageResolver(request);
    const basePower = localPayload.move?.basePower ?? localPayload.move?.power ?? null;
    const usedPower = localPayload.move?.customPower ?? basePower;
    return {
      rolls: safeResult.rolls,
      myuuRolls: safeResult.myuuRolls,
      myuuAverage: safeResult.myuuAverage,
      min: safeResult.rolls[0],
      max: safeResult.rolls.at(-1),
      effectiveness: safeResult.effectiveness,
      basePower,
      usedPower,
      criticalModifier: 1,
    };
  }

  getCurrentTypes(side) {
    return side === "boss" ? this.bossCurrentTypes : this.teamCurrentTypes[this.activeSlot];
  }

  setCurrentTypes(side, types) {
    const next = [...new Set((types || []).filter(Boolean))];
    if (side === "boss") this.bossCurrentTypes = next;
    else this.teamCurrentTypes[this.activeSlot] = next;
    return next;
  }

  applyTarShot(targetSide) {
    if (targetSide === "boss") this.volatileEffects.tarShot.boss = true;
    else this.volatileEffects.tarShot.player[this.activeSlot] = true;
  }

  beginRoost(side) {
    const before = [...this.getCurrentTypes(side)];
    const withoutFlying = removeType(before, "flying");
    if (side === "boss") this.volatileEffects.roost.boss = before;
    else this.volatileEffects.roost.player[this.activeSlot] = before;
    this.setCurrentTypes(side, withoutFlying);
    return { before, after: withoutFlying };
  }

  resolveActionMove(move, side, turnLog) {
    if (!move) return move;
    const originalType = move.type?.name || "normal";
    const electrified = this.volatileEffects.electrifyTarget === side;
    const effectiveType = resolveMoveType(originalType, {
      electrify: electrified,
      ionDeluge: this.volatileEffects.ionDeluge,
    });
    if (electrified) this.volatileEffects.electrifyTarget = null;
    if (effectiveType !== originalType) {
      turnLog.notes.push(`${titleCase(move.name)} became Electric type for this turn!`);
    }
    this.volatileEffects.lastMoveType[side] = effectiveType;
    return withMoveType(move, effectiveType);
  }

  conversion2TypeFor(side) {
    const targetSide = side === "player" ? "boss" : "player";
    const lastType = this.volatileEffects.lastMoveType[targetSide];
    if (!lastType) return "";
    const current = this.getCurrentTypes(side);
    return POKEMON_TYPES.find((type) => !current.includes(type) && typeEffectiveness(lastType, [type]) < 1)
      || POKEMON_TYPES.find((type) => typeEffectiveness(lastType, [type]) < 1)
      || "";
  }

  removeUserTypeAfterMove(side, moveName) {
    const removedType = moveName === "burn-up" ? "fire" : moveName === "double-shock" ? "electric" : "";
    if (!removedType) return null;
    const before = this.getCurrentTypes(side);
    if (!before.includes(removedType)) return null;
    const after = removeType(before, removedType);
    this.setCurrentTypes(side, after);
    return { removedType, after };
  }

  processEndOfTurnEffects(turnLog) {
    const octolock = this.volatileEffects.octolock;
    if (octolock?.active) {
      const targetIsBoss = octolock.target === "boss";
      const targetAlive = targetIsBoss ? this.bossHP > 0 : this.teamHP[this.activeSlot] > 0;
      if (targetAlive) {
        const targetRef = targetIsBoss ? { isBoss: true } : { slotIndex: this.activeSlot, isBoss: false };
        const targetName = targetIsBoss
          ? `The opposing ${getBossDisplayName(this)}`
          : displayName(this.team[this.activeSlot].pokemon.name);
        const defense = changeStage(targetRef, "def", -1, this);
        const specialDefense = changeStage(targetRef, "spd", -1, this);
        if (defense.after !== defense.before) turnLog.notes.push(`${targetName}'s Defense fell!`);
        if (specialDefense.after !== specialDefense.before) turnLog.notes.push(`${targetName}'s Sp. Defense fell!`);
      }
    }

    const slot = this.activeSlot;
    if (this.volatileEffects.ingrain[slot] && this.teamHP[slot] > 0) {
      const active = this.team[slot];
      const maxHp = active.stats.hp;
      if (this.teamHP[slot] < maxHp) {
        const heal = Math.floor(maxHp / 16);
        this.teamHP[slot] = Math.min(maxHp, this.teamHP[slot] + heal);
        const name = displayName(active.pokemon.name);
        turnLog.notes.push(`${name} absorbed nutrients with its roots!`);
        turnLog.notes.push(`${name} restored HP!`);
      }
    }

    if (this.volatileEffects.ingrainBoss && this.bossHP > 0 && this.bossHP < this.bossMaxHP) {
      const heal = Math.floor(this.bossMaxHP / 16);
      this.bossHP = Math.min(this.bossMaxHP, this.bossHP + heal);
      const bossName = `The opposing ${getBossDisplayName(this)}`;
      turnLog.notes.push(`${bossName} absorbed nutrients with its roots!`);
      turnLog.notes.push(`${bossName} restored HP!`);
    }

    const playerRoostTypes = this.volatileEffects.roost.player[this.activeSlot];
    if (Array.isArray(playerRoostTypes)) {
      this.teamCurrentTypes[this.activeSlot] = [...playerRoostTypes];
      this.volatileEffects.roost.player[this.activeSlot] = null;
    }
    if (Array.isArray(this.volatileEffects.roost.boss)) {
      this.bossCurrentTypes = [...this.volatileEffects.roost.boss];
      this.volatileEffects.roost.boss = null;
    }
    this.volatileEffects.electrifyTarget = null;
    this.volatileEffects.ionDeluge = false;
    if (this.volatileEffects.trickRoomTurns > 0) this.volatileEffects.trickRoomTurns -= 1;
  }

  trackPlayerMoveChain(slot, moveName, damaging = false) {
    const item = getEffectiveItem({ slotIndex: slot, isBoss: false, item: this.team[slot]?.item }, this);
    if (item !== "metronome") {
      this.metronomeMoveChains[slot] = { moveName: "", consecutiveUses: 0 };
      return 1;
    }
    const previous = this.metronomeMoveChains[slot] || { moveName: "", consecutiveUses: 0 };
    const consecutiveUses = previous.moveName === moveName ? previous.consecutiveUses + 1 : 1;
    this.metronomeMoveChains[slot] = { moveName, consecutiveUses };
    return damaging ? metronomeMultiplierForUse(consecutiveUses) : 1;
  }

  hasValidSwitch(excludingSlot = this.activeSlot) {
    return this.team.some((slot, index) => index !== excludingSlot && slot.pokemon && this.teamHP[index] > 0);
  }

  async executeTurn(playerAction, playerMoveIndex, playerSwitchSlot, bossAction, bossMoveIndex, playerTerastallize = false) {
    if (!this.battleActive) return;
    if (this.awaitingForcedSwitch) {
      throw new Error("Active Pokémon is fainted. You must select a replacement first.");
    }
    if (playerAction === "switch") {
      const trappedByOctolock = this.volatileEffects.octolock?.active
        && this.volatileEffects.octolock.target === "player";
      if (this.volatileEffects.ingrain[this.activeSlot] || trappedByOctolock) {
        throw new Error("The active Pokémon is rooted or trapped and cannot switch.");
      }
    }

    // 1. Take snapshot BEFORE executing turn
    this.history.push(this.createSnapshot());

    let turnLog = {
      turn: this.currentTurn,
      activeSlot: this.activeSlot,
      pokemon: this.team[this.activeSlot].pokemon.name,
      playerAction: playerAction,
      playerMove: "—",
      playerDamage: 0,
      playerHPAfter: 0,
      bossHPBefore: this.bossHP,
      bossHPAfter: this.bossHP,
      bossAction: bossAction,
      bossMove: "—",
      bossDamage: 0,
      notes: [],
      messages: [],
      playerMovedFirst: true,
    };

    const activeMon = this.team[this.activeSlot];
    const prevActiveSlot = this.activeSlot;

    // Move / Active Pokémon status validations
    // Move / Active Pokémon status validations
    if (playerAction === "use-move" || playerAction === "use-z-move") {
      if (this.teamHP[this.activeSlot] <= 0) {
        throw new Error("Active Pokémon is fainted. You must switch to a live Pokémon.");
      }
      const move = activeMon.moves[playerMoveIndex];
      if (!move) {
        throw new Error("No move selected in that slot.");
      }
      if (playerAction === "use-z-move") {
        const item = normalizeAbility(activeMon.item);
        const validZMove = (move.name === "belly-drum" && item === "normalium-z")
          || (move.name === "trick-or-treat" && item === "ghostium-z");
        if (!validZMove || this.zMoveUsed.player[this.activeSlot]) {
          throw new Error("That Z-Move is not available.");
        }
      }
    }

    // 2. Speed and Priority order determination
    const playerBattler = { slotIndex: this.activeSlot, item: activeMon.item, isBoss: false, name: activeMon.pokemon.name };
    const bossBattler = { isBoss: true, name: getBossDisplayName(this) };

    const playerActionObj = {
      type: playerAction,
      move: (playerAction === "use-move" || playerAction === "use-z-move") ? activeMon.moves[playerMoveIndex] : null
    };

    let resolvedBossAction = bossAction;
    let bossCannotMoveReason = "";
    let bossMove = null;

    if (this.bossHP > 0) {
      if (resolvedBossAction === "random-move") {
        const validMoves = this.bossMoves.filter((m) => m !== null);
        if (validMoves.length > 0) {
          bossMove = validMoves[Math.floor(Math.random() * validMoves.length)];
          resolvedBossAction = "use-move";
        } else {
          resolvedBossAction = "cannot-move";
          bossCannotMoveReason = "no moves are available";
        }
      } else if (resolvedBossAction === "use-move") {
        bossMove = this.bossMoves[bossMoveIndex];
        if (!bossMove) {
          resolvedBossAction = "cannot-move";
          bossCannotMoveReason = "no move was selected";
        }
      }
    } else {
      resolvedBossAction = "fainted-before-action";
    }

    turnLog.bossAction = resolvedBossAction;

    const bossActionObj = {
      type: resolvedBossAction,
      move: resolvedBossAction === "use-move" ? bossMove : null
    };

    const playerItemPriorityBonus = (playerActionObj.type === "use-move" || playerActionObj.type === "use-z-move") ? getItemPriorityBonus(playerBattler, playerActionObj.move, this, turnLog) : 0;
    const playerFinalPriority = playerActionObj.type === "switch" || playerActionObj.type === "baton-pass"
      ? 10
      : (playerActionObj.move ? (playerActionObj.move.priority ?? 0) : 0) + playerItemPriorityBonus;

    const bossItemPriorityBonus = bossActionObj.type === "use-move" ? getItemPriorityBonus(bossBattler, bossActionObj.move, this, turnLog) : 0;
    const bossFinalPriority = bossActionObj.type === "switch" || bossActionObj.type === "baton-pass"
      ? 10
      : (bossActionObj.move ? (bossActionObj.move.priority ?? 0) : 0) + bossItemPriorityBonus;

    const playerSpeed = getEffectiveSpeed(playerBattler, this);
    const bossSpeed = getEffectiveSpeed(bossBattler, this);

    let playerGoesFirst = true;
    if (playerActionObj.type === "switch" && bossActionObj.type !== "switch") {
      playerGoesFirst = true;
    } else if (bossActionObj.type === "switch" && playerActionObj.type !== "switch") {
      playerGoesFirst = false;
    } else if (playerFinalPriority > bossFinalPriority) {
      playerGoesFirst = true;
    } else if (bossFinalPriority > playerFinalPriority) {
      playerGoesFirst = false;
    } else {
      const trickRoomActive = this.volatileEffects.trickRoomTurns > 0;
      if (playerSpeed > bossSpeed) {
        playerGoesFirst = !trickRoomActive;
      } else if (bossSpeed > playerSpeed) {
        playerGoesFirst = trickRoomActive;
      } else {
        playerGoesFirst = true;
      }
    }

    turnLog.playerMovedFirst = playerGoesFirst;
    let notesCountBefore = 0;

    const captureNotes = () => {
      const newNotes = turnLog.notes.slice(notesCountBefore);
      newNotes.forEach((note) => {
        if (!turnLog.messages.includes(note)) {
          turnLog.messages.push(note);
        }
      });
      notesCountBefore = turnLog.notes.length;
    };

    const bossDisplayName = getBossDisplayName(this);

    // Step execution array
    const steps = [];
    if (playerGoesFirst) {
      steps.push({ side: "player", action: playerAction, moveIndex: playerMoveIndex, switchSlot: playerSwitchSlot });
      steps.push({ side: "boss", action: resolvedBossAction, move: bossMove });
    } else {
      steps.push({ side: "boss", action: resolvedBossAction, move: bossMove });
      steps.push({ side: "player", action: playerAction, moveIndex: playerMoveIndex, switchSlot: playerSwitchSlot });
    }

    for (const step of steps) {
      if (step.side === "player") {
        // Skip if fainted
        if (this.teamHP[this.activeSlot] <= 0 || this.awaitingForcedSwitch) continue;

        if (step.action === "switch" || step.action === "baton-pass") {
          const incomingMon = this.team[step.switchSlot];
          if (!incomingMon || !incomingMon.pokemon || this.teamHP[step.switchSlot] <= 0) {
            throw new Error("Cannot switch to empty or fainted slot.");
          }

          const currentActiveSlot = this.activeSlot;
          const currentActiveMon = this.team[currentActiveSlot];

          if (step.action === "baton-pass") {
            this.teamStages[step.switchSlot] = { ...this.teamStages[currentActiveSlot] };
            turnLog.notes.push(`${displayName(currentActiveMon.pokemon.name)} used Baton Pass. Boosts passed to ${displayName(incomingMon.pokemon.name)}.`);
            turnLog.messages.push(`<strong>${displayName(currentActiveMon.pokemon.name)}</strong> used <strong>Baton Pass</strong>!`);
            turnLog.messages.push(`Go! <strong>${displayName(incomingMon.pokemon.name)}</strong>!`);
            turnLog.messages.push(`Boosts were passed to <strong>${displayName(incomingMon.pokemon.name)}</strong>.`);
          } else {
            this.teamStages[step.switchSlot] = { ...incomingMon.stages };
            turnLog.notes.push(`${displayName(currentActiveMon.pokemon.name)} switched out. ${displayName(incomingMon.pokemon.name)} entered the battle.`);
            turnLog.messages.push(`Go! <strong>${displayName(incomingMon.pokemon.name)}</strong>!`);
          }

          // Reset the switched-out Pokémon's splits, overrides, stages, and type changes
          this.recordSplitEvent("reset-player", currentActiveSlot);
          this.clearPlayerVolatileEffects(currentActiveSlot);
          this.resetSlotStats(currentActiveSlot);
          this.teamStages[currentActiveSlot] = emptyStages();
          this.teamCurrentTypes[currentActiveSlot] = currentActiveMon.pokemon.types.map(({ type }) => type.name);
          this.metronomeMoveChains[currentActiveSlot] = { moveName: "", consecutiveUses: 0 };

          this.activeSlot = step.switchSlot;
          turnLog.activeSlot = this.activeSlot;
          turnLog.pokemon = incomingMon.pokemon.name;
          notesCountBefore = turnLog.notes.length;
        } else if (step.action === "use-move" || step.action === "use-z-move") {
          const selectedMove = this.team[this.activeSlot].moves[step.moveIndex];
          let move = resolveDynamicMovePower(selectedMove, this.teamStages[this.activeSlot], {
            faintedAllies: this.faintedAlliesCount,
          });
          if (move) {
            const currentActive = this.team[this.activeSlot];
            
            // Execute player Terastallize if requested
            if (playerTerastallize && !this.teraUsed.player) {
              this.teraUsed.player = true;
              this.terastallized.player[this.activeSlot] = true;
              this.teamCurrentTypes[this.activeSlot] = [currentActive.teraType || "normal"];
              const typeLabel = titleCase(currentActive.teraType || "normal");
              const teraMsg = `<strong>${displayName(currentActive.pokemon.name)}</strong> terastallized into the ${typeLabel}-type!`;
              turnLog.notes.push(`${displayName(currentActive.pokemon.name)} terastallized into the ${typeLabel}-type!`);
              turnLog.messages.push(teraMsg);
              notesCountBefore = turnLog.notes.length;
            }
            move = this.resolveActionMove(move, "player", turnLog);
            turnLog.playerMove = step.action === "use-z-move" ? `Z-${titleCase(move.name)}` : move.name;
            
            // Consume Custap Berry when move actually executes
            consumeCustapBerry(playerBattler, this, turnLog);
            captureNotes();
            
            if (step.action === "use-z-move" && move.name === "belly-drum") {
              const initialHP = this.teamHP[this.activeSlot];
              const maxHP = currentActive.stats.hp;
              
              // 1. Heal to full
              this.teamHP[this.activeSlot] = maxHP;
              // 2. Belly Drum cost & boost
              const hpCost = Math.floor(maxHP / 2);
              this.teamHP[this.activeSlot] = maxHP - hpCost;
              this.teamStages[this.activeSlot].atk = 6;
              this.zMoveUsed.player[this.activeSlot] = true;
              
              turnLog.messages.push(`<strong>${displayName(currentActive.pokemon.name)}</strong> used <strong>Z-Belly Drum</strong>!`);
              turnLog.messages.push(`<strong>${displayName(currentActive.pokemon.name)}</strong> restored its HP using its Z-Power!`);
              turnLog.messages.push(`<strong>${displayName(currentActive.pokemon.name)}</strong> cut its HP and maximized its Attack!`);
              
              turnLog.notes.push(`${displayName(currentActive.pokemon.name)} used Z-Belly Drum!`);
              turnLog.notes.push(`${displayName(currentActive.pokemon.name)} restored its HP using its Z-Power!`);
              turnLog.notes.push(`${displayName(currentActive.pokemon.name)} cut its HP and maximized its Attack!`);
              turnLog.notes.push(`${displayName(currentActive.pokemon.name)} HP: ${initialHP} → ${this.teamHP[this.activeSlot]} / ${maxHP}.`);
              turnLog.notes.push(`${displayName(currentActive.pokemon.name)} Attack stage: 0 → +6.`);
              notesCountBefore = turnLog.notes.length;
            } else {
              const usedPower = move.customPower ?? move.basePower ?? move.power ?? null;
              
              // Log move usage
              const moveLabel = step.action === "use-z-move" ? `Z-${titleCase(move.name)}` : titleCase(move.name);
              if (step.action === "use-z-move" && move.name === "trick-or-treat") {
                const zPowerMessage = `${displayName(currentActive.pokemon.name)} surrounded itself with its Z-Power!`;
                turnLog.messages.push(zPowerMessage);
                turnLog.notes.push(zPowerMessage);
                this.zMoveUsed.player[this.activeSlot] = true;
              }
              turnLog.messages.push(`<strong>${displayName(currentActive.pokemon.name)}</strong> used <strong>${moveLabel}</strong>!`);
              
              const isDamagingMove = move.damage_class?.name !== "status" && Boolean(usedPower);
              const metronomeMultiplier = this.trackPlayerMoveChain(this.activeSlot, move.name, isDamagingMove);
              currentActive.battleMetronomeMultiplier = metronomeMultiplier;

              if (move.damage_class?.name === "status" || !usedPower) {
                if (MOVE_EFFECTS[move.name]) {
                  MOVE_EFFECTS[move.name].apply(this, currentActive, this.boss, "player", turnLog, {
                    isZMove: step.action === "use-z-move",
                  });
                  captureNotes();
                } else {
                  const notImplementedMsg = `${titleCase(move.name)} (status) - Effect not implemented yet.`;
                  turnLog.messages.push(notImplementedMsg);
                  turnLog.notes.push(notImplementedMsg);
                  notesCountBefore = turnLog.notes.length;
                }
              } else if (move.damage_class?.name !== "status" && usedPower) {
                const requiredUserType = move.name === "burn-up" ? "fire" : move.name === "double-shock" ? "electric" : "";
                if (requiredUserType && !this.teamCurrentTypes[this.activeSlot].includes(requiredUserType)) {
                  turnLog.messages.push("But it failed!");
                  turnLog.notes.push(`${titleCase(move.name)} failed because the user was not ${titleCase(requiredUserType)} type.`);
                  captureNotes();
                  continue;
                }
                const attackerAbility = getEffectiveAbility({ slotIndex: this.activeSlot, isBoss: false }, this);
                const defenderAbility = getEffectiveAbility({ isBoss: true }, this);
                const attackerItem = getEffectiveItem({ slotIndex: this.activeSlot, isBoss: false, item: currentActive.item }, this);
                const payload = {
                  attacker: {
                    ...currentActive,
                    stats: currentActive.currentStats,
                    level: currentActive.level,
                    item: attackerItem,
                    ability: attackerAbility,
                    metronomeMultiplier,
                  },
                  boss: { stats: this.bossCurrentStats, maxHp: this.bossMaxHP },
                  move: move,
                  attackerTypes: this.teamCurrentTypes[this.activeSlot],
                  bossTypes: this.bossCurrentTypes,
                  ability: attackerAbility,
                  defenderAbility,
                  defenderHP: this.bossHP,
                  defenderMaxHP: this.bossMaxHP,
                  stages: this.teamStages[this.activeSlot],
                  bossStages: this.bossStages,
                  tarShot: this.volatileEffects.tarShot.boss,
                  isTerastallized: this.terastallized.player[this.activeSlot],
                  teraType: currentActive.teraType || "normal",
                };
              const normal = await this.resolveDamage(payload, this.buildPrivateDamageRequest(
                "player-to-boss",
                currentActive,
                move,
                attackerAbility,
                defenderAbility,
                attackerItem,
              ));
              const rollResult = selectDamageFromRolls(normal.rolls, this.damageRollMode || "random");
              const dealt = rollResult.damage;
              const displayedDamage = (this.damageRollMode || "random") === "average"
                ? normal.myuuAverage
                : normal.myuuRolls?.[rollResult.index];

              // Effectiveness
              if (normal.effectiveness === 0) {
                turnLog.messages.push(`It doesn't affect the opposing ${bossDisplayName}...`);
              } else {
                if (normal.effectiveness > 1) {
                  turnLog.messages.push(`<span class="chat-effective-line">It's super effective!</span>`);
                } else if (normal.effectiveness < 1) {
                  turnLog.messages.push(`<span class="chat-effective-line">It's not very effective...</span>`);
                }
                if (normal.criticalModifier > 1) {
                  turnLog.messages.push(`<span class="chat-modifier-line">A critical hit!</span>`);
                }
              }

              const initialHP = this.bossHP;
              const maxHP = this.bossMaxHP;
              const ignoresDefensiveAbilities = ["mold-breaker", "teravolt", "turboblaze"].includes(normalizeAbility(attackerAbility));
              const activeDefenderAbility = ignoresDefensiveAbilities ? "" : normalizeAbility(defenderAbility);
              
              let bossSurvived = false;
              if (dealt >= initialHP && initialHP === maxHP) {
                if (activeDefenderAbility === "sturdy") {
                  this.bossHP = 1;
                  bossSurvived = true;
                }
              }

              if (!bossSurvived) {
                this.bossHP = Math.max(0, this.bossHP - dealt);
              }

              turnLog.playerDamage = bossSurvived ? (initialHP - 1) : Math.min(dealt, initialHP);
              turnLog.playerDisplayedDamage = Number.isInteger(displayedDamage) ? displayedDamage : turnLog.playerDamage;
              turnLog.bossHPAfter = this.bossHP;

              if (normal.effectiveness !== 0 && turnLog.playerDamage > 0) {
                const damageLabel = turnLog.playerDamage.toLocaleString("en-US");
                const damagePercent = formatDamagePercent(turnLog.playerDamage, maxHP);
                turnLog.messages.push(`Boss ${bossDisplayName} lost ${damageLabel} HP (${damagePercent}%)!`);
              }

              turnLog.playerDamageDetails = {
                moveName: move.name,
                attackerName: currentActive.pokemon.name,
                defenderName: bossDisplayName,
                damage: turnLog.playerDamage,
                rollPercent: rollResult.rollPercent,
                rollMode: this.damageRollMode || "random",
                minDamage: normal.min,
                maxDamage: normal.max,
                level: currentActive.level,
                originalPower: normal.basePower || 50,
                usedPower: normal.usedPower,
                criticalModifier: normal.criticalModifier,
                effectiveness: normal.effectiveness,
                attackerAbility,
                attackerItem: currentActive.item
              };
              turnLog.damageDetails = turnLog.playerDamageDetails;

              if (metronomeMultiplier > 1) {
                const metronomeMessage = `${displayName(currentActive.pokemon.name)}'s Metronome boosted ${titleCase(move.name)} to ${metronomeMultiplier.toFixed(1)}x damage!`;
                turnLog.messages.push(metronomeMessage);
                turnLog.notes.push(metronomeMessage);
                turnLog.playerDamageDetails.metronomeMultiplier = metronomeMultiplier;
                notesCountBefore = turnLog.notes.length;
              }

              const moveType = move?.type?.name || "";
              if (attackerItem === `${moveType}-gem` && normal.effectiveness !== 0 && dealt > 0) {
                markItemConsumed({ slotIndex: this.activeSlot }, this);
                turnLog.notes.push(`${displayName(currentActive.pokemon.name)} consumed its ${titleCase(attackerItem)}!`);
                captureNotes();
              }

              applyDamagingMoveAfterEffects(
                this,
                currentActive,
                this.boss,
                "player",
                turnLog,
                move.name,
                normal.effectiveness !== 0,
              );
              captureNotes();

              if (bossSurvived) {
                turnLog.notes.push(`${bossDisplayName}'s Sturdy activated!`);
                turnLog.notes.push(`${bossDisplayName} endured the hit with 1 HP.`);
                captureNotes();
              }

              if (this.bossHP <= 0) {
                turnLog.messages.push(`The opposing <strong>${bossDisplayName}</strong> fainted!`);
              }
            }
          }
        }
      }
      } else {
        // Boss's turn
        if (this.bossHP <= 0) {
          turnLog.bossAction = "fainted-before-action";
          continue;
        }
        if (this.teamHP[this.activeSlot] <= 0) {
          turnLog.bossAction = "cannot-move";
          turnLog.messages.push(`The opposing <strong>${bossDisplayName}</strong> could not move because there was no active target.`);
          turnLog.notes.push("Boss could not move because there was no active target.");
          notesCountBefore = turnLog.notes.length;
          continue;
        }
        step.move = resolveDynamicMovePower(step.move, this.bossStages, { faintedAllies: 0 });
        step.move = this.resolveActionMove(step.move, "boss", turnLog);

        if (step.action === "use-move" && step.move) {
          const currentActive = this.team[this.activeSlot];
          turnLog.bossMove = step.move.name;
          const usedPower = step.move.customPower ?? step.move.basePower ?? step.move.power ?? null;

          // Log boss move usage
          turnLog.messages.push(`The opposing <strong>${bossDisplayName}</strong> used <strong>${titleCase(step.move.name)}</strong>!`);

          if (step.move.damage_class?.name === "status" || !usedPower) {
            if (MOVE_EFFECTS[step.move.name]) {
              MOVE_EFFECTS[step.move.name].apply(this, currentActive, this.boss, "boss", turnLog);
              captureNotes();
            } else {
              const notImplementedMsg = `Boss used ${titleCase(step.move.name)} (status).`;
              turnLog.messages.push(notImplementedMsg);
              turnLog.notes.push(notImplementedMsg);
              notesCountBefore = turnLog.notes.length;
            }
          } else if (step.move.damage_class?.name !== "status" && usedPower) {
            const requiredUserType = step.move.name === "burn-up" ? "fire" : step.move.name === "double-shock" ? "electric" : "";
            if (requiredUserType && !this.bossCurrentTypes.includes(requiredUserType)) {
              turnLog.messages.push("But it failed!");
              turnLog.notes.push(`${titleCase(step.move.name)} failed because the user was not ${titleCase(requiredUserType)} type.`);
              captureNotes();
              continue;
            }
            const attackerAbility = getEffectiveAbility({ isBoss: true }, this);
            const defenderAbility = getEffectiveAbility({ slotIndex: this.activeSlot, isBoss: false }, this);
            const payload = {
              attacker: { stats: this.bossCurrentStats, level: 100, item: "", ability: attackerAbility },
              boss: { stats: currentActive.currentStats, maxHp: currentActive.stats.hp },
              move: step.move,
              attackerTypes: this.bossCurrentTypes,
              bossTypes: this.teamCurrentTypes[this.activeSlot],
              ability: attackerAbility,
              defenderAbility,
              defenderHP: this.teamHP[this.activeSlot],
              defenderMaxHP: currentActive.stats.hp,
              stages: this.bossStages,
              bossStages: this.teamStages[this.activeSlot],
              tarShot: this.volatileEffects.tarShot.player[this.activeSlot],
              isTerastallized: this.terastallized.boss,
              teraType: "normal",
            };
            const normal = await this.resolveDamage(payload, this.buildPrivateDamageRequest(
              "boss-to-player",
              currentActive,
              step.move,
              attackerAbility,
              defenderAbility,
            ));
            const rollResult = selectDamageFromRolls(normal.rolls, this.damageRollMode || "random");
            const dealt = rollResult.damage;

            // Effectiveness
            if (normal.effectiveness === 0) {
              turnLog.messages.push(`It doesn't affect ${displayName(currentActive.pokemon.name)}...`);
            } else {
              if (normal.effectiveness > 1) {
                turnLog.messages.push(`<span class="chat-effective-line">It's super effective!</span>`);
              } else if (normal.effectiveness < 1) {
                turnLog.messages.push(`<span class="chat-effective-line">It's not very effective...</span>`);
              }
              if (normal.criticalModifier > 1) {
                turnLog.messages.push(`<span class="chat-modifier-line">A critical hit!</span>`);
              }
            }

            const initialHP = this.teamHP[this.activeSlot];
            const maxHP = currentActive.stats.hp;
            const itemSlug = getEffectiveItem({ slotIndex: this.activeSlot, isBoss: false, item: currentActive.item }, this);
            const ignoresDefensiveAbilities = ["mold-breaker", "teravolt", "turboblaze"].includes(normalizeAbility(attackerAbility));
            const activeDefenderAbility = ignoresDefensiveAbilities ? "" : normalizeAbility(defenderAbility);

            let playerSurvived = false;
            let survivalNote = "";
            let finalDamage = Math.min(dealt, initialHP);

            if (dealt >= initialHP && initialHP === maxHP) {
              if (activeDefenderAbility === "sturdy") {
                this.teamHP[this.activeSlot] = 1;
                playerSurvived = true;
                finalDamage = initialHP - 1;
                survivalNote = `<strong>${displayName(currentActive.pokemon.name)}</strong>'s Sturdy activated!\n<strong>${displayName(currentActive.pokemon.name)}</strong> endured the hit with 1 HP.`;
              } else if (itemSlug === "focus-sash") {
                this.teamHP[this.activeSlot] = 1;
                markItemConsumed({ slotIndex: this.activeSlot }, this);
                playerSurvived = true;
                finalDamage = initialHP - 1;
                survivalNote = `<strong>${displayName(currentActive.pokemon.name)}</strong> hung on using its Focus Sash!`;
              }
            }

            if (!playerSurvived) {
              this.teamHP[this.activeSlot] = Math.max(0, this.teamHP[this.activeSlot] - dealt);
            }

             turnLog.bossDamage = finalDamage;

             if (normal.effectiveness !== 0 && finalDamage > 0) {
               const damageLabel = finalDamage.toLocaleString("en-US");
               const damagePercent = formatDamagePercent(finalDamage, maxHP);
               turnLog.messages.push(`${displayName(currentActive.pokemon.name)} lost ${damageLabel} HP (${damagePercent}%)!`);
             }

             turnLog.bossDamageDetails = {
               moveName: step.move.name,
               attackerName: bossDisplayName,
               defenderName: currentActive.pokemon.name,
               damage: finalDamage,
               rollPercent: rollResult.rollPercent,
               rollMode: this.damageRollMode || "random",
               minDamage: normal.min,
               maxDamage: normal.max,
               level: 100,
               originalPower: normal.basePower || 50,
               usedPower: normal.usedPower,
               criticalModifier: normal.criticalModifier,
               effectiveness: normal.effectiveness,
               attackerAbility,
               attackerItem: ""
             };
             if (!turnLog.damageDetails) {
               turnLog.damageDetails = turnLog.bossDamageDetails;
             }

             if (playerSurvived) {
               survivalNote.split("\n").forEach(noteLine => {
                 turnLog.notes.push(noteLine.replace(/<\/?strong>/g, ""));
                 turnLog.messages.push(noteLine);
               });
               notesCountBefore = turnLog.notes.length;
             }

             applyDamagingMoveAfterEffects(
               this,
               currentActive,
               this.boss,
               "boss",
               turnLog,
               step.move.name,
               normal.effectiveness !== 0,
             );
             captureNotes();

            if (itemSlug === "eject-button" && normal.effectiveness !== 0 && finalDamage > 0 && this.teamHP[this.activeSlot] > 0) {
              markItemConsumed({ slotIndex: this.activeSlot }, this);
              if (this.hasValidSwitch(this.activeSlot)) {
                const ejectMessage = `${displayName(currentActive.pokemon.name)} is switched out with the Eject Button!`;
                turnLog.messages.push(ejectMessage);
                turnLog.notes.push(ejectMessage);
                this.awaitingForcedSwitch = true;
                this.forcedSwitchReason = "eject-button";
                if (!turnLog.playerMovedFirst && turnLog.playerMove === "—") {
                  turnLog.playerAction = "forced-out-before-action";
                }
              } else {
                const ejectMessage = `${displayName(currentActive.pokemon.name)}'s Eject Button was consumed, but no switch was available.`;
                turnLog.messages.push(ejectMessage);
                turnLog.notes.push(ejectMessage);
              }
              notesCountBefore = turnLog.notes.length;
            }

            if (this.teamHP[this.activeSlot] <= 0) {
              this.faintedAlliesCount += 1;
              turnLog.notes.push(`${displayName(currentActive.pokemon.name)} fainted!`);
              turnLog.messages.push(`<strong>${displayName(currentActive.pokemon.name)}</strong> fainted!`);
              
              const allFainted = this.team.every((slot, idx) => !slot.pokemon || this.teamHP[idx] <= 0);
              if (!allFainted) {
                turnLog.messages.push("Choose your next Pokémon.");
              }
              notesCountBefore = turnLog.notes.length;
            }
          } else {
            turnLog.bossAction = "cannot-move";
            turnLog.messages.push(`The opposing <strong>${bossDisplayName}</strong> could not use the selected move.`);
            turnLog.notes.push("Boss could not use the selected move.");
            notesCountBefore = turnLog.notes.length;
          }
        } else if (step.action === "do-nothing") {
          // The user intentionally selected no boss action.
          turnLog.bossAction = "do-nothing";
          turnLog.messages.push(`The opposing <strong>${bossDisplayName}</strong> did nothing.`);
          turnLog.notes.push("Boss did nothing.");
          notesCountBefore = turnLog.notes.length;
        } else if (step.action === "cannot-move") {
          turnLog.bossAction = "cannot-move";
          const reason = bossCannotMoveReason || "it could not act";
          turnLog.messages.push(`The opposing <strong>${bossDisplayName}</strong> could not move because ${reason}.`);
          turnLog.notes.push(`Boss could not move because ${reason}.`);
          notesCountBefore = turnLog.notes.length;
        }
      }
    }

    // End-of-turn volatile effects resolve after both actions.
    if (this.forcedSwitchReason !== "eject-button") {
      this.processEndOfTurnEffects(turnLog);
      captureNotes();
    }

    // Post-turn effects (healing, leftovers, shell bell, sitrus berry)
    if (this.teamHP[this.activeSlot] > 0 && this.forcedSwitchReason !== "eject-button") {
      const activeSlotIndex = this.activeSlot;
      const currentActive = this.team[activeSlotIndex];
      const itemSlug = getEffectiveItem({ slotIndex: activeSlotIndex, isBoss: false, item: currentActive.item }, this);
      const initialHP = this.teamHP[activeSlotIndex];
      const maxHP = currentActive.stats.hp;

      // Leftovers
      if (itemSlug === "leftovers" && initialHP < maxHP) {
        const heal = Math.floor(maxHP / 16);
        this.teamHP[activeSlotIndex] = Math.min(maxHP, initialHP + heal);
        const leftoversMsg = `<strong>${displayName(currentActive.pokemon.name)}</strong> restored HP using its Leftovers!`;
        turnLog.notes.push(`${displayName(currentActive.pokemon.name)} healed ${heal} HP from Leftovers.`);
        turnLog.messages.push(leftoversMsg);
      }

      // Shell Bell
      if (itemSlug === "shell-bell" && initialHP < maxHP && turnLog.playerDamage > 0) {
        const heal = Math.max(1, Math.floor(turnLog.playerDamage / 8));
        this.teamHP[activeSlotIndex] = Math.min(maxHP, initialHP + heal);
        const shellMsg = `<strong>${displayName(currentActive.pokemon.name)}</strong> restored HP using its Shell Bell!`;
        turnLog.notes.push(`${displayName(currentActive.pokemon.name)} healed ${heal} HP from Shell Bell.`);
        turnLog.messages.push(shellMsg);
      }

      // Oran Berry
      if (itemSlug === "oran-berry" && this.teamHP[activeSlotIndex] > 0 && this.teamHP[activeSlotIndex] <= maxHP / 2) {
        const heal = 10;
        this.teamHP[activeSlotIndex] = Math.min(maxHP, this.teamHP[activeSlotIndex] + heal);
        markItemConsumed({ slotIndex: activeSlotIndex }, this);

        const oranEat = `<strong>${displayName(currentActive.pokemon.name)}</strong> ate its Oran Berry!`;
        const oranMsg = `<strong>${displayName(currentActive.pokemon.name)}</strong> restored HP using its Oran Berry!`;
        turnLog.notes.push(`${displayName(currentActive.pokemon.name)} consumed its Oran Berry and healed ${heal} HP.`);
        turnLog.messages.push(oranEat);
        turnLog.messages.push(oranMsg);
      }

      // Sitrus Berry
      if (itemSlug === "sitrus-berry" && this.teamHP[activeSlotIndex] > 0 && this.teamHP[activeSlotIndex] <= maxHP / 2) {
        const heal = Math.floor(maxHP / 4);
        this.teamHP[activeSlotIndex] = Math.min(maxHP, this.teamHP[activeSlotIndex] + heal);
        markItemConsumed({ slotIndex: activeSlotIndex }, this);
        
        const sitrusEat = `<strong>${displayName(currentActive.pokemon.name)}</strong> ate its Sitrus Berry!`;
        const sitrusMsg = `<strong>${displayName(currentActive.pokemon.name)}</strong> restored HP using its Sitrus Berry!`;
        turnLog.notes.push(`${displayName(currentActive.pokemon.name)} consumed its Sitrus Berry and healed ${heal} HP.`);
        turnLog.messages.push(sitrusEat);
        turnLog.messages.push(sitrusMsg);
      }
      notesCountBefore = turnLog.notes.length;
    }

    turnLog.playerHPAfter = this.teamHP[this.activeSlot];
    turnLog.bossHPAfter = this.bossHP;

    this.battleLog.push(turnLog);

    // 4. Check battle completion & forced switches
    const allFainted = this.team.every((slot, idx) => !slot.pokemon || this.teamHP[idx] <= 0);

    if (this.bossHP <= 0) {
      turnLog.notes.push("Raid Boss DEFEATED!");
      if (!turnLog.messages.some((message) => message.includes(`<strong>${bossDisplayName}</strong> fainted!`))) {
        turnLog.messages.push(`The opposing <strong>${bossDisplayName}</strong> fainted!`);
      }
      this.battleActive = false;
      this.awaitingForcedSwitch = false;
    } else if (allFainted) {
      turnLog.notes.push("Strike team WIPED OUT!");
      turnLog.messages.push("Strike team WIPED OUT!");
      this.battleActive = false;
      this.awaitingForcedSwitch = false;
    } else if (this.currentTurn >= 21) {
      turnLog.notes.push("21 turns elapsed. Simulation ended.");
      turnLog.messages.push("21 turns elapsed. Simulation ended.");
      this.battleActive = false;
      this.awaitingForcedSwitch = false;
    } else {
      this.currentTurn += 1;
      if (this.teamHP[this.activeSlot] <= 0) {
        this.awaitingForcedSwitch = true;
      }
    }

    this.emit("simulation");
    this.emit("team");
  }

  executeForcedSwitch(slotIndex) {
    if (!this.battleActive || !this.awaitingForcedSwitch) return;

    const incomingMon = this.team[slotIndex];
    if (slotIndex === this.activeSlot || !incomingMon || !incomingMon.pokemon || this.teamHP[slotIndex] <= 0) {
      throw new Error("Cannot switch to empty or fainted slot.");
    }

    const prevActiveSlot = this.activeSlot;
    const switchReason = this.forcedSwitchReason;

    // Reset current active slot stat boosts, overrides, and types
    this.recordSplitEvent("reset-player", prevActiveSlot);
    this.clearPlayerVolatileEffects(prevActiveSlot);
    this.resetSlotStats(prevActiveSlot);
    this.teamStages[prevActiveSlot] = emptyStages();
    this.teamCurrentTypes[prevActiveSlot] = this.team[prevActiveSlot].pokemon.types.map(({ type }) => type.name);
    this.metronomeMoveChains[prevActiveSlot] = { moveName: "", consecutiveUses: 0 };

    // Swap active slot and initialize incoming boosts
    this.teamStages[slotIndex] = { ...incomingMon.stages };
    this.activeSlot = slotIndex;
    this.awaitingForcedSwitch = false;
    this.forcedSwitchReason = "";

    let forcedSwitchLog = {
      turn: this.currentTurn,
      activeSlot: this.activeSlot,
      pokemon: incomingMon.pokemon.name,
      playerAction: switchReason === "eject-button" ? "switch-eject-button" : "switch-forced",
      playerMove: "—",
      playerDamage: 0,
      playerHPAfter: this.teamHP[slotIndex],
      bossHPBefore: this.bossHP,
      bossHPAfter: this.bossHP,
      bossAction: "not-applicable",
      bossMove: "—",
      bossDamage: 0,
      notes: [`${displayName(incomingMon.pokemon.name)} entered the battle${switchReason === "eject-button" ? " after Eject Button activated" : ""}.`],
      messages: [`Go! <strong>${displayName(incomingMon.pokemon.name)}</strong>!`],
      playerMovedFirst: true,
    };
    this.battleLog.push(forcedSwitchLog);

    this.emit("simulation");
    this.emit("team");
  }

  applyTypeChangingMove(moveName, target) {
    let types = target === "boss" ? this.bossCurrentTypes : this.teamCurrentTypes[this.activeSlot];

    if (moveName === "trick-or-treat") {
      if (!types.includes("ghost")) {
        types = [...types, "ghost"];
      }
    } else if (moveName === "forests-curse") {
      if (!types.includes("grass")) {
        types = [...types, "grass"];
      }
    } else if (moveName === "magic-powder") {
      types = ["psychic"];
    } else if (moveName === "soak") {
      types = ["water"];
    }

    if (target === "boss") {
      this.bossCurrentTypes = types;
    } else {
      this.teamCurrentTypes[this.activeSlot] = types;
    }
  }
}

export function getBattleSpeedOverride(battlerRef, state) {
  const isBoss = (battlerRef === "boss" || battlerRef === state.boss || (battlerRef && battlerRef.isBoss));
  if (isBoss) {
    return state.battleSpeed.boss;
  }
  const idx = (battlerRef && typeof battlerRef.slotIndex === "number") ? battlerRef.slotIndex : state.activeSlot;
  return state.battleSpeed.player[idx];
}

export function setBattleSpeedOverride(battlerRef, state, val) {
  const isBoss = (battlerRef === "boss" || battlerRef === state.boss || (battlerRef && battlerRef.isBoss));
  if (isBoss) {
    state.battleSpeed.boss = val;
    state.bossSpeedOverride = val;
  } else {
    const idx = (battlerRef && typeof battlerRef.slotIndex === "number") ? battlerRef.slotIndex : state.activeSlot;
    state.battleSpeed.player[idx] = val;
    state.playerSpeedOverrides[idx] = val;
    const activeMon = state.team[idx];
    if (activeMon) {
      activeMon.speedOverride = val;
    }
  }
}

export function getCurrentStat(battlerRef, statKey, state) {
  const isBoss = (battlerRef === "boss" || battlerRef === state.boss || (battlerRef && battlerRef.isBoss));
  if (isBoss) {
    return state.bossCurrentStats[statKey];
  }
  const idx = (battlerRef && typeof battlerRef.slotIndex === "number") ? battlerRef.slotIndex : state.activeSlot;
  return state.team[idx]?.currentStats[statKey] ?? 0;
}

export function getStage(battlerRef, statKey, state) {
  const isBoss = (battlerRef === "boss" || battlerRef === state.boss || (battlerRef && battlerRef.isBoss));
  if (isBoss) {
    return state.bossStages[statKey] || 0;
  }
  const idx = (battlerRef && typeof battlerRef.slotIndex === "number") ? battlerRef.slotIndex : state.activeSlot;
  return state.teamStages[idx]?.[statKey] || 0;
}

export function getBattlerStages(battlerRef, state) {
  const isBoss = (battlerRef === "boss" || battlerRef === state.boss || (battlerRef && battlerRef.isBoss));
  if (isBoss) return state.bossStages;
  const idx = (battlerRef && typeof battlerRef.slotIndex === "number") ? battlerRef.slotIndex : state.activeSlot;
  return state.teamStages[idx] || emptyStages();
}

export function getTotalPositiveStages(battlerRef, state) {
  return totalPositiveStagesFromStages(getBattlerStages(battlerRef, state));
}

export function getStoredPowerLikeBasePower(battlerRef, state) {
  return storedPowerLikeBasePowerFromStages(getBattlerStages(battlerRef, state));
}

export function setStage(battlerRef, statKey, value, state) {
  const isBoss = (battlerRef === "boss" || battlerRef === state.boss || (battlerRef && battlerRef.isBoss));
  const clamped = Math.max(-6, Math.min(6, Number(value) || 0));
  if (isBoss) {
    state.bossStages[statKey] = clamped;
    return clamped;
  }
  const idx = (battlerRef && typeof battlerRef.slotIndex === "number") ? battlerRef.slotIndex : state.activeSlot;
  if (!state.teamStages[idx]) {
    state.teamStages[idx] = emptyStages();
  }
  state.teamStages[idx][statKey] = clamped;
  return clamped;
}

export function getAbilityOverride(battlerRef, state) {
  if (!state.abilityOverrides) {
    state.abilityOverrides = {
      player: [null, null, null, null, null, null],
      boss: null
    };
  }
  const isBoss = (battlerRef === "boss" || battlerRef === state.boss || (battlerRef && battlerRef.isBoss));
  if (isBoss) {
    return state.abilityOverrides.boss;
  }
  const idx = (battlerRef && typeof battlerRef.slotIndex === "number") ? battlerRef.slotIndex : state.activeSlot;
  return state.abilityOverrides.player[idx] || null;
}

export function setAbilityOverride(battlerRef, state, ability) {
  if (!state.abilityOverrides) {
    state.abilityOverrides = {
      player: [null, null, null, null, null, null],
      boss: null
    };
  }
  const normalized = ability ? normalizeAbility(ability) : null;
  const isBoss = (battlerRef === "boss" || battlerRef === state.boss || (battlerRef && battlerRef.isBoss));
  if (isBoss) {
    state.abilityOverrides.boss = normalized;
  } else {
    const idx = (battlerRef && typeof battlerRef.slotIndex === "number") ? battlerRef.slotIndex : state.activeSlot;
    state.abilityOverrides.player[idx] = normalized;
  }
  return normalized;
}

export function getEffectiveAbility(battlerRef, state) {
  const override = getAbilityOverride(battlerRef, state);
  if (override) return override;

  const isBoss = (battlerRef === "boss" || battlerRef === state.boss || (battlerRef && battlerRef.isBoss));
  if (isBoss) {
    return state.bossAbility || battlerRef?.ability || "";
  }
  const idx = (battlerRef && typeof battlerRef.slotIndex === "number") ? battlerRef.slotIndex : state.activeSlot;
  return state.team[idx]?.ability || battlerRef?.ability || "";
}

export function changeStage(battlerRef, statKey, amount, state) {
  const ability = normalizeAbility(getEffectiveAbility(battlerRef, state));
  const finalAmount = ability === "simple" ? amount * 2 : amount;
  const before = getStage(battlerRef, statKey, state);
  const after = setStage(battlerRef, statKey, before + finalAmount, state);
  return { before, after, appliedAmount: finalAmount, simpleBoosted: finalAmount !== amount };
}

export function stageToMultiplier(stage) {
  if (stage > 0) return (2 + stage) / 2;
  if (stage < 0) return 2 / (2 - stage);
  return 1;
}

export function getSetupItem(battlerRef, state) {
  const isBoss = (battlerRef === "boss" || battlerRef === state.boss || (battlerRef && battlerRef.isBoss));
  if (isBoss) {
    return normalizeAbility(battlerRef?.item || "");
  }
  const idx = (battlerRef && typeof battlerRef.slotIndex === "number") ? battlerRef.slotIndex : state.activeSlot;
  const item = battlerRef?.item ?? state.team[idx]?.item ?? "";
  return normalizeAbility(item);
}

export function getEffectiveItem(battlerRef, state) {
  return isItemConsumed(battlerRef, state) ? "" : getSetupItem(battlerRef, state);
}

export function hasItem(battlerRef, itemSlug, state = null) {
  const item = state ? getEffectiveItem(battlerRef, state) : normalizeAbility(battlerRef?.item || "");
  return item === itemSlug;
}

export function isItemConsumed(battlerRef, state) {
  const isBoss = (battlerRef === "boss" || battlerRef === state.boss || (battlerRef && battlerRef.isBoss));
  if (isBoss) return state.consumedItems.boss;
  const idx = (battlerRef && typeof battlerRef.slotIndex === "number") ? battlerRef.slotIndex : state.activeSlot;
  return state.consumedItems.player[idx];
}

export function markItemConsumed(battlerRef, state) {
  const isBoss = (battlerRef === "boss" || battlerRef === state.boss || (battlerRef && battlerRef.isBoss));
  if (isBoss) {
    state.consumedItems.boss = true;
  } else {
    const idx = (battlerRef && typeof battlerRef.slotIndex === "number") ? battlerRef.slotIndex : state.activeSlot;
    state.consumedItems.player[idx] = true;
  }
}

export function getBattlerHpStats(battlerRef, state) {
  const isBoss = (battlerRef === "boss" || battlerRef === state.boss || (battlerRef && battlerRef.isBoss));
  if (isBoss) {
    return { hp: state.bossHP, maxHP: state.bossMaxHP };
  }
  const idx = (battlerRef && typeof battlerRef.slotIndex === "number") ? battlerRef.slotIndex : state.activeSlot;
  const activeMon = state.team[idx];
  return { hp: state.teamHP[idx], maxHP: activeMon?.stats.hp ?? 1 };
}

// Check if Custap Berry applies for priority (does NOT consume)
export function checkCustapBerry(battler, state) {
  const hpStats = getBattlerHpStats(battler, state);
  return (
    hasItem(battler, "custap-berry", state) &&
    !isItemConsumed(battler, state) &&
    hpStats.hp <= hpStats.maxHP * 0.25
  );
}

// Consume Custap Berry and log (called only when move actually executes)
export function consumeCustapBerry(battler, state, turnLog) {
  if (checkCustapBerry(battler, state)) {
    markItemConsumed(battler, state);
    if (turnLog && turnLog.notes) {
      turnLog.notes.push(`${displayName(battler.name)}'s Custap Berry activated!`);
      turnLog.notes.push(`${displayName(battler.name)} moved first with priority +1.`);
    }
    return true;
  }
  return false;
}

export function getItemPriorityBonus(battler, selectedMove, state) {
  // Only check if Custap applies, don't consume yet
  if (checkCustapBerry(battler, state)) {
    return 1;
  }
  return 0;
}

export function getEffectiveSpeed(battlerRef, state) {
  const swappedSpeed = getBattleSpeedOverride(battlerRef, state);

  // If Speed Swap has set a battle speed, use it directly.
  // Do NOT recalculate from original stats.
  if (swappedSpeed !== null && swappedSpeed !== undefined) {
    return Math.max(1, Math.floor(swappedSpeed));
  }

  const baseSpeed = getCurrentStat(battlerRef, "spe", state);
  const stage = getStage(battlerRef, "spe", state);
  const stageMultiplier = stageToMultiplier(stage);

  let itemMultiplier = 1;

  if (hasItem(battlerRef, "choice-scarf", state)) {
    itemMultiplier *= 1.5;
  }

  let abilityMultiplier = 1;
  const isBoss = (battlerRef === "boss" || (battlerRef && battlerRef.isBoss));
  const ability = normalizeAbility(getEffectiveAbility(battlerRef, state));

  if (ability === "unburden") {
    const idx = isBoss ? null : ((battlerRef && typeof battlerRef.slotIndex === "number") ? battlerRef.slotIndex : state.activeSlot);
    const itemConsumed = isBoss ? state.consumedItems.boss : state.consumedItems.player[idx];
    if (itemConsumed) {
      abilityMultiplier *= 2;
    }
  }

  return Math.max(1, Math.floor(baseSpeed * stageMultiplier * itemMultiplier * abilityMultiplier));
}
