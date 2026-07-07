import { BattleState } from "../js/core/battle-state.js";
import { SetupPersistence, SETUP_STORAGE_KEY } from "../js/utils/persistence.js";

const memory = new Map();
globalThis.localStorage = {
  getItem: (key) => memory.get(key) ?? null,
  setItem: (key, value) => memory.set(key, value),
  removeItem: (key) => memory.delete(key),
};

async function runTests() {
  console.log("Running Persistence v2 tests...");
  
  const persistence = new SetupPersistence(new BattleState());

  // Test 1: Setup-only save (no battle state)
  {
    const state = new BattleState();
    state.activeEditor = 3;
    state.boss = { name: "lugia" };
    state.bossBaseStats = { hp: 1_060_000, atk: 500, def: 1_000, spa: 500, spd: 1_000, spe: 500 };
    state.bossStats = { ...state.bossBaseStats, def: 618 };
    state.team[0].pokemon = { name: "smeargle" };
    state.team[0].level = 100;
    state.team[0].ability = "own-tempo";
    state.team[0].item = "life-orb";
    state.team[0].moves[0] = {
      name: "last-respects",
      power: 50,
      basePower: 50,
      customPower: 300,
      type: { name: "ghost" },
      damage_class: { name: "physical" },
    };
    state.team[0].evs.atk = 252;
    state.team[0].stages.atk = 2;

    const persistence = new SetupPersistence(state);
    if (!persistence.save(true)) throw new Error("Save failed.");
    const saved = JSON.parse(localStorage.getItem(SETUP_STORAGE_KEY));

    if (saved.version !== 2) throw new Error("Expected version 2");
    if (!saved.setup) throw new Error("Missing setup section");
    if (saved.setup.boss.pokemon !== "lugia") throw new Error("Boss pokemon missing");
    if (saved.setup.team[0].moves[0].customPower !== 300) throw new Error("Team move customPower missing");
    if (saved.setup.team[0].evs.atk !== 252) throw new Error("EVs not saved");
    if (saved.setup.team[0].stages.atk !== 2) throw new Error("Stages not saved");
    if (saved.setup.selectedSlot !== 3) throw new Error("Selected slot missing");
    if (saved.battle !== null) throw new Error("Battle should be null when no battle active");
    console.log("Test 1 PASSED: Setup-only save works correctly");
  }

  // Test 2: Full battle state save
  {
    const state = new BattleState();
    state.team[0].pokemon = { name: "abra" };
    state.team[0].level = 100;
    state.team[0].item = "focus-sash";
    state.team[0].stats = { hp: 300, atk: 50, def: 30, spa: 200, spd: 100, spe: 18 };
    
    const bossStats = { hp: 1_060_000, atk: 507, def: 1009, spa: 683, spd: 1009, spe: 587 };
    state.setBoss({ name: "mewtwo", types: [{ type: { name: "psychic" } }], stats: [] }, bossStats);
    
    state.startBattle();
    state.currentTurn = 5;
    state.bossHP = 500000;
    state.teamHP[0] = 50;
    state.battleLog.push({ turn: 1, pokemon: "abra", notes: ["Test"], playerDamage: 100, bossHPAfter: 999900, playerHPAfter: 50 });
    state.consumedItems.player[0] = true;
    state.playerSpeedOverrides[0] = 587;
    state.bossSpeedOverride = 7;

    const persistence = new SetupPersistence(state);
    persistence.save(true, true);
    const saved = JSON.parse(localStorage.getItem(SETUP_STORAGE_KEY));

    if (!saved.battle) throw new Error("Missing battle section");
    if (!saved.battle.battleActive) throw new Error("Battle should be active");
    if (saved.battle.currentTurn !== 5) throw new Error("Current turn not saved");
    if (saved.battle.bossHP !== 500000) throw new Error("Boss HP not saved");
    if (saved.battle.playerSpeedOverrides[0] !== 587) throw new Error("Speed override not saved");
    if (saved.setup.team[0].item !== "focus-sash") throw new Error("Setup item was corrupted by consumed battle state");
    if (saved.battle.consumedItems.player[0] !== true) throw new Error("Consumed battle item state not saved");

    persistence.save(true, false);
    const setupOnly = JSON.parse(localStorage.getItem(SETUP_STORAGE_KEY));
    if (setupOnly.setup.team[0].item !== "focus-sash") throw new Error("Setup-only save did not preserve planned item");
    if (setupOnly.battle !== null) throw new Error("Setup-only save should not include consumed battle state");
    console.log("Test 2 PASSED: Full battle state save works correctly");
  }

  // Test 3: Invalid battle state is discarded, setup preserved
  {
    const memory2 = new Map();
    const localStorage2 = {
      getItem: (key) => memory2.get(key) ?? null,
      setItem: (key, value) => memory2.set(key, value),
      removeItem: (key) => memory2.delete(key),
    };
    globalThis.localStorage = localStorage2;
    
    // Manually create a corrupted save with invalid battle state
    const corruptedSave = {
      version: 2,
      setup: {
        boss: { pokemon: "mewtwo", baseStats: { hp: 1000, atk: 100, def: 100, spa: 100, spd: 100, spe: 100 }, currentStats: { hp: 1000, atk: 100, def: 100, spa: 100, spd: 100, spe: 100 } },
        bossMoves: [],
        team: Array(6).fill(null),
        selectedSlot: 0,
      },
      battle: {
        battleActive: true,
        // Missing required fields like currentTurn, bossHP, etc.
        // This should be detected as invalid
      }
    };
    localStorage2.setItem(SETUP_STORAGE_KEY, JSON.stringify(corruptedSave));
    
    const state2 = new BattleState();
    const persistence2 = new SetupPersistence(state2);
    await persistence2.load();
    
    if (state2.battleActive) throw new Error("Invalid battle state should not activate");
    if (state2.savedBattleBroken) console.log("Test 3a PASSED: Broken battle state detected");
    if (state2.boss?.name !== "mewtwo") throw new Error("Setup should be preserved despite broken battle");
    console.log("Test 3b PASSED: Setup preserved when battle state is invalid");
  }

  // Test 4: Migration from v1 format
  {
    const memory3 = new Map();
    const localStorage3 = {
      getItem: (key) => memory3.get(key) ?? null,
      setItem: (key, value) => memory3.set(key, value),
      removeItem: (key) => memory3.delete(key),
    };
    globalThis.localStorage = localStorage3;
    
    // Create v1 format save
    const v1Save = {
      version: 1,
      boss: { pokemon: "lugia" },
      team: [{ pokemon: "smeargle" }],
    };
    localStorage3.setItem(SETUP_STORAGE_KEY, JSON.stringify(v1Save));
    
    const state3 = new BattleState();
    const persistence3 = new SetupPersistence(state3);
    await persistence3.load();
    
    if (state3.boss?.name !== "lugia") throw new Error("V1 boss not migrated");
    if (state3.team[0]?.pokemon?.name !== "smeargle") throw new Error("V1 team not migrated");
    console.log("Test 4 PASSED: V1 format migration works");
  }

  persistence.clear();
  if (localStorage.getItem(SETUP_STORAGE_KEY) !== null) throw new Error("Clear failed.");
  
  console.log("All persistence v2 tests passed successfully!");
}

runTests().catch(e => {
  console.error("Test failed:", e);
  process.exit(1);
});
