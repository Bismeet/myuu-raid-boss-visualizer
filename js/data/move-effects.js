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
    return;
  }

  turnLog.notes.push(`${actorName}'s ${statNameLabel} ${roseLabel}!`);
  if (result.simpleBoosted) {
    turnLog.notes.push(`Simple doubled the stat change!`);
  }
  turnLog.notes.push(`${actorName} ${statNameLabel} stage: ${stageText(result.before)} -> ${stageText(result.after)}.`);
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
    apply(state, user, target, side, turnLog) {
      const targetSide = side === "player" ? "boss" : "player";
      state.applyTypeChangingMove("trick-or-treat", targetSide);
      const targetName = targetSide === "boss" ? getBossDisplayName(state) : displayName(user.pokemon.name);
      turnLog.notes.push(`${targetName}'s type changed to include Ghost!`);
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
        turnLog.notes.push(`${bossName}'s Defense changed: ${bossDef} → ${avgDef}.`);
        turnLog.notes.push(`${bossName}'s Sp. Defense changed: ${bossSpd} → ${avgSpd}.`);
      } else {
        user.statSources.def.push("Guard Split with Boss");
        user.statSources.spd.push("Guard Split with Boss");
        state.bossStatSources.def.push("Guard Split with player active");
        state.bossStatSources.spd.push("Guard Split with player active");
        
        turnLog.notes.push(`${displayName(user.pokemon.name)}'s Defense changed: ${userDef} → ${avgDef}.`);
        turnLog.notes.push(`${displayName(user.pokemon.name)}'s Sp. Defense changed: ${userSpd} → ${avgSpd}.`);
      }
    }
  },
  "power-split": {
    name: "Power Split",
    implemented: "Implemented",
    description: "Averages user's and target's Attack and Sp. Attack actual stats.",
    apply(state, user, target, side, turnLog) {
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
        turnLog.notes.push(`${bossName}'s Attack changed: ${bossAtk} → ${avgAtk}.`);
        turnLog.notes.push(`${bossName}'s Sp. Attack changed: ${bossSpa} → ${avgSpa}.`);
      } else {
        user.statSources.atk.push("Power Split with Boss");
        user.statSources.spa.push("Power Split with Boss");
        state.bossStatSources.atk.push("Power Split with player active");
        state.bossStatSources.spa.push("Power Split with player active");
        
        turnLog.notes.push(`${displayName(user.pokemon.name)}'s Attack changed: ${userAtk} → ${avgAtk}.`);
        turnLog.notes.push(`${displayName(user.pokemon.name)}'s Sp. Attack changed: ${userSpa} → ${avgSpa}.`);
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
