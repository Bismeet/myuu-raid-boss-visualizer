import { emptyStages } from "./stages.js";
import { calculatePokemonStats } from "./stats.js";
import { damageRolls } from "./damage.js";
import { displayName, titleCase, getBossDisplayName } from "../utils/format.js";
import { ITEM_EFFECTS } from "../data/item-effects.js";
import { MOVE_EFFECTS } from "../data/move-effects.js";

const blankStats = () => ({ hp: 0, atk: 0, def: 0, spa: 0, spd: 0, spe: 0 });
const blankSpread = (value) => ({ hp: value, atk: value, def: value, spa: value, spd: value, spe: value });

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
    this.manualBossHP = stats ? stats.hp : 0;
    this.manualBossMaxHP = stats ? stats.hp : 0;
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
      this.bossMaxHP = this.bossBaseStats ? this.bossBaseStats.hp : (this.bossStats ? this.bossStats.hp : 0);
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

    this.bossOriginalStats = {
      atk: this.bossStats.atk,
      def: this.bossStats.def,
      spa: this.bossStats.spa,
      spd: this.bossStats.spd,
      spe: this.bossStats.spe,
    };
    this.bossCurrentStats = { ...this.bossOriginalStats };
    this.bossStatSources = {
      atk: [this.manualBossOverride ? "Manual override" : "Raid scaler"],
      def: [this.manualBossOverride ? "Manual override" : "Raid scaler"],
      spa: [this.manualBossOverride ? "Manual override" : "Raid scaler"],
      spd: [this.manualBossOverride ? "Manual override" : "Raid scaler"],
      spe: [this.manualBossOverride ? "Manual override" : "Raid scaler"],
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
    if (snapshot.damageRollMode !== undefined) {
      this.damageRollMode = snapshot.damageRollMode;
    }

    this.emit("simulation");
    this.emit("team");
  }

  executeTurn(playerAction, playerMoveIndex, playerSwitchSlot, bossAction, bossMoveIndex, playerTerastallize = false) {
    if (!this.battleActive) return;
    if (this.awaitingForcedSwitch) {
      throw new Error("Active Pokémon is fainted. You must select a replacement first.");
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
    }

    // 2. Speed and Priority order determination
    const playerBattler = { slotIndex: this.activeSlot, item: activeMon.item, isBoss: false, name: activeMon.pokemon.name };
    const bossBattler = { isBoss: true, name: getBossDisplayName(this) };

    const playerActionObj = {
      type: playerAction,
      move: (playerAction === "use-move" || playerAction === "use-z-move") ? activeMon.moves[playerMoveIndex] : null
    };

    let resolvedBossAction = bossAction;
    let bossMove = null;

    if (this.bossHP > 0) {
      if (resolvedBossAction === "random-move") {
        const validMoves = this.bossMoves.filter((m) => m !== null);
        if (validMoves.length > 0) {
          bossMove = validMoves[Math.floor(Math.random() * validMoves.length)];
          resolvedBossAction = "use-move";
        } else {
          resolvedBossAction = "do-nothing";
        }
      } else if (resolvedBossAction === "use-move") {
        bossMove = this.bossMoves[bossMoveIndex];
        if (!bossMove) resolvedBossAction = "do-nothing";
      }
    } else {
      resolvedBossAction = "do-nothing";
    }

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
      if (playerSpeed > bossSpeed) {
        playerGoesFirst = true;
      } else if (bossSpeed > playerSpeed) {
        playerGoesFirst = false;
      } else {
        playerGoesFirst = true; // Speed tie fallback
      }
    }

    const firstMover = playerGoesFirst ? playerBattler.name : bossBattler.name;
    console.table({
      turn: this.currentTurn,
      player: playerBattler.name,
      playerMove: playerActionObj.move?.name || "none",
      playerMovePriority: playerActionObj.move?.priority ?? 0,
      playerItemPriority: playerItemPriorityBonus,
      playerFinalPriority,
      playerEffectiveSpeed: playerSpeed,
      boss: bossBattler.name,
      bossMove: bossActionObj.move?.name || "none",
      bossMovePriority: bossActionObj.move?.priority ?? 0,
      bossItemPriority: bossItemPriorityBonus,
      bossFinalPriority,
      bossEffectiveSpeed: bossSpeed,
      firstMover
    });

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
        if (this.teamHP[this.activeSlot] <= 0) continue;

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
          this.resetSlotStats(currentActiveSlot);
          this.teamStages[currentActiveSlot] = emptyStages();
          this.teamCurrentTypes[currentActiveSlot] = currentActiveMon.pokemon.types.map(({ type }) => type.name);

          this.activeSlot = step.switchSlot;
          turnLog.activeSlot = this.activeSlot;
          turnLog.pokemon = incomingMon.pokemon.name;
          notesCountBefore = turnLog.notes.length;
        } else if (step.action === "use-move" || step.action === "use-z-move") {
          const move = this.team[this.activeSlot].moves[step.moveIndex];
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
              turnLog.messages.push(`<strong>${displayName(currentActive.pokemon.name)}</strong> used <strong>${moveLabel}</strong>!`);
              
              if (move.damage_class?.name === "status" || !usedPower) {
                if (MOVE_EFFECTS[move.name]) {
                  MOVE_EFFECTS[move.name].apply(this, currentActive, this.boss, "player", turnLog);
                  captureNotes();
                } else {
                  const notImplementedMsg = `${titleCase(move.name)} (status) - Effect not implemented yet.`;
                  turnLog.messages.push(notImplementedMsg);
                  turnLog.notes.push(notImplementedMsg);
                  notesCountBefore = turnLog.notes.length;
                }
              } else if (move.damage_class?.name !== "status" && usedPower) {
                const attackerAbility = getEffectiveAbility({ slotIndex: this.activeSlot, isBoss: false }, this);
                const defenderAbility = getEffectiveAbility({ isBoss: true }, this);
                const attackerItem = getEffectiveItem({ slotIndex: this.activeSlot, isBoss: false, item: currentActive.item }, this);
                const payload = {
                  attacker: { ...currentActive, stats: currentActive.currentStats, level: currentActive.level, item: attackerItem, ability: attackerAbility },
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
                  isTerastallized: this.terastallized.player[this.activeSlot],
                  teraType: currentActive.teraType || "normal",
                };
              const normal = damageRolls(payload);
              const rollResult = selectDamageFromRolls(normal.rolls, this.damageRollMode || "random");
              const dealt = rollResult.damage;

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
                const pct = Math.round((dealt / this.bossMaxHP) * 100);
                const clampedPct = Math.min(100, Math.max(dealt > 0 ? 1 : 0, pct));
                turnLog.messages.push(`(The opposing ${bossDisplayName} lost ${clampedPct}% of its health!)`);
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

              turnLog.playerDamage = bossSurvived ? (initialHP - 1) : dealt;
              turnLog.bossHPAfter = this.bossHP;

              turnLog.playerDamageDetails = {
                moveName: move.name,
                attackerName: currentActive.pokemon.name,
                defenderName: bossDisplayName,
                damage: bossSurvived ? (initialHP - 1) : dealt,
                rollPercent: rollResult.rollPercent,
                rollMode: this.damageRollMode || "random",
                minDamage: normal.min,
                maxDamage: normal.max,
                level: currentActive.level,
                originalPower: normal.basePower || 50,
                usedPower: normal.usedPower,
                attackStat: normal.attackStat,
                defenseStat: normal.defenseStat,
                baseDamageBeforeModifier: normal.baseDamageBeforeModifier,
                criticalModifier: normal.criticalModifier,
                stab: normal.stab,
                effectiveness: normal.effectiveness,
                burnModifier: normal.burnModifier,
                otherModifiers: normal.otherModifiers,
                itemFinalModifier: normal.itemFinalModifier,
                attackStatModifier: normal.attackStatModifier,
                attackerAbility,
                attackerItem: currentActive.item
              };
              turnLog.damageDetails = turnLog.playerDamageDetails;

              const moveType = move?.type?.name || "";
              if (attackerItem === `${moveType}-gem` && normal.effectiveness !== 0 && dealt > 0) {
                markItemConsumed({ slotIndex: this.activeSlot }, this);
                turnLog.notes.push(`${displayName(currentActive.pokemon.name)} consumed its ${titleCase(attackerItem)}!`);
                captureNotes();
              }

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
        if (this.bossHP <= 0) continue;

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
            const attackerAbility = getEffectiveAbility({ isBoss: true }, this);
            const defenderAbility = getEffectiveAbility({ slotIndex: this.activeSlot, isBoss: false }, this);
            const payload = {
              attacker: { stats: this.bossCurrentStats, level: 200, item: "", ability: attackerAbility },
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
              isTerastallized: this.terastallized.boss,
              teraType: "normal",
            };
            const normal = damageRolls(payload);
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
              const pct = Math.round((dealt / currentActive.stats.hp) * 100);
              const clampedPct = Math.min(100, Math.max(dealt > 0 ? 1 : 0, pct));
              turnLog.messages.push(`(${displayName(currentActive.pokemon.name)} lost ${clampedPct}% of its health!)`);
            }

            const initialHP = this.teamHP[this.activeSlot];
            const maxHP = currentActive.stats.hp;
            const itemSlug = getEffectiveItem({ slotIndex: this.activeSlot, isBoss: false, item: currentActive.item }, this);
            const ignoresDefensiveAbilities = ["mold-breaker", "teravolt", "turboblaze"].includes(normalizeAbility(attackerAbility));
            const activeDefenderAbility = ignoresDefensiveAbilities ? "" : normalizeAbility(defenderAbility);

            let playerSurvived = false;
            let survivalNote = "";
            let finalDamage = dealt;

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

             turnLog.bossDamageDetails = {
               moveName: step.move.name,
               attackerName: bossDisplayName,
               defenderName: currentActive.pokemon.name,
               damage: finalDamage,
               rollPercent: rollResult.rollPercent,
               rollMode: this.damageRollMode || "random",
               minDamage: normal.min,
               maxDamage: normal.max,
               level: 200,
               originalPower: normal.basePower || 50,
               usedPower: normal.usedPower,
               attackStat: normal.attackStat,
               defenseStat: normal.defenseStat,
               baseDamageBeforeModifier: normal.baseDamageBeforeModifier,
               criticalModifier: normal.criticalModifier,
               stab: normal.stab,
               effectiveness: normal.effectiveness,
               burnModifier: normal.burnModifier,
               otherModifiers: normal.otherModifiers,
               itemFinalModifier: normal.itemFinalModifier,
               attackStatModifier: normal.attackStatModifier,
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
            turnLog.bossAction = "do-nothing";
            turnLog.messages.push(`The opposing <strong>${bossDisplayName}</strong> did nothing.`);
            turnLog.notes.push("Boss did nothing.");
            notesCountBefore = turnLog.notes.length;
          }
        } else {
          // Boss chose do-nothing (no move selected or skipped)
          turnLog.bossAction = "do-nothing";
          turnLog.messages.push(`The opposing <strong>${bossDisplayName}</strong> did nothing.`);
          turnLog.notes.push("Boss did nothing.");
          notesCountBefore = turnLog.notes.length;
        }
      }
    }

    // Post-turn effects (healing, leftovers, shell bell, sitrus berry)
    if (this.teamHP[this.activeSlot] > 0) {
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
      turnLog.messages.push(`The opposing <strong>${bossDisplayName}</strong> fainted!`);
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
    if (!incomingMon || !incomingMon.pokemon || this.teamHP[slotIndex] <= 0) {
      throw new Error("Cannot switch to empty or fainted slot.");
    }

    const prevActiveSlot = this.activeSlot;

    // Reset current active slot stat boosts, overrides, and types
    this.resetSlotStats(prevActiveSlot);
    this.teamStages[prevActiveSlot] = emptyStages();
    this.teamCurrentTypes[prevActiveSlot] = this.team[prevActiveSlot].pokemon.types.map(({ type }) => type.name);

    // Swap active slot and initialize incoming boosts
    this.teamStages[slotIndex] = { ...incomingMon.stages };
    this.activeSlot = slotIndex;
    this.awaitingForcedSwitch = false;

    let forcedSwitchLog = {
      turn: this.currentTurn,
      activeSlot: this.activeSlot,
      pokemon: incomingMon.pokemon.name,
      playerAction: "switch-forced",
      playerMove: "—",
      playerDamage: 0,
      playerHPAfter: this.teamHP[slotIndex],
      bossHPBefore: this.bossHP,
      bossHPAfter: this.bossHP,
      bossAction: "do-nothing",
      bossMove: "—",
      bossDamage: 0,
      notes: [`${displayName(incomingMon.pokemon.name)} entered the battle.`],
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
