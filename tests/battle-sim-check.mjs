import { BattleState } from "../js/core/battle-state.js";
import { calculatePokemonStats, calculateBossStats } from "../js/core/stats.js";
import { emptyStages } from "../js/core/stages.js";

const smeargle = {
  name: "smeargle",
  types: [{ type: { name: "normal" } }],
  abilities: [{ ability: { name: "own-tempo" } }],
  moves: [
    { move: { name: "swords-dance" } },
    { move: { name: "belly-drum" } },
    { move: { name: "baton-pass" } },
    { move: { name: "guard-split" } },
    { move: { name: "extreme-speed" } },
  ],
  stats: [
    { base_stat: 55, stat: { name: "hp" } },
    { base_stat: 20, stat: { name: "attack" } },
    { base_stat: 35, stat: { name: "defense" } },
    { base_stat: 20, stat: { name: "special-attack" } },
    { base_stat: 45, stat: { name: "special-defense" } },
    { base_stat: 75, stat: { name: "speed" } },
  ]
};

const mewtwo = {
  name: "mewtwo",
  types: [{ type: { name: "psychic" } }],
  abilities: [],
  moves: [
    { move: { name: "psystrike" } },
    { move: { name: "shadow-ball" } }
  ],
  stats: [
    { base_stat: 106, stat: { name: "hp" } },
    { base_stat: 110, stat: { name: "attack" } },
    { base_stat: 90, stat: { name: "defense" } },
    { base_stat: 154, stat: { name: "special-attack" } },
    { base_stat: 90, stat: { name: "special-defense" } },
    { base_stat: 130, stat: { name: "speed" } },
  ]
};

const state = new BattleState();

// Initialize team
state.team[0].pokemon = smeargle;
state.team[0].level = 100;
state.team[0].ability = "own-tempo";
state.team[0].item = "";
state.team[0].moves[0] = { name: "swords-dance", type: { name: "normal" }, damage_class: { name: "status" } };
state.team[0].moves[1] = { name: "belly-drum", type: { name: "normal" }, damage_class: { name: "status" } };
state.team[0].moves[2] = { name: "baton-pass", type: { name: "normal" }, damage_class: { name: "status" } };
state.team[0].moves[3] = { name: "extreme-speed", power: 80, type: { name: "normal" }, damage_class: { name: "physical" } };
state.team[0].stats = calculatePokemonStats(smeargle, state.team[0]);

state.team[1].pokemon = smeargle;
state.team[1].level = 100;
state.team[1].ability = "own-tempo";
state.team[1].item = "";
state.team[1].moves[0] = { name: "extreme-speed", power: 80, type: { name: "normal" }, damage_class: { name: "physical" } };
state.team[1].stats = calculatePokemonStats(smeargle, state.team[1]);

// Initialize boss
const bossStats = calculateBossStats(mewtwo);
state.boss = mewtwo;
state.bossBaseStats = { ...bossStats };
state.bossStats = { ...bossStats };

// Boss moves
state.bossMoves[0] = { name: "psystrike", power: 100, type: { name: "psychic" }, damage_class: { name: "special" } };

console.log("Starting battle checks...");

// 1. Start Battle
state.startBattle();
if (!state.battleActive) throw new Error("Battle should be active.");
if (state.currentTurn !== 1) throw new Error("Turn should start at 1.");
if (state.activeSlot !== 0) throw new Error("Active slot should be lead Pokémon.");
if (state.bossHP !== state.bossMaxHP) throw new Error("Boss HP should be full.");
if (state.teamHP[0] !== state.team[0].stats.hp) throw new Error("Active Pokémon HP should be full.");

console.log("Battle initialized successfully.");

// 2. Execute Swords Dance (+2 Atk)
state.executeTurn("use-move", 0, 0, "do-nothing", 0);
if (state.currentTurn !== 2) throw new Error("Turn should advance to 2.");
if (state.teamStages[0].atk !== 2) throw new Error(`Active Pokémon Atk stage should be +2, got ${state.teamStages[0].atk}`);

console.log("Swords Dance executed and stages modified.");

// 3. Execute Belly Drum (Atk maximized to +6, loses 50% HP)
const hpBeforeDrum = state.teamHP[0];
state.executeTurn("use-move", 1, 0, "do-nothing", 0);
if (state.teamStages[0].atk !== 6) throw new Error("Active Pokémon Atk stage should be +6.");
const expectedHpAfterDrum = hpBeforeDrum - Math.floor(state.team[0].stats.hp / 2);
if (state.teamHP[0] !== expectedHpAfterDrum) {
  throw new Error(`Expected HP after Belly Drum: ${expectedHpAfterDrum}, got ${state.teamHP[0]}`);
}

console.log("Belly Drum executed and HP/stages modified.");

// 4. Undo Turn
state.undoLastTurn();
if (state.currentTurn !== 2) throw new Error("Turn should be reverted to 2.");
if (state.teamStages[0].atk !== 2) throw new Error("Atk stage should be reverted to +2.");
if (state.teamHP[0] !== hpBeforeDrum) throw new Error("HP should be reverted.");

console.log("Undo Turn reverted state successfully.");

// 5. Baton Pass to Slot 1 (active slot 1)
state.executeTurn("baton-pass", 2, 1, "do-nothing", 0);
if (state.activeSlot !== 1) throw new Error("Active slot should change to 1.");
if (state.teamStages[1].atk !== 2) throw new Error(`Boosts should transfer to slot 1, got ${state.teamStages[1].atk}`);
if (state.teamStages[0].atk !== 0) throw new Error("Boosts should clear from previous active slot.");

console.log("Baton Pass transferred stages successfully.");

// 6. Boss attacks back (damage resolved against active slot 1)
const hpBeforeBossAttack = state.teamHP[1];
// Boss uses Psystrike
state.executeTurn("use-move", 0, 0, "use-move", 0);
if (state.teamHP[1] >= hpBeforeBossAttack) {
  throw new Error(`Boss attack should deal damage to active slot 1. Before: ${hpBeforeBossAttack}, After: ${state.teamHP[1]}`);
}
console.log(`Boss attack dealt damage: ${hpBeforeBossAttack - state.teamHP[1]} HP. Remaining: ${state.teamHP[1]}`);

// 6.5. Type-changing moves tests
state.resetBattle();
state.startBattle();

// Setup type-changing moves
state.team[0].moves[0] = { name: "trick-or-treat", type: { name: "ghost" }, damage_class: { name: "status" } };
state.team[0].moves[1] = { name: "soak", type: { name: "water" }, damage_class: { name: "status" } };
state.team[0].moves[2] = { name: "magic-powder", type: { name: "psychic" }, damage_class: { name: "status" } };
state.team[0].moves[3] = { name: "extreme-speed", power: 80, type: { name: "normal" }, damage_class: { name: "physical" } };

if (state.bossCurrentTypes.length !== 1 || state.bossCurrentTypes[0] !== "psychic") {
  throw new Error("Mewtwo should start as psychic type.");
}

// 6.5.1 Player uses Trick-or-Treat on boss
state.executeTurn("use-move", 0, 0, "do-nothing", 0);
if (!state.bossCurrentTypes.includes("psychic") || !state.bossCurrentTypes.includes("ghost")) {
  throw new Error("Boss should gain ghost typing after Trick-or-Treat.");
}
console.log("Trick-or-Treat added Ghost type to boss successfully.");

// 6.5.2 Player uses Soak on boss
state.executeTurn("use-move", 1, 0, "do-nothing", 0);
if (state.bossCurrentTypes.length !== 1 || state.bossCurrentTypes[0] !== "water") {
  throw new Error(`Boss types should become water only, got ${state.bossCurrentTypes.join("/")}`);
}
console.log("Soak changed boss type to water successfully.");

// 6.5.3 Player uses Magic Powder on boss
state.executeTurn("use-move", 2, 0, "do-nothing", 0);
if (state.bossCurrentTypes.length !== 1 || state.bossCurrentTypes[0] !== "psychic") {
  throw new Error(`Boss types should become psychic only, got ${state.bossCurrentTypes.join("/")}`);
}
console.log("Magic Powder changed boss type to psychic successfully.");

// Boss uses Soak on player
state.bossMoves[1] = { name: "soak", type: { name: "water" }, damage_class: { name: "status" } };
state.executeTurn("use-move", 3, 0, "use-move", 1);
if (state.teamCurrentTypes[0].length !== 1 || state.teamCurrentTypes[0][0] !== "water") {
  throw new Error(`Player Pokémon type should become water after Soak from boss, got ${state.teamCurrentTypes[0].join("/")}`);
}
console.log("Boss Soak changed player active Pokémon type to Water successfully.");

// 6.5.5 Player switches out (reverting player type changes)
state.executeTurn("switch", 3, 1, "do-nothing", 0);
if (state.teamCurrentTypes[0].length !== 1 || state.teamCurrentTypes[0][0] !== "normal") {
  throw new Error(`Switching out should restore player original types, got ${state.teamCurrentTypes[0].join("/")}`);
}
console.log("Player types reverted to original normal type after switching out.");

// 7. Reset Battle
state.resetBattle();
if (state.battleActive) throw new Error("Battle should not be active after reset.");
if (state.teamHP[0] !== 0) throw new Error("HP state should be cleared on reset.");
if (state.teamStages[0].atk !== 0) throw new Error("Stages should be cleared on reset.");

console.log("All battle simulator core checks passed successfully!");
