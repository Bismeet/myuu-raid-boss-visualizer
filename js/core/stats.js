import { natureModifier } from "../data/natures.js";

export const STAT_KEYS = ["hp", "atk", "def", "spa", "spd", "spe"];
const API_STAT = { hp:"hp", attack:"atk", defense:"def", "special-attack":"spa", "special-defense":"spd", speed:"spe" };

export function baseStats(pokemon) {
  return Object.fromEntries(pokemon.stats.map(({ base_stat, stat }) => [API_STAT[stat.name], base_stat]));
}

export function calculateStat(base, iv, ev, level, nature = 1, hp = false) {
  const core = Math.floor((2 * base + iv + Math.floor(ev / 4)) * level / 100);
  return hp ? core + level + 10 : Math.floor((core + 5) * nature);
}

export function calculatePokemonStats(pokemon, build) {
  const bases = baseStats(pokemon);
  return Object.fromEntries(STAT_KEYS.map((key) => [
    key,
    calculateStat(bases[key], build.ivs[key], build.evs[key], build.level, natureModifier(build.nature, key), key === "hp"),
  ]));
}

export function calculateBossStats(pokemon) {
  const bases = baseStats(pokemon);
  return {
    hp: bases.hp * 10000,
    atk: calculateStat(bases.atk, 31, 0, 200),
    def: calculateStat(bases.def * 2.617, 31, 0, 200),
    spa: calculateStat(bases.spa, 31, 0, 200),
    spd: calculateStat(bases.spd * 2.617, 31, 0, 200),
    spe: calculateStat(bases.spe, 31, 0, 200),
  };
}
