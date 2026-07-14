import { readFile } from "node:fs/promises";
import { BattleState } from "../js/core/battle-state.js";
import { damageRolls } from "../js/core/damage.js";
import { emptyStages } from "../js/core/stages.js";
import {
  resolveAttackerTypes,
  resolveDefenderTypes,
  resolveMoveType,
} from "../js/core/type-mechanics.js";
import { typeEffectiveness } from "../js/data/type-chart.js";
import { MOVE_EFFECTS, MOVE_MECHANICS_AUDIT, applyDamagingMoveAfterEffects } from "../js/data/move-effects.js";
import { resolveQuickCalcBossTypes } from "../js/ui/quick-calc.js";

const pokemon = (name, types) => ({
  name,
  types: types.map((type) => ({ type: { name: type } })),
  abilities: [{ ability: { name: "pressure" } }],
  stats: [
    ["hp", 100], ["attack", 100], ["defense", 100],
    ["special-attack", 100], ["special-defense", 100], ["speed", 100],
  ].map(([statName, base_stat]) => ({ base_stat, stat: { name: statName } })),
});

const playerPokemon = pokemon("type-user", ["fire", "flying"]);
const bossPokemon = pokemon("ting-lu", ["dark", "ground"]);
const state = new BattleState();
state.team[0].pokemon = playerPokemon;
state.team[0].stats = { hp: 320, atk: 200, def: 180, spa: 200, spd: 180, spe: 160 };
state.team[0].currentStats = { ...state.team[0].stats };
state.teamHP[0] = 160;
state.teamCurrentTypes = [["fire", "flying"], [], [], [], [], []];
state.boss = bossPokemon;
state.bossCurrentTypes = ["dark", "ground"];
state.bossHP = 1000;
state.bossMaxHP = 1000;
state.bossStages = emptyStages();
state.teamStages = Array.from({ length: 6 }, () => emptyStages());
const log = () => ({ notes: [], messages: [] });

MOVE_EFFECTS.soak.apply(state, state.team[0], bossPokemon, "player", log());
if (state.bossCurrentTypes.join("/") !== "water") throw new Error("Soak did not make the target pure Water.");

MOVE_EFFECTS["magic-powder"].apply(state, state.team[0], bossPokemon, "player", log());
if (state.bossCurrentTypes.join("/") !== "psychic") throw new Error("Magic Powder did not make the target pure Psychic.");

state.bossCurrentTypes = ["dark", "ground"];
MOVE_EFFECTS["trick-or-treat"].apply(state, state.team[0], bossPokemon, "player", log());
if (state.bossCurrentTypes.join("/") !== "dark/ground/ghost") throw new Error("Trick-or-Treat did not add Ghost.");

state.bossCurrentTypes = ["dark", "ground"];
MOVE_EFFECTS["forests-curse"].apply(state, state.team[0], bossPokemon, "player", log());
if (state.bossCurrentTypes.join("/") !== "dark/ground/grass") throw new Error("Forest's Curse did not preserve Ting-Lu's types and add Grass.");
if (typeEffectiveness("bug", state.bossCurrentTypes) !== 4) throw new Error("Bug should be 4x effective against Dark/Ground/Grass.");

const tarLog = log();
MOVE_EFFECTS["tar-shot"].apply(state, state.team[0], bossPokemon, "player", tarLog);
if (state.bossStages.spe !== -1 || !state.volatileEffects.tarShot.boss) throw new Error("Tar Shot did not lower Speed and set its volatile effect.");

const fireMove = { name: "flamethrower", power: 90, type: { name: "fire" }, damage_class: { name: "special" } };
const damageInput = {
  attacker: { level: 100, stats: { atk: 200, spa: 200 }, item: "" },
  boss: { stats: { def: 200, spd: 200 }, maxHp: 1000 },
  move: fireMove,
  attackerTypes: ["fire"],
  bossTypes: ["normal"],
  ability: "",
  stages: emptyStages(),
  bossStages: emptyStages(),
};
const normalFire = damageRolls(damageInput);
const tarShotFire = damageRolls({ ...damageInput, tarShot: true });
if (tarShotFire.min < normalFire.min * 1.99 || tarShotFire.max < normalFire.max * 1.99
  || !tarShotFire.abilityNotes.includes("Tar Shot: Fire damage 2.0x")) {
  throw new Error("Tar Shot did not double Fire-type damage.");
}

state.teamCurrentTypes[0] = ["fire", "flying"];
applyDamagingMoveAfterEffects(state, state.team[0], bossPokemon, "player", log(), "burn-up", true);
if (state.teamCurrentTypes[0].includes("fire")) throw new Error("Burn Up did not remove Fire type.");
state.teamCurrentTypes[0] = ["electric"];
applyDamagingMoveAfterEffects(state, state.team[0], bossPokemon, "player", log(), "double-shock", true);
if (state.teamCurrentTypes[0].length !== 0) throw new Error("Double Shock did not produce a typeless user.");

state.teamCurrentTypes[0] = ["fire", "flying"];
state.teamHP[0] = 160;
MOVE_EFFECTS.roost.apply(state, state.team[0], bossPokemon, "player", log());
if (state.teamCurrentTypes[0].includes("flying") || state.teamHP[0] !== 320) throw new Error("Roost did not heal and temporarily remove Flying.");
state.processEndOfTurnEffects(log());
if (state.teamCurrentTypes[0].join("/") !== "fire/flying") throw new Error("Roost did not restore Flying at end of turn.");

MOVE_EFFECTS.electrify.apply(state, state.team[0], bossPokemon, "player", log());
const electrified = state.resolveActionMove({ name: "tackle", type: { name: "normal" } }, "boss", log());
if (electrified.type.name !== "electric") throw new Error("Electrify did not override the target's move type.");
MOVE_EFFECTS["ion-deluge"].apply(state, state.team[0], bossPokemon, "player", log());
const ionMove = state.resolveActionMove({ name: "tackle", type: { name: "normal" } }, "player", log());
if (ionMove.type.name !== "electric" || resolveMoveType("water", { ionDeluge: true }) !== "water") {
  throw new Error("Ion Deluge did not limit its override to Normal moves.");
}

const orderedTypes = resolveDefenderTypes(["dark", "ground"], {
  soak: true,
  magicPowder: true,
  trickOrTreat: true,
  forestsCurse: true,
});
if (orderedTypes.join("/") !== "psychic/ghost/grass") throw new Error("Replacement/additive type-change order is incorrect.");
const manualTypes = resolveQuickCalcBossTypes({
  bossTypes: ["dark", "ground"], soak: true, magicPowder: true, forestsCurse: true,
  manualTypesEnabled: true, manualType1: "steel", manualType2: "fairy",
});
if (manualTypes.join("/") !== "steel/fairy") throw new Error("Manual boss types did not override all move effects.");

const reflected = resolveAttackerTypes(["normal"], { reflectType: true }, { targetTypes: ["dark", "ground", "grass"] });
if (reflected.join("/") !== "dark/ground/grass") throw new Error("Reflect Type did not copy current target types.");
state.bossCurrentTypes = ["dark", "ground", "grass"];
state.teamCurrentTypes[0] = ["normal"];
MOVE_EFFECTS["reflect-type"].apply(state, state.team[0], bossPokemon, "player", log());
if (state.teamCurrentTypes[0].join("/") !== "dark/ground/grass") throw new Error("Battle Reflect Type did not copy live target types.");
state.team[0].moves[0] = { name: "water-gun", type: { name: "water" } };
MOVE_EFFECTS.conversion.apply(state, state.team[0], bossPokemon, "player", log());
if (state.teamCurrentTypes[0].join("/") !== "water") throw new Error("Battle Conversion did not use the first move's type.");
state.volatileEffects.lastMoveType.boss = "fire";
MOVE_EFFECTS["conversion-2"].apply(state, state.team[0], bossPokemon, "player", log());
if (typeEffectiveness("fire", state.teamCurrentTypes[0]) >= 1) throw new Error("Battle Conversion 2 did not select a resistant type.");
MOVE_EFFECTS.camouflage.apply(state, state.team[0], bossPokemon, "player", log());
if (state.teamCurrentTypes[0].join("/") !== "normal") throw new Error("Battle Camouflage fallback was not Normal.");
MOVE_EFFECTS["trick-room"].apply(state, state.team[0], bossPokemon, "player", log());
if (state.volatileEffects.trickRoomTurns !== 5) throw new Error("Trick Room was marked implemented without activating its turn state.");
const quickEffectiveness = typeEffectiveness("bug", resolveQuickCalcBossTypes({ bossTypes: ["dark", "ground"], forestsCurse: true }));
const battleEffectiveness = typeEffectiveness("bug", state.applyTypeChangingMove("forests-curse", "boss") || state.bossCurrentTypes);
if (quickEffectiveness !== 4 || battleEffectiveness !== quickEffectiveness) throw new Error("Quick Calc and Battle did not share changed-type effectiveness.");

for (const name of ["soak", "tar-shot", "magic-powder", "trick-or-treat", "forests-curse", "reflect-type", "conversion", "conversion-2", "camouflage", "burn-up", "double-shock", "roost", "electrify", "ion-deluge"]) {
  if (!MOVE_MECHANICS_AUDIT[name] || MOVE_MECHANICS_AUDIT[name].status === "Missing") throw new Error(`${name} is missing from the move mechanics audit.`);
}
if (MOVE_MECHANICS_AUDIT["conversion-2"].status !== "Partial" || MOVE_MECHANICS_AUDIT.camouflage.status !== "Partial") {
  throw new Error("Complex manual-result mechanics must remain clearly marked Partial.");
}

const battleSceneSource = await readFile(new URL("../js/ui/battle-scene.js", import.meta.url), "utf8");
if ((battleSceneSource.match(/Current Type/g) || []).length < 2 || !battleSceneSource.includes("teamCurrentTypes") || !battleSceneSource.includes("bossCurrentTypes")) {
  throw new Error("Battle current-type badges are not wired to both live battlers.");
}

console.log("Type-changing move and effectiveness checks passed.");
