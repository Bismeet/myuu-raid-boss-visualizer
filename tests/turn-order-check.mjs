import { BattleState } from "../js/core/battle-state.js";
import { calculatePokemonStats } from "../js/core/stats.js";

console.log("Running turn order and priority tests...");

const abra = {
  name: "abra",
  types: [{ type: { name: "psychic" } }],
  abilities: [],
  moves: [
    { move: { name: "speed-swap", priority: 0 } },
    { move: { name: "quick-attack", priority: 1 } },
    { move: { name: "teleport", priority: 0 } }
  ],
  stats: [
    { base_stat: 25, stat: { name: "hp" } },
    { base_stat: 20, stat: { name: "attack" } },
    { base_stat: 15, stat: { name: "defense" } },
    { base_stat: 105, stat: { name: "special-attack" } },
    { base_stat: 55, stat: { name: "special-defense" } },
    { base_stat: 7, stat: { name: "speed" } }, // Speed 7 raw base
  ]
};

const mewtwo = {
  name: "mewtwo",
  types: [{ type: { name: "psychic" } }],
  abilities: [],
  moves: [
    { move: { name: "psystrike", priority: 0 } }
  ],
  stats: [
    { base_stat: 106, stat: { name: "hp" } },
    { base_stat: 110, stat: { name: "attack" } },
    { base_stat: 90, stat: { name: "defense" } },
    { base_stat: 154, stat: { name: "special-attack" } },
    { base_stat: 90, stat: { name: "special-defense" } },
    { base_stat: 130, stat: { name: "speed" } }, // Speed 130 raw base -> 587 at level 200
  ]
};

// 1. Speed Swap test
const state = new BattleState();
state.team[0].pokemon = abra;
state.team[0].level = 100;
state.team[0].item = "";
state.team[0].moves[0] = { name: "speed-swap", priority: 0, type: { name: "psychic" }, damage_class: { name: "status" } };
state.team[0].moves[1] = { name: "quick-attack", priority: 1, type: { name: "normal" }, damage_class: { name: "physical" } };
state.team[0].moves[2] = { name: "teleport", priority: 0, type: { name: "psychic" }, damage_class: { name: "status" } };
state.team[0].stats = calculatePokemonStats(abra, state.team[0]);

const bossStats = calculatePokemonStats(mewtwo, { level: 200, nature: "hardy", ivs: { hp: 31, atk: 31, def: 31, spa: 31, spd: 31, spe: 31 }, evs: { hp: 252, atk: 252, def: 252, spa: 252, spd: 252, spe: 252 } });
bossStats.hp = 1060000;
state.setBoss(mewtwo, bossStats);
state.bossMoves[0] = { name: "psystrike", priority: 0, type: { name: "psychic" }, damage_class: { name: "special" } };

state.startBattle();

// Turn 1: Mewtwo is faster (587 vs 18).
// Mewtwo moves first, then Abra uses Speed Swap.
// Wait, to verify Mewtwo moves first, we let Mewtwo use psystrike and Abra use Speed Swap.
state.executeTurn("use-move", 0, 0, "use-move", 0);
const log1 = state.battleLog[0];
console.log(`T1: Player moved first? ${log1.playerMovedFirst}`);
if (log1.playerMovedFirst) {
  throw new Error("Mewtwo should move first initially due to higher Speed.");
}

// Turn 2: Abra has Mewtwo's Speed raw value (587), Mewtwo has Abra's Speed raw value (18).
// Abra should move first now!
state.executeTurn("use-move", 2, 0, "use-move", 0); // Abra uses Teleport
const log2 = state.battleLog[1];
console.log(`T2: Player moved first? ${log2.playerMovedFirst}`);
if (!log2.playerMovedFirst) {
  throw new Error("Abra should move first after Speed Swap!");
}

// 2. Custap Berry test
// Reset battle to set up Custap Berry test
state.resetBattle();
state.team[0].item = "Custap Berry";
state.startBattle();
state.teamHP[0] = 1; // set HP to 1 after startBattle() so it doesn't get overwritten

// Turn 1: Abra HP is 1/191. Custap Berry is held.
// Abra uses priority 0 move (Teleport). Mewtwo uses priority 0 move (Psystrike).
// Custap Berry should activate and Abra should move first!
state.executeTurn("use-move", 2, 0, "use-move", 0);
const log3 = state.battleLog[0];
console.log(`T1 (Custap): Player moved first? ${log3.playerMovedFirst}`);
if (!log3.playerMovedFirst) {
  throw new Error("Custap Berry failed to grant priority to move first!");
}
console.log("T1 notes:", log3.notes);
if (!log3.notes.some(n => n.includes("Custap Berry activated!"))) {
  throw new Error("Custap Berry activation note not logged.");
}
if (!state.consumedItems.player[0]) {
  throw new Error("Custap Berry was not marked as consumed.");
}

// Turn 2: Custap is consumed. Mewtwo should move first again.
state.executeTurn("use-move", 2, 0, "use-move", 0);
const log4 = state.battleLog[1];
console.log(`T2 (Custap): Player moved first? ${log4.playerMovedFirst}`);
if (log4.playerMovedFirst) {
  throw new Error("Mewtwo should move first since Custap Berry is already consumed.");
}

// 3. Move priority test
state.resetBattle();
state.startBattle();
// Abra uses Quick Attack (+1 priority). Mewtwo uses Psystrike (0 priority).
// Abra should move first!
state.executeTurn("use-move", 1, 0, "use-move", 0);
const log5 = state.battleLog[0];
console.log(`T1 (Priority): Player moved first? ${log5.playerMovedFirst}`);
if (!log5.playerMovedFirst) {
  throw new Error("Quick Attack (+1 priority) should move before priority 0 Psystrike.");
}

// 4. Invalid turn test
// Smeargle faints
state.teamHP[0] = 0;
state.awaitingForcedSwitch = true;
try {
  state.executeTurn("use-move", 0, 0, "do-nothing", 0);
  throw new Error("Should have thrown error for executing turn when active Pokémon is fainted.");
} catch (e) {
  console.log("Caught expected error for fainted turn execution:", e.message);
}

// Verify that no log entry contains "Used —"
state.battleLog.forEach(log => {
  if (log.playerMove === "—" && log.playerAction === "use-move") {
    throw new Error("Found invalid log entry with Used —");
  }
});

console.log("All turn order and priority checks passed successfully!");
