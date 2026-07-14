import { BattleState } from "../js/core/battle-state.js";
import { getBossDisplayName } from "../js/utils/format.js";

console.log("Running Battle Log and Speed Swap verification checks...\n");

const state = new BattleState();

// Set up team slot 0 (Abra)
state.team[0] = {
  pokemon: { name: "abra", types: [{ type: { name: "psychic" } }], abilities: [{ ability: { name: "synchronize" } }], stats: { hp: 200, atk: 50, def: 50, spa: 100, spd: 50, spe: 105 }, moves: [] },
  level: 100,
  nature: "serious",
  ability: "synchronize",
  item: "focus-sash",
  moves: [
    { name: "speed-swap", type: { name: "psychic" }, damage_class: { name: "status" } },
    { name: "guard-split", type: { name: "psychic" }, damage_class: { name: "status" } },
    { name: "shadow-ball", power: 80, basePower: 80, type: { name: "ghost" }, damage_class: { name: "special" } }
  ],
  evs: { hp: 0, atk: 0, def: 0, spa: 0, spd: 0, spe: 0 },
  ivs: { hp: 31, atk: 31, def: 31, spa: 31, spd: 31, spe: 31 },
  stages: { atk: 0, def: 0, spa: 0, spd: 0, spe: 0, accuracy: 0, evasion: 0, crit: 0 },
  stats: { hp: 200, atk: 50, def: 50, spa: 100, spd: 50, spe: 105 },
  originalStats: { hp: 200, atk: 50, def: 50, spa: 100, spd: 50, spe: 105 },
  currentStats: { hp: 200, atk: 50, def: 50, spa: 100, spd: 50, spe: 105 },
  statSources: { atk: ["Base"], def: ["Base"], spa: ["Base"], spd: ["Base"], spe: ["Base"] },
  speedOverride: null
};

// Set up boss (Latias)
state.boss = { name: "latias", types: [{ type: { name: "dragon" } }, { type: { name: "psychic" } }], stats: { hp: 800, atk: 80, def: 90, spa: 110, spd: 130, spe: 110 }, moves: [] };
state.bossStats = { hp: 800, atk: 80, def: 90, spa: 110, spd: 130, spe: 110 };
state.bossOriginalStats = { hp: 800, atk: 80, def: 90, spa: 110, spd: 130, spe: 110 };
state.bossCurrentStats = { hp: 800, atk: 80, def: 90, spa: 110, spd: 130, spe: 110 };
state.bossMaxHP = 8000;
state.bossHP = 8000;
state.bossCurrentTypes = ["dragon", "psychic"];
state.teamCurrentTypes = [["psychic"], [], [], [], [], []];
state.teamHP = [200, 0, 0, 0, 0, 0];
state.bossStages = { atk: 0, def: 0, spa: 0, spd: 0, spe: 0, accuracy: 0, evasion: 0, crit: 0 };
state.teamStages = [
  { atk: 0, def: 0, spa: 0, spd: 0, spe: 0, accuracy: 0, evasion: 0, crit: 0 },
  { atk: 0, def: 0, spa: 0, spd: 0, spe: 0, accuracy: 0, evasion: 0, crit: 0 },
  { atk: 0, def: 0, spa: 0, spd: 0, spe: 0, accuracy: 0, evasion: 0, crit: 0 },
  { atk: 0, def: 0, spa: 0, spd: 0, spe: 0, accuracy: 0, evasion: 0, crit: 0 },
  { atk: 0, def: 0, spa: 0, spd: 0, spe: 0, accuracy: 0, evasion: 0, crit: 0 },
  { atk: 0, def: 0, spa: 0, spd: 0, spe: 0, accuracy: 0, evasion: 0, crit: 0 }
];
state.bossStatSources = { atk: ["Raid scaler"], def: ["Raid scaler"], spa: ["Raid scaler"], spd: ["Raid scaler"], spe: ["Raid scaler"] };
state.battleSpeed = { player: [null, null, null, null, null, null], boss: null };
state.consumedItems = { player: [false, false, false, false, false, false], boss: false };
state.zMoveUsed = { player: [false, false, false, false, false, false], boss: false };
state.teraUsed = { player: false, boss: false };
state.terastallized = { player: [false, false, false, false, false, false], boss: false };
state.bossAbility = "";
state.bossMoves = [null, null, null, null];
state.battleActive = true;
state.currentTurn = 1;
state.activeSlot = 0;
state.faintedAlliesCount = 0;
state.battleLog = [];
state.history = [];
state.awaitingForcedSwitch = false;
state.damageRollMode = "random";
state.manualBossOverride = { enabled: true, displayName: "Latias" };
state.manualBossName = "Latias";

// Check boss name resolution
const bossName = getBossDisplayName(state);
if (bossName !== "Latias") {
  console.error(`FAIL: expected boss name Latias, got ${bossName}`);
  process.exit(1);
}
console.log("PASS: getBossDisplayName resolves selected boss Latias");

// =============================================
// Turn 1: Speed Swap
// =============================================
await state.executeTurn(
  "use-move",
  0, // index of speed-swap
  null,
  "do-nothing",
  0
);

const turn1Log = state.battleLog[0];
console.log("\nTurn 1 messages:", turn1Log.messages);

// Verify messages array exists
if (!Array.isArray(turn1Log.messages) || turn1Log.messages.length === 0) {
  console.error("FAIL: turnLog.messages was not populated.");
  process.exit(1);
}
console.log("PASS: turnLog.messages array is populated");

// Speed Swap logs verification
const speedSwapSwappedLine = turn1Log.messages.find(m => m.includes("swapped Speed with"));
const speedSwapOldNewUser = turn1Log.messages.find(m => m.includes("Abra Speed:"));
const speedSwapOldNewBoss = turn1Log.messages.find(m => m.includes("Latias Speed:"));

if (!speedSwapSwappedLine) {
  console.error("FAIL: Speed Swap 'swapped Speed' line is missing.");
  console.error("Messages:", turn1Log.messages);
  process.exit(1);
}
console.log("PASS: Speed Swap 'swapped Speed' line found");

if (!speedSwapOldNewUser) {
  console.error("FAIL: Speed Swap user speed line is missing.");
  process.exit(1);
}
if (!speedSwapOldNewBoss) {
  console.error("FAIL: Speed Swap boss speed line is missing.");
  process.exit(1);
}
console.log("PASS: Speed Swap user and boss speed lines found");

// Check target speed old -> new (should NOT be identical before and after)
if (speedSwapOldNewBoss.includes("Latias Speed: 110 → 110")) {
  console.error(`FAIL: Speed Swap boss speed log typo not resolved. Logged: ${speedSwapOldNewBoss}`);
  process.exit(1);
}
console.log("PASS: Speed Swap log target speed typo resolved");

// Verify no duplicate "used Speed Swap" lines
const speedSwapUseLines = turn1Log.messages.filter(m => m.toLowerCase().includes("used") && m.toLowerCase().includes("speed swap"));
if (speedSwapUseLines.length !== 1) {
  console.error(`FAIL: Expected exactly 1 'used Speed Swap' line, got: ${speedSwapUseLines.length}`);
  console.error("Lines:", speedSwapUseLines);
  process.exit(1);
}
console.log("PASS: No duplicate 'used Speed Swap' lines");

// =============================================
// Turn 2: Guard Split
// =============================================
await state.executeTurn(
  "use-move",
  1, // index of guard-split
  null,
  "do-nothing",
  0
);

const turn2Log = state.battleLog[1];
console.log("\nTurn 2 messages:", turn2Log.messages);

const guardSplitUseLines = turn2Log.messages.filter(m => m.toLowerCase().includes("used") && m.toLowerCase().includes("guard split"));
if (guardSplitUseLines.length !== 1) {
  console.error(`FAIL: Expected exactly 1 'used Guard Split' line, got: ${guardSplitUseLines.length}`);
  console.error("Lines:", guardSplitUseLines);
  process.exit(1);
}
console.log("PASS: Guard Split contains no duplicate logs");

// Verify boss "did nothing" message
const bossDidNothing = turn2Log.messages.find(m => m.toLowerCase().includes("did nothing"));
if (!bossDidNothing) {
  console.error("FAIL: Boss 'did nothing' message is missing.");
  console.error("Messages:", turn2Log.messages);
  process.exit(1);
}
console.log("PASS: Boss 'did nothing' message present");

// =============================================
// Turn 3: Shadow Ball vs Dragon Pulse (test damage + faint ordering)
// =============================================
state.bossMoves = [{ name: "dragon-pulse", power: 185, basePower: 185, type: { name: "dragon" }, damage_class: { name: "special" } }, null, null, null];

await state.executeTurn(
  "use-move",
  2, // shadow-ball
  null,
  "use-move",
  0  // dragon-pulse
);

const turn3Log = state.battleLog[2];
console.log("\nTurn 3 messages:", turn3Log.messages);

// Check that boss move usage is shown in the messages list
const bossUseMoveLine = turn3Log.messages.find(m => m.toLowerCase().includes("opposing") && m.toLowerCase().includes("used") && m.toLowerCase().includes("dragon pulse"));
if (!bossUseMoveLine) {
  console.error("FAIL: Boss move usage was not logged in messages array.");
  console.error("Messages:", turn3Log.messages);
  process.exit(1);
}
console.log("PASS: Boss move usage appears in main log feed");

// Check that player move is also shown
const playerUseMoveLine = turn3Log.messages.find(m => m.toLowerCase().includes("used") && m.toLowerCase().includes("shadow ball") && !m.toLowerCase().includes("opposing"));
if (!playerUseMoveLine) {
  console.error("FAIL: Player move usage was not logged in messages array.");
  console.error("Messages:", turn3Log.messages);
  process.exit(1);
}
console.log("PASS: Player move usage appears in main log feed");

// Check faint log (Abra should faint from powerful Dragon Pulse)
const faintLine = turn3Log.messages.find(m => m.toLowerCase().includes("fainted"));
if (faintLine) {
  // If faint happened, check ordering
  const bossMoveIndex = turn3Log.messages.indexOf(bossUseMoveLine);
  const faintIndex = turn3Log.messages.indexOf(faintLine);
  if (bossMoveIndex > faintIndex) {
    console.error("FAIL: Faint message appeared BEFORE the move that caused it.");
    process.exit(1);
  }
  console.log("PASS: Faint message correctly ordered after the move that caused it");
  
  // Check sash message order
  const sashLine = turn3Log.messages.find(m => m.toLowerCase().includes("focus sash"));
  if (sashLine) {
    const sashIndex = turn3Log.messages.indexOf(sashLine);
    if (bossMoveIndex > sashIndex) {
      console.error("FAIL: Sash activation message appeared before the move that caused it.");
      process.exit(1);
    }
    console.log("PASS: Focus Sash activation correctly ordered after move usage");
  }
} else {
  console.log("NOTE: No faint occurred in Turn 3 (Abra survived, possibly via Focus Sash)");
}

console.log("\n✅ All Battle Log and Speed Swap verification checks PASSED!");
