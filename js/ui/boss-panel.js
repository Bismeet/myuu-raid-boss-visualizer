import { BOSSES, searchBosses } from "../data/bosses.js";
import { getPokemon, getMove, getMoveIndex } from "../api/pokeapi.js";
import { calculateBossStats } from "../core/stats.js";
import { compactNumber, displayName, fallbackSprite, spriteUrl, titleCase } from "../utils/format.js";
import { emptyStages } from "../core/stages.js";

const isSelectableMove = (name) => !["max-", "g-max-", "shadow-"].some((prefix) => name.startsWith(prefix)) && !name.endsWith("-z") && !name.includes("gmax");

const prepareMove = (move) => move ? {
  ...move,
  basePower: move.power ?? null,
  customPower: move.power ?? null,
} : null;

export class BossPanel {
  constructor(root, state) {
    this.root = root;
    this.state = state;
    this.query = "";
    this.activeSection = "none"; // "none" | "change-boss" | "edit-moves" | "edit-stats"
    this.globalMoves = null;
    this.moveSearchTimer = null;
    
    this.render();
    if (!this.state.boss) this.load("mewtwo");
  }

  filtered() {
    return searchBosses(this.query);
  }

  async ensureGlobalMoves() {
    if (this.globalMoves) return this.globalMoves;
    const data = await getMoveIndex();
    this.globalMoves = data.results.map(({ name }) => name).filter(isSelectableMove).sort();
    return this.globalMoves;
  }

  render() {
    const boss = this.state.boss;
    const stats = this.state.bossStats;
    const isBattle = this.state.appView === "battle";

    this.root.innerHTML = `
      <section class="panel boss-panel" aria-labelledby="boss-title" style="display:grid; gap:12px; padding: 15px;">
        <div class="panel-heading">
          <div><span class="eyebrow">Raid target</span><h2 id="boss-title">Boss dossier</h2></div>
          <span class="level-chip">LV. 200</span>
        </div>
        
        <!-- Top Dossier Action Buttons (Always Visible) -->
        ${!isBattle ? `
          <div style="display:grid; grid-template-columns:1fr 1fr 1fr; gap:6px; margin: 4px 0 10px 0;">
            <button type="button" id="top-btn-change-boss" class="button dossier-action-btn" style="border: 1px solid var(--cyan); color: var(--cyan); background: var(--cyan-dark); cursor: pointer; font-weight: 800; font-size: 10px; padding: 6px 4px; border-radius: 6px; text-align:center;">Change Boss</button>
            <button type="button" id="top-btn-edit-moves" class="button dossier-action-btn" style="border: 1px solid var(--cyan); color: var(--cyan); background: var(--cyan-dark); cursor: pointer; font-weight: 800; font-size: 10px; padding: 6px 4px; border-radius: 6px; text-align:center;">Edit Boss Moves</button>
            <button type="button" id="top-btn-edit-stats" class="button dossier-action-btn" style="border: 1px solid var(--cyan); color: var(--cyan); background: var(--cyan-dark); cursor: pointer; font-weight: 800; font-size: 10px; padding: 6px 4px; border-radius: 6px; text-align:center;">Edit Boss Stats</button>
          </div>
        ` : ""}

        <!-- Section 1: Raid Target -->
        <div class="boss-section" style="border-bottom:1px solid var(--border-soft); padding-bottom:12px; margin-bottom:4px;">
          <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px;">
            <h3 style="font-size:12px; font-weight:800; color:var(--muted); text-transform:uppercase; margin:0;">Raid Target</h3>
            ${!isBattle ? `<button type="button" id="section-btn-change-boss" class="button dossier-action-btn" style="border: 1px solid var(--cyan); color: var(--cyan); background: var(--cyan-dark); cursor: pointer; font-weight: 800; font-size: 10px; padding: 4px 8px; border-radius: 6px;">Change Boss</button>` : ""}
          </div>
          
          ${this.activeSection === "change-boss" && !isBattle ? `
            <div style="margin-bottom:12px; position:relative;">
              <label class="search-field" style="margin-top:4px;"><span class="sr-only">Search Pokémon name</span>
                <input id="boss-search" value="${this.query}" placeholder="Search Pokémon name…" autocomplete="off" style="width:100%;">
              </label>
              <div class="inline-results ${this.query ? "" : "hidden"}" id="boss-results" style="position:absolute; left:0; right:0; z-index:200; background:var(--bg-elevated); border:1px solid var(--border); border-radius:4px; max-height:200px; overflow-y:auto; box-shadow:0 8px 24px rgba(0,0,0,0.6); padding:4px;"></div>
            </div>
          ` : ""}
          
          ${boss ? `
            <div class="boss-identity">
              <div class="sprite-stage"><img src="${spriteUrl(boss.name)}" data-fallback="${fallbackSprite(boss)}" alt="${displayName(boss.name)} sprite"></div>
              <div>
                <p class="boss-name" style="margin-bottom:4px;">${this.state.manualBossOverride ? displayName(this.state.manualBossName || boss.name) : displayName(boss.name)}</p>
                <div class="type-row">
                  ${this.state.bossCurrentTypes.map((t) => `<span class="type-badge type-${t}">${t}</span>`).join("")}
                </div>
                ${JSON.stringify(this.state.bossCurrentTypes) !== JSON.stringify(boss.types.map(({ type }) => type.name)) ?
                  `<div class="type-diff-note" style="margin-top:4px; font-size:10px; color:var(--cyan); line-height:1.2;">
                    Current: ${this.state.bossCurrentTypes.map(titleCase).join("/")}<br>
                    <small style="color:var(--faint);">Original: ${boss.types.map(({ type }) => titleCase(type.name)).join("/")}</small>
                  </div>` : ""
                }
              </div>
            </div>
            <div class="boss-hp"><span>Scaled raid HP</span><strong>${compactNumber(isBattle ? this.state.bossHP : stats.hp)}</strong></div>
            <div class="stat-grid">${["atk","def","spa","spd","spe"].map((key) => `<div><span>${key.toUpperCase()}</span><strong>${stats[key].toLocaleString()}</strong></div>`).join("")}</div>
          ` : `<div class="loading-block">Loading boss dossier…</div>`}
        </div>

        <!-- Section 2: Boss Moves -->
        <div class="boss-section" style="border-bottom:1px solid var(--border-soft); padding-bottom:12px; margin-bottom:4px;">
          <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:6px;">
            <h3 style="font-size:12px; font-weight:800; color:var(--muted); text-transform:uppercase; margin:0;">Boss Moves</h3>
            ${!isBattle ? `<button type="button" id="section-btn-edit-moves" class="button dossier-action-btn" style="border: 1px solid var(--cyan); color: var(--cyan); background: var(--cyan-dark); cursor: pointer; font-weight: 800; font-size: 10px; padding: 4px 8px; border-radius: 6px;">Edit Boss Moves</button>` : ""}
          </div>
          
          <p style="font-size:10px; color:var(--faint); margin:0 0 8px 0; font-style:italic;">Click Edit Boss Moves to change boss attacks</p>

          ${this.activeSection === "edit-moves" && !isBattle ? `
            <div class="boss-moves-edit-grid" style="display:grid; gap:10px;">
              ${[0, 1, 2, 3].map((idx) => this.moveEditableMarkup(this.state.bossMoves[idx], idx)).join("")}
            </div>
          ` : `
            <div class="move-grid" style="display:grid; grid-template-columns:1fr 1fr; gap:8px;">
              ${[0, 1, 2, 3].map((idx) => {
                const move = this.state.bossMoves[idx];
                return move ? `
                  <div class="boss-move-badge" style="padding:6px; border:1px solid var(--border-soft); border-radius:4px; font-size:11px; background:var(--bg-card);">
                    <strong>${titleCase(move.name)}</strong>
                    <div style="display:flex; justify-content:space-between; font-size:9px; color:var(--muted); margin-top:2px;">
                      <span class="type-badge type-${move.type.name}" style="padding:1px 3px; font-size:8px;">${move.type.name}</span>
                      <span>BP: ${move.customPower ?? move.basePower ?? move.power ?? "—"}</span>
                    </div>
                  </div>
                ` : `
                  <div class="boss-move-badge empty" style="padding:6px; border:1px dashed var(--border-soft); border-radius:4px; font-size:11px; color:var(--faint); text-align:center;">
                    (Empty Slot)
                  </div>
                `;
              }).join("")}
            </div>
          `}
        </div>

        <!-- Section 3: Manual Overrides -->
        <div class="boss-section" style="padding-bottom:4px;">
          <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:6px;">
            <h3 style="font-size:12px; font-weight:800; color:var(--muted); text-transform:uppercase; margin:0;">Manual Boss Override</h3>
            ${!isBattle ? `<button type="button" id="section-btn-edit-stats" class="button dossier-action-btn" style="border: 1px solid var(--cyan); color: var(--cyan); background: var(--cyan-dark); cursor: pointer; font-weight: 800; font-size: 10px; padding: 4px 8px; border-radius: 6px;">Edit Boss Stats</button>` : ""}
          </div>
          
          <p style="font-size:10px; color:var(--faint); margin:0 0 8px 0; font-style:italic;">Click Edit Boss Stats to manually override boss HP/types/stats</p>

          ${this.state.manualBossOverride ? `
            <div style="display:inline-block; margin-bottom:8px; background:rgba(239, 68, 68, 0.2); border:1px solid rgba(239, 68, 68, 0.4); border-radius:4px; padding:4px 8px; font-size:10px; font-weight:800; color:var(--danger);">
              ⚠️ Manual Boss Override Active
            </div>
          ` : ""}

          ${this.activeSection === "edit-stats" && !isBattle ? `
            <div style="display:grid; gap:8px; border:1px solid var(--border-soft); padding:10px; border-radius:6px; background:var(--bg-elevated);">
              <label style="display:flex; align-items:center; gap:6px; font-size:11px; font-weight:800; cursor:pointer; user-select:none;">
                <input type="checkbox" id="manual-override-toggle" ${this.state.manualBossOverride ? "checked" : ""}>
                Manual Boss Override
              </label>

              <div id="manual-override-fields" style="${this.state.manualBossOverride ? "" : "opacity:0.5; pointer-events:none;"}">
                <!-- Display Name -->
                <div style="margin-bottom:6px;">
                  <label style="font-size:10px; color:var(--muted); display:block; margin-bottom:2px;">Boss Name</label>
                  <input type="text" id="manual-boss-name" value="${this.state.manualBossName || ""}" style="width:100%; font-size:11px; padding:4px 8px; background:var(--bg-card); border:1px solid var(--border-soft); color:var(--text);">
                </div>
                
                <!-- HP boundaries -->
                <div style="display:grid; grid-template-columns:1fr 1fr; gap:8px; margin-bottom:6px;">
                  <div>
                    <label style="font-size:10px; color:var(--muted); display:block; margin-bottom:2px;">Current HP</label>
                    <input type="number" id="manual-boss-hp" value="${this.state.manualBossHP}" style="width:100%; font-size:11px; padding:4px 8px; background:var(--bg-card); border:1px solid var(--border-soft); color:var(--text);">
                  </div>
                  <div>
                    <label style="font-size:10px; color:var(--muted); display:block; margin-bottom:2px;">Max HP</label>
                    <input type="number" id="manual-boss-max-hp" value="${this.state.manualBossMaxHP}" style="width:100%; font-size:11px; padding:4px 8px; background:var(--bg-card); border:1px solid var(--border-soft); color:var(--text);">
                  </div>
                </div>

                <div style="margin-bottom:6px;">
                  <label style="font-size:10px; color:var(--muted); display:block; margin-bottom:2px;">Current Types (comma-separated)</label>
                  <input type="text" id="manual-boss-types" value="${this.state.manualBossCurrentTypes?.join(", ") || ""}" placeholder="e.g. fire, flying" style="width:100%; font-size:11px; padding:4px 8px; background:var(--bg-card); border:1px solid var(--border-soft); color:var(--text);">
                </div>

                <!-- Stats Grids -->
                <h4 style="font-size:10px; font-weight:800; color:var(--cyan); margin:6px 0 2px 0; text-transform:uppercase;">Base Stats</h4>
                <div style="display:grid; grid-template-columns:repeat(6, 1fr); gap:4px; margin-bottom:6px;">
                  ${["hp", "atk", "def", "spa", "spd", "spe"].map(key => `
                    <div>
                      <label style="font-size:8px; color:var(--muted); display:block; text-transform:uppercase; text-align:center;">${key}</label>
                      <input type="number" data-manual-base-stat="${key}" value="${this.state.manualBossBaseStats[key]}" style="width:100%; font-size:10px; padding:2px; text-align:center; background:var(--bg-card); border:1px solid var(--border-soft); color:var(--text);">
                    </div>
                  `).join("")}
                </div>

                <h4 style="font-size:10px; font-weight:800; color:var(--cyan); margin:6px 0 2px 0; text-transform:uppercase;">Final Stats</h4>
                <div style="display:grid; grid-template-columns:repeat(5, 1fr); gap:4px; margin-bottom:6px;">
                  ${["atk", "def", "spa", "spd", "spe"].map(key => `
                    <div>
                      <label style="font-size:8px; color:var(--muted); display:block; text-transform:uppercase; text-align:center;">${key}</label>
                      <input type="number" data-manual-final-stat="${key}" value="${this.state.manualBossFinalStats[key]}" style="width:100%; font-size:10px; padding:2px; text-align:center; background:var(--bg-card); border:1px solid var(--border-soft); color:var(--text);">
                    </div>
                  `).join("")}
                </div>

                <h4 style="font-size:10px; font-weight:800; color:var(--cyan); margin:6px 0 2px 0; text-transform:uppercase;">Stat Stages</h4>
                <div style="display:grid; grid-template-columns:repeat(5, 1fr); gap:4px; margin-bottom:6px;">
                  ${["atk", "def", "spa", "spd", "spe"].map(key => `
                    <div>
                      <label style="font-size:8px; color:var(--muted); display:block; text-transform:uppercase; text-align:center;">${key}</label>
                      <input type="number" min="-6" max="6" data-manual-stage="${key}" value="${this.state.manualBossStages[key]}" style="width:100%; font-size:10px; padding:2px; text-align:center; background:var(--bg-card); border:1px solid var(--border-soft); color:var(--text);">
                    </div>
                  `).join("")}
                </div>

                <button type="button" id="apply-manual-overrides" class="button primary" style="font-size:11px; padding:6px; width:100%; margin-top:6px;">Apply Overrides</button>
              </div>
            </div>
          ` : ""}
        </div>

        <p class="microcopy" style="margin:4px 0 0 0;">Defenses use the 2.617 raid scalar. Split-modified values update here after simulation.</p>
      </section>`;
    
    this.bind();
  }

  moveEditableMarkup(move, index) {
    const basePower = move?.basePower ?? move?.power ?? null;
    const customPower = move?.customPower ?? basePower;
    return `
      <div class="boss-move-selector" style="border:1px solid var(--border-soft); padding:10px; border-radius:6px; background:var(--bg-elevated); display:grid; gap:8px;">
        <div style="display:flex; justify-content:space-between; align-items:center;">
          <strong style="font-size:12px; color:var(--text);">Move ${index + 1}</strong>
        </div>
        
        <div class="boss-move-selector-search" style="position:relative; display:flex; gap:6px;">
          <input type="text" class="move-search-input" data-boss-move-search="${index}" value="${move ? titleCase(move.name) : ""}" placeholder="Search boss move..." style="flex:1; font-size:12px; padding:6px 10px; background:var(--bg-card); border:1px solid var(--border); color:var(--text);" autocomplete="off">
          ${move ? `<button type="button" class="button danger" data-clear-boss-move="${index}" style="font-size:11px; padding:6px 12px; border-color:var(--danger); color:var(--danger); cursor:pointer;">Clear</button>` : ""}
        </div>
        <div class="boss-move-results hidden" style="position:absolute; left:0; right:0; z-index:999; background:var(--bg-elevated); border:1px solid var(--border); border-radius:4px; max-height:200px; overflow-y:auto; box-shadow:0 8px 24px rgba(0,0,0,0.6); padding:4px; display:grid; gap:2px;"></div>

        <div style="font-size:11px; display:grid; grid-template-columns:1fr auto; gap:12px; align-items:center; color:var(--muted);">
          <div>
            Type: <span class="type-badge type-${move?.type?.name || 'normal'}" style="font-size:8px; padding:1px 3px;">${move?.type?.name || 'normal'}</span> | 
            Category: <strong>${move ? titleCase(move.damage_class?.name || "status") : "—"}</strong>
          </div>
          <div style="display:flex; align-items:center; gap:4px;">
            <span>Base: <strong>${basePower ?? "—"}</strong></span> | 
            <span>Custom Power:</span>
            <input type="number" data-boss-custom-power="${index}" value="${customPower ?? ""}" style="width:55px; font-size:11px; padding:2px; background:var(--bg-card); border:1px solid var(--border); color:var(--text); text-align:center;">
          </div>
        </div>
      </div>
    `;
  }

  bind() {
    const isBattle = this.state.appView === "battle";
    
    // Wire up toggle handlers
    const toggleChangeBoss = () => {
      this.activeSection = this.activeSection === "change-boss" ? "none" : "change-boss";
      this.render();
    };
    const toggleEditMoves = () => {
      this.activeSection = this.activeSection === "edit-moves" ? "none" : "edit-moves";
      this.render();
    };
    const toggleEditStats = () => {
      this.activeSection = this.activeSection === "edit-stats" ? "none" : "edit-stats";
      this.render();
    };

    this.root.querySelector("#top-btn-change-boss")?.addEventListener("click", toggleChangeBoss);
    this.root.querySelector("#section-btn-change-boss")?.addEventListener("click", toggleChangeBoss);

    this.root.querySelector("#top-btn-edit-moves")?.addEventListener("click", toggleEditMoves);
    this.root.querySelector("#section-btn-edit-moves")?.addEventListener("click", toggleEditMoves);

    this.root.querySelector("#top-btn-edit-stats")?.addEventListener("click", toggleEditStats);
    this.root.querySelector("#section-btn-edit-stats")?.addEventListener("click", toggleEditStats);

    // Apply button hover animation scripts
    const editBtns = this.root.querySelectorAll(".dossier-action-btn");
    editBtns.forEach((btn) => {
      btn.style.transition = "all 0.15s ease";
      btn.addEventListener("mouseenter", () => {
        btn.style.background = "var(--cyan)";
        btn.style.color = "#041116";
      });
      btn.addEventListener("mouseleave", () => {
        btn.style.background = "var(--cyan-dark)";
        btn.style.color = "var(--cyan)";
      });
    });

    if (this.activeSection === "change-boss" && !isBattle) {
      const input = this.root.querySelector("#boss-search");
      const results = this.root.querySelector("#boss-results");
      
      input?.addEventListener("input", (event) => {
        this.query = event.target.value.toLowerCase().trimStart();
        results.classList.toggle("hidden", !this.query);
        const matched = this.filtered();
        const customSlug = this.query.trim().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
        const customOption = matched.length === 0 && customSlug && !BOSSES.includes(customSlug)
          ? `<button type="button" data-boss="${customSlug}">Load custom boss: "${displayName(customSlug)}"</button>`
          : "";
        results.innerHTML = matched.map((name) => `<button type="button" data-boss="${name}">${displayName(name)}</button>`).join("") + customOption || `<p>No raid boss found.</p>`;
        this.bindResultButtons();
      });
      this.bindResultButtons();
    }

    if (this.activeSection === "edit-moves" && !isBattle) {
      this.bindMoveSearch();
      this.root.querySelectorAll("[data-boss-custom-power]").forEach((input) => input.addEventListener("input", (event) => {
        const idx = Number(event.target.dataset.bossCustomPower);
        const move = this.state.bossMoves[idx];
        if (move) {
          move.customPower = event.target.value === "" ? null : Math.max(0, Number(event.target.value));
          this.state.emit("damage-input");
        }
      }));
    }

    if (this.activeSection === "edit-stats" && !isBattle) {
      const toggle = this.root.querySelector("#manual-override-toggle");
      toggle?.addEventListener("change", (e) => {
        this.state.manualBossOverride = e.target.checked;
        this.state.emit("damage-input");
        this.render();
      });

      this.root.querySelector("#apply-manual-overrides")?.addEventListener("click", () => {
        this.state.manualBossOverride = toggle.checked;
        this.state.manualBossName = this.root.querySelector("#manual-boss-name")?.value || "";
        this.state.manualBossHP = Math.max(0, Number(this.root.querySelector("#manual-boss-hp")?.value) || 0);
        this.state.manualBossMaxHP = Math.max(1, Number(this.root.querySelector("#manual-boss-max-hp")?.value) || 1);
        
        const typesText = this.root.querySelector("#manual-boss-types")?.value || "";
        this.state.manualBossCurrentTypes = typesText.split(",").map(t => t.trim().toLowerCase()).filter(Boolean);

        this.root.querySelectorAll("[data-manual-base-stat]").forEach(input => {
          const key = input.dataset.manualBaseStat;
          this.state.manualBossBaseStats[key] = Math.max(0, Number(input.value) || 0);
        });

        this.root.querySelectorAll("[data-manual-final-stat]").forEach(input => {
          const key = input.dataset.manualFinalStat;
          this.state.manualBossFinalStats[key] = Math.max(1, Number(input.value) || 1);
        });

        this.root.querySelectorAll("[data-manual-stage]").forEach(input => {
          const key = input.dataset.manualStage;
          this.state.manualBossStages[key] = Math.max(-6, Math.min(6, Number(input.value) || 0));
        });

        if (this.state.manualBossOverride) {
          this.state.bossHP = this.state.manualBossHP;
          this.state.bossMaxHP = this.state.manualBossMaxHP;
          this.state.bossCurrentTypes = [...this.state.manualBossCurrentTypes];
          this.state.bossStats = {
            hp: this.state.manualBossBaseStats.hp,
            atk: this.state.manualBossFinalStats.atk,
            def: this.state.manualBossFinalStats.def,
            spa: this.state.manualBossFinalStats.spa,
            spd: this.state.manualBossFinalStats.spd,
            spe: this.state.manualBossFinalStats.spe,
          };
          this.state.bossStages = { ...this.state.manualBossStages };
        }

        this.state.emit("damage-input");
        this.render();
      });
    }

    this.root.querySelectorAll("img[data-fallback]").forEach((img) => img.addEventListener("error", () => {
      if (img.dataset.fallback && img.src !== img.dataset.fallback) img.src = img.dataset.fallback;
    }, { once: true }));
  }

  bindResultButtons() {
    this.root.querySelectorAll("[data-boss]").forEach((button) => button.addEventListener("click", () => {
      this.load(button.dataset.boss);
      this.activeSection = "none";
    }));
  }

  bindMoveSearch() {
    this.root.querySelectorAll("[data-boss-move-search]").forEach((input) => {
      const index = Number(input.dataset.bossMoveSearch);
      
      const show = () => {
        clearTimeout(this.moveSearchTimer);
        this.moveSearchTimer = setTimeout(() => {
          this.showMoveResults(input, index);
        }, 150);
      };
      
      input.addEventListener("focus", show);
      input.addEventListener("input", show);
      
      input.closest(".boss-move-selector").addEventListener("focusout", () => {
        setTimeout(() => {
          const container = input.closest(".boss-move-selector");
          if (!container.contains(document.activeElement)) {
            container.querySelector(".boss-move-results").classList.add("hidden");
          }
        }, 150);
      });
    });

    this.root.querySelectorAll("[data-clear-boss-move]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const index = Number(btn.dataset.clearBossMove);
        this.state.bossMoves[index] = null;
        this.state.emit("damage-input");
        this.render();
      });
    });
  }

  async showMoveResults(input, index) {
    const results = input.closest(".boss-move-selector").querySelector(".boss-move-results");
    results.classList.remove("hidden");
    results.innerHTML = "<p style='font-size:10px; color:var(--muted);'>Loading moves…</p>";
    
    try {
      const source = await this.ensureGlobalMoves();
      const query = input.value.trim().toLowerCase().replaceAll(" ", "-");
      const matches = query
        ? source.filter((name) => name.includes(query)).slice(0, 10)
        : source.slice(0, 10);

      // Fetch move details concurrently
      const matchesData = await Promise.all(
        matches.map(async (name) => {
          try {
            return await getMove(name);
          } catch {
            return { name, type: { name: "normal" }, damage_class: { name: "physical" }, power: null };
          }
        })
      );

      results.innerHTML = matchesData.map((m) => `
        <button type="button" class="select-move-btn" data-select-boss-move="${m.name}" data-move-index="${index}" style="display:flex; justify-content:space-between; align-items:center; width:100%; text-align:left; background:var(--bg-card); border:1px solid var(--border-soft); padding:4px 8px; border-radius:4px; font-size:10px; cursor:pointer; color:var(--text);">
          <strong>${titleCase(m.name)}</strong>
          <span style="font-size:9px; opacity:0.8; display:flex; align-items:center; gap:4px;">
            <span class="type-badge type-${m.type?.name}" style="padding:1px 3px; font-size:8px;">${m.type?.name}</span>
            <span>${titleCase(m.damage_class?.name || "status")}</span>
            <span>BP: ${m.power ?? "—"}</span>
          </span>
        </button>
      `).join("") || "<p style='font-size:10px; color:var(--muted);'>No matching moves.</p>";

      results.querySelectorAll("[data-select-boss-move]").forEach((button) => {
        button.addEventListener("click", () => {
          this.selectMove(Number(button.dataset.moveIndex), button.dataset.selectBossMove);
        });
      });
    } catch (err) {
      results.innerHTML = `<p style='font-size:10px; color:var(--muted);'>Error loading moves: ${err.message}</p>`;
    }
  }

  async selectMove(index, name) {
    try {
      const move = prepareMove(await getMove(name));
      this.state.bossMoves[index] = move;
      this.state.emit("damage-input");
      this.render();
    } catch (e) {
      console.error(e);
    }
  }

  async load(name) {
    this.root.classList.add("is-loading");
    try {
      const pokemon = await getPokemon(name);
      this.query = "";

      if (this.state.battleActive) this.state.resetBattle();
      this.state.setBoss(pokemon, calculateBossStats(pokemon));
      this.state.bossCurrentTypes = pokemon.types.map(({ type }) => type.name);

      const learnset = pokemon.moves.map(({ move }) => move.name).sort();
      const defaultMoves = learnset.slice(0, 4);

      this.state.bossMoves = [null, null, null, null];
      for (let i = 0; i < 4; i++) {
        if (defaultMoves[i]) {
          try {
            this.state.bossMoves[i] = prepareMove(await getMove(defaultMoves[i]));
          } catch {
            this.state.bossMoves[i] = null;
          }
        }
      }

      this.state.emit("boss");
      this.render();
    } catch (error) {
      this.root.innerHTML = `<section class="panel error-state"><h2>Boss link interrupted</h2><p>${error.message}. Check your connection and retry.</p><button id="retry-boss" class="button primary">Retry</button></section>`;
      this.root.querySelector("#retry-boss")?.addEventListener("click", () => this.load(name));
    } finally {
      this.root.classList.remove("is-loading");
    }
  }
}
