import {
  getItem,
  getItemIndex,
  getMove,
  getMoveIndex,
  getPokemon,
  searchPokemon,
} from "../api/pokeapi.js";
import { NATURES, natureDropdownLabel } from "../data/natures.js";
import { calculatePokemonStats, STAT_KEYS } from "../core/stats.js";
import { copyText, displayName, fallbackSprite, spriteUrl, titleCase } from "../utils/format.js";
import { ABILITY_EFFECTS } from "../data/ability-effects.js";
import { MOVE_MECHANICS_AUDIT } from "../data/move-effects.js";
import { openSearchDropdown, setupSearchDropdownController } from "./search-dropdown.js";

const TERA_TYPES = [
  "normal", "fire", "water", "electric", "grass", "ice", "fighting", "poison", "ground",
  "flying", "psychic", "bug", "rock", "ghost", "dragon", "dark", "steel", "fairy"
];

const FEATURED_MOVES = ["guard-split", "power-split", "swords-dance", "nasty-plot", "focus-energy", "baton-pass"];
const SMEARGLE_RAID_MOVES = [
  ...FEATURED_MOVES,
  "spore", "screech", "metal-sound", "helping-hand", "fake-tears", "simple-beam", "skill-swap", "gastro-acid",
  "last-respects", "stored-power", "power-trip", "rage-fist", "low-kick", "grass-knot", "heavy-slam",
  "heat-crash", "gyro-ball", "electro-ball", "return", "frustration", "reversal", "flail", "eruption",
  "water-spout", "crush-grip", "wring-out", "close-combat", "v-create", "fishious-rend", "bolt-strike", "blue-flare",
];
const CURATED_ITEMS = [
  "life-orb", "choice-band", "choice-specs", "choice-scarf", "muscle-band", "wise-glasses", "expert-belt", "metronome",
  "focus-sash", "leftovers", "shell-bell", "kings-rock", "scope-lens", "razor-claw",
  "stick", "leek",
  "normal-gem", "fire-gem", "water-gem", "electric-gem", "grass-gem", "ice-gem", "fighting-gem",
  "poison-gem", "ground-gem", "flying-gem", "psychic-gem", "bug-gem", "rock-gem", "ghost-gem",
  "dragon-gem", "dark-gem", "steel-gem", "fairy-gem",
  "flame-plate", "splash-plate", "zap-plate", "meadow-plate", "icicle-plate", "fist-plate",
  "toxic-plate", "earth-plate", "sky-plate", "mind-plate", "insect-plate", "stone-plate",
  "spooky-plate", "draco-plate", "dread-plate", "iron-plate", "pixie-plate",
  "silk-scarf", "charcoal", "mystic-water", "magnet", "miracle-seed", "never-melt-ice",
  "black-belt", "poison-barb", "soft-sand", "sharp-beak", "twisted-spoon", "silver-powder",
  "hard-stone", "spell-tag", "dragon-fang", "black-glasses", "metal-coat", "fairy-feather",
  "normalium-z", "ghostium-z",
];

const ITEM_EFFECT_DESCRIPTIONS = {
  "normalium-z": "Normalium Z — Allows one Normal-type Z-Move. Z-Belly Drum restores HP before using Belly Drum.",
  "ghostium-z": "Ghostium Z — Allows Z-Trick-or-Treat to raise all stats before adding Ghost type.",
  "life-orb": "Damage ×1.3",
  "choice-band": "Physical Attack ×1.5",
  "choice-specs": "Special Attack ×1.5",
  "choice-scarf": "Speed ×1.5; no direct damage boost",
  "expert-belt": "Super-effective damage ×1.2",
  "muscle-band": "Physical damage ×1.1",
  "wise-glasses": "Special damage ×1.1",
  metronome: "Manual repeated-move multiplier",
  "scope-lens": "Critical-hit stage +1",
  "razor-claw": "Critical-hit stage +1",
  stick: "Farfetch’d critical-hit stage +2",
  leek: "Farfetch’d/Sirfetch’d critical-hit stage +2",
};

const isSmeargle = (pokemon) => pokemon?.name === "smeargle";
const isSelectableMove = (name) => ![
  "max-", "g-max-", "shadow-",
].some((prefix) => name.startsWith(prefix)) && !name.endsWith("-z") && !name.includes("gmax");
const prepareMove = (move) => move ? {
  ...move,
  basePower: move.power ?? null,
  customPower: move.power ?? null,
} : null;
const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const normalizeSpreadValue = (field, rawValue) => {
  const numeric = Number(rawValue);
  const safeValue = Number.isFinite(numeric) ? numeric : 0;
  if (field === "ev") {
    return clamp(Math.round(clamp(safeValue, 0, 252) / 4) * 4, 0, 252);
  }
  return clamp(Math.round(safeValue), 0, 31);
};

export class TeamBuilder {
  constructor(root, state, persistence = null) {
    this.root = root;
    this.state = state;
    this.persistence = persistence;
    this.searchTimer = null;
    this.globalMoves = null;
    this.globalItems = null;
    setupSearchDropdownController(this.root);
    this.persistence?.addEventListener("status", (event) => this.updatePersistenceStatus(event.detail));
    this.render();
    if (!this.state.team.some((slot) => slot.pokemon)) {
      this.loadPokemon(0, "mew", ["psychic", "nasty-plot", "focus-energy", "baton-pass"]);
    }
  }

  render() {
    const active = this.state.team[this.state.activeEditor];
    this.root.innerHTML = `
      <section class="team-shell" aria-labelledby="team-title">
        <div class="workspace-heading">
          <div><span class="eyebrow">Strike team</span><h1 id="team-title">Build the raid line</h1><p>Configure six attackers, then choreograph the full 21-turn run.</p></div>
          <div class="workspace-actions">
            ${this.persistence ? `<div class="persistence-tools" aria-label="Setup save controls">
              <div class="persistence-buttons">
                <button type="button" data-save-setup-only>Save Setup Only</button>
                <button type="button" data-save-full-battle>Save Full Battle State</button>
                <button type="button" data-reset-battle-only>Reset Battle Only</button>
                <button type="button" data-import-setup>Import Setup</button>
                <button type="button" class="danger-text" data-clear-all-saved>Clear All Saved Data</button>
              </div>
              <span class="autosave-status" role="status">${this.persistence.lastStatus}</span>
            </div>` : ""}
            <div class="team-count"><strong>${this.state.team.filter((slot) => slot.pokemon).length}</strong><span>/ 6 ready</span></div>
          </div>
        </div>
        <div class="team-tabs" role="tablist" aria-label="Team slots">
          ${this.state.team.map((slot, index) => this.tab(slot, index)).join("")}
        </div>
        <div class="editor-card">${this.editor(active)}</div>
        ${this.persistence ? `<dialog class="import-dialog" id="import-setup-dialog">
          <form method="dialog">
            <div class="dialog-heading"><div><span class="eyebrow">Portable setup</span><h2>Import raid JSON</h2></div><button type="submit" aria-label="Close import dialog">×</button></div>
            <label><span>Setup JSON</span><textarea id="import-setup-json" rows="12" placeholder="Paste exported Myuu Raid setup JSON here…"></textarea></label>
            <span class="dialog-status" role="status">${this.persistence.lastStatus}</span>
            <div class="dialog-actions"><button type="submit" class="button">Cancel</button><button type="button" class="button primary" data-apply-import>Import setup</button></div>
          </form>
        </dialog>` : ""}
      </section>`;
    this.bind();
  }

  tab(slot, index) {
    const selected = index === this.state.activeEditor;
    return `<button type="button" class="team-tab ${selected ? "active" : ""}" role="tab" aria-selected="${selected}" data-slot-tab="${index}">
      <span class="slot-number">0${index + 1}</span>
      ${slot.pokemon ? `<img src="${spriteUrl(slot.pokemon.name)}" data-fallback="${fallbackSprite(slot.pokemon)}" alt="">` : `<span class="empty-ball">+</span>`}
      <span class="tab-copy"><strong>${slot.pokemon ? displayName(slot.pokemon.name) : "Empty slot"}</strong><small>${slot.pokemon ? `${titleCase(slot.item || "No item")} · ${titleCase(slot.ability || "No ability")}` : "Add Pokémon"}</small></span>
    </button>`;
  }

  editor(build) {
    if (!build.pokemon) return `
      <div class="empty-editor">
        <span class="empty-editor-icon">＋</span><h2>Recruit slot ${this.state.activeEditor + 1}</h2>
        <p>Search the complete Pokédex to add an attacker.</p>
        ${this.searchMarkup()}
      </div>`;
    const pokemon = build.pokemon;
    const learnset = [...new Set(pokemon.moves.map(({ move }) => move.name))].sort();
    const smeargleMode = isSmeargle(pokemon);
    return `
      <div class="editor-header">
        <div class="editor-mon">
          <div class="portrait"><img src="${spriteUrl(pokemon.name)}" data-fallback="${fallbackSprite(pokemon)}" alt="${displayName(pokemon.name)} sprite"></div>
          <div><span class="eyebrow">Slot ${this.state.activeEditor + 1}</span><h2>${displayName(pokemon.name)}</h2><div class="type-row">${pokemon.types.map(({ type }) => `<span class="type-badge type-${type.name}">${type.name}</span>`).join("")}</div></div>
        </div>
        <button type="button" class="text-button" id="replace-pokemon">Replace Pokémon</button>
      </div>
      <div id="replace-search" class="replace-search hidden">${this.searchMarkup()}</div>
      <div class="editor-grid">
        <div class="config-column">
          <div class="field-row four">
            <label><span>Level</span><input id="level" type="number" min="1" max="100" value="${build.level}"></label>
            <label><span>Nature</span><select id="nature">${Object.keys(NATURES).map((name) => `<option value="${name}" ${(build.nature || "").toLowerCase() === name ? "selected" : ""}>${natureDropdownLabel(name)}</option>`).join("")}</select></label>
            <label><span>Ability</span><select id="ability">${pokemon.abilities.map(({ ability }) => `<option value="${ability.name}" ${build.ability === ability.name ? "selected" : ""}>${titleCase(ability.name)}</option>`).join("")}</select></label>
            <label><span>Tera Type</span><select id="tera-type">${TERA_TYPES.map((type) => `<option value="${type}" ${(build.teraType || "").toLowerCase() === type ? "selected" : ""}>${titleCase(type)}</option>`).join("")}</select></label>
          </div>
          ${this.abilityInfoMarkup(build)}
          ${this.itemSelectorMarkup(build)}
          <fieldset class="move-fieldset"><legend>Moveset</legend>
            <div class="move-grid">${build.moves.map((move, index) => this.moveSelectorMarkup(move, index, smeargleMode)).join("")}
            </div>
            <p class="dynamic-power-hint">Edit power for dynamic moves like Last Respects, Stored Power, Power Trip, Low Kick, Heavy Slam, Gyro Ball, Electro Ball, and similar moves.</p>
            <div class="quick-moves"><span>Setup:</span>${FEATURED_MOVES.filter((name) => smeargleMode || learnset.includes(name)).map((name) => `<button type="button" class="${build.moves.some((move) => move?.name === name) ? "selected" : ""}" data-quick-move="${name}">${titleCase(name)}</button>`).join("") || `<small>No featured setup moves in learnset</small>`}</div>
            ${smeargleMode ? `<p class="selector-hint smeargle-hint">Smeargle mode: search and select raid setup or attacking moves from the global move list.</p>` : ""}
          </fieldset>
        </div>
        <div class="numbers-column">
          <div class="calculated-stats" id="calculated-stats">${this.statsMarkup(build)}</div>
          <div class="spread-table">
            <div class="spread-head stat-row"><span>Stat</span><span>EV</span><span></span><span>IV</span><span></span><span>Stage</span></div>
            ${STAT_KEYS.map((key) => `<div class="spread-row stat-row">
              <strong>${key.toUpperCase()}</strong>
              <label class="spread-control spread-control-ev"><span class="sr-only">${key} EV slider</span><input type="range" min="0" max="252" step="4" value="${build.evs[key]}" data-stat-input data-control="range" data-field="ev" data-stat="${key}"></label>
              <input class="spread-number spread-number-ev" aria-label="${key} EV value" type="number" inputmode="numeric" min="0" max="252" step="4" value="${build.evs[key]}" data-stat-input data-control="number" data-field="ev" data-stat="${key}">
              <label class="spread-control spread-control-iv"><span class="sr-only">${key} IV slider</span><input type="range" min="0" max="31" step="1" value="${build.ivs[key]}" data-stat-input data-control="range" data-field="iv" data-stat="${key}"></label>
              <input class="spread-number spread-number-iv" aria-label="${key} IV value" type="number" inputmode="numeric" min="0" max="31" step="1" value="${build.ivs[key]}" data-stat-input data-control="number" data-field="iv" data-stat="${key}">
              ${key === "hp"
                ? `<select aria-label="HP has no stat stage" disabled><option>—</option></select>`
                : `<select data-stage="${key}" aria-label="${key} initial stage">${Array.from({length:13},(_,i)=>i-6).map((value) => `<option value="${value}" ${build.stages[key] === value ? "selected" : ""}>${value > 0 ? "+" : ""}${value}</option>`).join("")}</select>`}
            </div>`).join("")}
            <div class="ev-total ${this.evTotal(build) > 510 ? "over" : ""}" id="ev-total" role="status">
              <span>Total EVs</span><strong>${this.evTotal(build)} / 510</strong>${this.evTotal(build) > 510 ? `<em>EV total exceeds 510.</em>` : ""}
            </div>
          </div>
        </div>
      </div>`;
  }

  abilityInfoMarkup(build) {
    if (!build.ability) return "";
    const name = build.ability;
    const effect = ABILITY_EFFECTS[name];
    if (effect) {
      const statusText = effect.status === "Partial" ? `Partial: ${effect.details || ""}` : effect.status;
      return `<small class="selector-hint ability-effect" style="display:block; margin: -6px 0 10px 0; font-size:11px; line-height:1.45; color:var(--muted);"><strong>${effect.name}</strong> — ${effect.description} — <span style="color: ${effect.status === 'Implemented' ? 'var(--success)' : (effect.status === 'TODO' ? 'var(--danger)' : 'var(--amber)')}; font-weight:800;">${statusText}</span></small>`;
    } else {
      return `<small class="selector-hint ability-effect" style="display:block; margin: -6px 0 10px 0; font-size:11px; line-height:1.45; color:var(--muted);"><strong>${titleCase(name)}</strong> — No special battle effect — <span style="color: var(--faint); font-weight:800;">Display Only</span></small>`;
    }
  }

  itemSelectorMarkup(build) {
    const itemEffect = build.itemData?.effect_entries?.find(({ language }) => language.name === "en")?.short_effect;
    return `<div class="selector-search item-selector">
      <label><span>Held item</span><input data-item-search value="${build.item ? titleCase(build.item) : ""}" placeholder="Search held items…" autocomplete="off" aria-expanded="false"></label>
      <div class="inline-results selector-results hidden" data-item-results></div>
      ${build.item ? `<small class="selector-hint item-effect">${ITEM_EFFECT_DESCRIPTIONS[build.item] || itemEffect || "Held item selected; effect may be informational only."}</small>` : ""}
      ${build.item === "metronome" ? `<label class="metronome-control"><span>Repeated-move multiplier</span><input type="number" data-metronome-multiplier min="1" max="2" step="0.1" value="${build.metronomeMultiplier || 1}"></label>` : ""}
    </div>`;
  }

  moveSelectorMarkup(move, index, smeargleMode) {
    const basePower = move?.basePower ?? move?.power ?? null;
    const customPower = move?.customPower ?? basePower;
    const mechanics = move ? MOVE_MECHANICS_AUDIT[move.name] : null;
    return `<div class="selector-search move-selector">
      <label><span>Move ${index + 1}</span><input data-move-search="${index}" value="${move ? titleCase(move.name) : ""}" placeholder="${smeargleMode ? "Search all moves…" : "Search learnset…"}" autocomplete="off" aria-expanded="false"></label>
      <div class="inline-results selector-results hidden" data-move-results="${index}"></div>
      ${move
        ? `<div class="move-detail">
            <small class="move-meta"><span class="type-badge type-${move.type.name}">${move.type.name}</span>${titleCase(move.damage_class.name)}</small>
            <div class="power-controls">
              <span>Base <strong>${basePower ?? "—"}</strong></span>
              <label><span>Custom power</span><input type="number" min="0" max="9999" step="1" data-custom-power="${index}" value="${customPower ?? ""}" placeholder="—"></label>
            </div>
            ${mechanics ? `<small class="move-mechanics-status status-${mechanics.status.toLowerCase().replaceAll(" ", "-")}"><strong>${mechanics.status}</strong> — ${mechanics.description}</small>` : ""}
          </div>`
        : `<small>${smeargleMode ? "Global Sketch-compatible move search" : "Filtered to this Pokémon's learnset"}</small>`}
    </div>`;
  }

  searchMarkup() {
    return `<div class="pokemon-search"><label><span class="sr-only">Search Pokémon</span><input data-pokemon-search placeholder="Search any Pokémon…" autocomplete="off" aria-expanded="false"></label><div class="inline-results search-results hidden"><p>Start typing to search.</p></div></div>`;
  }

  statsMarkup(build) {
    const currentNatureKey = typeof build.nature === "string" ? build.nature.toLowerCase() : "";
    const nature = NATURES[currentNatureKey];
    return STAT_KEYS.map((key) => {
      let suffix = "";
      if (key !== "hp" && nature) {
        if (nature.increased === key) {
          suffix = " ▲";
        } else if (nature.decreased === key) {
          suffix = " ▼";
        }
      }
      return `<div><span>${key.toUpperCase()}</span><strong>${build.stats[key] || "—"}${suffix}</strong></div>`;
    }).join("");
  }

  bind() {
    this.bindPersistenceControls();
    this.root.querySelectorAll("[data-slot-tab]").forEach((button) => button.addEventListener("click", () => {
      this.state.activeEditor = Number(button.dataset.slotTab);
      this.state.emit("selection");
      this.render();
    }));
    this.root.querySelector("#replace-pokemon")?.addEventListener("click", () => this.root.querySelector("#replace-search")?.classList.toggle("hidden"));
    this.bindSearch();
    this.root.querySelectorAll("img[data-fallback]").forEach((img) => img.addEventListener("error", () => {
      if (img.dataset.fallback && img.src !== img.dataset.fallback) img.src = img.dataset.fallback;
    }, { once: true }));

    const build = this.state.team[this.state.activeEditor];
    if (!build.pokemon) return;
    ["level", "nature", "ability", "tera-type"].forEach((id) => this.root.querySelector(`#${id}`)?.addEventListener("change", (event) => {
      const prop = id === "tera-type" ? "teraType" : id;
      build[prop] = id === "level" ? Math.max(1, Math.min(100, Number(event.target.value))) : event.target.value;
      this.recalculate(build);
      if (id === "ability") this.refreshTabs();
    }));
    this.bindMoveSearch(build);
    this.bindItemSearch(build);
    this.root.querySelectorAll("[data-custom-power]").forEach((input) => input.addEventListener("input", (event) => {
      const move = build.moves[Number(event.target.dataset.customPower)];
      if (!move) return;
      // TODO: Automatically derive power for dynamic moves once their battle-state inputs are modeled.
      move.customPower = event.target.value === "" ? null : Math.max(0, Number(event.target.value));
      this.state.emit("damage-input");
    }));
    this.root.querySelector("[data-metronome-multiplier]")?.addEventListener("input", (event) => {
      build.metronomeMultiplier = Math.max(1, Math.min(2, Number(event.target.value) || 1));
      this.state.emit("damage-input");
    });
    this.bindSpreadEditor(build);
    this.root.querySelectorAll("[data-stage]").forEach((select) => select.addEventListener("change", (event) => {
      build.stages[event.target.dataset.stage] = Number(event.target.value);
      this.state.emit("team");
    }));
    this.root.querySelectorAll("[data-quick-move]").forEach((button) => button.addEventListener("click", async () => {
      const emptyIndex = build.moves.findIndex((move) => !move);
      const existingIndex = build.moves.findIndex((move) => move?.name === button.dataset.quickMove);
      if (existingIndex >= 0) return;
      await this.selectMove(build, emptyIndex >= 0 ? emptyIndex : 0, button.dataset.quickMove);
    }));
  }

  bindSpreadEditor(build) {
    const table = this.root.querySelector(".spread-table");
    if (!table) return;
    table.addEventListener("input", (event) => {
      const target = event.target;
      if (!target.matches("[data-stat-input]")) return;
      this.updateStatInput(this.state.activeEditor, target.dataset.stat, target.dataset.field, target.value);
    });
  }

  updateStatInput(slotIndex, stat, field, rawValue) {
    if (!STAT_KEYS.includes(stat) || !["ev", "iv"].includes(field)) return;
    const build = this.state.team[slotIndex];
    if (!build?.pokemon) return;
    const group = field === "ev" ? "evs" : "ivs";
    const value = normalizeSpreadValue(field, rawValue);
    build[group][stat] = value;
    this.root.querySelectorAll(`[data-stat-input][data-stat="${stat}"][data-field="${field}"]`).forEach((input) => {
      input.value = value;
    });
    this.updateEvTotal(build);
    this.renderStatPreviewOnly(build);
    this.persistence?.scheduleAutosave();
  }

  updateSpreadValue(build, stat, field, rawValue) {
    const slotIndex = this.state.team.indexOf(build);
    this.updateStatInput(slotIndex >= 0 ? slotIndex : this.state.activeEditor, stat, field, rawValue);
  }

  renderStatPreviewOnly(build) {
    if (typeof build.nature !== "string" || !NATURES[build.nature.toLowerCase()]) {
      build.nature = "hardy";
    } else {
      build.nature = build.nature.toLowerCase();
    }
    build.stats = calculatePokemonStats(build.pokemon, build);
    const statsNode = this.root.querySelector("#calculated-stats");
    if (statsNode) statsNode.innerHTML = this.statsMarkup(build);
  }

  evTotal(build) {
    return STAT_KEYS.reduce((total, stat) => total + (Number(build.evs[stat]) || 0), 0);
  }

  updateEvTotal(build) {
    const node = this.root.querySelector("#ev-total");
    if (!node) return;
    const total = this.evTotal(build);
    node.classList.toggle("over", total > 510);
    node.innerHTML = `<span>Total EVs</span><strong>${total} / 510</strong>${total > 510 ? `<em>EV total exceeds 510.</em>` : ""}`;
  }

  updatePersistenceStatus(message) {
    this.root.querySelectorAll(".autosave-status, .dialog-status").forEach((node) => {
      node.textContent = message;
    });
  }

  bindPersistenceControls() {
    if (!this.persistence) return;
    this.root.querySelector("[data-save-setup-only]")?.addEventListener("click", () => {
      this.persistence.save(true, false);
    });
    this.root.querySelector("[data-save-full-battle]")?.addEventListener("click", () => {
      this.persistence.save(true, true);
    });
    this.root.querySelector("[data-reset-battle-only]")?.addEventListener("click", () => {
      if (window.confirm("Reset current battle simulation?")) {
        this.state.resetBattle();
      }
    });
    this.root.querySelector("[data-clear-all-saved]")?.addEventListener("click", () => {
      if (window.confirm("Delete all saved Myuu Raid data from this browser?")) {
        this.persistence.clear();
      }
    });
    this.root.querySelector("[data-export-setup]")?.addEventListener("click", async () => {
      await copyText(this.persistence.exportJson());
      this.persistence.status("Setup JSON copied");
    });
    const dialog = this.root.querySelector("#import-setup-dialog");
    this.root.querySelector("[data-import-setup]")?.addEventListener("click", () => dialog?.showModal());
    this.root.querySelector("[data-apply-import]")?.addEventListener("click", async () => {
      const text = this.root.querySelector("#import-setup-json")?.value || "";
      if (await this.persistence.importJson(text)) dialog?.close();
    });
  }

  async ensureGlobalMoves() {
    if (this.globalMoves) return this.globalMoves;
    const data = await getMoveIndex();
    this.globalMoves = data.results.map(({ name }) => name).filter(isSelectableMove).sort();
    console.log("[Myuu debug] loaded global move count:", this.globalMoves.length);
    return this.globalMoves;
  }

  async ensureGlobalItems() {
    if (this.globalItems) return this.globalItems;
    const data = await getItemIndex();
    this.globalItems = [...new Set([...CURATED_ITEMS, ...data.results.map(({ name }) => name)])];
    return this.globalItems;
  }

  bindMoveSearch(build) {
    this.root.querySelectorAll("[data-move-search]").forEach((input) => {
      const index = Number(input.dataset.moveSearch);
      const show = () => this.showMoveResults(input, build, index);
      input.addEventListener("focus", show);
      input.addEventListener("click", show);
      input.addEventListener("input", show);
      input.closest(".selector-search").addEventListener("focusout", () => setTimeout(() => {
        const container = input.closest(".selector-search");
        if (!container.contains(document.activeElement)) {
          container.querySelector(".selector-results").classList.add("hidden");
          input.setAttribute("aria-expanded", "false");
        }
      }));
    });
  }

  async showMoveResults(input, build, index) {
    const results = input.closest(".selector-search").querySelector(".selector-results");
    openSearchDropdown(input, results);
    results.innerHTML = "<p>Loading moves…</p>";
    const smeargleMode = isSmeargle(build.pokemon);
    const learnset = [...new Set(build.pokemon.moves.map(({ move }) => move.name))].sort();
    const source = smeargleMode ? await this.ensureGlobalMoves() : learnset;
    const query = input.value.trim().toLowerCase().replaceAll(" ", "-");
    const recommended = smeargleMode ? SMEARGLE_RAID_MOVES : FEATURED_MOVES.filter((name) => learnset.includes(name));
    const matches = query
      ? source.filter((name) => name.includes(query)).sort((a, b) => Number(recommended.includes(b)) - Number(recommended.includes(a))).slice(0, 14)
      : [...new Set([...recommended, ...source])].slice(0, 14);
    results.innerHTML = `${build.moves[index] ? `<button type="button" class="clear-selection" data-clear-move="${index}">Clear move</button>` : ""}${
      matches.map((name) => `<button type="button" data-select-move="${name}" data-move-index="${index}">${titleCase(name)}${recommended.includes(name) ? `<small>Raid pick</small>` : ""}</button>`).join("")
      || "<p>No matching valid moves.</p>"
    }`;
    results.querySelector("[data-clear-move]")?.addEventListener("click", () => {
      build.moves[index] = null;
      this.state.resetSimulation();
      this.state.emit("team");
      this.render();
    });
    results.querySelectorAll("[data-select-move]").forEach((button) => button.addEventListener("click", () => this.selectMove(build, Number(button.dataset.moveIndex), button.dataset.selectMove)));
  }

  async selectMove(build, index, name) {
    const move = prepareMove(await getMove(name));
    if (!move?.damage_class?.name || !move?.type?.name || !isSelectableMove(move.name)) return;
    build.moves[index] = move;
    console.log("[Myuu debug] selected move data:", move);
    this.state.resetSimulation();
    this.state.emit("team");
    this.render();
  }

  bindItemSearch(build) {
    const input = this.root.querySelector("[data-item-search]");
    if (!input) return;
    const show = () => this.showItemResults(input, build);
    input.addEventListener("focus", show);
    input.addEventListener("click", show);
    input.addEventListener("input", show);
    input.closest(".selector-search").addEventListener("focusout", () => setTimeout(() => {
      const container = input.closest(".selector-search");
      if (!container.contains(document.activeElement)) {
        container.querySelector(".selector-results").classList.add("hidden");
        input.setAttribute("aria-expanded", "false");
      }
    }));
  }

  async showItemResults(input, build) {
    const results = input.closest(".selector-search").querySelector(".selector-results");
    openSearchDropdown(input, results);
    results.innerHTML = "<p>Loading held items…</p>";
    const items = await this.ensureGlobalItems();
    const query = input.value.trim().toLowerCase().replaceAll(" ", "-");
    const matches = query
      ? items.filter((name) => name.includes(query)).sort((a, b) => Number(CURATED_ITEMS.includes(b)) - Number(CURATED_ITEMS.includes(a))).slice(0, 14)
      : CURATED_ITEMS.slice(0, 14);
    results.innerHTML = `${build.item ? `<button type="button" class="clear-selection" data-clear-item>Clear held item</button>` : ""}${
      matches.map((name) => `<button type="button" data-select-item="${name}">${titleCase(name)}${CURATED_ITEMS.includes(name) ? `<small>Raid item</small>` : ""}</button>`).join("")
      || "<p>No matching items.</p>"
    }`;
    results.querySelector("[data-clear-item]")?.addEventListener("click", () => {
      build.item = "";
      build.itemData = null;
      build.metronomeMultiplier = 1;
      this.state.emit("damage-input");
      this.state.emit("team");
      this.render();
    });
    results.querySelectorAll("[data-select-item]").forEach((button) => button.addEventListener("click", () => this.selectItem(build, button.dataset.selectItem)));
  }

  async selectItem(build, name) {
    let itemData = null;
    try {
      itemData = await getItem(name);
    } catch (error) {
      console.warn("[Myuu debug] item detail unavailable; storing slug:", name, error);
    }
    build.item = name;
    build.itemData = itemData;
    if (name !== "metronome") build.metronomeMultiplier = 1;
    console.log("[Myuu debug] selected item data:", itemData || { name });
    this.state.emit("damage-input");
    this.state.emit("team");
    this.render();
  }

  bindSearch() {
    this.root.querySelectorAll("[data-pokemon-search]").forEach((input) => {
      const show = () => {
        clearTimeout(this.searchTimer);
        const results = input.closest(".pokemon-search").querySelector(".search-results");
        openSearchDropdown(input, results);
        if (input.value.trim().length < 2) {
          results.innerHTML = "<p>Type at least two characters.</p>";
          return;
        }
        results.innerHTML = "<p>Scanning Pokédex…</p>";
        const query = input.value;
        this.searchTimer = setTimeout(async () => {
          try {
            const matches = await searchPokemon(query);
            if (!input.isConnected || input.value !== query) return;
            results.innerHTML = matches.map(({ name }) => `<button type="button" data-pokemon="${name}">${displayName(name)}</button>`).join("") || "<p>No Pokémon found.</p>";
            results.querySelectorAll("[data-pokemon]").forEach((button) => button.addEventListener("click", () => this.loadPokemon(this.state.activeEditor, button.dataset.pokemon)));
          } catch {
            if (input.isConnected) results.innerHTML = "<p>Search unavailable. Check your connection.</p>";
          }
        }, 120);
      };
      input.addEventListener("focus", show);
      input.addEventListener("click", show);
      input.addEventListener("input", show);
    });
  }

  async loadPokemon(index, name, defaultMoves = []) {
    try {
      const pokemon = await getPokemon(name);
      const build = this.state.team[index];
      const previousMoves = [...build.moves];
      const smeargleMode = isSmeargle(pokemon);
      const learnset = new Set(pokemon.moves.map(({ move }) => move.name));
      build.pokemon = pokemon;
      build.ability = pokemon.abilities[0]?.ability.name || "";
      build.teraType = pokemon.types[0]?.type?.name || "normal";
      build.moves = defaultMoves.length
        ? await Promise.all([0,1,2,3].map(async (slot) => defaultMoves[slot] ? prepareMove(await getMove(defaultMoves[slot])) : null))
        : previousMoves.map((move) => move && (smeargleMode || learnset.has(move.name)) ? move : null);
      if (typeof build.nature !== "string" || !NATURES[build.nature.toLowerCase()]) {
        build.nature = "hardy";
      } else {
        build.nature = build.nature.toLowerCase();
      }
      build.stats = calculatePokemonStats(pokemon, build);
      console.log("[Myuu debug] selected Pokémon slug:", pokemon.name);
      console.log("[Myuu debug] Smeargle global move mode:", smeargleMode);
      if (smeargleMode) await this.ensureGlobalMoves();
      this.state.resetSimulation();
      this.state.emit("team");
      this.render();
    } catch (error) {
      console.error(error);
    }
  }

  recalculate(build) {
    if (typeof build.nature !== "string" || !NATURES[build.nature.toLowerCase()]) {
      build.nature = "hardy";
    } else {
      build.nature = build.nature.toLowerCase();
    }
    build.stats = calculatePokemonStats(build.pokemon, build);
    this.root.querySelector("#calculated-stats").innerHTML = this.statsMarkup(build);
    this.state.emit("team");
    this.state.emit("damage-input");
  }

  refreshTabs() {
    this.render();
  }
}
