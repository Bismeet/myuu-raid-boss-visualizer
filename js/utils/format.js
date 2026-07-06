const DISPLAY_OVERRIDES = {
  "meloetta-aria": "Meloetta",
  "deoxys-normal": "Deoxys",
  "giratina-altered": "Giratina",
  "shaymin-land": "Shaymin",
  "tornadus-incarnate": "Tornadus",
  "thundurus-incarnate": "Thundurus",
  "landorus-incarnate": "Landorus",
  "keldeo-ordinary": "Keldeo",
  "basculin-red-striped": "Basculin",
};

export function titleCase(value = "") {
  return value.split("-").map((part) => part ? part[0].toUpperCase() + part.slice(1) : "").join(" ");
}

export function displayName(slug = "") {
  return DISPLAY_OVERRIDES[slug] || titleCase(slug);
}

export function spriteUrl(slug) {
  return `https://play.pokemonshowdown.com/sprites/ani/${slug}.gif`;
}

export function fallbackSprite(pokemon) {
  return pokemon?.sprites?.other?.["official-artwork"]?.front_default
    || pokemon?.sprites?.front_default
    || "";
}

export function compactNumber(value) {
  return new Intl.NumberFormat("en-US", { notation: value >= 1_000_000 ? "compact" : "standard", maximumFractionDigits: 1 }).format(value || 0);
}

export function copyText(text) {
  return navigator.clipboard?.writeText(text).catch(() => {
    const node = document.createElement("textarea");
    node.value = text;
    document.body.append(node);
    node.select();
    document.execCommand("copy");
    node.remove();
  });
}

export function getBossDisplayName(state) {
  if (!state) return "Raid Boss";
  if (state.manualBossOverride) {
    if (typeof state.manualBossOverride === 'object') {
      if (state.manualBossOverride.enabled && state.manualBossOverride.displayName) {
        return state.manualBossOverride.displayName;
      }
    } else {
      if (state.manualBossName) {
        return displayName(state.manualBossName);
      }
    }
  }

  const rawName = state.boss?.displayName || state.boss?.name || state.boss?.speciesName;
  return rawName ? displayName(rawName) : "Raid Boss";
}

