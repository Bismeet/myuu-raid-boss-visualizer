import { applyStage } from "./stages.js";
import { typeEffectiveness } from "../data/type-chart.js";
import { ITEM_EFFECTS } from "../data/item-effects.js";
import { tarShotModifier } from "./type-mechanics.js";

export const RANDOM_ROLLS = Array.from({ length: 16 }, (_, i) => (85 + i) / 100);

//need to expand.
  
const TYPE_BOOST_ITEMS = {
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
  fairy: ["fairy-feather", "pixie-plate"],
};

const itemLabel = (slug) => slug.split("-").map((part) => part[0].toUpperCase() + part.slice(1)).join(" ");

function resolveItemEffects(attacker, item, moveType, physical, effectiveness, damaging) {
  let attackStatModifier = 1;
  let itemFinalModifier = 1;
  let critStageBonus = 0;
  const notes = [];

  const slug = (item || "").toLowerCase().replaceAll(" ", "-");
  const effect = ITEM_EFFECTS[slug];

  if (effect && effect.hooks) {
    const ctx = { attacker, moveType, physical, effectiveness, damaging };

    if (damaging && effect.hooks.atkStatModifier) {
      attackStatModifier = effect.hooks.atkStatModifier(ctx);
      if (attackStatModifier !== 1.0) {
        notes.push(`${effect.name}: ${physical ? "Atk" : "SpA"} ${attackStatModifier}x`);
      }
    }

    if (damaging && effect.hooks.finalDamageModifier) {
      itemFinalModifier = effect.hooks.finalDamageModifier(ctx);
      if (itemFinalModifier !== 1.0) {
        notes.push(`${effect.name}: ${itemFinalModifier}x`);
      }
    }

    if (effect.hooks.critStageBonus) {
      critStageBonus = effect.hooks.critStageBonus(ctx);
      if (critStageBonus > 0) {
        notes.push(`${effect.name}: +${critStageBonus} crit stage`);
      }
    }

    if (slug === "choice-scarf") {
      notes.push("Choice Scarf: Spe 1.5x");
    }
  }

  // Fallback for Gems if not in main registry
  if (damaging && item === `${moveType}-gem`) {
    itemFinalModifier = 1.3;
    notes.push(`${itemLabel(item)}: ${itemLabel(moveType)} 1.3x`);
  }

  return { attackStatModifier, itemFinalModifier, critStageBonus, notes };
}

export function damageRolls({
  attacker,
  boss,
  move,
  attackerTypes,
  bossTypes,
  ability,
  defenderAbility = "",
  defenderHP = 0,
  defenderMaxHP = 0,
  stages,
  bossStages,
  critical = false,
  burned = false,
  tarShot = false,
  isTerastallized = false,
  teraType = "normal"
}) {
  const basePower = move?.basePower ?? move?.power ?? null;
  const usedPower = move?.customPower ?? basePower;
  const moveType = move?.type?.name;
  const physical = move?.damage_class?.name === "physical";
  const effectiveness = moveType ? typeEffectiveness(moveType, bossTypes) : 1;
  const item = (attacker.item || "").toLowerCase().replaceAll(" ", "-");
  const damaging = Boolean(usedPower && move?.damage_class?.name !== "status");
  const itemEffects = resolveItemEffects(attacker, item, moveType, physical, effectiveness, damaging);
  const critStage = Math.min(4, (stages.crit || 0) + itemEffects.critStageBonus);

  if (!usedPower || move?.damage_class?.name === "status") {
    return {
      rolls: [0], min: 0, max: 0, percent: [0, 0], effectiveness,
      basePower, usedPower, critStage,
      attackStatModifier: itemEffects.attackStatModifier,
      itemFinalModifier: itemEffects.itemFinalModifier,
      itemNotes: itemEffects.notes,
      abilityNotes: [],
    };
  }

  const attackKey = physical ? "atk" : "spa";
  const defenseKey = physical ? "def" : "spd";
  const atkStage = critical && stages[attackKey] < 0 ? 0 : stages[attackKey];
  const defStage = critical && bossStages[defenseKey] > 0 ? 0 : bossStages[defenseKey];

  // 1. Base stat with EV/IV/nature & 2. Stat stages
  const stagedAttack = applyStage(attacker.stats[attackKey], atkStage);

  // 3. Ability stat modifiers
  let abilityAtkModifier = 1.0;
  const abilityNotes = [];

  if (physical) {
    if (ability === "huge-power" || ability === "pure-power") {
      abilityAtkModifier *= 2.0;
      abilityNotes.push(`${ability === "huge-power" ? "Huge Power" : "Pure Power"}: Atk 2.0x`);
    } else if (ability === "hustle") {
      abilityAtkModifier *= 1.5;
      abilityNotes.push("Hustle: Atk 1.5x");
    }
  }

  if (ability === "guts" && burned) {
    abilityAtkModifier *= 1.5;
    abilityNotes.push("Guts: Atk 1.5x");
  }

  // 4. Item stat modifiers
  const attackStatModifiers = abilityAtkModifier * itemEffects.attackStatModifier;
  const attack = stagedAttack * attackStatModifiers;

  const stagedDefense = applyStage(boss.stats[defenseKey], defStage);
  const defenseStatModifiers = 1;
  const defense = Math.max(1, stagedDefense * defenseStatModifiers);

  // 5. Move base power/custom power: usedPower

  // 6. Ability base power/final modifiers: Technician
  let technicianModifier = 1.0;
  if (ability === "technician" && usedPower <= 60) {
    technicianModifier = 1.5;
    abilityNotes.push("Technician: BP 1.5x");
  }

  // 7. Critical hit
  const criticalModifier = critical ? (ability === "sniper" ? 2.25 : 1.5) : 1;
  if (critical) {
    if (ability === "sniper") {
      abilityNotes.push("Sniper: Crit 2.25x");
    } else {
      abilityNotes.push("Critical hit: 1.5x");
    }
  }

  // 8. Burn modifier
  const burnModifier = burned && physical && ability !== "guts" ? 0.5 : 1;
  if (burned && physical && ability !== "guts") {
    abilityNotes.push("Burn: Atk 0.5x");
  } else if (burned && physical && ability === "guts") {
    abilityNotes.push("Guts: ignored burn Atk reduction");
  }

  // 9. STAB
  let stab = 1.0;
  if (isTerastallized) {
    const originalTypes = attacker.pokemon ? attacker.pokemon.types.map(({ type }) => type.name) : attackerTypes;
    const matchesOriginalType = originalTypes.includes(moveType);
    const matchesTeraType = (moveType === teraType);

    if (matchesTeraType && matchesOriginalType) {
      if (ability === "adaptability") {
        stab = 2.25;
        abilityNotes.push("Adaptability boosted Tera STAB: 2.25x");
      } else {
        stab = 2.0;
        abilityNotes.push("Tera STAB: 2.0x");
      }
    } else if (matchesTeraType) {
      if (ability === "adaptability") {
        stab = 2.0;
        abilityNotes.push("Adaptability boosted Tera STAB: 2.0x");
      } else {
        stab = 1.5;
        abilityNotes.push("Tera STAB: 1.5x");
      }
    } else if (matchesOriginalType) {
      if (ability === "adaptability") {
        stab = 2.0;
        abilityNotes.push("Adaptability boosted STAB: 2.0x");
      } else {
        stab = 1.5;
        abilityNotes.push("STAB: 1.5x");
      }
    }
  } else {
    stab = attackerTypes.includes(moveType) ? (ability === "adaptability" ? 2.0 : 1.5) : 1.0;
    if (attackerTypes.includes(moveType)) {
      if (ability === "adaptability") {
        abilityNotes.push("Adaptability: STAB 2.0x");
      } else {
        abilityNotes.push("STAB: 1.5x");
      }
    }
  }

  // 10. Type effectiveness: effectiveness

  // 11. Defensive ability modifiers
  let defenderAbilityModifier = 1.0;
  const ignoresDefensiveAbilities = ["mold-breaker", "teravolt", "turboblaze"].includes(ability);
  const activeDefenderAbility = ignoresDefensiveAbilities ? "" : defenderAbility;

  if (ignoresDefensiveAbilities && defenderAbility && ["multiscale", "shadow-shield", "filter", "solid-rock", "prism-armor", "sturdy"].includes(defenderAbility)) {
    abilityNotes.push(`${ability === "mold-breaker" ? "Mold Breaker" : (ability === "teravolt" ? "Teravolt" : "Turboblaze")} ignored defender's ${defenderAbility}`);
  }

  if (activeDefenderAbility) {
    if ((activeDefenderAbility === "multiscale" || activeDefenderAbility === "shadow-shield") && defenderHP > 0 && defenderHP === defenderMaxHP) {
      defenderAbilityModifier *= 0.5;
      abilityNotes.push(`${activeDefenderAbility === "multiscale" ? "Multiscale" : "Shadow Shield"}: 0.5x`);
    }
    if ((activeDefenderAbility === "filter" || activeDefenderAbility === "solid-rock" || activeDefenderAbility === "prism-armor") && effectiveness > 1) {
      defenderAbilityModifier *= 0.75;
      abilityNotes.push(`${activeDefenderAbility === "filter" ? "Filter" : (activeDefenderAbility === "solid-rock" ? "Solid Rock" : "Prism Armor")}: 0.75x`);
    }
  }

  // Tinted Lens
  let tintedLensModifier = 1.0;
  if (ability === "tinted-lens" && effectiveness < 1) {
    tintedLensModifier = 2.0;
    abilityNotes.push("Tinted Lens: 2.0x");
  }

  // 12. Final item modifiers
  const itemFinalModifiers = itemEffects.itemFinalModifier;
  const tarShotDamageModifier = tarShotModifier(moveType, tarShot);
  if (tarShotDamageModifier > 1) abilityNotes.push("Tar Shot: Fire damage 2.0x");
  const otherModifiers = technicianModifier * tintedLensModifier * defenderAbilityModifier * tarShotDamageModifier;

  const baseDamage = Math.floor(
    Math.floor(
      Math.floor((Math.floor((2 * attacker.level) / 5 + 2) * usedPower * attack) / defense) / 50
    ) + 2
  );
  const rolls = RANDOM_ROLLS.map((random) => Math.floor(
    baseDamage * criticalModifier * random * stab * effectiveness * burnModifier * itemFinalModifiers * otherModifiers
  ));

  return {
    rolls,
    min: rolls[0],
    max: rolls.at(-1),
    percent: [rolls[0] / boss.maxHp * 100, rolls.at(-1) / boss.maxHp * 100],
    effectiveness,
    basePower,
    usedPower,
    critStage,
    attackStatModifier: itemEffects.attackStatModifier,
    defenseStatModifier: defenseStatModifiers,
    itemFinalModifier: itemEffects.itemFinalModifier,
    itemNotes: itemEffects.notes,
    abilityNotes,
    tarShotModifier: tarShotDamageModifier,
    // Audit fields
    attackStat: attack,
    defenseStat: defense,
    baseDamageBeforeModifier: baseDamage,
    criticalModifier,
    stab,
    burnModifier,
    otherModifiers,
  };
}
