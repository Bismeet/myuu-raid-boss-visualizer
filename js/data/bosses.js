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
  "ogerpon", "terapagos", "pecharunt"
];

export const normalizeBossSearch = (value = "") =>
  value.toLowerCase().trim().replace(/[^a-z0-9]+/g, "");

export const searchBosses = (query, limit = 12) => {
  const normalizedQuery = normalizeBossSearch(query);
  if (!normalizedQuery) return [];
  return BOSSES
    .filter((name) => normalizeBossSearch(name).includes(normalizedQuery))
    .slice(0, limit);
};
