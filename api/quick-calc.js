import { damageRolls } from "../js/core/damage.js";
import { emptyStages } from "../js/core/stages.js";
import { baseStats, calculatePokemonStats, calculateStat } from "../js/core/stats.js";

const POKE_API = "https://pokeapi.co/api/v2";
const TYPES = new Set([
  "normal", "fire", "water", "electric", "grass", "ice", "fighting", "poison", "ground",
  "flying", "psychic", "bug", "rock", "ghost", "dragon", "dark", "steel", "fairy",
]);

const clamp = (value, min, max) => Math.max(min, Math.min(max, Number(value) || 0));
const titleCase = (value = "") => String(value)
  .split("-")
  .filter(Boolean)
  .map((part) => part[0].toUpperCase() + part.slice(1))
  .join(" ");

function secretNumber(name) {
  const value = Number(process.env[name]);
  if (!Number.isFinite(value) || value <= 0) {
    const error = new Error("SERVER_CONFIG_UNAVAILABLE");
    error.configKey = name;
    throw error;
  }
  return value;
}

function safeErrorDetails(error) {
  const message = error instanceof Error ? error.message : "UNKNOWN_ERROR";
  if (message === "SERVER_CONFIG_UNAVAILABLE") {
    return { code: message, configKey: error.configKey || "UNKNOWN_SERVER_VARIABLE" };
  }
  if (/^INVALID_[A-Z_]+$/.test(message)) return { code: message };
  if (message === "PUBLIC_DATA_UNAVAILABLE") return { code: message };
  return { code: "CALCULATION_FAILED" };
}

function slug(value, field) {
  const normalized = String(value || "").trim().toLowerCase();
  if (!/^[a-z0-9-]{1,80}$/.test(normalized)) throw new Error(`INVALID_${field}`);
  return normalized;
}

async function fetchPokeApi(resource, name) {
  const response = await fetch(`${POKE_API}/${resource}/${encodeURIComponent(name)}`);
  if (!response.ok) throw new Error("PUBLIC_DATA_UNAVAILABLE");
  return response.json();
}

function spread(value) {
  return { hp: value, atk: value, def: value, spa: value, spd: value, spe: value };
}

function currentTypes(pokemon, input) {
  let types = input.manualTypesEnabled
    ? [input.manualType1, input.manualType2].filter((type) => TYPES.has(type))
    : pokemon.types.map(({ type }) => type.name);

  if (input.magicPowder) types = ["psychic"];
  if (input.soak) types = ["water"];
  if (input.trickOrTreat && !types.includes("ghost")) types.push("ghost");
  if (input.forestsCurse && !types.includes("grass")) types.push("grass");
  return types;
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

function parseBody(request) {
  if (request.body && typeof request.body === "object") return request.body;
  if (typeof request.body === "string") return JSON.parse(request.body);
  return {};
}

export default async function handler(request, response) {
  response.setHeader("Cache-Control", "no-store");
  response.setHeader("Content-Type", "application/json; charset=utf-8");

  if (request.method !== "POST") {
    response.setHeader("Allow", "POST");
    return response.status(405).json({ error: "Method not allowed" });
  }

  try {
    const input = parseBody(request);
    const bossName = slug(input.boss, "BOSS");
    const attackerName = slug(input.attacker, "ATTACKER");
    const moveName = slug(input.move, "MOVE");
    const privateLevel = secretNumber("BOSS_LEVEL");
    const hpScale = secretNumber("BOSS_HP_MULTIPLIER");
    const defScale = secretNumber("BOSS_DEF_MULTIPLIER");
    const spdScale = secretNumber("BOSS_SPD_MULTIPLIER");
    const damageCap = secretNumber("MYUU_DAMAGE_CAP");
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
      spa: clamp(input.spaStage, -6, 6),
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

    const bases = baseStats(bossPokemon);
    const bossStats = {
      hp: Math.max(1, Math.floor(bases.hp * hpScale)),
      atk: calculateStat(bases.atk, 31, 0, privateLevel),
      def: Math.max(1, Math.floor(calculateStat(bases.def, 31, 0, privateLevel) * defScale)),
      spa: calculateStat(bases.spa, 31, 0, privateLevel),
      spd: Math.max(1, Math.floor(calculateStat(bases.spd, 31, 0, privateLevel) * spdScale)),
      spe: calculateStat(bases.spe, 31, 0, privateLevel),
    };
    applyPublicSplitInputs(bossStats, input.guardSplitOrder, input.splitterStats);

    const defDrop = clamp(input.screechCount, 0, 3) * (input.simpleDefense ? -4 : -2);
    const spdDrop = (clamp(input.metalSoundCount, 0, 3) + clamp(input.fakeTearsCount, 0, 3))
      * (input.simpleSpd ? -4 : -2);
    const bossStages = {
      ...emptyStages(),
      def: clamp(Number(input.defenseStage) + defDrop, -6, 6),
      spd: clamp(Number(input.spdStage) + spdDrop, -6, 6),
    };

    const move = { ...moveData, basePower: moveData.power ?? null, customPower: moveData.power ?? null };
    if (move.name === "last-respects") {
      move.customPower = 50 + clamp(input.faintedAllies, 0, 5) * 50;
    } else if (input.customPowerEnabled) {
      move.customPower = clamp(input.customPower, 0, 9999);
    }

    const bossTypes = currentTypes(bossPokemon, input.typeChanges || {});
    const result = damageRolls({
      attacker,
      boss: { stats: bossStats, maxHp: bossStats.hp },
      move,
      attackerTypes: attackerPokemon.types.map(({ type }) => type.name),
      bossTypes,
      ability: attacker.ability,
      defenderHP: bossStats.hp,
      defenderMaxHP: bossStats.hp,
      stages,
      bossStages,
      critical: Boolean(input.critical),
      isTerastallized: Boolean(input.terastallized),
      teraType: attacker.teraType,
    });
    const hits = clamp(input.hitCount, 1, 5);
    const displayedMin = Math.floor(result.min * hits) % damageCap;
    const displayedMax = Math.floor(result.max * hits) % damageCap;

    return response.status(200).json({
      summary: `${titleCase(attackerName)} using ${titleCase(moveName)} vs ${titleCase(bossName)}`,
      damageRange: `${displayedMin.toLocaleString("en-US")} - ${displayedMax.toLocaleString("en-US")}`,
    });
  } catch (error) {
    const unavailable = error?.message === "SERVER_CONFIG_UNAVAILABLE";
    console.error("[quick-calc api] request failed", safeErrorDetails(error));
    return response.status(unavailable ? 503 : 400).json({
      error: unavailable ? "Server calculation unavailable" : "Unable to calculate damage",
    });
  }
}
