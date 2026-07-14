import { displayName, titleCase, getBossDisplayName } from "../utils/format.js";
import { changeStage, getEffectiveAbility, getEffectiveSpeed, setAbilityOverride, setBattleSpeedOverride } from "../core/battle-state.js";

const stageText = (stage) => stage > 0 ? `+${stage}` : `${stage}`;

function battlerRefForSide(state, side, role) {
  if ((side === "player" && role === "user") || (side === "boss" && role === "target")) {
    return { slotIndex: state.activeSlot, isBoss: false };
  }
  return { isBoss: true };
}

function battlerNameForSide(state, user, side, role) {
  if ((side === "player" && role === "user") || (side === "boss" && role === "target")) {
    return displayName(user.pokemon.name);
  }
  return `The opposing ${getBossDisplayName(state)}`;
}

function applyStatRaisingMove(state, user, side, turnLog, statKey, stagesToRaise, statNameLabel, roseLabel) {
  const userRef = battlerRefForSide(state, side, "user");
  const actorName = battlerNameForSide(state, user, side, "user");
  const result = changeStage(userRef, statKey, stagesToRaise, state);

  if (result.after === result.before) {
    turnLog.notes.push(`${actorName}'s ${statNameLabel} won't go any higher!`);
    return result;
  }

  turnLog.notes.push(`${actorName}'s ${statNameLabel} ${roseLabel}!`);
  if (result.simpleBoosted) {
    turnLog.notes.push(`Simple doubled the stat change!`);
  }
  turnLog.notes.push(`${actorName} ${statNameLabel} stage: ${stageText(result.before)} -> ${stageText(result.after)}.`);
  return result;
}

export function applyStatLoweringMove(state, user, target, side, turnLog, moveName, statKey, stagesToDrop, statNameLabel) {
  const targetRef = battlerRefForSide(state, side, "target");
  const targetName = battlerNameForSide(state, user, side, "target");
  const result = changeStage(targetRef, statKey, -stagesToDrop, state);

  if (result.after === result.before) {
    turnLog.notes.push(`${targetName}'s ${statNameLabel} won't go any lower!`);
  } else {
    const fallLabel = stagesToDrop >= 2 ? "harshly fell" : "fell";
    turnLog.notes.push(`${targetName}'s ${statNameLabel} ${fallLabel}!`);
    if (result.simpleBoosted) {
      turnLog.notes.push(`Simple doubled the stat change!`);
    }
    turnLog.notes.push(`${targetName} ${statNameLabel} stage: ${stageText(result.before)} -> ${stageText(result.after)}.`);
  }
  return result;
}

export function applyDamagingMoveAfterEffects(state, user, target, side, turnLog, moveName, landed = true) {
  if (!landed) return;
  const drops = moveName === "close-combat"
    ? [["def", "Defense"], ["spd", "Sp. Defense"]]
    : moveName === "superpower"
      ? [["atk", "Attack"], ["def", "Defense"]]
      : [];
  const actorName = battlerNameForSide(state, user, side, "user");
  if (drops.length) {
    const userRef = battlerRefForSide(state, side, "user");
    for (const [stat, label] of drops) {
      const result = changeStage(userRef, stat, -1, state);
      if (result.after !== result.before) turnLog.notes.push(`${actorName}'s ${label} fell!`);
      if (result.simpleBoosted) turnLog.notes.push("Simple doubled the stat change!");
    }
  }

  const typeRemoval = state.removeUserTypeAfterMove(side, moveName);
  if (typeRemoval) {
    turnLog.notes.push(`${actorName} lost its ${titleCase(typeRemoval.removedType)} type!`);
  }
}

export function applySpeedSwap(ctx) {
  const userSpeedBefore = getEffectiveSpeed(ctx.user, ctx.state);
  const targetSpeedBefore = getEffectiveSpeed(ctx.target, ctx.state);

  // Set overrides - this is the ONLY source of truth for Speed Swap
  setBattleSpeedOverride(ctx.user, ctx.state, targetSpeedBefore);
  setBattleSpeedOverride(ctx.target, ctx.state, userSpeedBefore);

  // Verify by reading back from getEffectiveSpeed
  const userSpeedAfter = getEffectiveSpeed(ctx.user, ctx.state);
  const targetSpeedAfter = getEffectiveSpeed(ctx.target, ctx.state);

  ctx.log.push(`${ctx.user.name} swapped Speed with ${ctx.target.name}.`);
  ctx.log.push(`${ctx.user.name} Speed: ${userSpeedBefore} → ${userSpeedAfter}.`);
  ctx.log.push(`${ctx.target.name} Speed: ${targetSpeedBefore} → ${targetSpeedAfter}.`);
}

export const MOVE_EFFECTS = {
  "swords-dance": {
    name: "Swords Dance",
    implemented: "Implemented",
    description: "Boosts user's Attack by 2 stages.",
    apply(state, user, target, side, turnLog) {
      applyStatRaisingMove(state, user, side, turnLog, "atk", 2, "Attack", "sharply rose");
    }
  },
  "nasty-plot": {
    name: "Nasty Plot",
    implemented: "Implemented",
    description: "Boosts user's Sp. Atk by 2 stages.",
    apply(state, user, target, side, turnLog) {
      applyStatRaisingMove(state, user, side, turnLog, "spa", 2, "Sp. Atk", "sharply rose");
    }
  },
  "tail-glow": {
    name: "Tail Glow",
    implemented: "Implemented",
    description: "Boosts user's Sp. Attack by 3 stages.",
    apply(state, user, target, side, turnLog) {
      applyStatRaisingMove(state, user, side, turnLog, "spa", 3, "Sp. Attack", "rose drastically");
    }
  },
  "cotton-guard": {
    name: "Cotton Guard",
    implemented: "Implemented",
    description: "Boosts user's Defense by 3 stages.",
    apply(state, user, target, side, turnLog) {
      applyStatRaisingMove(state, user, side, turnLog, "def", 3, "Defense", "rose drastically");
    }
  },
  "simple-beam": {
    name: "Simple Beam",
    implemented: "Implemented",
    description: "Changes the target's ability to Simple.",
    apply(state, user, target, side, turnLog) {
      const targetRef = battlerRefForSide(state, side, "target");
      const targetName = battlerNameForSide(state, user, side, "target");
      const before = getEffectiveAbility(targetRef, state);
      setAbilityOverride(targetRef, state, "simple");

      turnLog.notes.push(`${targetName}'s Ability became Simple!`);
      turnLog.notes.push(`${targetName}'s Ability: ${titleCase(before || "None")} -> Simple.`);

      return {
        dealtDamage: 0,
        effectApplied: true
      };
    }
  },
  "belly-drum": {
    name: "Belly Drum",
    implemented: "Implemented",
    description: "Maximizes Attack stage (+6) in exchange for 50% max HP.",
    apply(state, user, target, side, turnLog) {
      if (side === "player") {
        const currentHP = state.teamHP[state.activeSlot];
        const maxHP = user.stats.hp;
        const selfDamage = Math.floor(maxHP / 2);
        if (currentHP > selfDamage) {
          state.teamHP[state.activeSlot] = currentHP - selfDamage;
          state.teamStages[state.activeSlot].atk = 6;
          turnLog.notes.push(`${displayName(user.pokemon.name)} cut its HP and maximized its Attack!`);
        } else {
          turnLog.notes.push(`But it failed!`);
        }
      } else {
        const currentHP = state.bossHP;
        const maxHP = state.bossMaxHP;
        const selfDamage = Math.floor(maxHP / 2);
        if (currentHP > selfDamage) {
          state.bossHP = currentHP - selfDamage;
          state.bossStages.atk = 6;
          turnLog.notes.push(`The opposing ${getBossDisplayName(state)} cut its HP and maximized its Attack!`);
        } else {
          turnLog.notes.push(`But it failed!`);
        }
      }
    }
  },
  "focus-energy": {
    name: "Focus Energy",
    implemented: "Implemented",
    description: "Boosts critical-hit ratio by 2 stages.",
    apply(state, user, target, side, turnLog) {
      const stages = side === "player" ? state.teamStages[state.activeSlot] : state.bossStages;
      stages.crit = Math.min(4, stages.crit + 2);
      const actorName = side === "player" ? displayName(user.pokemon.name) : `opposing ${getBossDisplayName(state)}`;
      turnLog.notes.push(`${actorName} is getting pumped!`);
    }
  },
  "baton-pass": {
    name: "Baton Pass",
    implemented: "Implemented",
    description: "Passes stat stages to replacement Pokémon.",
    apply(state, user, target, side, turnLog) {
      // Baton Pass is handled in switch execution, registered here for description
    }
  },
  "trick-or-treat": {
    name: "Trick-or-Treat",
    implemented: "Implemented",
    description: "Adds Ghost type to the target.",
    apply(state, user, target, side, turnLog, options = {}) {
      if (options.isZMove) {
        const userRef = battlerRefForSide(state, side, "user");
        for (const stat of ["atk", "def", "spa", "spd", "spe"]) {
          changeStage(userRef, stat, 1, state);
        }
        const actorName = battlerNameForSide(state, user, side, "user");
        turnLog.notes.push(`${actorName}'s stats rose!`);
      }
      const targetSide = side === "player" ? "boss" : "player";
      state.applyTypeChangingMove("trick-or-treat", targetSide);
      const targetName = targetSide === "boss" ? `the opposing ${getBossDisplayName(state)}` : displayName(user.pokemon.name);
      turnLog.notes.push(`Ghost type was added to ${targetName}!`);
    }
  },
  "octolock": {
    name: "Octolock",
    implemented: "Implemented",
    description: "Traps the target and lowers its Defense and Sp. Defense at the end of each turn.",
    apply(state, user, target, side, turnLog) {
      const targetSide = side === "player" ? "boss" : "player";
      state.volatileEffects.octolock = {
        target: targetSide,
        targetSlot: targetSide === "player" ? state.activeSlot : null,
        source: side,
        active: true,
      };
      const targetName = targetSide === "boss" ? `The opposing ${getBossDisplayName(state)}` : displayName(user.pokemon.name);
      turnLog.notes.push(`${targetName} can no longer escape!`);
    }
  },
  "ingrain": {
    name: "Ingrain",
    implemented: "Implemented",
    description: "Roots the user and restores one sixteenth of max HP at the end of each turn.",
    apply(state, user, target, side, turnLog) {
      const actorName = battlerNameForSide(state, user, side, "user");
      if (side === "player") state.volatileEffects.ingrain[state.activeSlot] = true;
      else state.volatileEffects.ingrainBoss = true;
      turnLog.notes.push(`${actorName} planted its roots!`);
    }
  },
  "memento": {
    name: "Memento",
    implemented: "Implemented",
    description: "The user faints and lowers the target's Attack and Sp. Attack by 2 stages.",
    apply(state, user, target, side, turnLog) {
      const actorName = battlerNameForSide(state, user, side, "user");
      if (side === "player") {
        if (state.teamHP[state.activeSlot] > 0) state.faintedAlliesCount += 1;
        state.teamHP[state.activeSlot] = 0;
      } else {
        state.bossHP = 0;
      }
      turnLog.notes.push(`${actorName} fainted!`);
      applyStatLoweringMove(state, user, target, side, turnLog, "Memento", "atk", 2, "Attack");
      applyStatLoweringMove(state, user, target, side, turnLog, "Memento", "spa", 2, "Sp. Attack");
    }
  },
  "tickle": {
    name: "Tickle",
    implemented: "Implemented",
    description: "Lowers the target's Attack and Defense by 1 stage.",
    apply(state, user, target, side, turnLog) {
      applyStatLoweringMove(state, user, target, side, turnLog, "Tickle", "atk", 1, "Attack");
      applyStatLoweringMove(state, user, target, side, turnLog, "Tickle", "def", 1, "Defense");
    }
  },
  "forests-curse": {
    name: "Forest's Curse",
    implemented: "Implemented",
    description: "Adds Grass type to the target.",
    apply(state, user, target, side, turnLog) {
      const targetSide = side === "player" ? "boss" : "player";
      state.applyTypeChangingMove("forests-curse", targetSide);
      const targetName = targetSide === "boss" ? getBossDisplayName(state) : displayName(user.pokemon.name);
      turnLog.notes.push(`${targetName}'s type changed to include Grass!`);
    }
  },
  "magic-powder": {
    name: "Magic Powder",
    implemented: "Implemented",
    description: "Replaces target's types with Psychic.",
    apply(state, user, target, side, turnLog) {
      const targetSide = side === "player" ? "boss" : "player";
      state.applyTypeChangingMove("magic-powder", targetSide);
      const targetName = targetSide === "boss" ? getBossDisplayName(state) : displayName(user.pokemon.name);
      turnLog.notes.push(`${targetName}'s type changed to Psychic!`);
    }
  },
  "soak": {
    name: "Soak",
    implemented: "Implemented",
    description: "Replaces target's types with Water.",
    apply(state, user, target, side, turnLog) {
      const targetSide = side === "player" ? "boss" : "player";
      state.applyTypeChangingMove("soak", targetSide);
      const targetName = targetSide === "boss" ? getBossDisplayName(state) : displayName(user.pokemon.name);
      turnLog.notes.push(`${targetName}'s type changed to Water!`);
    }
  },
  "tar-shot": {
    name: "Tar Shot",
    implemented: "Implemented",
    description: "Lowers the target's Speed by 1 stage and doubles Fire damage against it.",
    apply(state, user, target, side, turnLog) {
      const targetSide = side === "player" ? "boss" : "player";
      applyStatLoweringMove(state, user, target, side, turnLog, "Tar Shot", "spe", 1, "Speed");
      state.applyTarShot(targetSide);
      const targetName = targetSide === "boss" ? `The opposing ${getBossDisplayName(state)}` : displayName(user.pokemon.name);
      turnLog.notes.push(`${targetName} became weaker to Fire-type moves!`);
    }
  },
  "reflect-type": {
    name: "Reflect Type",
    implemented: "Implemented",
    description: "Copies the target's current types.",
    apply(state, user, target, side, turnLog) {
      const targetSide = side === "player" ? "boss" : "player";
      const copiedTypes = state.getCurrentTypes(targetSide);
      state.setCurrentTypes(side, copiedTypes);
      const actorName = battlerNameForSide(state, user, side, "user");
      turnLog.notes.push(`${actorName} copied the target's current type!`);
    }
  },
  "conversion": {
    name: "Conversion",
    implemented: "Implemented",
    description: "Changes the user to the type of its first move.",
    apply(state, user, target, side, turnLog) {
      const moves = side === "player" ? state.team[state.activeSlot].moves : state.bossMoves;
      const resultingType = moves.find(Boolean)?.type?.name;
      if (!resultingType) {
        turnLog.notes.push("But it failed!");
        return;
      }
      state.setCurrentTypes(side, [resultingType]);
      const actorName = battlerNameForSide(state, user, side, "user");
      turnLog.notes.push(`${actorName} became ${titleCase(resultingType)} type!`);
    }
  },
  "conversion-2": {
    name: "Conversion 2",
    implemented: "Partial",
    description: "Changes the user to a deterministic type that resists or is immune to the target's last move.",
    apply(state, user, target, side, turnLog) {
      const resultingType = state.conversion2TypeFor(side);
      if (!resultingType) {
        turnLog.notes.push("But it failed! No target move type was available.");
        return;
      }
      state.setCurrentTypes(side, [resultingType]);
      const actorName = battlerNameForSide(state, user, side, "user");
      turnLog.notes.push(`${actorName} became ${titleCase(resultingType)} type!`);
    }
  },
  "camouflage": {
    name: "Camouflage",
    implemented: "Partial",
    description: "Changes the user to Normal type because battle terrain is not modeled.",
    apply(state, user, target, side, turnLog) {
      state.setCurrentTypes(side, ["normal"]);
      const actorName = battlerNameForSide(state, user, side, "user");
      turnLog.notes.push(`${actorName} became Normal type!`);
    }
  },
  "roost": {
    name: "Roost",
    implemented: "Implemented",
    description: "Heals half max HP and removes Flying type until the end of the turn.",
    apply(state, user, target, side, turnLog) {
      const actorName = battlerNameForSide(state, user, side, "user");
      if (side === "player") {
        const maxHp = user.stats.hp;
        state.teamHP[state.activeSlot] = Math.min(maxHp, state.teamHP[state.activeSlot] + Math.floor(maxHp / 2));
      } else {
        state.bossHP = Math.min(state.bossMaxHP, state.bossHP + Math.floor(state.bossMaxHP / 2));
      }
      const change = state.beginRoost(side);
      turnLog.notes.push(`${actorName} restored HP!`);
      if (change.before.includes("flying")) turnLog.notes.push(`${actorName} lost its Flying type for the rest of the turn!`);
    }
  },
  "electrify": {
    name: "Electrify",
    implemented: "Implemented",
    description: "Changes the target's next move this turn to Electric type.",
    apply(state, user, target, side, turnLog) {
      state.volatileEffects.electrifyTarget = side === "player" ? "boss" : "player";
      turnLog.notes.push("The target's move was electrified!");
    }
  },
  "ion-deluge": {
    name: "Ion Deluge",
    implemented: "Implemented",
    description: "Changes Normal-type moves to Electric type for the rest of the turn.",
    apply(state, user, target, side, turnLog) {
      state.volatileEffects.ionDeluge = true;
      turnLog.notes.push("A deluge of ions showers the battlefield!");
    }
  },
  "trick-room": {
    name: "Trick Room",
    implemented: "Implemented",
    description: "Reverses move order within equal priority brackets for five turns.",
    apply(state, user, target, side, turnLog) {
      const active = state.volatileEffects.trickRoomTurns > 0;
      state.volatileEffects.trickRoomTurns = active ? 0 : 5;
      turnLog.notes.push(active ? "The twisted dimensions returned to normal!" : "The dimensions were twisted!");
    }
  },
  "burn-up": {
    name: "Burn Up",
    implemented: "Implemented",
    description: "After a successful hit, removes the user's Fire type; fails without Fire typing."
  },
  "double-shock": {
    name: "Double Shock",
    implemented: "Implemented",
    description: "After a successful hit, removes the user's Electric type; fails without Electric typing."
  },
  "speed-swap": {
    name: "Speed Swap",
    implemented: "Implemented",
    description: "Swaps effective Speed raw values of user and target.",
    apply(state, user, target, side, turnLog) {
      const bossName = state.manualBossOverride ? displayName(state.manualBossName) : displayName(target.name);
      const playerName = displayName(user.pokemon.name);
      
      const userRef = side === "player"
        ? { slotIndex: state.activeSlot, item: user.item, isBoss: false, name: playerName }
        : { isBoss: true, name: bossName };
        
      const targetRef = side === "player"
        ? { isBoss: true, name: bossName }
        : { slotIndex: state.activeSlot, item: user.item, isBoss: false, name: playerName };
      
      const ctx = {
        user: userRef,
        target: targetRef,
        state: state,
        log: turnLog.notes
      };
      
      applySpeedSwap(ctx);
      
      // Swap stats directly for UI consistency
      const playerSpe = user.stats.spe;
      const bossSpe = state.bossStats.spe;
      user.stats.spe = bossSpe;
      state.bossStats.spe = playerSpe;
      
      // Track the Speed Swap in stat sources (for tooltip display)
      if (side === "player") {
        user.statSources.spe.push("Speed Swap with Boss");
        state.bossStatSources.spe.push(`Speed Swap with ${displayName(user.pokemon.name)}`);
      } else {
        user.statSources.spe.push("Speed Swap with Boss");
        state.bossStatSources.spe.push(`Speed Swap with Boss`);
      }
    }
  },
  "guard-split": {
    name: "Guard Split",
    implemented: "Implemented",
    description: "Averages user's and target's Defense and Sp. Defense actual stats.",
    apply(state, user, target, side, turnLog) {
      state.recordSplitEvent("guard-split", state.activeSlot);
      const userDef = user.currentStats.def;
      const userSpd = user.currentStats.spd;
      const bossDef = state.bossCurrentStats.def;
      const bossSpd = state.bossCurrentStats.spd;
      
      const avgDef = Math.floor((userDef + bossDef) / 2);
      const avgSpd = Math.floor((userSpd + bossSpd) / 2);
      
      user.currentStats.def = avgDef;
      user.currentStats.spd = avgSpd;
      state.bossCurrentStats.def = avgDef;
      state.bossCurrentStats.spd = avgSpd;
      
      user.stats.def = avgDef;
      user.stats.spd = avgSpd;
      state.bossStats.def = avgDef;
      state.bossStats.spd = avgSpd;

      if (side === "player") {
        user.statSources.def.push("Guard Split with Boss");
        user.statSources.spd.push("Guard Split with Boss");
        state.bossStatSources.def.push(`Guard Split with ${displayName(user.pokemon.name)}`);
        state.bossStatSources.spd.push(`Guard Split with ${displayName(user.pokemon.name)}`);
        
        const bossName = getBossDisplayName(state);
        turnLog.notes.push(`${bossName} shared its defensive power with ${displayName(user.pokemon.name)}.`);
      } else {
        user.statSources.def.push("Guard Split with Boss");
        user.statSources.spd.push("Guard Split with Boss");
        state.bossStatSources.def.push("Guard Split with player active");
        state.bossStatSources.spd.push("Guard Split with player active");
        
        turnLog.notes.push(`${displayName(user.pokemon.name)} shared its defensive power with the boss.`);
      }
    }
  },
  "power-split": {
    name: "Power Split",
    implemented: "Implemented",
    description: "Averages user's and target's Attack and Sp. Attack actual stats.",
    apply(state, user, target, side, turnLog) {
      state.recordSplitEvent("power-split", state.activeSlot);
      const userAtk = user.currentStats.atk;
      const userSpa = user.currentStats.spa;
      const bossAtk = state.bossCurrentStats.atk;
      const bossSpa = state.bossCurrentStats.spa;
      
      const avgAtk = Math.floor((userAtk + bossAtk) / 2);
      const avgSpa = Math.floor((userSpa + bossSpa) / 2);
      
      user.currentStats.atk = avgAtk;
      user.currentStats.spa = avgSpa;
      state.bossCurrentStats.atk = avgAtk;
      state.bossCurrentStats.spa = avgSpa;
      
      user.stats.atk = avgAtk;
      user.stats.spa = avgSpa;
      state.bossStats.atk = avgAtk;
      state.bossStats.spa = avgSpa;

      if (side === "player") {
        user.statSources.atk.push("Power Split with Boss");
        user.statSources.spa.push("Power Split with Boss");
        state.bossStatSources.atk.push(`Power Split with ${displayName(user.pokemon.name)}`);
        state.bossStatSources.spa.push(`Power Split with ${displayName(user.pokemon.name)}`);
        
        const bossName = getBossDisplayName(state);
        turnLog.notes.push(`${bossName} shared its offensive power with ${displayName(user.pokemon.name)}.`);
      } else {
        user.statSources.atk.push("Power Split with Boss");
        user.statSources.spa.push("Power Split with Boss");
        state.bossStatSources.atk.push("Power Split with player active");
        state.bossStatSources.spa.push("Power Split with player active");
        
        turnLog.notes.push(`${displayName(user.pokemon.name)} shared its offensive power with the boss.`);
      }
    }
  },
  "screech": {
    name: "Screech",
    implemented: "Implemented",
    description: "Lowers the target's Defense by 2 stages.",
    apply(state, user, target, side, turnLog) {
      applyStatLoweringMove(state, user, target, side, turnLog, "Screech", "def", 2, "Defense");
    }
  },
  "metal-sound": {
    name: "Metal Sound",
    implemented: "Implemented",
    description: "Lowers the target's Sp. Def by 2 stages.",
    apply(state, user, target, side, turnLog) {
      applyStatLoweringMove(state, user, target, side, turnLog, "Metal Sound", "spd", 2, "Sp. Defense");
    }
  },
  "fake-tears": {
    name: "Fake Tears",
    implemented: "Implemented",
    description: "Lowers the target's Sp. Def by 2 stages.",
    apply(state, user, target, side, turnLog) {
      applyStatLoweringMove(state, user, target, side, turnLog, "Fake Tears", "spd", 2, "Sp. Defense");
    }
  },
  "charm": {
    name: "Charm",
    implemented: "Implemented",
    description: "Lowers the target's Attack by 2 stages.",
    apply(state, user, target, side, turnLog) {
      applyStatLoweringMove(state, user, target, side, turnLog, "Charm", "atk", 2, "Attack");
    }
  },
  "feather-dance": {
    name: "Feather Dance",
    implemented: "Implemented",
    description: "Lowers the target's Attack by 2 stages.",
    apply(state, user, target, side, turnLog) {
      applyStatLoweringMove(state, user, target, side, turnLog, "Feather Dance", "atk", 2, "Attack");
    }
  },
  "tail-whip": {
    name: "Tail Whip",
    implemented: "Implemented",
    description: "Lowers the target's Defense by 1 stage.",
    apply(state, user, target, side, turnLog) {
      applyStatLoweringMove(state, user, target, side, turnLog, "Tail Whip", "def", 1, "Defense");
    }
  },
  "leer": {
    name: "Leer",
    implemented: "Implemented",
    description: "Lowers the target's Defense by 1 stage.",
    apply(state, user, target, side, turnLog) {
      applyStatLoweringMove(state, user, target, side, turnLog, "Leer", "def", 1, "Defense");
    }
  },
  "growl": {
    name: "Growl",
    implemented: "Implemented",
    description: "Lowers the target's Attack by 1 stage.",
    apply(state, user, target, side, turnLog) {
      applyStatLoweringMove(state, user, target, side, turnLog, "Growl", "atk", 1, "Attack");
    }
  },
  "string-shot": {
    name: "String Shot",
    implemented: "Implemented",
    description: "Lowers the target's Speed by 2 stages.",
    apply(state, user, target, side, turnLog) {
      applyStatLoweringMove(state, user, target, side, turnLog, "String Shot", "spe", 2, "Speed");
    }
  },
  "scary-face": {
    name: "Scary Face",
    implemented: "Implemented",
    description: "Lowers the target's Speed by 2 stages.",
    apply(state, user, target, side, turnLog) {
      applyStatLoweringMove(state, user, target, side, turnLog, "Scary Face", "spe", 2, "Speed");
    }
  }
};

const AUDITED_STATUS_MOVES = [
  "soak", "tar-shot", "magic-powder", "trick-or-treat", "forests-curse", "reflect-type",
  "conversion", "conversion-2", "camouflage", "burn-up", "double-shock", "roost", "electrify",
  "ion-deluge", "screech", "metal-sound", "fake-tears", "charm", "feather-dance", "tail-whip",
  "leer", "growl", "string-shot", "scary-face", "tickle", "memento", "octolock", "ingrain",
  "tail-glow", "cotton-guard", "simple-beam", "guard-split", "power-split", "speed-swap",
  "baton-pass", "trick-room", "focus-energy", "belly-drum",
];

export const MOVE_MECHANICS_AUDIT = Object.fromEntries(AUDITED_STATUS_MOVES.map((name) => [name, {
  name: MOVE_EFFECTS[name]?.name || titleCase(name),
  status: MOVE_EFFECTS[name]?.implemented || "Missing",
  description: MOVE_EFFECTS[name]?.description || "No battle implementation is registered.",
}]));

MOVE_MECHANICS_AUDIT["z-belly-drum"] = {
  name: "Z-Belly Drum",
  status: "Implemented",
  description: "Restores HP first, then applies Belly Drum and marks the Z-Move used.",
};
MOVE_MECHANICS_AUDIT["z-trick-or-treat"] = {
  name: "Z-Trick-or-Treat",
  status: "Implemented",
  description: "Raises all five battle stats, adds Ghost type, and marks the Z-Move used.",
};
