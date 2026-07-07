import { copyText, displayName, fallbackSprite, spriteUrl, titleCase, getBossDisplayName } from "../utils/format.js";
import { compactNumber } from "../utils/format.js";
import { getAbilityOverride, getEffectiveAbility, getEffectiveSpeed } from "../core/battle-state.js";
import { ABILITY_EFFECTS } from "../data/ability-effects.js";
import { applyStage } from "../core/stages.js";

function getBossTooltipHTML(state) {
  const boss = state.boss;
  if (!boss) return "";
  
  const originalTypes = boss.types.map(({ type }) => type.name).join(" / ");
  const currentTypes = state.bossCurrentTypes.join(" / ");
  
  const statsKeys = ["atk", "def", "spa", "spd", "spe"];
  const stages = state.bossStages;

  const bossAbility = state.bossAbility || "";
  const bossAbilityOverride = getAbilityOverride({ isBoss: true }, state);
  const effectiveBossAbility = getEffectiveAbility({ isBoss: true }, state);
  const effect = ABILITY_EFFECTS[effectiveBossAbility];
  let abilityInfoHTML = "";
  if (bossAbility || effectiveBossAbility) {
    const name = effect ? effect.name : titleCase(effectiveBossAbility || bossAbility);
    const status = effect ? effect.status : "Display Only";
    const description = effect ? effect.description : "No special battle effect.";
    
    // Check if currently active:
    let isActive = "Yes";
    if (effectiveBossAbility === "sturdy" || effectiveBossAbility === "multiscale" || effectiveBossAbility === "shadow-shield") {
      isActive = (state.bossHP === state.bossMaxHP) ? "Yes" : "No";
    }
    
    abilityInfoHTML = `
      <div style="margin-top: 8px; border-top: 1px solid var(--border-soft); padding-top: 6px; font-size: 9px; line-height: 1.3;">
        <strong>Original Ability:</strong> ${bossAbility ? titleCase(bossAbility) : "None"}<br>
        <strong>Current Ability:</strong> ${name}<br>
        ${bossAbilityOverride ? `<strong>Changed by:</strong> Simple Beam<br>` : ""}
        <strong>Status:</strong> <span style="color: ${status === 'Implemented' ? 'var(--success)' : (status === 'TODO' ? 'var(--danger)' : 'var(--amber)')}; font-weight:800;">${status}</span><br>
        <strong>Effect:</strong> ${description}<br>
        <strong>Currently active:</strong> ${isActive}
      </div>
    `;
  } else {
    abilityInfoHTML = `
      <div style="margin-top: 8px; border-top: 1px solid var(--border-soft); padding-top: 6px; font-size: 9px; line-height: 1.3; color: var(--faint);">
        <strong>Ability:</strong> None
      </div>
    `;
  }

  return `
    <div class="stat-tooltip" style="text-align: left;">
      <h4>${getBossDisplayName(state)} — Boss Stats</h4>
      <div style="margin-bottom: 6px; line-height: 1.3;">
        <strong>HP:</strong> ${state.bossHP.toLocaleString()} / ${state.bossMaxHP.toLocaleString()}<br>
        <strong>Types:</strong><br>
        <span style="font-size: 9px; color: var(--muted);">Original: ${originalTypes}</span><br>
        <span style="font-size: 10px; color: var(--cyan); font-weight: 800;">Current: ${currentTypes}</span>
      </div>
      
      <table style="width: 100%; font-size: 10px; margin-bottom: 8px; border-collapse: collapse; min-width: 0;">
        <thead>
          <tr style="border-bottom: 1px solid var(--border-soft); text-align: left; font-size: 8px; color: var(--faint);">
            <th style="padding: 2px;">Stat</th>
            <th style="padding: 2px;">Orig</th>
            <th style="padding: 2px;">Stage</th>
            <th style="padding: 2px;">Eff</th>
          </tr>
        </thead>
        <tbody>
          ${statsKeys.map(k => {
            const orig = state.bossOriginalStats ? state.bossOriginalStats[k] : (state.bossStats ? state.bossStats[k] : 0);
            const effVal = (k === "spe")
              ? getEffectiveSpeed({ isBoss: true, name: boss.name }, state)
              : (state.bossCurrentStats ? state.bossCurrentStats[k] : (state.bossStats ? state.bossStats[k] : 0));
            const stage = stages[k] || 0;
            const sign = stage >= 0 ? `+${stage}` : `${stage}`;
            const eff = (k === "spe") ? effVal : applyStage(effVal, stage);
            return `
              <tr style="border-bottom: 1px dashed rgba(255,255,255,0.05);">
                <td style="padding: 2px;"><strong>${k.toUpperCase()}</strong></td>
                <td style="padding: 2px;">${orig}</td>
                <td style="padding: 2px; color: ${stage > 0 ? 'var(--success)' : stage < 0 ? 'var(--danger)' : 'var(--muted)'};">${sign}</td>
                <td style="padding: 2px;"><strong style="color: var(--amber);">${eff}</strong></td>
              </tr>
            `;
          }).join("")}
        </tbody>
      </table>
      
      <div style="font-size: 9px; line-height: 1.3;">
        <strong>Stat Modifiers:</strong><br>
        ${statsKeys.map(k => {
          const sources = state.bossStatSources ? state.bossStatSources[k] : [];
          if (!sources || sources.length <= 1) return "";
          return `<div style="color: var(--muted); margin-bottom: 2px;">• <strong>${k.toUpperCase()}:</strong> ${sources.slice(1).join(", ")}</div>`;
        }).filter(Boolean).join("") || "<span style='color: var(--faint);'>None</span>"}
      </div>

      <div style="font-size: 9px; line-height: 1.3; margin-top: 6px;">
        <strong>Stage Modifiers:</strong><br>
        ${statsKeys.map(k => {
          const stage = stages[k] || 0;
          if (stage === 0) return "";
          const sign = stage >= 0 ? `+${stage}` : `${stage}`;
          let note = "";
          if (k === "def" && stage < 0) note = " (Defense stage changed by Screech/debuffs)";
          if (k === "spd" && stage < 0) note = " (Sp. Defense stage changed by debuffs)";
          if (k === "atk" && stage < 0) note = " (Attack stage changed by debuffs)";
          if (k === "spe" && stage < 0) note = " (Speed stage changed by debuffs)";
          return `<div style="color: var(--muted); margin-bottom: 2px;">• <strong>${k.toUpperCase()}:</strong> ${sign}${note}</div>`;
        }).filter(Boolean).join("") || "<span style='color: var(--faint);'>None</span>"}
      </div>
      ${abilityInfoHTML}
    </div>
  `;
}

function getPlayerTooltipHTML(state) {
  const activeMon = state.team[state.activeSlot];
  if (!activeMon || !activeMon.pokemon) return "";
  
  const originalTypes = activeMon.pokemon.types.map(({ type }) => type.name).join(" / ");
  const currentTypes = state.teamCurrentTypes[state.activeSlot].join(" / ");
  
  const statsKeys = ["atk", "def", "spa", "spd", "spe"];
  const stages = state.teamStages[state.activeSlot];

  const playerAbility = activeMon.ability || "";
  const playerAbilityOverride = getAbilityOverride({ slotIndex: state.activeSlot, isBoss: false }, state);
  const effectivePlayerAbility = getEffectiveAbility({ slotIndex: state.activeSlot, isBoss: false }, state);
  const effect = ABILITY_EFFECTS[effectivePlayerAbility];
  let abilityInfoHTML = "";
  if (playerAbility || effectivePlayerAbility) {
    const name = effect ? effect.name : titleCase(effectivePlayerAbility || playerAbility);
    const status = effect ? effect.status : "Display Only";
    const description = effect ? effect.description : "No special battle effect.";
    
    // Check if currently active:
    let isActive = "Yes";
    if (effectivePlayerAbility === "sturdy" || effectivePlayerAbility === "multiscale" || effectivePlayerAbility === "shadow-shield") {
      const currentHP = state.teamHP[state.activeSlot];
      const maxHP = activeMon.stats.hp;
      isActive = (currentHP > 0 && currentHP === maxHP) ? "Yes" : "No";
    } else if (effectivePlayerAbility === "unburden") {
      isActive = state.consumedItems.player[state.activeSlot] ? "Yes" : "No";
    }
    
    abilityInfoHTML = `
      <div style="margin-top: 8px; border-top: 1px solid var(--border-soft); padding-top: 6px; font-size: 9px; line-height: 1.3;">
        <strong>Original Ability:</strong> ${playerAbility ? titleCase(playerAbility) : "None"}<br>
        <strong>Current Ability:</strong> ${name}<br>
        ${playerAbilityOverride ? `<strong>Changed by:</strong> Simple Beam<br>` : ""}
        <strong>Status:</strong> <span style="color: ${status === 'Implemented' ? 'var(--success)' : (status === 'TODO' ? 'var(--danger)' : 'var(--amber)')}; font-weight:800;">${status}</span><br>
        <strong>Effect:</strong> ${description}<br>
        <strong>Currently active:</strong> ${isActive}
      </div>
    `;
  } else {
    abilityInfoHTML = `
      <div style="margin-top: 8px; border-top: 1px solid var(--border-soft); padding-top: 6px; font-size: 9px; line-height: 1.3; color: var(--faint);">
        <strong>Ability:</strong> None
      </div>
    `;
  }

  return `
    <div class="stat-tooltip" style="text-align: left;">
      <h4>${displayName(activeMon.pokemon.name)} — Stats</h4>
      <div style="margin-bottom: 6px; line-height: 1.3;">
        <strong>HP:</strong> ${state.teamHP[state.activeSlot]} / ${activeMon.stats.hp}<br>
        <strong>Types:</strong><br>
        <span style="font-size: 9px; color: var(--muted);">Original: ${originalTypes}</span><br>
        <span style="font-size: 10px; color: var(--cyan); font-weight: 800;">Current: ${currentTypes}</span>
      </div>
      
      <table style="width: 100%; font-size: 10px; margin-bottom: 8px; border-collapse: collapse; min-width: 0;">
        <thead>
          <tr style="border-bottom: 1px solid var(--border-soft); text-align: left; font-size: 8px; color: var(--faint);">
            <th style="padding: 2px;">Stat</th>
            <th style="padding: 2px;">Orig</th>
            <th style="padding: 2px;">Stage</th>
            <th style="padding: 2px;">Eff</th>
          </tr>
        </thead>
        <tbody>
          ${statsKeys.map(k => {
            const orig = activeMon.originalStats ? activeMon.originalStats[k] : activeMon.stats[k];
            const effVal = (k === "spe")
              ? getEffectiveSpeed({ slotIndex: state.activeSlot, item: activeMon.item, isBoss: false, name: activeMon.pokemon.name }, state)
              : (activeMon.currentStats ? activeMon.currentStats[k] : activeMon.stats[k]);
            const stage = stages[k] || 0;
            const sign = stage >= 0 ? `+${stage}` : `${stage}`;
            const eff = (k === "spe") ? effVal : applyStage(effVal, stage);
            return `
              <tr style="border-bottom: 1px dashed rgba(255,255,255,0.05);">
                <td style="padding: 2px;"><strong>${k.toUpperCase()}</strong></td>
                <td style="padding: 2px;">${orig}</td>
                <td style="padding: 2px; color: ${stage > 0 ? 'var(--success)' : stage < 0 ? 'var(--danger)' : 'var(--muted)'};">${sign}</td>
                <td style="padding: 2px;"><strong style="color: var(--amber);">${eff}</strong></td>
              </tr>
            `;
          }).join("")}
        </tbody>
      </table>
      
      <div style="font-size: 9px; line-height: 1.3;">
        <strong>Stat Modifiers:</strong><br>
        ${statsKeys.map(k => {
          const sources = activeMon.statSources ? activeMon.statSources[k] : [];
          if (!sources || sources.length <= 1) return "";
          return `<div style="color: var(--muted); margin-bottom: 2px;">• <strong>${k.toUpperCase()}:</strong> ${sources.slice(1).join(", ")}</div>`;
        }).filter(Boolean).join("") || "<span style='color: var(--faint);'>None</span>"}
      </div>

      <div style="font-size: 9px; line-height: 1.3; margin-top: 6px;">
        <strong>Stage Modifiers:</strong><br>
        ${statsKeys.map(k => {
          const stage = stages[k] || 0;
          if (stage === 0) return "";
          const sign = stage >= 0 ? `+${stage}` : `${stage}`;
          let note = "";
          if (k === "def" && stage < 0) note = " (Defense stage changed by Screech/debuffs)";
          if (k === "spd" && stage < 0) note = " (Sp. Defense stage changed by debuffs)";
          if (k === "atk" && stage < 0) note = " (Attack stage changed by debuffs)";
          if (k === "atk" && stage === 6) note = " (maximized by Belly Drum)";
          if (k === "spe" && stage < 0) note = " (Speed stage changed by debuffs)";
          return `<div style="color: var(--muted); margin-bottom: 2px;">• <strong>${k.toUpperCase()}:</strong> ${sign}${note}</div>`;
        }).filter(Boolean).join("") || "<span style='color: var(--faint);'>None</span>"}
      </div>
      ${abilityInfoHTML}
    </div>
  `;
}

function formatBattleLogTurnHTML(log, state) {
  const bossName = getBossDisplayName(state);
  let html = `<div class="battle-chat-turn">`;
  html += `<div class="chat-turn-title">Turn ${log.turn}</div>`;

  const messagesToRender = Array.isArray(log.messages)
    ? log.messages
    : (Array.isArray(log.notes) ? log.notes.map(note => {
        let clean = note.trim();
        // Fallback name plate styling
        if (clean.includes("fainted!")) {
          const namePart = clean.replace(" fainted!", "");
          if (namePart.toLowerCase() === state.boss?.name?.toLowerCase() || namePart.toLowerCase() === state.manualBossName?.toLowerCase()) {
            return `The opposing <strong>${bossName}</strong> fainted!`;
          } else {
            return `<strong>${displayName(namePart)}</strong> fainted!`;
          }
        }
        if (clean.includes("terastallized into the")) return clean;
        if (clean.includes("Sturdy activated!")) {
          const namePart = clean.replace("'s Sturdy activated!", "");
          return `<strong>${displayName(namePart)}</strong>'s Sturdy activated!`;
        }
        if (clean.includes("endured the hit")) {
          const namePart = clean.replace(" endured the hit with 1 HP.", "");
          return `<strong>${displayName(namePart)}</strong> endured the hit with 1 HP.`;
        }
        if (clean.includes("hung on using its Focus Sash")) {
          const namePart = clean.replace(" hung on using its Focus Sash!", "");
          return `<strong>${displayName(namePart)}</strong> hung on using its Focus Sash!`;
        }
        let finalNote = clean;
        if (finalNote.includes("Mewtwo")) {
          finalNote = finalNote.replaceAll("Mewtwo", bossName);
        }
        return finalNote;
      }) : []);

  messagesToRender.forEach((msg) => {
    let cssClass = "chat-narration-line";
    const plainText = msg.replace(/<\/?strong>/g, "").replace(/<\/?span[^>]*>/g, "").toLowerCase();
    
    if (plainText.includes("fainted!")) {
      cssClass = "chat-faint-line";
    } else if (plainText.includes("activated!") || plainText.includes("restored hp") || plainText.includes("ate its") || plainText.includes("terastallized") || plainText.includes("swapped speed")) {
      cssClass = "chat-modifier-line";
    } else if (plainText.includes("super effective") || plainText.includes("not very effective") || plainText.includes("doesn't affect")) {
      cssClass = "chat-effective-line";
    } else if (plainText.includes("used") && plainText.includes("opposing")) {
      cssClass = "chat-boss-msg";
    } else if (plainText.includes("used")) {
      cssClass = "chat-player-msg";
    }
    
    html += `<p class="${cssClass}" style="margin: 3px 0;">${msg}</p>`;
  });

  // Collapsible [Damage details] box
  if (log.playerDamageDetails || log.bossDamageDetails) {
    html += `<details style="margin: 6px 0 6px 0;">`;
    html += `<summary class="chat-details-summary" style="margin:0; cursor:pointer; color:var(--cyan); font-size:10px; font-weight:800; outline:none; user-select:none;">[Damage details]</summary>`;
    html += `<div class="chat-details-box" style="margin-top: 4px; padding: 6px; border: 1px solid var(--border-soft); border-radius: 4px; background: var(--bg-card); font-size: 10px; line-height: 1.45; color: var(--muted);">`;

    const printDetails = (details, label) => {
      const rollPercent = Math.round(details.rollPercent * 100);
      const modeLabel = details.rollMode === "random" ? "" : ` (${titleCase(details.rollMode)} Roll)`;
      
      let out = `<div style="margin-bottom: 6px; border-bottom: 1px dashed rgba(255,255,255,0.05); padding-bottom: 4px;">`;
      out += `<strong style="color:var(--text);">${label} Details:</strong><br>`;
      out += `• Damage: <strong>${details.damage.toLocaleString()}</strong><br>`;
      out += `• Range: ${details.minDamage.toLocaleString()}–${details.maxDamage.toLocaleString()} · Roll: ${rollPercent}%${modeLabel}<br>`;
      out += `• Power: ${details.usedPower}<br>`;
      out += `• STAB: ${details.stab.toFixed(2)}x<br>`;
      out += `• Type effectiveness: ${details.effectiveness}x<br>`;
      out += `• Critical hit multiplier: ${details.criticalModifier.toFixed(2)}x<br>`;
      out += `• Attack stat used: ${details.attackStat} (Base power: ${details.originalPower})<br>`;
      out += `• Defense stat used: ${details.defenseStat}<br>`;
      out += `• Base damage: ${details.baseDamageBeforeModifier}<br>`;
      out += `• Item multiplier: ${(details.itemFinalModifier || 1.0).toFixed(2)}x (Stat mod: ${(details.attackStatModifier || 1.0).toFixed(2)}x)<br>`;
      out += `• Ability/Other multiplier: ${(details.otherModifiers || 1.0).toFixed(2)}x<br>`;
      out += `• Burn multiplier: ${(details.burnModifier || 1.0).toFixed(2)}x<br>`;
      out += `</div>`;
      return out;
    };

    if (log.playerDamageDetails) {
      html += printDetails(log.playerDamageDetails, displayName(log.playerDamageDetails.attackerName));
    }
    if (log.bossDamageDetails) {
      html += printDetails(log.bossDamageDetails, bossName);
    }

    html += `</div></details>`;
  }

  html += `</div>`;
  return html;
}

export class BattleScene {
  constructor(root, state, simulator) {
    this.root = root;
    this.state = state;
    this.simulator = simulator;
    this.busy = false;
    this.lastAnimatedTurn = 0;

    // UI Battle Pending Actions State
    this.selectedMoveIndex = 0;
    this.playerAction = "use-move";
    this.selectedSwitchSlot = 0;
    this.batonPassSelecting = false;
    this.bossAction = "random-move";
    this.bossMoveIndex = 0;

    this.render();
  }

  controlsLocked() {
    return this.busy || this.state.isResolvingTurn;
  }

  render() {
    const boss = this.state.boss;
    const isBattle = this.state.battleActive;
    const controlsLocked = this.controlsLocked();
    
    let formulaModalHTML = "";
    if (this.showFormulaPanel) {
      formulaModalHTML = `
        <div id="formula-modal-overlay" style="position:fixed; top:0; left:0; width:100%; height:100%; background:rgba(0,0,0,0.7); display:flex; justify-content:center; align-items:center; z-index:9999; backdrop-filter:blur(3px);">
          <div style="background:var(--bg-elevated); border:1px solid var(--border-soft); border-radius:8px; padding:20px; max-width:480px; width:90%; position:relative; box-shadow:0 10px 25px rgba(0,0,0,0.5);">
            <button type="button" id="close-formula-modal-btn" style="position:absolute; top:12px; right:12px; background:none; border:none; color:var(--muted); font-size:16px; cursor:pointer;">&times;</button>
            <h3 style="margin:0 0 12px 0; color:var(--cyan); font-size:14px; font-weight:800; border-bottom:1px solid var(--border-soft); padding-bottom:6px;">Damage Formula Info</h3>
            
            <div style="font-family:var(--font-mono, monospace); font-size:10px; background:var(--bg-card); border:1px solid var(--border); padding:10px; border-radius:4px; margin-bottom:12px; color:var(--text); white-space:pre-wrap; line-height:1.4;">baseDamage = floor(floor(floor((floor(2L/5 + 2) × Power × A / D) / 50) + 2))

Damage = floor(baseDamage × Modifier)

Modifier = Critical × Random × STAB × TypeEffectiveness × Burn × Other</div>

            <div style="font-size:11px; display:grid; gap:4px; line-height:1.4; max-height:240px; overflow-y:auto; padding-right:4px;">
              <div><strong>L</strong> = attacker level</div>
              <div><strong>Power</strong> = move base power or custom power</div>
              <div><strong>A</strong> = final attacking stat after nature, stages, abilities, and items</div>
              <div><strong>D</strong> = final defending stat after nature, stages, split effects, abilities, and items</div>
              <div><strong>Random</strong> = one of 16 rolls from 0.85 to 1.00</div>
              <div><strong>STAB</strong> = 1.5 normally, 2.0 with Adaptability</div>
              <div><strong>Critical</strong> = 1.5 normally, 2.25 with Sniper</div>
            </div>
            
            <button type="button" id="close-formula-modal-btn-ok" class="button" style="margin-top:16px; width:100%; min-height:32px; cursor:pointer; background:var(--cyan); color:black; border:none; font-weight:800; border-radius:4px;">Close</button>
          </div>
        </div>
      `;
    }
    
    // Resolve active Pokémon build & stats
    const lastLog = this.state.battleLog.at(-1);
    const hasUnanimatedLog = isBattle && lastLog && lastLog.turn > this.lastAnimatedTurn;
    
    let activeSlot = this.state.activeSlot;
    let activeBuild = this.state.team[activeSlot];
    let playerHp = activeBuild?.pokemon ? this.state.teamHP[activeSlot] : 0;
    let playerMaxHp = activeBuild?.pokemon ? activeBuild.stats.hp : 1;
    let bossHp = this.state.bossHP;
    let bossMaxHp = this.state.bossMaxHP || 1;
    let playerTypes = activeBuild?.pokemon ? this.state.teamCurrentTypes[activeSlot] : [];
    let bossTypes = this.state.bossCurrentTypes || [];

    if (hasUnanimatedLog && this.state.history.length > 0) {
      const snapshot = this.state.history.at(-1);
      const oldActiveSlot = snapshot.activeSlot;
      activeSlot = oldActiveSlot;
      activeBuild = this.state.team[oldActiveSlot];
      playerHp = snapshot.teamHP[oldActiveSlot] ?? playerHp;
      playerMaxHp = activeBuild?.pokemon ? activeBuild.stats.hp : 1;
      bossHp = snapshot.bossHP ?? bossHp;
      bossMaxHp = snapshot.bossMaxHP ?? bossMaxHp;
      playerTypes = snapshot.teamCurrentTypes[oldActiveSlot] ?? playerTypes;
      bossTypes = snapshot.bossCurrentTypes ?? bossTypes;
    }

    const playerHpPercent = Math.max(0, (playerHp / playerMaxHp) * 100);
    const bossHpPercent = Math.max(0, (bossHp / bossMaxHp) * 100);
    const isFainted = playerHp <= 0;

    // Setup simulator panel if battle is not active
    if (!isBattle) {
      let maxHp = this.state.bossBaseStats?.hp || 1;
      let hp = maxHp;
      let hpPercent = 100;
      let currentTurnLabel = "Awaiting battle";
      let calloutAction = "Setup phase";
      let calloutDetail = "Press Start Battle in setup panel to begin";

      const row = this.state.results.at(-1);
      activeBuild = row ? this.state.team[row.slot] : this.state.team[0];
      hp = row?.hp ?? maxHp;
      hpPercent = Math.max(0, (hp / maxHp) * 100);
      if (row) {
        currentTurnLabel = `Turn ${row.turn}`;
        calloutAction = titleCase(row.action);
        calloutDetail = `${row.normalLabel} damage`;
      }

      this.root.innerHTML = `
        <section class="battle-module" aria-labelledby="battle-title" style="padding: 15px;">
          <div class="battle-toolbar" style="margin-bottom: 12px;">
            <div><span class="eyebrow">Live visualization</span><h2 id="battle-title">Battle field</h2></div>
            <div class="battle-actions" style="display:flex; gap:8px;">
              <button type="button" class="button primary" id="simulate-all">▶ Simulate all</button>
              <button type="button" class="button" id="step-turn">Step turn</button>
              <button type="button" class="button" id="reset-battle">Reset</button>
              <button type="button" class="button" id="copy-summary">Copy summary</button>
            </div>
          </div>
          <div class="battlefield">
            <div class="arena-grid" aria-hidden="true"></div>
            <div class="combatant attacker ${activeBuild?.pokemon ? "" : "empty"}">
              <div class="nameplate"><span>${activeBuild?.pokemon ? displayName(activeBuild.pokemon.name) : "No attacker"}</span><small>${currentTurnLabel}</small></div>
              ${activeBuild?.pokemon ? `<img id="attacker-sprite" src="${spriteUrl(activeBuild.pokemon.name)}" data-fallback="${fallbackSprite(activeBuild.pokemon)}" alt="${displayName(activeBuild.pokemon.name)}">` : `<div class="sprite-placeholder">?</div>`}
            </div>
            <div class="battle-callout" id="battle-callout"><strong>${calloutAction}</strong><span>${calloutDetail}</span></div>
            <div class="combatant defender">
              <div class="boss-health">
                <div><strong>${boss ? displayName(boss.name) : "Loading boss"}</strong><span>${hp.toLocaleString()} / ${maxHp.toLocaleString()}</span></div>
                <div class="hp-track"><span style="width:${hpPercent}%"></span></div>
              </div>
              ${boss ? `<img id="boss-sprite" src="${spriteUrl(boss.name)}" data-fallback="${fallbackSprite(boss)}" alt="${displayName(boss.name)}">` : ""}
            </div>
            <div class="damage-float" id="damage-float"></div>
          </div>
        </section>`;
      
      this.bindSetupControls();
      return;
    }

    // Showdown Live Battle UI
    const bossMoves = this.state.bossMoves.filter(Boolean);

    // Build Team Party HTML
    const partyButtonsHTML = this.state.team.map((slot, idx) => {
      if (!slot.pokemon) {
        return `<div style="border:1px dashed var(--border-soft); border-radius:6px; display:grid; place-items:center; height:50px; color:var(--faint); font-size:16px;">?</div>`;
      }
      const hpVal = this.state.teamHP[idx];
      const maxVal = slot.stats.hp;
      const isFainted = hpVal <= 0;
      const isActive = idx === activeSlot;
      const pct = Math.max(0, (hpVal / maxVal) * 100);
      
      let borderStyle = "1px solid var(--border-soft)";
      let bgStyle = "var(--bg-card)";
      let opacity = "1";
      if (isActive) {
        borderStyle = "2px solid var(--cyan)";
        bgStyle = "rgba(82,211,230,0.1)";
      } else if (isFainted) {
        borderStyle = "1px solid rgba(239, 68, 68, 0.4)";
        bgStyle = "rgba(239, 68, 68, 0.05)";
        opacity = "0.6";
      }
      const isUnavailable = controlsLocked
        || (!this.state.awaitingForcedSwitch && (isActive || isFainted))
        || (this.state.awaitingForcedSwitch && isFainted);

      return `
        <button type="button" class="party-member-btn" data-slot="${idx}" aria-label="Select ${displayName(slot.pokemon.name)}" ${isUnavailable ? "disabled" : ""} style="width:100%; border:${borderStyle}; background:${bgStyle}; opacity:${opacity}; padding:6px; border-radius:6px; cursor:pointer; text-align:left; display:flex; gap:6px; align-items:center; min-height:48px; position:relative; user-select:none;">
          <img src="${spriteUrl(slot.pokemon.name)}" data-fallback="${fallbackSprite(slot.pokemon)}" alt="" style="width:28px; height:28px; object-fit:contain;">
          <div style="flex:1; min-width:0; display:grid; line-height:1.2;">
            <strong style="font-size:10px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; color:${isFainted ? 'var(--danger)' : 'var(--text)'};">${displayName(slot.pokemon.name)}</strong>
            <span style="font-size:8px; color:var(--faint); overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${slot.item ? titleCase(slot.item) : "No item"}</span>
            <div style="height:3px; background:#311c25; border-radius:1px; overflow:hidden; margin-top:2px;">
              <div style="width:${pct}%; height:100%; background:${isFainted ? 'var(--danger)' : 'var(--success)'};"></div>
            </div>
          </div>
          ${isFainted ? `<span style="position:absolute; top:2px; right:4px; font-size:7px; font-weight:900; color:var(--danger); background:rgba(0,0,0,0.7); padding:1px 3px; border-radius:3px;">FNT</span>` : ""}
          ${isActive ? `<span style="position:absolute; top:2px; right:4px; font-size:7px; font-weight:900; color:var(--cyan); background:rgba(0,0,0,0.7); padding:1px 3px; border-radius:3px;">ACT</span>` : ""}
        </button>
      `;
    }).join("");

    // Build Command Panel HTML
    let commandPanelHTML = "";
    if (this.state.needsResume) {
      commandPanelHTML = `
        <div class="battle-resume-prompt" style="text-align:center; padding:15px; border-radius:6px; background:rgba(82,211,230,0.05); border:1px solid rgba(82,211,230,0.2);">
          <strong style="color:var(--cyan); font-size:12px; display:block; margin-bottom:4px;">Saved Battle Found</strong>
          <span style="font-size:11px; color:var(--muted);">Continue from your saved turn and party state.</span>
          <button type="button" id="resume-battle-btn" class="button primary" ${controlsLocked ? "disabled" : ""}>Resume Battle</button>
        </div>
      `;
    } else if (this.state.awaitingForcedSwitch) {
      commandPanelHTML = `
        <div style="text-align:center; padding:15px; border-radius:6px;">
          <strong style="color:var(--danger); font-size:13px; display:block; margin-bottom:4px;">${displayName(activeBuild.pokemon.name)} fainted!</strong>
          <span style="font-size:11px; color:var(--muted);">Choose your next Pokémon from your team buttons above.</span>
        </div>
      `;
    } else if (this.batonPassSelecting) {
      commandPanelHTML = `
        <div>
          <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px;">
            <strong style="color:var(--cyan); font-size:12px;">Baton Pass: Choose a receiver</strong>
            <button type="button" id="cancel-baton-pass-btn" ${controlsLocked ? "disabled" : ""} style="font-size:9px; padding:2px 6px; cursor:pointer; background:var(--surface-2); color:var(--text); border:1px solid var(--border); border-radius:3px;">Cancel</button>
          </div>
          <span style="font-size:11px; color:var(--muted); display:block; margin-bottom:6px;">Select which Pokémon will inherit stat stages:</span>
          <div style="display:grid; grid-template-columns: repeat(3, 1fr); gap:6px;">
            ${this.state.team.map((slot, idx) => {
              if (idx === activeSlot || !slot.pokemon || this.state.teamHP[idx] <= 0) return "";
              return `<button type="button" class="baton-target-btn" data-slot="${idx}" ${controlsLocked ? "disabled" : ""} style="font-size:10px; padding:6px; cursor:pointer; background:var(--surface-3); border:1px solid var(--border); border-radius:4px; color:var(--text);">${displayName(slot.pokemon.name)}</button>`;
            }).join("")}
          </div>
        </div>
      `;
    } else if (this.playerAction === "switch") {
      const targetMon = this.state.team[this.selectedSwitchSlot];
      commandPanelHTML = `
        <div style="display:flex; justify-content:space-between; align-items:center; padding:6px;">
          <div>
            <span style="font-size:9px; color:var(--muted); display:block; text-transform:uppercase; font-weight:800;">Pending Action</span>
            <strong style="font-size:12px; color:var(--cyan);">Switch to ${targetMon ? displayName(targetMon.pokemon.name) : "Slot " + (this.selectedSwitchSlot + 1)}</strong>
          </div>
          <button type="button" id="cancel-switch-btn" class="button" ${controlsLocked ? "disabled" : ""} style="font-size:11px; padding:4px 10px; cursor:pointer;">Cancel Switch</button>
        </div>
      `;
    } else {
      const moves = activeBuild ? activeBuild.moves : [null, null, null, null];
      
      // If active Pokémon is fainted, don't show move buttons
      if (isFainted) {
        commandPanelHTML = `
          <div style="text-align:center; padding:15px; border-radius:6px;">
            <strong style="color:var(--danger); font-size:13px; display:block; margin-bottom:4px;">${displayName(activeBuild.pokemon.name)} fainted!</strong>
            <span style="font-size:11px; color:var(--muted);">Choose your next Pokémon from your team buttons above.</span>
          </div>
        `;
      } else {
        const itemSlug = (activeBuild.item || "").toLowerCase().replaceAll(" ", "-");
        const hasNormaliumZ = itemSlug === "normalium-z";
        const hasBellyDrum = moves.some((m) => m && m.name === "belly-drum");
        const zMoveUnused = !this.state.zMoveUsed.player[activeSlot];
        
        let zMoveButtonHTML = "";
        if (hasNormaliumZ && hasBellyDrum) {
          if (zMoveUnused) {
            zMoveButtonHTML = `
              <div style="margin-top: 10px; border-top: 1px solid var(--border-soft); padding-top: 10px;">
                <button type="button" id="z-move-btn" ${controlsLocked ? "disabled" : ""} style="width: 100%; border:1px solid var(--border-soft); background:var(--surface-3); border-radius:6px; padding:8px 10px; cursor:pointer; text-align:left; display:flex; flex-direction:column; justify-content:space-between; min-height:48px; color:var(--text); transition:all 0.15s ease;">
                  <div style="display:flex; justify-content:space-between; width:100%; align-items:center;">
                    <strong style="font-size:11px; color:#c084fc;">[Z-Belly Drum]</strong>
                    <span class="type-badge type-normal" style="padding:1px 3px; font-size:7px;">normal</span>
                  </div>
                  <div style="display:flex; justify-content:space-between; width:100%; font-size:9px; color:var(--muted); margin-top:2px;">
                    <span>Normalium Z | Status</span>
                    <span>Restores HP, then Belly Drum</span>
                  </div>
                </button>
              </div>
            `;
          } else {
            zMoveButtonHTML = `
              <div style="margin-top: 10px; border-top: 1px solid var(--border-soft); padding-top: 10px; text-align: center;">
                <small style="color: var(--muted); font-size: 10px; font-style: italic;">Z-Move used</small>
              </div>
            `;
          }
        }

        commandPanelHTML = `
          <div>
            <span style="font-size:11px; color:var(--muted); display:block; margin-bottom:6px;">What will <strong>${displayName(activeBuild.pokemon.name)}</strong> do?</span>
            <div style="display:grid; grid-template-columns:1fr 1fr; gap:8px;">
              ${[0, 1, 2, 3].map((idx) => {
                const m = moves[idx];
                if (!m) {
                  return `<button type="button" class="button" style="min-height:48px; opacity:0.3; pointer-events:none;" disabled>(No Move)</button>`;
                }
                const isSelected = this.playerAction === "use-move" && this.selectedMoveIndex === idx;
                const isBatonPass = m.name === "baton-pass";
                const customPower = m.customPower ?? m.basePower ?? m.power ?? null;
                
                let borderStyle = isSelected ? "2px solid var(--cyan)" : "1px solid var(--border-soft)";
                let bgStyle = isSelected ? "rgba(82,211,230,0.15)" : "var(--surface-3)";
  
                return `
                  <button type="button" class="move-btn" data-move-idx="${idx}" data-baton-pass="${isBatonPass}" ${controlsLocked ? "disabled" : ""} style="border:${borderStyle}; background:${bgStyle}; border-radius:6px; padding:6px 10px; cursor:pointer; text-align:left; display:flex; flex-direction:column; justify-content:space-between; min-height:48px; color:var(--text); transition:all 0.15s ease;">
                    <div style="display:flex; justify-content:space-between; width:100%; align-items:center;">
                      <strong style="font-size:11px;">${titleCase(m.name)}</strong>
                      <span class="type-badge type-${m.type.name}" style="padding:1px 3px; font-size:7px;">${m.type.name}</span>
                    </div>
                    <div style="display:flex; justify-content:space-between; width:100%; font-size:9px; color:var(--muted); margin-top:2px;">
                      <span>${titleCase(m.damage_class?.name || "status")}</span>
                      <span>BP: ${customPower ?? "—"}</span>
                    </div>
                  </button>
                `;
              }).join("")}
            </div>
            ${!this.state.teraUsed.player ? `
              <div style="margin-top: 8px; display:flex; align-items:center; justify-content:center; gap:8px; border:1px solid var(--border-soft); padding:6px; border-radius:6px; background:var(--bg-elevated);">
                <label style="display:flex; align-items:center; gap:6px; cursor:pointer; user-select:none; font-size:11px; color:var(--text);">
                  <input type="checkbox" id="terastallize-checkbox" ${this.shouldTerastallize ? "checked" : ""} ${controlsLocked ? "disabled" : ""}>
                  Terastallize
                </label>
                <span class="type-badge type-${activeBuild.teraType || 'normal'}" style="font-size:8px; padding:1px 4px; border-radius:3px;">
                  ${(activeBuild.teraType || 'normal').toUpperCase()}
                </span>
              </div>
            ` : ""}
            ${zMoveButtonHTML}
          </div>
        `;
      }
    }

    this.root.innerHTML = `
      <section class="battle-module" aria-labelledby="battle-title" style="padding: 0; border-radius: var(--radius); overflow: hidden;">
        
        <div class="showdown-layout">
          
          <!-- Battlefield Column -->
          <div class="battlefield" style="border: 0; min-height: 310px; width: 100%; display: grid; grid-template-columns: 1fr minmax(100px, 0.4fr) 1fr; align-items: end; padding: 28px 24px 20px; box-sizing: border-box;">
            <div class="arena-grid" aria-hidden="true"></div>
            
            <!-- Attacker side -->
            <div class="combatant attacker tooltip-anchor" id="player-combatant" style="display:grid; justify-items:start;">
              <div class="nameplate" style="position:static; display:grid; gap:2px; margin-bottom:6px; min-width:140px;">
                <span style="font-size:11px; font-weight:800;">${displayName(activeBuild.pokemon.name)}</span>
                <div class="type-row">
                  ${playerTypes.map((t) => `<span class="type-badge type-${t}" style="font-size:7px; padding:1px 3px;">${t}</span>`).join("")}
                </div>
              </div>
              
              <img id="player-sprite" src="${spriteUrl(activeBuild.pokemon.name)}" data-fallback="${fallbackSprite(activeBuild.pokemon)}" alt="${activeBuild.pokemon.name}" style="width:110px; height:110px; object-fit:contain; transition: transform 0.25s ease; ${isFainted ? 'opacity: 0.3; filter: grayscale(1);' : ''}">
              
              <div class="hp-track" style="width:130px; height:6px; margin-top:6px;"><span id="player-hp-bar" style="width:${playerHpPercent}%"></span></div>
              <div id="player-hp-text" style="font-size:10px; color:var(--muted); margin-top:2px;">${playerHp} / ${playerMaxHp} HP ${isFainted ? '<strong style="color:var(--danger); font-size:9px; margin-left:4px;">[FAINTED]</strong>' : ''}</div>

              <!-- Attacker Stats Hover Tooltip -->
              ${getPlayerTooltipHTML(this.state)}
            </div>
            
            <div class="battle-callout" id="battle-callout"><strong>VS</strong><span>Turn ${this.state.currentTurn}</span></div>
            
            <!-- Defender side -->
            <div class="combatant defender tooltip-anchor" id="boss-combatant" style="display:grid; justify-items:end;">
              <div class="boss-health" style="position:static; display:grid; gap:2px; margin-bottom:6px; min-width:140px; text-align:right;">
                <div style="display:flex; justify-content:space-between; align-items:center; gap:8px;">
                  <strong style="font-size:11px;">${getBossDisplayName(this.state)}</strong>
                  <span style="font-size:9px; color:var(--muted);">Lv. 200</span>
                </div>
                <div class="type-row" style="justify-content:flex-end;">
                  ${bossTypes.map((t) => `<span class="type-badge type-${t}" style="font-size:7px; padding:1px 3px;">${t}</span>`).join("")}
                </div>
              </div>
              
              <img id="boss-sprite" src="${spriteUrl(boss.name)}" data-fallback="${fallbackSprite(boss)}" alt="${boss.name}" style="width:110px; height:110px; object-fit:contain; transition: transform 0.25s ease; ${bossHp <= 0 ? 'opacity: 0.3; filter: grayscale(1);' : ''}">
              
              <div class="hp-track" style="width:130px; height:6px; margin-top:6px;"><span id="boss-hp-bar" style="width:${bossHpPercent}%"></span></div>
              <div id="boss-hp-text" style="font-size:10px; color:var(--muted); margin-top:2px;">${compactNumber(bossHp)} / ${compactNumber(bossMaxHp)} HP ${bossHp <= 0 ? '<strong style="color:var(--danger); font-size:9px; margin-left:4px;">[FAINTED]</strong>' : ''}</div>
 
              <!-- Defender Stats Hover Tooltip -->
              ${getBossTooltipHTML(this.state)}
            </div>
            
            <!-- Damage Floats -->
            <div id="player-damage-float" class="damage-float" style="left: 15%; top: 40%; color: var(--danger); font-size: 20px; font-weight: 900; pointer-events:none;"></div>
            <div id="boss-damage-float" class="damage-float" style="right: 15%; top: 40%; color: var(--amber); font-size: 20px; font-weight: 900; pointer-events:none;"></div>
          </div>
 
          <div class="battle-log-feed" id="battle-log-feed">
            ${this.state.battleLog.map((log) => formatBattleLogTurnHTML(log, this.state)).join("") || `<div style="color: var(--faint); font-style: italic; text-align: center; margin-top: 120px;">No turns executed yet.</div>`}
          </div>

        </div>

        <!-- Showdown Command Dashboard -->
        <div class="battle-command-deck">
          <div class="battle-team-section">
            <h3 style="font-size:11px; font-weight:800; color:var(--muted); text-transform:uppercase; margin:0 0 6px 0; letter-spacing:0.04em;">Your Team</h3>
            <div class="battle-party-strip">
              ${partyButtonsHTML}
            </div>
          </div>

          <div class="battle-command-panel">
            ${commandPanelHTML}
            
            <!-- Horizontal Battle Controls Bar -->
            <div class="battle-settings-bar">
              <strong style="color: var(--muted); text-transform: uppercase; font-size: 9px; letter-spacing: 0.05em;">Battle Controls:</strong>
              
              <div class="battle-setting">
                <span>Boss Action:</span>
                <select id="boss-action-select" ${controlsLocked ? "disabled" : ""} style="min-height:28px; font-size:11px; background:var(--bg-card); border:1px solid var(--border); color:var(--text); border-radius:4px; padding: 2px 6px;">
                  ${bossMoves.length > 0 ? `<option value="random-move" ${this.bossAction === "random-move" ? "selected" : ""}>Random Move</option>` : ""}
                  ${bossMoves.length > 0 ? `<option value="use-move" ${this.bossAction === "use-move" ? "selected" : ""}>Use Selected Move</option>` : ""}
                  <option value="do-nothing" ${this.bossAction === "do-nothing" ? "selected" : ""}>Do Nothing</option>
                </select>
                <select id="boss-move-select" class="${this.bossAction === "use-move" ? "" : "hidden"}" ${controlsLocked ? "disabled" : ""} style="min-height:28px; font-size:11px; background:var(--bg-card); border:1px solid var(--border); color:var(--text); border-radius:4px; padding: 2px 6px;">
                  ${bossMoves.map((m, idx) => `<option value="${idx}" ${this.bossMoveIndex === idx ? "selected" : ""}>${titleCase(m.name)}</option>`).join("")}
                </select>
              </div>

              <div class="battle-setting">
                <span>Damage Roll:</span>
                <select id="damage-roll-mode-select" ${controlsLocked ? "disabled" : ""} style="min-height:28px; font-size:11px; background:var(--bg-card); border:1px solid var(--border); color:var(--text); border-radius:4px; padding: 2px 6px;">
                  <option value="random" ${(this.state.damageRollMode || "random") === "random" ? "selected" : ""}>Random Roll</option>
                  <option value="min" ${(this.state.damageRollMode || "random") === "min" ? "selected" : ""}>Min Roll</option>
                  <option value="average" ${(this.state.damageRollMode || "random") === "average" ? "selected" : ""}>Average Roll</option>
                  <option value="max" ${(this.state.damageRollMode || "random") === "max" ? "selected" : ""}>Max Roll</option>
                </select>
              </div>

              <div class="battle-utility-actions">
                <button type="button" id="toggle-formula-btn" class="button" style="min-height:28px; padding: 2px 10px; font-size:10px; cursor:pointer;">Damage Formula</button>
                <button type="button" id="undo-turn-btn" class="button" style="min-height:28px; padding: 2px 10px; font-size:10px; cursor:pointer;" ${this.state.history.length > 0 && !controlsLocked ? "" : "disabled"}>Undo Turn</button>
                <button type="button" id="new-battle-btn" class="button" style="min-height:28px; padding: 2px 10px; font-size:10px; cursor:pointer;" ${controlsLocked ? "disabled" : ""}>New Battle</button>
                <button type="button" id="reset-battle-btn" class="button danger-text" style="min-height:28px; padding: 2px 10px; font-size:10px; color:var(--danger); border-color:rgba(255,100,124,0.3); cursor:pointer;" ${controlsLocked ? "disabled" : ""}>Reset Battle</button>
                <button type="button" id="back-to-builder-btn" class="button" style="min-height:28px; padding: 2px 10px; font-size:10px; cursor:pointer; border-color:var(--cyan); color:var(--cyan); background:rgba(8, 207, 233, 0.05);">Back to Team Builder</button>
              </div>
            </div>
          </div>
        </div>
      </section>
      ${formulaModalHTML}
    `;

    this.bindBattleControls();
    
    // Auto scroll log to bottom
    const logFeed = this.root.querySelector("#battle-log-feed");
    if (logFeed) {
      logFeed.scrollTop = logFeed.scrollHeight;
    }

    // Trigger animations if needed
    if (hasUnanimatedLog && !this.busy) {
      this.playTurnAnimations(lastLog);
    }
  }

  bindSetupControls() {
    this.root.querySelector("#simulate-all")?.addEventListener("click", () => this.simulateAll());
    this.root.querySelector("#step-turn")?.addEventListener("click", () => this.step());
    this.root.querySelector("#reset-battle")?.addEventListener("click", () => {
      this.state.resetSimulation();
      this.render();
    });
    this.root.querySelector("#copy-summary")?.addEventListener("click", () => this.copy());
    this.root.querySelectorAll("img[data-fallback]").forEach((img) => img.addEventListener("error", () => {
      if (img.dataset.fallback && img.src !== img.dataset.fallback) img.src = img.dataset.fallback;
    }, { once: true }));
  }

  bindBattleControls() {
    const state = this.state;

    this.root.querySelector("#resume-battle-btn")?.addEventListener("click", () => {
      state.needsResume = false;
      state.battleActive = true;
      state.uiMode = "battle";
      if (window.myuuRaid?.navigate) window.myuuRaid.navigate("battle");
      else if (window.myuuRaid?.renderAll) window.myuuRaid.renderAll();
      else this.render();
    });

    // Party selection
    this.root.querySelectorAll(".party-member-btn").forEach((btn) => {
      btn.addEventListener("click", () => {
        if (this.controlsLocked()) return;
        const slot = Number(btn.dataset.slot);
        
        if (state.awaitingForcedSwitch) {
          try {
            state.executeForcedSwitch(slot);
          } catch (e) {
            alert(e.message);
          }
        } else if (this.batonPassSelecting) {
          this.playerAction = "baton-pass";
          this.selectedSwitchSlot = slot;
          this.executeActiveTurn();
          this.batonPassSelecting = false;
        } else {
          if (slot === state.activeSlot) return;
          if (state.teamHP[slot] <= 0) return;
          
          if (confirm(`Switch to ${displayName(state.team[slot].pokemon.name)}? This will consume your turn.`)) {
            this.playerAction = "switch";
            this.selectedSwitchSlot = slot;
            this.executeActiveTurn();
          }
        }
      });
    });

    // Baton targets selection
    this.root.querySelectorAll(".baton-target-btn").forEach((btn) => {
      btn.addEventListener("click", () => {
        if (this.controlsLocked()) return;
        const slot = Number(btn.dataset.slot);
        this.playerAction = "baton-pass";
        this.selectedSwitchSlot = slot;
        this.executeActiveTurn();
        this.batonPassSelecting = false;
      });
    });

    // Cancel buttons
    this.root.querySelector("#cancel-switch-btn")?.addEventListener("click", () => {
      this.playerAction = "use-move";
      this.selectedMoveIndex = 0;
      this.render();
    });

    this.root.querySelector("#cancel-baton-pass-btn")?.addEventListener("click", () => {
      this.batonPassSelecting = false;
      this.playerAction = "use-move";
      this.selectedMoveIndex = 0;
      this.render();
    });

    // Move buttons immediately execute on click
    this.root.querySelectorAll(".move-btn").forEach((btn) => {
      btn.addEventListener("click", () => {
        if (this.controlsLocked()) return;
        const idx = Number(btn.dataset.moveIdx);
        const isBatonPass = btn.dataset.batonPass === "true";
        
        if (isBatonPass) {
          this.batonPassSelecting = true;
          this.selectedMoveIndex = idx;
          this.playerAction = "baton-pass";
          this.render();
        } else {
          this.playerAction = "use-move";
          this.selectedMoveIndex = idx;
          this.executeActiveTurn();
        }
      });
    });

    // Z-Move button handler
    const zMoveBtn = this.root.querySelector("#z-move-btn");
    zMoveBtn?.addEventListener("click", () => {
      if (this.controlsLocked()) return;
      const activeBuild = state.team[state.activeSlot];
      if (activeBuild && activeBuild.moves) {
        const idx = activeBuild.moves.findIndex((m) => m && m.name === "belly-drum");
        if (idx >= 0) {
          this.playerAction = "use-z-move";
          this.selectedMoveIndex = idx;
          this.executeActiveTurn();
        }
      }
    });

    // Terastallize checkbox listener
    this.root.querySelector("#terastallize-checkbox")?.addEventListener("change", (e) => {
      this.shouldTerastallize = e.target.checked;
    });

    // Boss configuration
    // Damage Settings handlers
    const rollModeSelect = this.root.querySelector("#damage-roll-mode-select");
    rollModeSelect?.addEventListener("change", (e) => {
      const mode = e.target.value;
      state.damageRollMode = mode;
      localStorage.setItem("myuu_raid_damage_roll_mode", mode);
      this.render();
    });

    const toggleFormulaBtn = this.root.querySelector("#toggle-formula-btn");
    toggleFormulaBtn?.addEventListener("click", () => {
      this.showFormulaPanel = true;
      this.render();
    });

    this.root.querySelector("#close-formula-modal-btn")?.addEventListener("click", () => {
      this.showFormulaPanel = false;
      this.render();
    });

    this.root.querySelector("#close-formula-modal-btn-ok")?.addEventListener("click", () => {
      this.showFormulaPanel = false;
      this.render();
    });

    const bossActionSelect = this.root.querySelector("#boss-action-select");
    bossActionSelect?.addEventListener("change", (e) => {
      this.bossAction = e.target.value;
      this.render();
    });

    const bossMoveSelect = this.root.querySelector("#boss-move-select");
    bossMoveSelect?.addEventListener("change", (e) => {
      this.bossMoveIndex = Number(e.target.value);
    });

    this.root.querySelector("#undo-turn-btn")?.addEventListener("click", () => {
      if (this.controlsLocked()) return;
      this.lastAnimatedTurn = Math.max(0, state.battleLog.length - 2);
      state.undoLastTurn();
    });

    this.root.querySelector("#new-battle-btn")?.addEventListener("click", () => {
      if (this.controlsLocked()) return;
      try {
        state.startNewBattleFromCurrentSetup();
        state.battleActive = true;
        state.uiMode = "battle";
        if (window.myuuRaid?.navigate) window.myuuRaid.navigate("battle");
        else if (window.myuuRaid?.renderAll) window.myuuRaid.renderAll();
        else this.render();
      } catch (error) {
        alert(error.message);
      }
    });

    this.root.querySelector("#reset-battle-btn")?.addEventListener("click", () => {
      if (this.controlsLocked()) return;
      if (confirm("Reset current battle simulation?")) {
        this.lastAnimatedTurn = 0;
        state.resetBattle();
      }
    });

    this.root.querySelector("#back-to-builder-btn")?.addEventListener("click", (e) => {
      e.preventDefault();
      state.uiMode = "builder";
      state.battleActive = false;
      if (window.myuuRaid?.navigate) window.myuuRaid.navigate("team-builder");
      else if (window.myuuRaid?.renderAll) window.myuuRaid.renderAll();
      else state.emit("restore");
    });

    this.root.querySelectorAll("img[data-fallback]").forEach((img) => img.addEventListener("error", () => {
      if (img.dataset.fallback && img.src !== img.dataset.fallback) img.src = img.dataset.fallback;
    }, { once: true }));
  }

  executeActiveTurn() {
    if (this.controlsLocked()) return;
    this.state.isResolvingTurn = true;
    try {
      const terastallizeCheckbox = this.root.querySelector("#terastallize-checkbox");
      const shouldTera = terastallizeCheckbox ? terastallizeCheckbox.checked : false;
      this.state.executeTurn(
        this.playerAction,
        this.selectedMoveIndex,
        this.selectedSwitchSlot,
        this.bossAction,
        this.bossMoveIndex,
        shouldTera
      );
      this.shouldTerastallize = false;
    } catch (err) {
      this.state.isResolvingTurn = false;
      alert(err.message);
      this.render();
    }
  }

  triggerAttack(attackerSide) {
    const attackerSprite = document.querySelector(attackerSide === "player" ? "#player-sprite" : "#boss-sprite");
    const defenderSprite = document.querySelector(attackerSide === "player" ? "#boss-sprite" : "#player-sprite");
    
    if (attackerSprite && defenderSprite) {
      attackerSprite.classList.add("lunge");
      setTimeout(() => {
        attackerSprite.classList.remove("lunge");
        defenderSprite.classList.add("hit");
        setTimeout(() => {
          defenderSprite.classList.remove("hit");
        }, 300);
      }, 160);
    }
  }

  triggerStatusGlow(side) {
    const sprite = document.querySelector(side === "player" ? "#player-sprite" : "#boss-sprite");
    if (sprite) {
      sprite.classList.add("status-glow");
      setTimeout(() => {
        sprite.classList.remove("status-glow");
      }, 650);
    }
  }

  showDamageFloat(side, amount) {
    const el = document.querySelector(side === "player" ? "#player-damage-float" : "#boss-damage-float");
    if (el) {
      el.textContent = `-${amount.toLocaleString()}`;
      el.classList.add("show");
      setTimeout(() => {
        el.classList.remove("show");
      }, 800);
    }
  }

  updateHPDisplay(side, current, max) {
    const bar = document.querySelector(side === "player" ? "#player-hp-bar" : "#boss-hp-bar");
    const text = document.querySelector(side === "player" ? "#player-hp-text" : "#boss-hp-text");
    const pct = Math.max(0, (current / max) * 100);
    if (bar) bar.style.width = `${pct}%`;
    if (text) {
      if (side === "boss") {
        text.textContent = `${compactNumber(current)} / ${compactNumber(max)} HP`;
      } else {
        text.textContent = `${current} / ${max} HP`;
      }
    }
  }

  async playTurnAnimations(log) {
    this.busy = true;
    try {
      const playerMon = this.state.team[log.activeSlot];
      const callout = document.querySelector("#battle-callout");
      
      const playerGoesFirst = log.playerMovedFirst;
      const steps = [];
      if (playerGoesFirst) {
        steps.push({ side: "player", action: log.playerAction, moveName: log.playerMove, damage: log.playerDamage });
        steps.push({ side: "boss", action: log.bossAction, moveName: log.bossMove, damage: log.bossDamage });
      } else {
        steps.push({ side: "boss", action: log.bossAction, moveName: log.bossMove, damage: log.bossDamage });
        steps.push({ side: "player", action: log.playerAction, moveName: log.playerMove, damage: log.playerDamage });
      }

      for (const step of steps) {
        if (step.side === "player") {
          if (step.action === "switch" || step.action === "switch-forced" || step.action === "baton-pass") {
            if (callout) {
              callout.innerHTML = `<strong>Switch</strong><span>${displayName(playerMon.pokemon.name)} entered battle!</span>`;
            }
            const sprite = document.querySelector("#player-sprite");
            if (sprite) {
              sprite.style.opacity = "0";
              sprite.style.transform = "scale(0.5)";
              await new Promise(r => setTimeout(r, 200));
              sprite.src = spriteUrl(playerMon.pokemon.name);
              sprite.style.opacity = "1";
              sprite.style.transform = "scale(1)";
            }
            await new Promise(r => setTimeout(r, 600));
          } else if (step.action === "use-move") {
            const moveData = playerMon.moves.find((move) => move?.name === log.playerMove) || playerMon.moves[this.selectedMoveIndex];
            const isStatus = moveData && (moveData.damage_class?.name === "status" || !(moveData.customPower ?? moveData.basePower ?? moveData.power));

            if (callout) {
              callout.innerHTML = `<strong>${titleCase(step.moveName)}</strong><span>used by ${displayName(playerMon.pokemon.name)}</span>`;
            }
            
            if (isStatus) {
              this.triggerStatusGlow("player");
            } else {
              this.triggerAttack("player");
            }
            await new Promise(r => setTimeout(r, 200));
            
            if (step.damage > 0) {
              this.showDamageFloat("boss", step.damage);
              const bossHPAfterStep = Math.max(0, log.bossHPBefore - step.damage);
              this.updateHPDisplay("boss", bossHPAfterStep, this.state.bossMaxHP);
            }
            await new Promise(r => setTimeout(r, 700));
          }
        } else {
          if (this.state.bossHP <= 0 && step.damage === 0) continue; 

          if (step.action === "use-move") {
            const bossMoveData = this.state.bossMoves.find((move) => move?.name === log.bossMove) || this.state.bossMoves[this.bossMoveIndex];
            const isStatus = bossMoveData && (bossMoveData.damage_class?.name === "status" || !(bossMoveData.customPower ?? bossMoveData.basePower ?? bossMoveData.power));

            if (callout) {
              callout.innerHTML = `<strong>${titleCase(step.moveName)}</strong><span>used by Boss</span>`;
            }
            
            if (isStatus) {
              this.triggerStatusGlow("boss");
            } else {
              this.triggerAttack("boss");
            }
            await new Promise(r => setTimeout(r, 200));
            
            if (step.damage > 0) {
              this.showDamageFloat("player", step.damage);
              const playerHPAfterStep = Math.max(0, log.playerHPAfter); 
              this.updateHPDisplay("player", playerHPAfterStep, playerMon.stats.hp);
            }
            await new Promise(r => setTimeout(r, 700));
          } else {
            if (callout) {
              callout.innerHTML = `<strong>Do Nothing</strong><span>Boss did nothing</span>`;
            }
            await new Promise(r => setTimeout(r, 650));
          }
        }
      }

      if (log.notes.length > 0) {
        for (const note of log.notes) {
          if (callout) {
            callout.innerHTML = `<strong>Battle Alert</strong><span style="font-size:10px; display:block; padding:4px;">${note}</span>`;
          }
          if (note.includes("terastallized into the")) {
            this.triggerStatusGlow("player");
          }
          await new Promise(r => setTimeout(r, 900));
        }
      }

      this.lastAnimatedTurn = log.turn;
    } finally {
      this.busy = false;
      this.state.isResolvingTurn = false;
      
      // Reset selections after move execution
      this.playerAction = "use-move";
      this.selectedMoveIndex = 0;
      
      this.render(); 
    }
  }

  async simulateAll() {
    if (this.busy || !this.state.boss) return;
    this.busy = true;
    const rows = this.simulator.run(21);
    this.state.results = [];
    for (const row of rows) {
      this.state.results.push(row);
      this.state.cursor = row.turn;
      this.render();
      await this.animate(row);
    }
    this.busy = false;
    this.state.emit("simulation");
  }

  async step() {
    if (this.busy || !this.state.boss || this.state.cursor >= 21) return;
    this.busy = true;
    const rows = this.simulator.run(this.state.cursor + 1);
    this.state.results = rows;
    this.state.cursor = rows.length;
    this.render();
    await this.animate(rows.at(-1));
    this.busy = false;
    this.state.emit("simulation");
  }

  animate(row) {
    if (!row) return Promise.resolve();
    const attacker = this.root.querySelector("#attacker-sprite");
    const boss = this.root.querySelector("#boss-sprite");
    const float = this.root.querySelector("#damage-float");
    if (row.normal.max > 0) {
      attacker?.classList.add("lunge");
      boss?.classList.add("hit");
      float.textContent = `−${Math.round((row.normal.min + row.normal.max) / 2).toLocaleString()}`;
      float.classList.add("show");
    }
    return new Promise((resolve) => setTimeout(resolve, 380));
  }

  copy() {
    const lines = [
      `Myuu Raid — ${this.state.boss ? displayName(this.state.boss.name) : "Boss"}`,
      ...this.state.results.map((row) => `T${row.turn} ${displayName(row.pokemon)} — ${titleCase(row.action)} | ${row.normalLabel} normal | ${row.criticalLabel} crit | HP ${row.hp.toLocaleString()}`),
    ];
    copyText(lines.join("\n"));
    const button = this.root.querySelector("#simulate-all") || this.root.querySelector("#copy-summary");
    if (button) {
      const origText = button.textContent;
      button.textContent = "Copied";
      setTimeout(() => button.textContent = origText, 1200);
    }
  }
}
