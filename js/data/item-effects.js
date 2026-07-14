export const ITEM_EFFECTS = {
  "life-orb": {
    id: "life-orb",
    name: "Life Orb",
    description: "Boosts damage by 1.3x.",
    hooks: {
      finalDamageModifier(ctx) {
        return 1.3;
      }
    }
  },
  "choice-band": {
    id: "choice-band",
    name: "Choice Band",
    description: "Boosts Physical Attack by 1.5x.",
    hooks: {
      atkStatModifier(ctx) {
        return ctx.physical ? 1.5 : 1.0;
      }
    }
  },
  "choice-specs": {
    id: "choice-specs",
    name: "Choice Specs",
    description: "Boosts Special Attack by 1.5x.",
    hooks: {
      atkStatModifier(ctx) {
        return !ctx.physical ? 1.5 : 1.0;
      }
    }
  },
  "choice-scarf": {
    id: "choice-scarf",
    name: "Choice Scarf",
    description: "Boosts Speed by 1.5x.",
    hooks: {
      // Spe is not checked in damage calculations directly, but is logged
    }
  },
  "expert-belt": {
    id: "expert-belt",
    name: "Expert Belt",
    description: "Boosts super-effective damage by 1.2x.",
    hooks: {
      finalDamageModifier(ctx) {
        return ctx.effectiveness > 1 ? 1.2 : 1.0;
      }
    }
  },
  "muscle-band": {
    id: "muscle-band",
    name: "Muscle Band",
    description: "Boosts physical damage by 1.1x.",
    hooks: {
      finalDamageModifier(ctx) {
        return ctx.physical ? 1.1 : 1.0;
      }
    }
  },
  "wise-glasses": {
    id: "wise-glasses",
    name: "Wise Glasses",
    description: "Boosts special damage by 1.1x.",
    hooks: {
      finalDamageModifier(ctx) {
        return !ctx.physical ? 1.1 : 1.0;
      }
    }
  },
  "metronome": {
    id: "metronome",
    name: "Metronome",
    description: "Boosts damage of repeated moves (manual override multiplier).",
    hooks: {
      finalDamageModifier(ctx) {
        return Math.max(1.0, Math.min(2.0, ctx.attacker.metronomeMultiplier || 1.0));
      }
    }
  },
  // Crit items
  "scope-lens": {
    id: "scope-lens",
    name: "Scope Lens",
    description: "Boosts critical-hit ratio by 1 stage.",
    hooks: {
      critStageBonus(ctx) {
        return 1;
      }
    }
  },
  "razor-claw": {
    id: "razor-claw",
    name: "Razor Claw",
    description: "Boosts critical-hit ratio by 1 stage.",
    hooks: {
      critStageBonus(ctx) {
        return 1;
      }
    }
  },
  "stick": {
    id: "stick",
    name: "Stick",
    description: "Boosts Farfetch'd/Sirfetch'd critical-hit ratio by 2 stages.",
    hooks: {
      critStageBonus(ctx) {
        const mon = ctx.attacker.pokemon?.name || "";
        return ["farfetchd", "sirfetchd"].includes(mon) ? 2 : 0;
      }
    }
  },
  "leek": {
    id: "leek",
    name: "Leek",
    description: "Boosts Farfetch'd/Sirfetch'd critical-hit ratio by 2 stages.",
    hooks: {
      critStageBonus(ctx) {
        const mon = ctx.attacker.pokemon?.name || "";
        return ["farfetchd", "sirfetchd"].includes(mon) ? 2 : 0;
      }
    }
  },

  // Post-Turn Healing Items
  "leftovers": {
    id: "leftovers",
    name: "Leftovers",
    description: "Heals 1/16th max HP at turn end.",
    hooks: {
      onTurnEnd(ctx) {
        const maxHP = ctx.attackerBuild.stats.hp;
        const heal = Math.floor(maxHP / 16);
        const currentHP = ctx.state.teamHP[ctx.slot];
        const newHP = Math.min(maxHP, currentHP + heal);
        ctx.state.teamHP[ctx.slot] = newHP;
        return `${displayName(ctx.attackerBuild.pokemon.name)} healed ${newHP - currentHP} HP from Leftovers.`;
      }
    }
  },
  "shell-bell": {
    id: "shell-bell",
    name: "Shell Bell",
    description: "Heals 1/8th of damage dealt at turn end.",
    hooks: {
      onTurnEnd(ctx) {
        if (!ctx.damageDealt || ctx.damageDealt <= 0) return null;
        const maxHP = ctx.attackerBuild.stats.hp;
        const heal = Math.floor(ctx.damageDealt / 8);
        const currentHP = ctx.state.teamHP[ctx.slot];
        const newHP = Math.min(maxHP, currentHP + heal);
        ctx.state.teamHP[ctx.slot] = newHP;
        return `${displayName(ctx.attackerBuild.pokemon.name)} healed ${newHP - currentHP} HP from Shell Bell.`;
      }
    }
  },
  "oran-berry": {
    id: "oran-berry",
    name: "Oran Berry",
    description: "Heals 10 HP when HP drops below 50%.",
    hooks: {
      onTurnEnd(ctx) {
        if (ctx.state.consumedItems?.player?.[ctx.slot]) return null;
        const maxHP = ctx.attackerBuild.stats.hp;
        const currentHP = ctx.state.teamHP[ctx.slot];
        if (currentHP > 0 && currentHP < Math.floor(maxHP / 2)) {
          const heal = 10;
          const newHP = Math.min(maxHP, currentHP + heal);
          ctx.state.teamHP[ctx.slot] = newHP;
          if (ctx.state.consumedItems?.player) {
            ctx.state.consumedItems.player[ctx.slot] = true;
          }
          return `${displayName(ctx.attackerBuild.pokemon.name)} consumed Oran Berry and healed ${newHP - currentHP} HP.`;
        }
      }
    }
  },
  "sitrus-berry": {
    id: "sitrus-berry",
    name: "Sitrus Berry",
    description: "Heals 25% max HP when HP drops below 50%.",
    hooks: {
      onTurnEnd(ctx) {
        if (ctx.state.consumedItems?.player?.[ctx.slot]) return null;
        const maxHP = ctx.attackerBuild.stats.hp;
        const currentHP = ctx.state.teamHP[ctx.slot];
        if (currentHP > 0 && currentHP < Math.floor(maxHP / 2)) {
          const heal = Math.floor(maxHP / 4);
          const newHP = Math.min(maxHP, currentHP + heal);
          ctx.state.teamHP[ctx.slot] = newHP;
          if (ctx.state.consumedItems?.player) {
            ctx.state.consumedItems.player[ctx.slot] = true;
          }
          return `${displayName(ctx.attackerBuild.pokemon.name)} consumed Sitrus Berry and healed ${newHP - currentHP} HP.`;
        }
      }
    }
  },
  "normalium-z": {
    id: "normalium-z",
    name: "Normalium Z",
    description: "Allows one Normal-type Z-Move. Z-Belly Drum restores HP before using Belly Drum.",
    hooks: {}
  },
  "ghostium-z": {
    id: "ghostium-z",
    name: "Ghostium Z",
    description: "Allows Z-Trick-or-Treat to raise all stats before adding Ghost type.",
    hooks: {}
  }
};

// Type Boosting Items mapping
const TYPE_BOOST_MAP = {
  normal: ["silk-scarf", "blank-plate"],
  fire: ["charcoal", "flame-plate"],
  water: ["mystic-water", "splash-plate", "sea-incense", "wave-incense"],
  electric: ["magnet", "zap-plate"],
  grass: ["miracle-seed", "meadow-plate", "rose-incense"],
  ice: ["never-melt-ice", "icicle-plate"],
  fighting: ["black-belt", "fist-plate"],
  poison: ["poison-barb", "toxic-plate"],
  ground: ["soft-sand", "earth-plate"],
  flying: ["sharp-beak", "sky-plate"],
  psychic: ["twisted-spoon", "mind-plate", "odd-incense"],
  bug: ["silver-powder", "insect-plate"],
  rock: ["hard-stone", "stone-plate", "rock-incense"],
  ghost: ["spell-tag", "spooky-plate"],
  dragon: ["dragon-fang", "draco-plate"],
  dark: ["black-glasses", "dread-plate"],
  steel: ["metal-coat", "iron-plate"],
  fairy: ["fairy-feather", "pixie-plate"]
};

// Register all type-boosting plates and items dynamically
Object.entries(TYPE_BOOST_MAP).forEach(([type, itemIds]) => {
  itemIds.forEach((itemId) => {
    ITEM_EFFECTS[itemId] = {
      id: itemId,
      name: itemId.split("-").map(p => p[0].toUpperCase() + p.slice(1)).join(" "),
      description: `Boosts ${type.toUpperCase()} damage by 1.2x.`,
      hooks: {
        finalDamageModifier(ctx) {
          return ctx.moveType === type ? 1.2 : 1.0;
        }
      }
    };
  });
});

import { displayName } from "../utils/format.js";
