export const POKEMON_TYPES = [
  "normal", "fire", "water", "electric", "grass", "ice", "fighting", "poison", "ground",
  "flying", "psychic", "bug", "rock", "ghost", "dragon", "dark", "steel", "fairy",
];

const TYPE_SET = new Set(POKEMON_TYPES);

export function normalizeTypes(types = []) {
  return [...new Set((Array.isArray(types) ? types : [])
    .map((type) => String(type || "").toLowerCase())
    .filter((type) => TYPE_SET.has(type)))];
}

export function addType(types, type) {
  const current = normalizeTypes(types);
  return TYPE_SET.has(type) && !current.includes(type) ? [...current, type] : current;
}

export function removeType(types, type) {
  return normalizeTypes(types).filter((current) => current !== type);
}

export function resolveDefenderTypes(originalTypes = [], changes = {}) {
  let types = normalizeTypes(originalTypes);

  // Replacement effects resolve before additive effects.
  if (changes.soak) types = ["water"];
  if (changes.magicPowder) types = ["psychic"];
  if (changes.trickOrTreat) types = addType(types, "ghost");
  if (changes.forestsCurse) types = addType(types, "grass");

  // The manual editor is an explicit final override.
  if (changes.manualTypesEnabled) {
    types = normalizeTypes([changes.manualType1, changes.manualType2]);
  }
  return types;
}

export function resolveAttackerTypes(originalTypes = [], changes = {}, context = {}) {
  let types = normalizeTypes(originalTypes);
  const targetTypes = normalizeTypes(context.targetTypes);
  const selectedMoveType = TYPE_SET.has(context.selectedMoveType) ? context.selectedMoveType : "";

  if (changes.reflectType && targetTypes.length) types = [...targetTypes];
  if (changes.conversion) {
    const type = TYPE_SET.has(changes.conversionType) ? changes.conversionType : selectedMoveType;
    if (type) types = [type];
  }
  if (changes.conversion2 && TYPE_SET.has(changes.conversion2Type)) types = [changes.conversion2Type];
  if (changes.camouflage && TYPE_SET.has(changes.camouflageType)) types = [changes.camouflageType];
  if (changes.burnUp) types = removeType(types, "fire");
  if (changes.doubleShock) types = removeType(types, "electric");
  if (changes.roost) types = removeType(types, "flying");
  return types;
}

export function resolveMoveType(originalType, { electrify = false, ionDeluge = false } = {}) {
  if (electrify || (ionDeluge && originalType === "normal")) return "electric";
  return originalType;
}

export function withMoveType(move, type) {
  if (!move || !TYPE_SET.has(type) || move.type?.name === type) return move;
  return { ...move, type: { ...(move.type || {}), name: type } };
}

export function tarShotModifier(moveType, active = false) {
  return active && moveType === "fire" ? 2 : 1;
}
