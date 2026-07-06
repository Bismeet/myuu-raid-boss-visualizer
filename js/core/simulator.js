import { damageRolls } from "./damage.js";
import { emptyStages } from "./stages.js";

const SETUP = {
  "swords-dance": { atk: 2 },
  "nasty-plot": { spa: 2 },
  "focus-energy": { crit: 2 },
};

const clampStage = (value) => Math.max(-6, Math.min(6, value));
const range = (data) => `${data.min.toLocaleString()}–${data.max.toLocaleString()}`;

export class Simulator {
  constructor(state) {
    this.state = state;
  }

  run(limit = 21) {
    const state = this.state;
    const bossStats = { ...state.bossBaseStats };
    const bossStages = emptyStages();
    let hp = bossStats.hp;
    let stages = emptyStages();
    let activeSlot = -1;
    const rows = [];

    for (const planned of state.plan.slice(0, limit)) {
      const build = state.team[planned.slot];
      const action = planned.action;
      let note = "";
      let normal = { min: 0, max: 0, percent: [0, 0], effectiveness: 1, itemNotes: [] };
      let critical = { ...normal };
      let move = build.moves.find((item) => item?.name === action) || null;
      const usedPower = move?.customPower ?? move?.basePower ?? move?.power ?? null;

      if (!build.pokemon) {
        rows.push(this.row(planned, build, move, normal, critical, hp, "Empty team slot"));
        continue;
      }

      if (planned.slot !== activeSlot) {
        stages = planned.switchMode === "baton" && activeSlot >= 0 ? { ...stages } : { ...build.stages };
        note = planned.switchMode === "baton" ? "Stages passed" : activeSlot >= 0 ? "Normal switch; stages reset" : "Entered battle";
        activeSlot = planned.slot;
      }

      if (SETUP[action]) {
        Object.entries(SETUP[action]).forEach(([key, amount]) => stages[key] = clampStage(stages[key] + amount));
        note = `${note ? `${note}. ` : ""}${action === "focus-energy" ? "Critical stage +2" : `${Object.keys(SETUP[action])[0].toUpperCase()} +2`}`;
      } else if (action === "guard-split") {
        const def = Math.floor((build.stats.def + bossStats.def) / 2);
        const spd = Math.floor((build.stats.spd + bossStats.spd) / 2);
        bossStats.def = def; bossStats.spd = spd;
        note = `${note ? `${note}. ` : ""}Boss defenses split to ${def}/${spd}`;
      } else if (action === "power-split") {
        const atk = Math.floor((build.stats.atk + bossStats.atk) / 2);
        const spa = Math.floor((build.stats.spa + bossStats.spa) / 2);
        bossStats.atk = atk; bossStats.spa = spa;
        note = `${note ? `${note}. ` : ""}Boss offenses split to ${atk}/${spa}`;
      } else if (move?.damage_class?.name !== "status" && usedPower) {
        const payload = {
          attacker: build,
          boss: { stats: bossStats, maxHp: state.bossBaseStats.hp },
          move,
          attackerTypes: build.pokemon.types.map(({ type }) => type.name),
          bossTypes: state.boss.types.map(({ type }) => type.name),
          ability: build.ability,
          defenderAbility: state.bossAbility || "",
          defenderHP: hp,
          defenderMaxHP: state.bossBaseStats.hp,
          stages,
          bossStages,
        };
        normal = damageRolls(payload);
        critical = damageRolls({ ...payload, critical: true });
        const dealt = Math.round((normal.min + normal.max) / 2);
        hp = Math.max(0, hp - dealt);
        const abilityNote = normal.abilityNotes?.length ? `${normal.abilityNotes.join("; ")}. ` : "";
        const itemNote = normal.itemNotes?.length ? `${normal.itemNotes.join("; ")}. ` : "";
        note = `${note ? `${note}. ` : ""}${abilityNote}${itemNote}Applied midpoint roll: ${dealt.toLocaleString()}`;
      } else if (action === "baton-pass") {
        note = `${note ? `${note}. ` : ""}Stages ready to pass on next Baton switch`;
      } else {
        note = note || (action ? "Status move" : "No action selected");
      }

      rows.push(this.row(planned, build, move, normal, critical, hp, note));
      if (hp <= 0) break;
    }
    state.bossStats = bossStats;
    return rows;
  }

  row(planned, build, move, normal, critical, hp, note) {
    return {
      ...planned,
      pokemon: build.pokemon?.name || "Empty slot",
      action: planned.action || "—",
      moveName: move?.name || planned.action || "—",
      moveType: move?.type?.name || "status",
      category: move?.damage_class?.name || "status",
      originalPower: move?.basePower ?? move?.power ?? "—",
      usedPower: move?.customPower ?? move?.basePower ?? move?.power ?? "—",
      power: move?.customPower ?? move?.basePower ?? move?.power ?? "—",
      heldItem: build.item || "—",
      itemNotes: normal.itemNotes?.join("; ") || "—",
      effectiveness: normal.effectiveness,
      normal, critical,
      normalLabel: range(normal),
      criticalLabel: range(critical),
      hp,
      note,
    };
  }
}
