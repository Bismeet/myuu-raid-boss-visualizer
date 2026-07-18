import { damageRolls } from "./damage.js";
import { emptyStages, resolveDynamicMovePower } from "./stages.js";
import { calculateRaidBossHP } from "./stats.js";

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
    const raidBossMaxHp = Array.isArray(state.boss?.stats)
      ? calculateRaidBossHP(state.boss)
      : Math.max(1, Number(state.bossMaxHP || state.bossBaseStats?.hp) || 1);
    let hp = raidBossMaxHp;
    let stages = emptyStages();
    let activeSlot = -1;
    const rows = [];

    for (const planned of state.plan.slice(0, limit)) {
      const build = state.team[planned.slot];
      const action = planned.action;
      let damage = { min: 0, max: 0 };
      let move = build.moves.find((item) => item?.name === action) || null;

      if (!build.pokemon) {
        rows.push(this.row(planned, build, move, damage, hp));
        continue;
      }

      if (planned.slot !== activeSlot) {
        stages = planned.switchMode === "baton" && activeSlot >= 0 ? { ...stages } : { ...build.stages };
        activeSlot = planned.slot;
      }

      if (SETUP[action]) {
        Object.entries(SETUP[action]).forEach(([key, amount]) => stages[key] = clampStage(stages[key] + amount));
      } else if (action === "guard-split") {
        const def = Math.floor((build.stats.def + bossStats.def) / 2);
        const spd = Math.floor((build.stats.spd + bossStats.spd) / 2);
        bossStats.def = def; bossStats.spd = spd;
      } else if (action === "power-split") {
        const atk = Math.floor((build.stats.atk + bossStats.atk) / 2);
        const spa = Math.floor((build.stats.spa + bossStats.spa) / 2);
        bossStats.atk = atk; bossStats.spa = spa;
      } else {
        move = resolveDynamicMovePower(move, stages, { faintedAllies: state.faintedAlliesCount });
        const movePower = move?.customPower ?? move?.basePower ?? move?.power ?? null;
        if (move?.damage_class?.name === "status" || !movePower) {
          rows.push(this.row(planned, build, move, damage, hp));
          continue;
        }
        const payload = {
          attacker: build,
          boss: { stats: bossStats, maxHp: raidBossMaxHp },
          move,
          attackerTypes: build.pokemon.types.map(({ type }) => type.name),
          bossTypes: state.boss.types.map(({ type }) => type.name),
          ability: build.ability,
          defenderAbility: state.bossAbility || "",
          defenderHP: hp,
          defenderMaxHP: raidBossMaxHp,
          stages,
          bossStages,
        };
        damage = damageRolls(payload);
        const dealt = Math.round((damage.min + damage.max) / 2);
        hp = Math.max(0, hp - dealt);
      }

      rows.push(this.row(planned, build, move, damage, hp));
      if (hp <= 0) break;
    }
    state.bossStats = bossStats;
    return rows;
  }

  row(planned, build, move, damage, hp) {
    return {
      turn: planned.turn,
      slot: planned.slot,
      action: planned.action || "—",
      pokemon: build.pokemon?.name || "Empty slot",
      moveName: move?.name || planned.action || "—",
      damageMin: damage.min,
      damageMax: damage.max,
      damageLabel: range(damage),
      hp,
    };
  }
}
