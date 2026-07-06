export const NATURES = {
  hardy: {
    name: "Hardy",
    increased: null,
    decreased: null,
    modifiers: { atk: 1.0, def: 1.0, spa: 1.0, spd: 1.0, spe: 1.0 }
  },
  lonely: {
    name: "Lonely",
    increased: "atk",
    decreased: "def",
    modifiers: { atk: 1.1, def: 0.9, spa: 1.0, spd: 1.0, spe: 1.0 }
  },
  brave: {
    name: "Brave",
    increased: "atk",
    decreased: "spe",
    modifiers: { atk: 1.1, def: 1.0, spa: 1.0, spd: 1.0, spe: 0.9 }
  },
  adamant: {
    name: "Adamant",
    increased: "atk",
    decreased: "spa",
    modifiers: { atk: 1.1, def: 1.0, spa: 0.9, spd: 1.0, spe: 1.0 }
  },
  naughty: {
    name: "Naughty",
    increased: "atk",
    decreased: "spd",
    modifiers: { atk: 1.1, def: 1.0, spa: 1.0, spd: 0.9, spe: 1.0 }
  },
  bold: {
    name: "Bold",
    increased: "def",
    decreased: "atk",
    modifiers: { atk: 0.9, def: 1.1, spa: 1.0, spd: 1.0, spe: 1.0 }
  },
  docile: {
    name: "Docile",
    increased: null,
    decreased: null,
    modifiers: { atk: 1.0, def: 1.0, spa: 1.0, spd: 1.0, spe: 1.0 }
  },
  relaxed: {
    name: "Relaxed",
    increased: "def",
    decreased: "spe",
    modifiers: { atk: 1.0, def: 1.1, spa: 1.0, spd: 1.0, spe: 0.9 }
  },
  impish: {
    name: "Impish",
    increased: "def",
    decreased: "spa",
    modifiers: { atk: 1.0, def: 1.1, spa: 0.9, spd: 1.0, spe: 1.0 }
  },
  lax: {
    name: "Lax",
    increased: "def",
    decreased: "spd",
    modifiers: { atk: 1.0, def: 1.1, spa: 1.0, spd: 0.9, spe: 1.0 }
  },
  timid: {
    name: "Timid",
    increased: "spe",
    decreased: "atk",
    modifiers: { atk: 0.9, def: 1.0, spa: 1.0, spd: 1.0, spe: 1.1 }
  },
  hasty: {
    name: "Hasty",
    increased: "spe",
    decreased: "def",
    modifiers: { atk: 1.0, def: 0.9, spa: 1.0, spd: 1.0, spe: 1.1 }
  },
  serious: {
    name: "Serious",
    increased: null,
    decreased: null,
    modifiers: { atk: 1.0, def: 1.0, spa: 1.0, spd: 1.0, spe: 1.0 }
  },
  jolly: {
    name: "Jolly",
    increased: "spe",
    decreased: "spa",
    modifiers: { atk: 1.0, def: 1.0, spa: 0.9, spd: 1.0, spe: 1.1 }
  },
  naive: {
    name: "Naive",
    increased: "spe",
    decreased: "spd",
    modifiers: { atk: 1.0, def: 1.0, spa: 1.0, spd: 0.9, spe: 1.1 }
  },
  modest: {
    name: "Modest",
    increased: "spa",
    decreased: "atk",
    modifiers: { atk: 0.9, def: 1.0, spa: 1.1, spd: 1.0, spe: 1.0 }
  },
  mild: {
    name: "Mild",
    increased: "spa",
    decreased: "def",
    modifiers: { atk: 1.0, def: 0.9, spa: 1.1, spd: 1.0, spe: 1.0 }
  },
  quiet: {
    name: "Quiet",
    increased: "spa",
    decreased: "spe",
    modifiers: { atk: 1.0, def: 1.0, spa: 1.1, spd: 1.0, spe: 0.9 }
  },
  bashful: {
    name: "Bashful",
    increased: null,
    decreased: null,
    modifiers: { atk: 1.0, def: 1.0, spa: 1.0, spd: 1.0, spe: 1.0 }
  },
  rash: {
    name: "Rash",
    increased: "spa",
    decreased: "spd",
    modifiers: { atk: 1.0, def: 1.0, spa: 1.1, spd: 0.9, spe: 1.0 }
  },
  calm: {
    name: "Calm",
    increased: "spd",
    decreased: "atk",
    modifiers: { atk: 0.9, def: 1.0, spa: 1.0, spd: 1.1, spe: 1.0 }
  },
  gentle: {
    name: "Gentle",
    increased: "spd",
    decreased: "def",
    modifiers: { atk: 1.0, def: 0.9, spa: 1.0, spd: 1.1, spe: 1.0 }
  },
  sassy: {
    name: "Sassy",
    increased: "spd",
    decreased: "spe",
    modifiers: { atk: 1.0, def: 1.0, spa: 1.0, spd: 1.1, spe: 0.9 }
  },
  careful: {
    name: "Careful",
    increased: "spd",
    decreased: "spa",
    modifiers: { atk: 1.0, def: 1.0, spa: 0.9, spd: 1.1, spe: 1.0 }
  },
  quirky: {
    name: "Quirky",
    increased: null,
    decreased: null,
    modifiers: { atk: 1.0, def: 1.0, spa: 1.0, spd: 1.0, spe: 1.0 }
  }
};

export function natureModifier(nature, stat) {
  const key = typeof nature === "string" ? nature.toLowerCase() : "";
  const data = NATURES[key] || NATURES["hardy"];
  if (!data) return 1.0;
  return data.modifiers[stat] ?? 1.0;
}

export function natureDropdownLabel(natureKey) {
  const key = typeof natureKey === "string" ? natureKey.toLowerCase() : "";
  const nature = NATURES[key] || NATURES["hardy"];
  
  if (!nature.increased && !nature.decreased) {
    return `${nature.name} (Neutral)`;
  }
  
  const mapStat = (stat) => {
    switch (stat) {
      case "atk": return "Atk";
      case "def": return "Def";
      case "spa": return "SpA";
      case "spd": return "SpD";
      case "spe": return "Spe";
      default: return stat;
    }
  };
  
  return `${nature.name} (+${mapStat(nature.increased)}, -${mapStat(nature.decreased)})`;
}
