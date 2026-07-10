export const BOSSES = [
  "articuno", "zapdos", "moltres", "mewtwo", "mew",
  "raikou", "entei", "suicune", "lugia", "ho-oh", "celebi",
  "regirock", "regice", "registeel", "latias", "latios", "kyogre", "groudon", "rayquaza",
  "jirachi", "deoxys-normal", "uxie", "mesprit", "azelf", "dialga", "palkia",
  "heatran", "regigigas", "giratina-altered", "cresselia", "phione", "manaphy",
  "darkrai", "shaymin-land", "arceus", "victini", "cobalion", "terrakion",
  "virizion", "tornadus-incarnate", "thundurus-incarnate", "reshiram", "zekrom",
  "landorus-incarnate", "kyurem", "keldeo-ordinary", "meloetta-aria", "genesect",
  "xerneas", "yveltal", "zygarde-50", "diancie", "hoopa", "volcanion", "type-null",
  "silvally", "tapu-koko", "tapu-lele", "tapu-bulu", "tapu-fini", "cosmog",
  "cosmoem", "solgaleo", "lunala", "necrozma", "nihilego", "buzzwole", "pheromosa",
  "xurkitree", "celesteela", "kartana", "guzzlord", "poipole", "naganadel",
  "stakataka", "blacephalon", "magearna", "marshadow", "zeraora",
  "meltan", "melmetal", "zacian", "zamazenta", "eternatus", "kubfu", "urshifu-single-strike",
  "zarude", "regieleki", "regidrago", "glastrier", "spectrier", "calyrex", "enamorus-incarnate",
  "wo-chien", "chien-pao", "ting-lu", "chi-yu", "koraidon", "miraidon",
  "walking-wake", "iron-leaves", "okidogi", "munkidori", "fezandipiti",
  "ogerpon", "terapagos", "pecharunt",
  "articuno-galar", "zapdos-galar", "moltres-galar",
  "raichu-alola", "sandshrew-alola", "sandslash-alola", "vulpix-alola", "ninetales-alola",
  "diglett-alola", "dugtrio-alola", "meowth-alola", "persian-alola", "geodude-alola",
  "graveler-alola", "golem-alola", "grimer-alola", "muk-alola", "exeggutor-alola", "marowak-alola",
  "meowth-galar", "ponyta-galar", "rapidash-galar", "slowpoke-galar", "slowbro-galar",
  "farfetchd-galar", "weezing-galar", "mr-mime-galar", "corsola-galar", "zigzagoon-galar",
  "linoone-galar", "darumaka-galar", "darmanitan-galar-standard", "yamask-galar", "stunfisk-galar", "slowking-galar",
  "growlithe-hisui", "arcanine-hisui", "voltorb-hisui", "electrode-hisui", "typhlosion-hisui",
  "qwilfish-hisui", "sneasel-hisui", "samurott-hisui", "lilligant-hisui", "zorua-hisui",
  "zoroark-hisui", "braviary-hisui", "sliggoo-hisui", "goodra-hisui", "avalugg-hisui", "decidueye-hisui",
  "tauros-paldea-combat", "tauros-paldea-blaze", "tauros-paldea-aqua", "wooper-paldea"
];

export const normalizeBossSearch = (value = "") =>
  value.toLowerCase().trim().replace(/[^a-z0-9]+/g, "");

const REGIONAL_FORM_SUFFIXES = ["galar", "alola", "hisui", "paldea"];

function bossSearchTerms(slug) {
  const parts = slug.split("-");
  const regionIndex = parts.findIndex((part) => REGIONAL_FORM_SUFFIXES.includes(part));
  if (regionIndex < 0) return [slug];

  const region = parts[regionIndex];
  const species = [...parts.slice(0, regionIndex), ...parts.slice(regionIndex + 1)];
  const speciesName = species.join("-");
  const formName = `${speciesName}-${region}`;
  const regionAdjective = region === "hisui" ? "hisuian" : region === "paldea" ? "paldean" : `${region}ian`;

  return [
    slug,
    formName,
    `${region}-${speciesName}`,
    `${regionAdjective}-${speciesName}`,
    `${speciesName}-${regionAdjective}`,
  ];
}

export const searchBosses = (query, limit = 12) => {
  const normalizedQuery = normalizeBossSearch(query);
  if (!normalizedQuery) return [];
  return BOSSES
    .filter((name) => bossSearchTerms(name).some((term) => normalizeBossSearch(term).includes(normalizedQuery)))
    .slice(0, limit);
};
