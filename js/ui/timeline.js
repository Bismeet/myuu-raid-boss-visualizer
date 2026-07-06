import { displayName, titleCase } from "../utils/format.js";

export class Timeline {
  constructor(root, state) {
    this.root = root;
    this.state = state;
    this.bindGlobalEventDelegation();
    this.render();
  }

  // Centralized event delegation for all timeline buttons
  bindGlobalEventDelegation() {
    this.root.addEventListener("click", (event) => {
      const action = event.target.closest("[data-action]")?.dataset.action;
      if (!action) return;

      console.log(`[Timeline] Action: ${action}`);

      switch (action) {
        case "new-battle":
          event.preventDefault();
          this.handleNewBattle();
          break;
        case "start-battle":
          event.preventDefault();
          this.handleStartBattle();
          break;
        case "resume-battle":
          event.preventDefault();
          this.handleResumeBattle();
          break;
        case "reset-battle":
          event.preventDefault();
          this.handleResetBattle();
          break;
        case "undo-turn":
          event.preventDefault();
          this.handleUndoTurn();
          break;
        case "back-to-builder":
          event.preventDefault();
          this.handleBackToBuilder();
          break;
      }
    });
  }

  handleNewBattle() {
    try {
      this.state.startNewBattleFromCurrentSetup();
      this.state.battleActive = true;
      this.state.uiMode = "battle";
      this.forceRenderAll();
    } catch (err) {
      alert(err.message);
    }
  }

  handleStartBattle() {
    try {
      this.state.startBattle();
      this.forceRenderAll();
    } catch (err) {
      alert(err.message);
    }
  }

  handleResumeBattle() {
    this.state.battleActive = true;
    this.state.uiMode = "battle";
    this.state.needsResume = false;
    this.forceRenderAll();
  }

  handleResetBattle() {
    if (confirm("Reset current battle simulation?")) {
      this.state.resetBattle();
      this.forceRenderAll();
    }
  }

  handleUndoTurn() {
    this.state.undoLastTurn();
    this.forceRenderAll();
  }

  handleBackToBuilder() {
    this.state.uiMode = "builder";
    this.state.battleActive = false;
    this.forceRenderAll();
  }

  forceRenderAll() {
    // Use centralized renderAll from app.js
    if (window.myuuRaid?.renderAll) {
      window.myuuRaid.renderAll();
    } else {
      // Fallback if app.js hasn't loaded yet
      this.render();
      if (window.myuuRaid?.battleScene) window.myuuRaid.battleScene.render();
      if (window.myuuRaid?.summary) window.myuuRaid.summary.render();
      if (window.myuuRaid?.bossPanel) window.myuuRaid.bossPanel.render();
      if (window.myuuRaid?.teamBuilder) window.myuuRaid.teamBuilder.render();
    }
  }

  render() {
    const state = this.state;

    // Case 3: Saved state is broken/incomplete
    if (state.savedBattleBroken) {
      this.root.innerHTML = `
        <section class="panel timeline-panel" aria-labelledby="timeline-title" style="padding:15px; min-height:300px;">
          <div class="panel-heading sticky-heading" style="padding: 10px; border-bottom: 1px solid var(--border-soft);">
            <div><span class="eyebrow">Raid simulator</span><h2 id="timeline-title">Battle setup</h2></div>
          </div>
          <div style="margin-top:20px; display:grid; gap:12px;">
            <p style="color:var(--danger); font-size:12px; line-height:1.5; font-weight:800;">Saved battle state was incomplete. Start a new battle.</p>
            <button type="button" class="button primary" data-action="new-battle" style="width:100%; min-height:40px; cursor:pointer;">New Battle</button>
            <button id="clear-broken-btn" type="button" class="button" style="width:100%; min-height:36px; cursor:pointer; color:var(--danger); border-color:var(--danger);">Clear Broken Battle State</button>
          </div>
        </section>
      `;
      this.root.querySelector("#clear-broken-btn")?.addEventListener("click", () => {
        console.log("Clear Broken Battle State button clicked.");
        this.state.savedBattleBroken = false;
        this.state.battleActive = false;
        this.forceRenderAll();
      });
      return;
    }

    // Case 2: Saved battle is already active, needs resume confirm
    if (state.battleActive && state.needsResume) {
      this.root.innerHTML = `
        <section class="panel timeline-panel" aria-labelledby="timeline-title" style="padding:15px; min-height:300px;">
          <div class="panel-heading sticky-heading" style="padding: 10px; border-bottom: 1px solid var(--border-soft);">
            <div><span class="eyebrow">Raid simulator</span><h2 id="timeline-title">Resume Battle</h2></div>
          </div>
          <div style="margin-top:20px; display:grid; gap:10px;">
            <p style="color:var(--cyan); font-size:12px; line-height:1.5; font-weight:800; margin-bottom:8px;">Saved battle state is active.</p>
            <button type="button" class="button primary" data-action="resume-battle" style="width:100%; min-height:40px; cursor:pointer;">Resume Battle</button>
            <button type="button" class="button" data-action="new-battle" style="width:100%; min-height:40px; cursor:pointer; border-color:var(--cyan); color:var(--cyan); background:rgba(8, 207, 233, 0.05);">New Battle</button>
            <button type="button" class="button danger-text" data-action="reset-battle" style="width:100%; min-height:40px; color:var(--danger); border-color:var(--danger); cursor:pointer;">Reset Battle</button>
          </div>
        </section>
      `;
      return;
    }

    // Case 1: Team is built but battle has not started
    if (!state.battleActive) {
      const hasBoss = !!state.boss;
      const hasTeam = state.team.some((slot) => slot.pokemon);
      const canStart = hasBoss && hasTeam;

      this.root.innerHTML = `
        <section class="panel timeline-panel" aria-labelledby="timeline-title" style="padding:15px; min-height:300px;">
          <div class="panel-heading sticky-heading" style="padding: 10px; border-bottom: 1px solid var(--border-soft);">
            <div><span class="eyebrow">Raid simulator</span><h2 id="timeline-title">Battle setup</h2></div>
          </div>
          <div style="margin-top:20px; display:grid; gap:12px;">
            <p style="color:var(--muted); font-size:12px; line-height:1.5;">Configure your team and the boss, then start the interactive battle simulation.</p>
            <div style="font-size:12px; display:grid; gap:4px; margin-bottom:10px;">
              <span style="color:${hasBoss ? "var(--success)" : "var(--danger)"};">● Boss loaded: ${hasBoss ? displayName(state.boss.name) : "No"}</span>
              <span style="color:${hasTeam ? "var(--success)" : "var(--danger)"};">● Team ready: ${hasTeam ? "Yes" : "No (need at least 1 Pokémon)"}</span>
            </div>
            <button type="button" class="button primary" data-action="start-battle" style="width:100%; min-height:40px; cursor:pointer;" ${canStart ? "" : "disabled"}>Start Battle</button>
          </div>
        </section>
      `;
      return;
    }

    // Normal active battle view: render Battle Logs with all controls
    this.root.innerHTML = `
      <section class="panel timeline-panel" aria-labelledby="timeline-title" style="padding:15px; max-height:none; overflow-y:auto; min-height:420px; display:flex; flex-direction:column; gap:12px;">
        <div class="panel-heading sticky-heading" style="padding: 10px; border-bottom: 1px solid var(--border-soft); display:flex; justify-content:space-between; align-items:center;">
          <div><span class="eyebrow">Raid simulator</span><h2 id="timeline-title">Battle Logs</h2></div>
          <span class="turn-chip" style="font-size:12px; font-weight:800;">Turn ${state.currentTurn} / 21</span>
        </div>
        <div style="display:grid; gap:10px; font-size:11px; overflow-y:auto; flex:1;">
          ${state.battleLog.map((log) => `
            <div style="padding:8px; border:1px solid var(--border-soft); border-radius:6px; background:var(--bg-elevated);">
              <div style="display:flex; justify-content:space-between; font-weight:800; border-bottom:1px solid var(--border-soft); padding-bottom:3px; margin-bottom:4px; color:var(--cyan);">
                <span>Turn ${log.turn}</span>
                <span>${displayName(log.pokemon)}</span>
              </div>
              <div style="display:grid; gap:3px;">
                ${log.notes.map(n => `<div style="color:var(--text); line-height:1.3;">● ${n}</div>`).join("")}
              </div>
            </div>
          `).reverse().join("") || `<p style="color:var(--faint); font-style:italic; text-align:center;">No turns executed yet.</p>`}
        </div>
        <div style="margin-top:10px; border-top:1px solid var(--border-soft); padding-top:10px; display:grid; grid-template-columns:repeat(4, 1fr); gap:6px;">
          <button type="button" class="button" data-action="new-battle" style="min-height:32px; font-size:10px; cursor:pointer; border-color:var(--cyan); color:var(--cyan); background:rgba(8, 207, 233, 0.05);">New Battle</button>
          <button type="button" class="button" data-action="undo-turn" style="min-height:32px; font-size:10px; cursor:pointer;" ${state.history.length > 0 ? "" : "disabled"}>Undo Turn</button>
          <button type="button" class="button danger-text" data-action="reset-battle" style="min-height:32px; font-size:10px; color:var(--danger); border-color:rgba(255,100,124,0.3); cursor:pointer;">Reset Battle</button>
          <button type="button" class="button" data-action="back-to-builder" style="min-height:32px; font-size:10px; cursor:pointer;">Back to Builder</button>
        </div>
      </section>
    `;
  }
}
