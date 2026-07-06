import { BattleState } from "../js/core/battle-state.js";
import { calculatePokemonStats } from "../js/core/stats.js";
import { damageRolls } from "../js/core/damage.js";
import { getEffectiveSpeed } from "../js/core/battle-state.js";

console.log("Running Ability Effects Upgrade checks...");

// Helper mock pokemon
const shieldon = {
  name: "shieldon",
  types: [{ type: { name: "rock" } }, { type: { name: "steel" } }],
  abilities: [{ ability: { name: "sturdy" } }],
  moves: [],
  stats: [
    { base_stat: 30, stat: { name: "hp" } },
    { base_stat: 42, stat: { name: "attack" } },
    { base_stat: 118, stat: { name: "defense" } },
    { base_stat: 42, stat: { name: "special-attack" } },
    { base_stat: 88, stat: { name: "special-defense" } },
    { base_stat: 30, stat: { name: "speed" } },
  ]
};

const mewtwo = {
  name: "mewtwo",
  types: [{ type: { name: "psychic" } }],
  abilities: [{ ability: { name: "pressure" } }],
  moves: [],
  stats: [
    { base_stat: 106, stat: { name: "hp" } },
    { base_stat: 110, stat: { name: "attack" } },
    { base_stat: 90, stat: { name: "defense" } },
    { base_stat: 154, stat: { name: "special-attack" } },
    { base_stat: 90, stat: { name: "special-defense" } },
    { base_stat: 130, stat: { name: "speed" } },
  ]
};

const standardAttacker = {
  stats: { hp: 300, atk: 200, def: 200, spa: 200, spd: 200, spe: 200 },
  level: 100,
  item: "",
  ability: ""
};

const standardDefender = {
  stats: { hp: 300, atk: 200, def: 200, spa: 200, spd: 200, spe: 200 },
  maxHp: 300
};

// ----------------------------------------------------
// 1. Huge Power / Pure Power Test
// ----------------------------------------------------
{
  const move = { name: "tackle", power: 40, type: { name: "normal" }, damage_class: { name: "physical" } };
  
  const normalRolls = damageRolls({
    attacker: standardAttacker,
    boss: standardDefender,
    move,
    attackerTypes: ["normal"],
    bossTypes: ["normal"],
    ability: "",
    stages: { hp: 0, atk: 0, def: 0, spa: 0, spd: 0, spe: 0, crit: 0 },
    bossStages: { hp: 0, atk: 0, def: 0, spa: 0, spd: 0, spe: 0, crit: 0 }
  });

  const hugePowerRolls = damageRolls({
    attacker: standardAttacker,
    boss: standardDefender,
    move,
    attackerTypes: ["normal"],
    bossTypes: ["normal"],
    ability: "huge-power",
    stages: { hp: 0, atk: 0, def: 0, spa: 0, spd: 0, spe: 0, crit: 0 },
    bossStages: { hp: 0, atk: 0, def: 0, spa: 0, spd: 0, spe: 0, crit: 0 }
  });

  console.log(`Huge Power Test: Normal Min: ${normalRolls.min}, Huge Power Min: ${hugePowerRolls.min}`);
  if (hugePowerRolls.min <= normalRolls.min * 1.8) {
    throw new Error("Huge Power damage should be approximately double normal physical damage.");
  }
  console.log("Huge Power/Pure Power check PASSED.");
}

// ----------------------------------------------------
// 2. Adaptability Test
// ----------------------------------------------------
{
  const move = { name: "tackle", power: 40, type: { name: "normal" }, damage_class: { name: "physical" } };
  
  const normalSTAB = damageRolls({
    attacker: standardAttacker,
    boss: standardDefender,
    move,
    attackerTypes: ["normal"], // STAB active
    bossTypes: ["ghost"], // immune is 0, let's use normal for 1x
    bossTypes: ["normal"],
    ability: "",
    stages: { hp: 0, atk: 0, def: 0, spa: 0, spd: 0, spe: 0, crit: 0 },
    bossStages: { hp: 0, atk: 0, def: 0, spa: 0, spd: 0, spe: 0, crit: 0 }
  });

  const adaptabilitySTAB = damageRolls({
    attacker: standardAttacker,
    boss: standardDefender,
    move,
    attackerTypes: ["normal"],
    bossTypes: ["normal"],
    ability: "adaptability",
    stages: { hp: 0, atk: 0, def: 0, spa: 0, spd: 0, spe: 0, crit: 0 },
    bossStages: { hp: 0, atk: 0, def: 0, spa: 0, spd: 0, spe: 0, crit: 0 }
  });

  console.log(`Adaptability Test: Normal STAB Min: ${normalSTAB.min}, Adaptability STAB Min: ${adaptabilitySTAB.min}`);
  // STAB is normally 1.5x, Adaptability is 2.0x. Ratio should be 2.0 / 1.5 = 1.33x
  if (adaptabilitySTAB.min < normalSTAB.min * 1.3) {
    throw new Error("Adaptability should increase STAB multiplier to 2.0x.");
  }
  console.log("Adaptability check PASSED.");
}

// ----------------------------------------------------
// 3. Sniper Test
// ----------------------------------------------------
{
  const move = { name: "tackle", power: 40, type: { name: "normal" }, damage_class: { name: "physical" } };
  
  const normalCrit = damageRolls({
    attacker: standardAttacker,
    boss: standardDefender,
    move,
    attackerTypes: ["normal"],
    bossTypes: ["normal"],
    ability: "",
    stages: { hp: 0, atk: 0, def: 0, spa: 0, spd: 0, spe: 0, crit: 0 },
    bossStages: { hp: 0, atk: 0, def: 0, spa: 0, spd: 0, spe: 0, crit: 0 },
    critical: true
  });

  const sniperCrit = damageRolls({
    attacker: standardAttacker,
    boss: standardDefender,
    move,
    attackerTypes: ["normal"],
    bossTypes: ["normal"],
    ability: "sniper",
    stages: { hp: 0, atk: 0, def: 0, spa: 0, spd: 0, spe: 0, crit: 0 },
    bossStages: { hp: 0, atk: 0, def: 0, spa: 0, spd: 0, spe: 0, crit: 0 },
    critical: true
  });

  console.log(`Sniper Test: Normal Crit Min: ${normalCrit.min}, Sniper Crit Min: ${sniperCrit.min}`);
  // normal crit is 1.5x, sniper crit is 2.25x. Ratio should be 2.25 / 1.5 = 1.5x
  if (sniperCrit.min < normalCrit.min * 1.4) {
    throw new Error("Sniper critical hits should deal 2.25x damage instead of 1.5x.");
  }
  console.log("Sniper check PASSED.");
}

// ----------------------------------------------------
// 4. Technician Test
// ----------------------------------------------------
{
  const lowPowerMove = { name: "tackle", power: 40, type: { name: "normal" }, damage_class: { name: "physical" } };
  const highPowerMove = { name: "slam", power: 80, type: { name: "normal" }, damage_class: { name: "physical" } };

  const techLow = damageRolls({
    attacker: standardAttacker,
    boss: standardDefender,
    move: lowPowerMove,
    attackerTypes: [],
    bossTypes: ["normal"],
    ability: "technician",
    stages: { hp: 0, atk: 0, def: 0, spa: 0, spd: 0, spe: 0, crit: 0 },
    bossStages: { hp: 0, atk: 0, def: 0, spa: 0, spd: 0, spe: 0, crit: 0 }
  });

  const normalLow = damageRolls({
    attacker: standardAttacker,
    boss: standardDefender,
    move: lowPowerMove,
    attackerTypes: [],
    bossTypes: ["normal"],
    ability: "",
    stages: { hp: 0, atk: 0, def: 0, spa: 0, spd: 0, spe: 0, crit: 0 },
    bossStages: { hp: 0, atk: 0, def: 0, spa: 0, spd: 0, spe: 0, crit: 0 }
  });

  const techHigh = damageRolls({
    attacker: standardAttacker,
    boss: standardDefender,
    move: highPowerMove,
    attackerTypes: [],
    bossTypes: ["normal"],
    ability: "technician",
    stages: { hp: 0, atk: 0, def: 0, spa: 0, spd: 0, spe: 0, crit: 0 },
    bossStages: { hp: 0, atk: 0, def: 0, spa: 0, spd: 0, spe: 0, crit: 0 }
  });

  const normalHigh = damageRolls({
    attacker: standardAttacker,
    boss: standardDefender,
    move: highPowerMove,
    attackerTypes: [],
    bossTypes: ["normal"],
    ability: "",
    stages: { hp: 0, atk: 0, def: 0, spa: 0, spd: 0, spe: 0, crit: 0 },
    bossStages: { hp: 0, atk: 0, def: 0, spa: 0, spd: 0, spe: 0, crit: 0 }
  });

  console.log(`Technician Low Power Test: Normal Min: ${normalLow.min}, Tech Min: ${techLow.min}`);
  console.log(`Technician High Power Test: Normal Min: ${normalHigh.min}, Tech Min: ${techHigh.min}`);

  if (techLow.min < normalLow.min * 1.4) {
    throw new Error("Technician should boost moves with base power <= 60 by 1.5x.");
  }
  if (techHigh.min !== normalHigh.min) {
    throw new Error("Technician should not boost moves with base power > 60.");
  }
  console.log("Technician check PASSED.");
}

// ----------------------------------------------------
// 5. Filter / Solid Rock / Prism Armor Test
// ----------------------------------------------------
{
  const fireMove = { name: "ember", power: 40, type: { name: "fire" }, damage_class: { name: "special" } };
  // Grass defender takes super-effective damage (2.0x) from fire
  const grassDefender = { stats: { hp: 300, atk: 200, def: 200, spa: 200, spd: 200, spe: 200 }, maxHp: 300 };

  const normalSuper = damageRolls({
    attacker: standardAttacker,
    boss: grassDefender,
    move: fireMove,
    attackerTypes: [],
    bossTypes: ["grass"],
    ability: "",
    defenderAbility: "",
    defenderHP: 300,
    defenderMaxHP: 300,
    stages: { hp: 0, atk: 0, def: 0, spa: 0, spd: 0, spe: 0, crit: 0 },
    bossStages: { hp: 0, atk: 0, def: 0, spa: 0, spd: 0, spe: 0, crit: 0 }
  });

  const filterSuper = damageRolls({
    attacker: standardAttacker,
    boss: grassDefender,
    move: fireMove,
    attackerTypes: [],
    bossTypes: ["grass"],
    ability: "",
    defenderAbility: "filter",
    defenderHP: 300,
    defenderMaxHP: 300,
    stages: { hp: 0, atk: 0, def: 0, spa: 0, spd: 0, spe: 0, crit: 0 },
    bossStages: { hp: 0, atk: 0, def: 0, spa: 0, spd: 0, spe: 0, crit: 0 }
  });

  console.log(`Filter Test: Normal Super-effective: ${normalSuper.min}, Filter Super-effective: ${filterSuper.min}`);
  if (filterSuper.min >= normalSuper.min) {
    throw new Error("Filter should reduce super-effective damage taken.");
  }
  console.log("Filter/Solid Rock/Prism Armor check PASSED.");
}

// ----------------------------------------------------
// 6. Multiscale / Shadow Shield Test
// ----------------------------------------------------
{
  const move = { name: "tackle", power: 40, type: { name: "normal" }, damage_class: { name: "physical" } };

  const normalFullHP = damageRolls({
    attacker: standardAttacker,
    boss: standardDefender,
    move,
    attackerTypes: [],
    bossTypes: ["normal"],
    ability: "",
    defenderAbility: "",
    defenderHP: 300,
    defenderMaxHP: 300,
    stages: { hp: 0, atk: 0, def: 0, spa: 0, spd: 0, spe: 0, crit: 0 },
    bossStages: { hp: 0, atk: 0, def: 0, spa: 0, spd: 0, spe: 0, crit: 0 }
  });

  const multiscaleFullHP = damageRolls({
    attacker: standardAttacker,
    boss: standardDefender,
    move,
    attackerTypes: [],
    bossTypes: ["normal"],
    ability: "",
    defenderAbility: "multiscale",
    defenderHP: 300,
    defenderMaxHP: 300,
    stages: { hp: 0, atk: 0, def: 0, spa: 0, spd: 0, spe: 0, crit: 0 },
    bossStages: { hp: 0, atk: 0, def: 0, spa: 0, spd: 0, spe: 0, crit: 0 }
  });

  const multiscaleLowHP = damageRolls({
    attacker: standardAttacker,
    boss: standardDefender,
    move,
    attackerTypes: [],
    bossTypes: ["normal"],
    ability: "",
    defenderAbility: "multiscale",
    defenderHP: 299,
    defenderMaxHP: 300,
    stages: { hp: 0, atk: 0, def: 0, spa: 0, spd: 0, spe: 0, crit: 0 },
    bossStages: { hp: 0, atk: 0, def: 0, spa: 0, spd: 0, spe: 0, crit: 0 }
  });

  console.log(`Multiscale Test: Normal: ${normalFullHP.min}, Multiscale Full HP: ${multiscaleFullHP.min}, Multiscale Low HP: ${multiscaleLowHP.min}`);
  if (multiscaleFullHP.min > normalFullHP.min * 0.6) {
    throw new Error("Multiscale should halve damage taken at full HP.");
  }
  if (multiscaleLowHP.min !== normalFullHP.min) {
    throw new Error("Multiscale should not activate if defender is below full HP.");
  }
  console.log("Multiscale/Shadow Shield check PASSED.");
}

// ----------------------------------------------------
// 7. Sturdy & Battle Logic Integration Test
// ----------------------------------------------------
async function testSturdyAndUnburden() {
  const state = new BattleState();
  state.team[0].pokemon = shieldon;
  state.team[0].level = 100;
  state.team[0].item = "";
  state.team[0].ability = "sturdy";
  state.team[0].moves = [{ name: "tackle", power: 40, type: { name: "normal" }, damage_class: { name: "physical" } }];
  state.team[0].stats = calculatePokemonStats(shieldon, state.team[0]);

  // Mewtwo stats for test
  const bossStats = calculatePokemonStats(mewtwo, { level: 200, nature: "hardy", ivs: { hp: 31, atk: 31, def: 31, spa: 31, spd: 31, spe: 31 }, evs: { hp: 252, atk: 252, def: 252, spa: 252, spd: 252, spe: 252 } });
  bossStats.hp = 1060000;
  state.setBoss(mewtwo, bossStats);
  state.bossMoves[0] = { name: "close-combat", power: 120, type: { name: "fighting" }, damage_class: { name: "physical" } };

  state.startBattle();

  // Turn 1: Boss attacks Shieldon with Close Combat.
  // Mewtwo's attack will deal lethal damage to Shieldon, which is at full HP.
  // Shieldon has Sturdy, so it should survive at 1 HP.
  state.executeTurn("use-move", 0, 0, "use-move", 0);

  const log1 = state.battleLog[0];
  console.log("T1 Log notes:", log1.notes);

  if (state.teamHP[0] !== 1) {
    throw new Error(`Shieldon should survive at 1 HP using Sturdy. Current HP: ${state.teamHP[0]}`);
  }
  
  const hasSturdyNote = log1.notes.some(n => n.includes("Sturdy activated"));
  if (!hasSturdyNote) {
    throw new Error("Log notes should mention Sturdy activation.");
  }

  // Turn 2: Mewtwo attacks Shieldon again.
  // Since Shieldon is at 1 HP (not full HP), Sturdy should NOT activate and it should faint.
  state.executeTurn("use-move", 0, 0, "use-move", 0);

  const log2 = state.battleLog[1];
  console.log("T2 Log notes:", log2.notes);

  if (state.teamHP[0] !== 0) {
    throw new Error(`Shieldon should faint since it was not at full HP. Current HP: ${state.teamHP[0]}`);
  }
  
  const hasFaintedNote = log2.notes.some(n => n.includes("fainted"));
  if (!hasFaintedNote) {
    throw new Error("Log notes should mention Shieldon fainted.");
  }
  console.log("Sturdy battle check PASSED.");

  // ----------------------------------------------------
  // 8. Mold Breaker Test
  // ----------------------------------------------------
  const state2 = new BattleState();
  state2.team[0].pokemon = shieldon;
  state2.team[0].level = 100;
  state2.team[0].item = "";
  state2.team[0].ability = "sturdy";
  state2.team[0].moves = [{ name: "tackle", power: 40, type: { name: "normal" }, damage_class: { name: "physical" } }];
  state2.team[0].stats = calculatePokemonStats(shieldon, state2.team[0]);
  state2.setBoss(mewtwo, bossStats);
  state2.bossMoves[0] = { name: "close-combat", power: 120, type: { name: "fighting" }, damage_class: { name: "physical" } };
  
  // Set Mewtwo's ability to Mold Breaker
  state2.bossAbility = "mold-breaker";
  
  state2.startBattle();

  // Mewtwo attacks Shieldon with Mold Breaker. Sturdy should be bypassed!
  state2.executeTurn("use-move", 0, 0, "use-move", 0);
  const log3 = state2.battleLog[0];
  console.log("Mold Breaker T1 Log notes:", log3.notes);

  if (state2.teamHP[0] !== 0) {
    throw new Error(`Shieldon should faint because Mewtwo's Mold Breaker ignored Sturdy. Current HP: ${state2.teamHP[0]}`);
  }
  console.log("Mold Breaker battle check PASSED.");

  // ----------------------------------------------------
  // 9. Unburden Test
  // ----------------------------------------------------
  const state3 = new BattleState();
  state3.team[0].pokemon = shieldon;
  state3.team[0].level = 100;
  state3.team[0].item = "focus-sash";
  state3.team[0].ability = "unburden";
  state3.team[0].moves = [{ name: "tackle", power: 40, type: { name: "normal" }, damage_class: { name: "physical" } }];
  state3.team[0].stats = calculatePokemonStats(shieldon, state3.team[0]);
  state3.setBoss(mewtwo, bossStats);
  state3.bossMoves[0] = { name: "close-combat", power: 120, type: { name: "fighting" }, damage_class: { name: "physical" } };

  state3.startBattle();

  const originalSpeed = getEffectiveSpeed({ slotIndex: 0 }, state3);
  console.log("Unburden original speed:", originalSpeed);

  // Take lethal damage to consume Focus Sash
  state3.executeTurn("use-move", 0, 0, "use-move", 0);

  const log4 = state3.battleLog[0];
  console.log("Unburden T1 Log notes:", log4.notes);

  if (state3.teamHP[0] !== 1) {
    throw new Error("Shieldon should survive on Focus Sash.");
  }
  if (state3.team[0].item !== "") {
    throw new Error("Focus Sash should be consumed (cleared).");
  }

  const speedAfterItemConsumed = getEffectiveSpeed({ slotIndex: 0 }, state3);
  console.log("Unburden speed after item consumption:", speedAfterItemConsumed);
  
  if (speedAfterItemConsumed !== originalSpeed * 2) {
    throw new Error(`Unburden did not double the speed. Current: ${speedAfterItemConsumed}, Expected: ${originalSpeed * 2}`);
  }
  console.log("Unburden check PASSED.");
}

testSturdyAndUnburden().then(() => {
  console.log("All ability checks passed successfully!");
}).catch(e => {
  console.error("Test failed:", e);
  process.exit(1);
});
