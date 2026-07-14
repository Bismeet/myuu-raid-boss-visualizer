import { compactNumber, displayName, titleCase } from "../utils/format.js";
import { calculateRaidBossHP } from "../core/stats.js";

const publicNotes = (notes = []) => notes.filter((note) => !/(?:Defense|Sp\. Defense|Attack|Sp\. Attack|Speed|HP)\s*(?:changed|stage|:).*?(?:→|->|\d)/i.test(note));

export class Summary {
  constructor(root, state) {
    this.root = root;
    this.state = state;
    this.render();
  }

  render() {
    const isBattle = this.state.battleActive;
    const log = this.state.battleLog;

    if (isBattle || log.length > 0) {
      const startHp = this.state.bossMaxHP || (this.state.bossBaseStats?.hp || 0);
      const remaining = this.state.bossHP;
      const bossProgress = Math.max(0, Math.min(100, ((startHp - remaining) / (startHp || 1)) * 100));
      const totalDamage = log.reduce((sum, turn) => sum + turn.playerDamage, 0);

      // Find best hit
      let bestHit = null;
      let maxDamage = -1;
      log.forEach((turn) => {
        if (turn.playerAction === "use-move" && turn.playerDamage > maxDamage) {
          maxDamage = turn.playerDamage;
          bestHit = turn;
        }
      });

      const bestHitLabel = bestHit
        ? `Turn ${bestHit.turn} — ${displayName(bestHit.pokemon)} ${titleCase(bestHit.playerMove)} (${bestHit.playerDamage.toLocaleString()} damage)`
        : "—";

      const allFainted = this.state.team.every((slot, idx) => !slot.pokemon || this.state.teamHP[idx] <= 0);
      let outcomeLabel = "Battle in progress…";
      let outcomeClass = "";

      if (!isBattle) {
        if (remaining <= 0) {
          outcomeLabel = `DEFEATED (Turn ${log.at(-1)?.turn || 21})`;
          outcomeClass = "success";
        } else if (allFainted) {
          outcomeLabel = "WIPED OUT";
          outcomeClass = "danger-text";
        } else {
          outcomeLabel = "TIMEOUT (21 turns)";
        }
      }

      this.root.innerHTML = `
        <section class="summary-section" aria-labelledby="summary-title">
          <div class="summary-heading" style="margin-bottom:15px;">
            <div><span class="eyebrow">Raid simulator</span><h2 id="summary-title">Raid summary</h2></div>
            <div class="summary-metrics" style="display:flex; flex-wrap:wrap; gap:8px;">
              <div><span>Total damage</span><strong>${totalDamage.toLocaleString()}</strong></div>
              <div><span>Boss progress</span><strong>${bossProgress.toFixed(1)}% dealt</strong></div>
              <div class="${outcomeClass}"><span>Outcome</span><strong>${outcomeLabel}</strong></div>
              <div><span>Fainted Allies</span><strong>${this.state.faintedAlliesCount}</strong></div>
            </div>
          </div>
          
          <div style="font-size:12px; margin-bottom:15px; padding:10px; border:1px solid var(--border-soft); border-radius:8px; background:var(--bg-elevated);">
            <span style="font-size:9px; color:var(--muted); text-transform:uppercase; font-weight:800; display:block;">Best Hit</span>
            <strong>${bestHitLabel}</strong>
          </div>

          <h3 style="font-size:13px; color:var(--cyan); margin-bottom:10px; font-weight:800; text-transform:uppercase; letter-spacing:0.04em;">Battle Log</h3>
          <div class="battle-log-list" style="max-height:450px; overflow-y:auto; padding-right:4px;">
            ${log.map((row) => `
              <div class="turn-card" style="padding:10px 12px; border:1px solid var(--border-soft); border-radius:8px; background:var(--bg-elevated); margin-bottom:8px; display:grid; gap:4px;">
                <div style="display:flex; justify-content:space-between; align-items:center; border-bottom:1px solid var(--border-soft); padding-bottom:2px; margin-bottom:2px;">
                  <strong style="color:var(--cyan); font-size:11px;">Turn ${row.turn}</strong>
                  <span style="font-size:11px; font-weight:800;">${displayName(row.pokemon)}</span>
                </div>
                <div style="display:grid; grid-template-columns:1fr 1fr; gap:12px; font-size:11px; line-height:1.45;">
                  <div>
                    <span style="color:var(--success); font-weight:800; display:block; font-size:9px; text-transform:uppercase;">Player Action</span>
                    ${row.playerAction === "use-move" ? `Used <strong>${titleCase(row.playerMove)}</strong>` : titleCase(row.playerAction)}
                    ${row.playerDamage > 0 ? `<br><span style="color:var(--success);">Dealt ${row.playerDamage.toLocaleString()} damage</span>` : ""}
                  </div>
                  <div>
                    <span style="color:var(--danger); font-weight:800; display:block; font-size:9px; text-transform:uppercase;">Boss Action</span>
                    ${row.bossAction === "use-move" ? `Used <strong>${titleCase(row.bossMove)}</strong>` : "Did Nothing"}
                    ${row.bossDamage > 0 ? `<br><span style="color:var(--danger);">Took ${row.bossDamage.toLocaleString()} damage</span>` : ""}
                  </div>
                </div>
                <div style="display:flex; justify-content:space-between; font-size:10px; color:var(--muted); margin-top:4px; padding-top:4px; border-top:1px dashed var(--border-soft);">
                  <span>Boss progress: <strong>${Math.max(0, Math.min(100, ((startHp - row.bossHPAfter) / (startHp || 1)) * 100)).toFixed(1)}% dealt</strong></span>
                  <span>Active HP: <strong>${row.playerHPAfter.toLocaleString()}</strong></span>
                </div>
                ${publicNotes(row.notes).length > 0 ? `<div style="font-size:10px; color:var(--amber); margin-top:3px; padding-top:2px; border-top:1px solid rgba(255,255,255,0.05);"><strong>Notes:</strong> ${publicNotes(row.notes).join(". ")}</div>` : ""}
              </div>
            `).reverse().join("")}
          </div>
        </section>
      `;
      return;
    }

    const rows = this.state.results;
    const startHp = this.state.boss ? calculateRaidBossHP(this.state.boss) : 0;
    const remaining = rows.at(-1)?.hp ?? startHp;
    const damage = startHp - remaining;
    this.root.innerHTML = `
      <section class="summary-section" aria-labelledby="summary-title">
        <div class="summary-heading">
          <div><span class="eyebrow">Combat log</span><h2 id="summary-title">Raid summary</h2></div>
          <div class="summary-metrics">
            <div><span>Total damage</span><strong>${compactNumber(damage)}</strong></div>
            <div class="${remaining <= 0 ? "success" : ""}"><span>Outcome</span><strong>${remaining <= 0 ? `KO · Turn ${rows.length}` : `${((damage / (startHp || 1)) * 100).toFixed(2)}% dealt`}</strong></div>
          </div>
        </div>
        <div class="table-wrap">
          <table>
            <thead><tr><th>Turn</th><th>Active Pokémon</th><th>Move</th><th>Damage range</th><th>Boss HP</th></tr></thead>
            <tbody>${rows.length ? rows.map((row) => `<tr>
              <td>${row.turn}</td><td>${displayName(row.pokemon)}</td><td>${titleCase(row.moveName)}</td>
              <td><strong>${row.damageLabel}</strong></td><td>${row.hp.toLocaleString()}</td>
            </tr>`).join("") : `<tr><td colspan="5" class="empty-table">Start a battle, then execute turns to generate the battle log.</td></tr>`}</tbody>
          </table>
        </div>
      </section>`;
  }
}
