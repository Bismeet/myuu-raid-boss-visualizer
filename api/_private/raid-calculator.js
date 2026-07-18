import { damageRolls } from "../../js/core/damage.js";
import { emptyStages, resolveDynamicMovePower } from "../../js/core/stages.js";
import { baseStats, calculatePokemonStats, calculateStat } from "../../js/core/stats.js";
import { resolveAttackerTypes, resolveDefenderTypes, resolveMoveType, withMoveType } from "../../js/core/type-mechanics.js";

const POKE_API = "https://pokeapi.co/api/v2";
const TYPES = new Set([
  "normal", "fire", "water", "electric", "grass", "ice", "fighting", "poison", "ground",
  "flying", "psychic", "bug", "rock", "ghost", "dragon", "dark", "steel", "fairy",
]);

export const clamp = (value, min, max) => Math.max(min, Math.min(max, Number(value) || 0));

export const titleCase = (value = "") => String(value)
  .split("-")
  .filter(Boolean)
  .map((part) => part[0].toUpperCase() + part.slice(1))
  .join(" ");

export function secretNumber(name) {
  const value = Number(process.env[name]);
  if (!Number.isFinite(value) || value <= 0) {
    const error = new Error("SERVER_CONFIG_UNAVAILABLE");
    error.configKey = name;
    throw error;
  }
  return value;
}

export function safeErrorDetails(error) {
  const message = error instanceof Error ? error.message : "UNKNOWN_ERROR";
  if (message === "SERVER_CONFIG_UNAVAILABLE") {
    return { code: message, configKey: error.configKey || "UNKNOWN_SERVER_VARIABLE" };
  }
  if (/^INVALID_[A-Z_]+$/.test(message)) return { code: message };
  if (message === "PUBLIC_DATA_UNAVAILABLE") return { code: message };
  return { code: "CALCULATION_FAILED" };
}

export function slug(value, field) {
  const normalized = String(value || "").trim().toLowerCase();
  if (!/^[a-z0-9-]{1,80}$/.test(normalized)) throw new Error(`INVALID_${field}`);
  return normalized;
}

export async function fetchPokeApi(resource, name) {
  const response = await fetch(`${POKE_API}/${resource}/${encodeURIComponent(name)}`);
  if (!response.ok) throw new Error("PUBLIC_DATA_UNAVAILABLE");
  return response.json();
}

const spread = (value) => ({ hp: value, atk: value, def: value, spa: value, spd: value, spe: value });

function normalizeStages(value) {
  const stages = emptyStages();
  for (const key of Object.keys(stages)) {
    stages[key] = clamp(value?.[key], key === "crit" ? 0 : -6, key === "crit" ? 4 : 6);
  }
  return stages;
}

function normalizeStats(value) {
  const stats = {};
  for (const key of ["atk", "def", "spa", "spd", "spe"]) {
    const stat = Number(value?.[key]);
    if (!Number.isFinite(stat) || stat < 1 || stat > 9999) throw new Error("INVALID_TEAM_STATS");
    stats[key] = Math.floor(stat);
  }
  return stats;
}

function privateConfig() {
  return {
    privateLevel: secretNumber("BOSS_LEVEL"),
    hpScale: secretNumber("BOSS_HP_MULTIPLIER"),
    defScale: secretNumber("BOSS_DEF_MULTIPLIER"),
    spdScale: secretNumber("BOSS_SPD_MULTIPLIER"),
    damageCap: secretNumber("MYUU_DAMAGE_CAP"),
  };
}

function privateBossStats(pokemon, config) {
  const { privateLevel, hpScale, defScale, spdScale } = config;
  const bases = baseStats(pokemon);
  return {
    level: privateLevel,
    stats: {
      hp: Math.max(1, Math.floor(bases.hp * hpScale)),
      atk: calculateStat(bases.atk, 31, 0, privateLevel),
      def: Math.max(1, Math.floor(calculateStat(bases.def, 31, 0, privateLevel) * defScale)),
      spa: calculateStat(bases.spa, 31, 0, privateLevel),
      spd: Math.max(1, Math.floor(calculateStat(bases.spd, 31, 0, privateLevel) * spdScale)),
      spe: calculateStat(bases.spe, 31, 0, privateLevel),
    },
  };
}

function applyPublicSplitInputs(stats, order, suppliedStats) {
  for (const key of Array.isArray(order) ? order.slice(0, 10) : []) {
    const splitter = suppliedStats?.[key];
    const def = Number(splitter?.def);
    const spd = Number(splitter?.spd);
    if (!Number.isFinite(def) || !Number.isFinite(spd) || def < 1 || spd < 1 || def > 999 || spd > 999) {
      throw new Error("INVALID_SPLITTER_INPUT");
    }
    stats.def = Math.floor((stats.def + def) / 2);
    stats.spd = Math.floor((stats.spd + spd) / 2);
  }
}

function prepareMove(moveData, input, stages = emptyStages(), { acceptProvidedCustomPower = false } = {}) {
  let move = { ...moveData, basePower: moveData.power ?? null, customPower: moveData.power ?? null };
  if (move.name === "last-respects") {
    move.customPower = 50 + clamp(input.faintedAllies, 0, 5) * 50;
  } else if (input.customPowerEnabled || (acceptProvidedCustomPower && Number.isFinite(Number(input.customPower)))) {
    move.customPower = clamp(input.customPower, 0, 9999);
  }
  move = resolveDynamicMovePower(move, stages, {
    allowCustomOverride: Boolean(input.customPowerEnabled),
    faintedAllies: input.faintedAllies,
  });
  return withMoveType(move, TYPES.has(input.moveType) ? input.moveType : move.type?.name);
}

export async function calculateQuickRaidDamage(input) {
  const config = privateConfig();
  const bossName = slug(input.boss, "BOSS");
  const attackerName = slug(input.attacker, "ATTACKER");
  const moveName = slug(input.move, "MOVE");
  const [bossPokemon, attackerPokemon, moveData] = await Promise.all([
    fetchPokeApi("pokemon", bossName),
    fetchPokeApi("pokemon", attackerName),
    fetchPokeApi("move", moveName),
  ]);

  const level = clamp(input.level, 1, 100);
  const ivs = spread(31);
  const evs = spread(0);
  ivs.atk = clamp(input.atkIv, 0, 31);
  ivs.spa = clamp(input.spaIv, 0, 31);
  evs.atk = clamp(input.atkEv, 0, 252);
  evs.spa = clamp(input.spaEv, 0, 252);
  const stages = {
    ...emptyStages(),
    atk: clamp(input.atkStage, -6, 6),
    def: clamp(input.attackerDefStage, -6, 6),
    spa: clamp(input.spaStage, -6, 6),
    spd: clamp(input.attackerSpdStage, -6, 6),
    spe: clamp(input.speStage, -6, 6),
    accuracy: clamp(input.accuracyStage, -6, 6),
    evasion: clamp(input.evasionStage, -6, 6),
    crit: clamp(input.critStage, 0, 4),
  };
  const attacker = {
    pokemon: attackerPokemon,
    level,
    nature: String(input.nature || "hardy"),
    ability: String(input.ability || ""),
    item: String(input.item || ""),
    teraType: TYPES.has(input.teraType) ? input.teraType : "normal",
    ivs,
    evs,
    stages,
    stats: {},
  };
  attacker.stats = calculatePokemonStats(attackerPokemon, attacker);

  const privateBoss = privateBossStats(bossPokemon, config);
  const bossStats = privateBoss.stats;
  applyPublicSplitInputs(bossStats, input.guardSplitOrder, input.splitterStats);

  const defDrop = clamp(input.screechCount, 0, 3) * (input.simpleDefense ? -4 : -2);
  const spdDrop = (clamp(input.metalSoundCount, 0, 3) + clamp(input.fakeTearsCount, 0, 3))
    * (input.simpleSpd ? -4 : -2);
  const bossStages = {
    ...emptyStages(),
    def: clamp(Number(input.defenseStage) + defDrop, -6, 6),
    spd: clamp(Number(input.spdStage) + spdDrop, -6, 6),
  };
  const typeChanges = input.typeChanges || {};
  const bossTypes = resolveDefenderTypes(bossPokemon.types.map(({ type }) => type.name), typeChanges);
  const effectiveMoveType = resolveMoveType(moveData.type?.name, {
    electrify: Boolean(typeChanges.electrify),
    ionDeluge: Boolean(typeChanges.ionDeluge),
  });
  const move = prepareMove(moveData, { ...input, moveType: effectiveMoveType }, stages);
  const attackerTypes = resolveAttackerTypes(
    attackerPokemon.types.map(({ type }) => type.name),
    typeChanges,
    { targetTypes: bossTypes, selectedMoveType: effectiveMoveType },
  );
  const result = damageRolls({
    attacker,
    boss: { stats: bossStats, maxHp: bossStats.hp },
    move,
    attackerTypes,
    bossTypes,
    ability: attacker.ability,
    defenderHP: bossStats.hp,
    defenderMaxHP: bossStats.hp,
    stages,
    bossStages,
    critical: Boolean(input.critical),
    tarShot: Boolean(typeChanges.tarShot),
    isTerastallized: Boolean(input.terastallized),
    teraType: attacker.teraType,
  });
  const hits = clamp(input.hitCount, 1, 5);
  return {
    bossName,
    attackerName,
    moveName,
    actualMin: Math.floor(result.min * hits),
    actualMax: Math.floor(result.max * hits),
  };
}

function replaySplitEvents(input, bossStats) {
  const teamBaseStats = Array.isArray(input.teamBaseStats) ? input.teamBaseStats.slice(0, 6).map(normalizeStats) : [];
  if (!teamBaseStats.length) throw new Error("INVALID_TEAM_STATS");
  const teamStats = teamBaseStats.map((stats) => ({ ...stats }));
  const events = Array.isArray(input.splitEvents) ? input.splitEvents.slice(0, 100) : [];

  for (const event of events) {
    const slot = clamp(event?.slot, 0, teamStats.length - 1);
    if (!teamStats[slot]) throw new Error("INVALID_SPLIT_EVENT");
    if (event?.kind === "reset-player") {
      teamStats[slot] = { ...teamBaseStats[slot] };
      continue;
    }
    const keys = event?.kind === "guard-split" ? ["def", "spd"]
      : event?.kind === "power-split" ? ["atk", "spa"]
        : null;
    if (!keys) throw new Error("INVALID_SPLIT_EVENT");
    for (const key of keys) {
      const average = Math.floor((teamStats[slot][key] + bossStats[key]) / 2);
      teamStats[slot][key] = average;
      bossStats[key] = average;
    }
  }
  return teamStats;
}

export async function calculateBattleRaidDamage(input) {
  const config = privateConfig();
  const direction = input.direction === "boss-to-player" ? input.direction : "player-to-boss";
  const bossName = slug(input.boss, "BOSS");
  const playerName = slug(input.player?.pokemon, "PLAYER");
  const moveName = slug(input.move, "MOVE");
  const [bossPokemon, playerPokemon, moveData] = await Promise.all([
    fetchPokeApi("pokemon", bossName),
    fetchPokeApi("pokemon", playerName),
    fetchPokeApi("move", moveName),
  ]);
  const privateBoss = privateBossStats(bossPokemon, config);
  const bossStats = privateBoss.stats;
  // Raid offense is reduced before replaying Power Split so every battle path
  // averages against the same current offensive value.
  bossStats.atk = Math.floor(bossStats.atk / 2);
  bossStats.spa = Math.floor(bossStats.spa / 2);
  const teamStats = replaySplitEvents(input, bossStats);
  const activeSlot = clamp(input.activeSlot, 0, teamStats.length - 1);
  const playerStats = teamStats[activeSlot];
  if (!playerStats) throw new Error("INVALID_TEAM_STATS");

  const playerTypes = Array.isArray(input.player?.types)
    ? input.player.types.filter((type) => TYPES.has(type)).slice(0, 4)
    : playerPokemon.types.map(({ type }) => type.name);
  const bossTypes = Array.isArray(input.bossState?.types)
    ? input.bossState.types.filter((type) => TYPES.has(type)).slice(0, 4)
    : bossPokemon.types.map(({ type }) => type.name);
  const playerAbility = String(input.player?.ability || "");
  const bossAbility = String(input.bossState?.ability || "");
  const hitCount = clamp(input.hitCount, 1, 5);

  const player = {
    pokemon: playerPokemon,
    stats: playerStats,
    level: clamp(input.player?.level, 1, 100),
    item: String(input.player?.item || ""),
    ability: playerAbility,
    metronomeMultiplier: clamp(input.player?.metronomeMultiplier, 1, 2),
  };
  const boss = {
    pokemon: bossPokemon,
    stats: bossStats,
    level: privateBoss.level,
    item: "",
    ability: bossAbility,
  };
  const attacker = direction === "player-to-boss" ? player : boss;
  const defender = direction === "player-to-boss" ? boss : player;
  const attackerTypes = direction === "player-to-boss" ? playerTypes : bossTypes;
  const defenderTypes = direction === "player-to-boss" ? bossTypes : playerTypes;
  const stages = direction === "player-to-boss"
    ? normalizeStages(input.player?.stages)
    : normalizeStages(input.bossState?.stages);
  const defenderStages = direction === "player-to-boss"
    ? normalizeStages(input.bossState?.stages)
    : normalizeStages(input.player?.stages);
  const move = prepareMove(moveData, {
    customPower: input.customPower,
    customPowerEnabled: false,
    faintedAllies: input.faintedAllies,
    moveType: input.moveType,
  }, stages, { acceptProvidedCustomPower: true });
  const defenderAtFullHp = direction === "player-to-boss"
    ? Boolean(input.bossState?.atFullHp)
    : Boolean(input.player?.atFullHp);
  const teraType = direction === "player-to-boss" && TYPES.has(input.player?.teraType)
    ? input.player.teraType
    : "normal";

  const result = damageRolls({
    attacker,
    boss: { stats: defender.stats, maxHp: 1 },
    move,
    attackerTypes,
    bossTypes: defenderTypes,
    ability: attacker.ability,
    defenderAbility: defender.ability,
    defenderHP: defenderAtFullHp ? 1 : 0,
    defenderMaxHP: 1,
    stages,
    bossStages: defenderStages,
    critical: Boolean(input.critical),
    burned: Boolean(input.burned),
    tarShot: Boolean(input.tarShot),
    isTerastallized: direction === "player-to-boss" && Boolean(input.player?.terastallized),
    teraType,
  });
  const rawRolls = result.rolls.map((roll) => Math.floor(roll * hitCount));
  const damageCap = config.damageCap;
  const myuuRolls = rawRolls.map((roll) => roll % damageCap);
  const average = Math.round(rawRolls.reduce((sum, roll) => sum + roll, 0) / rawRolls.length);

  return {
    rolls: rawRolls,
    myuuRolls,
    myuuAverage: average % damageCap,
    effectiveness: result.effectiveness,
  };
}
