import { BattleState } from "../js/core/battle-state.js";
import { calculateBossStats, calculatePokemonStats, calculateRaidBossHP } from "../js/core/stats.js";

const pokemon = (name, hp, attack, defense, specialAttack, specialDefense, speed, types, ability) => ({
  name,
  types: types.map((type) => ({ type: { name: type } })),
  abilities: [{ ability: { name: ability } }],
  stats: [
    ["hp", hp],
    ["attack", attack],
    ["defense", defense],
    ["special-attack", specialAttack],
    ["special-defense", specialDefense],
    ["speed", speed],
  ].map(([statName, base_stat]) => ({ base_stat, stat: { name: statName } })),
});

const pangoro = pokemon("pangoro", 95, 124, 78, 69, 71, 58, ["fighting", "dark"], "iron-fist");
const meloetta = pokemon("meloetta-aria", 100, 77, 77, 128, 128, 90, ["normal", "psychic"], "serene-grace");

const state = new BattleState();
state.team[0].pokemon = pangoro;
state.team[0].level = 100;
state.team[0].ability = "iron-fist";
state.team[0].moves[0] = {
  name: "power-trip",
  power: 20,
  type: { name: "dark" },
  damage_class: { name: "physical" },
};
state.team[0].stats = calculatePokemonStats(pangoro, state.team[0]);
state.setBoss(meloetta, calculateBossStats(meloetta));
state.startBattle();
state.damageRollMode = "min";

const expectedRaidHp = 1_000_000;
if (calculateRaidBossHP(meloetta) !== expectedRaidHp) {
  throw new Error("Raid boss HP must equal base HP multiplied by 10,000.");
}
if (state.bossHP !== expectedRaidHp || state.bossMaxHP !== expectedRaidHp) {
  throw new Error(`Meloetta started with ${state.bossHP}/${state.bossMaxHP} instead of raid-scale HP.`);
}

let privateRequest = null;
state.privateDamageResolver = async (request) => {
  privateRequest = request;
  return {
    rolls: Array(16).fill(39_610),
    myuuRolls: Array(16).fill(39_610),
    myuuAverage: 39_610,
    effectiveness: 2,
  };
};

await state.executeTurn("use-move", 0, 0, "do-nothing", 0);

if (!privateRequest || privateRequest.direction !== "player-to-boss") {
  throw new Error("Live Battle did not route damage through the private damage resolver.");
}
const serializedRequest = JSON.stringify(privateRequest);
for (const forbidden of ["multiplier", "finalBossDef", "finalBossSpD", "level200Boss"]) {
  if (serializedRequest.includes(forbidden)) {
    throw new Error(`Battle exposed forbidden private defensive data: ${forbidden}`);
  }
}

const expectedRemainingHp = expectedRaidHp - 39_610;
if (state.bossHP !== expectedRemainingHp) {
  throw new Error(`39,610 damage left ${state.bossHP} HP instead of ${expectedRemainingHp}.`);
}
if (!state.battleActive || state.bossHP <= 0) {
  throw new Error("Meloetta was incorrectly defeated by 39,610 damage.");
}

const progress = ((state.bossMaxHP - state.bossHP) / state.bossMaxHP) * 100;
if (Math.abs(progress - 3.961) > Number.EPSILON) {
  throw new Error(`Battle progress was ${progress}% instead of 3.961%.`);
}
if (state.battleLog.at(-1)?.playerDamage !== 39_610) {
  throw new Error("Battle log did not preserve the raw private damage result.");
}

console.log("Raid boss HP and private Battle damage regression checks passed.");
