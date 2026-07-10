import { BOSSES, searchBosses } from "../data/bosses.js";
import { getPokemon, getMove, getMoveIndex } from "../api/pokeapi.js";
import { calculateBossStats } from "../core/stats.js";
import { displayName, fallbackSprite, spriteUrl, titleCase } from "../utils/format.js";
import { openSearchDropdown, setupSearchDropdownController } from "./search-dropdown.js";

const isSelectableMove = (name) => !["max-", "g-max-", "shadow-"].some((prefix) => name.startsWith(prefix)) && !name.endsWith("-z") && !name.includes("gmax");
const prepareMove = (move) => move ? { ...move, basePower: move.power ?? null, customPower: move.power ?? null } : null;

export class BossPanel {
  constructor(root, state) {
    this.root = root;
    this.state = state;
    this.query = "";
    this.activeSection = "none";
    this.globalMoves = null;
    this.moveSearchTimer = null;
    setupSearchDropdownController(this.root);
    this.render();
    if (!this.state.boss) this.load("mewtwo");
  }

  filtered() {
    return this.query.trim() ? searchBosses(this.query) : BOSSES.slice(0, 14);
  }

  async ensureGlobalMoves() {
    if (this.globalMoves) return this.globalMoves;
    const data = await getMoveIndex();
    this.globalMoves = data.results.map(({ name }) => name).filter(isSelectableMove).sort();
    return this.globalMoves;
  }

  render() {
    const boss = this.state.boss;
    const isBattle = this.state.appView === "battle";
    this.root.innerHTML = `
      <section class="boss-public-showcase" aria-labelledby="boss-title">
        <article class="boss-hero-card">
          <span class="eyebrow">Raid target</span>
          <h2 id="boss-title" class="sr-only">Boss builder</h2>
          ${boss ? `
            <img class="boss-hero-sprite" src="${spriteUrl(boss.name)}" data-fallback="${fallbackSprite(boss)}" alt="${displayName(boss.name)} sprite">
            <h3 class="boss-hero-name">${displayName(boss.name)}</h3>
            <div class="type-row boss-hero-types">${this.state.bossCurrentTypes.map((type) => `<span class="type-badge type-${type}">${type}</span>`).join("")}</div>
          ` : `<div class="boss-hero-placeholder">?</div><p>Loading boss…</p>`}
          ${!isBattle ? `<button type="button" id="section-btn-change-boss" class="button primary boss-showcase-action">${this.activeSection === "change-boss" ? "Done" : "Change Boss"}</button>` : ""}
          ${this.activeSection === "change-boss" && !isBattle ? `
            <div class="boss-change-search" data-search-dropdown>
              <label class="search-field"><span class="sr-only">Search Pokémon name</span><input id="boss-search" value="${this.query}" placeholder="Search Pokémon name…" autocomplete="off" aria-expanded="false"></label>
              <div class="inline-results hidden" id="boss-results"></div>
            </div>
          ` : ""}
        </article>
        <article class="boss-moves-card">
          <div class="boss-moves-card-heading">
            <div><span class="eyebrow">Moveset</span><h2>Boss Moves</h2></div>
            ${!isBattle ? `<button type="button" id="section-btn-edit-moves" class="button">${this.activeSection === "edit-moves" ? "Done" : "Edit Boss Moves"}</button>` : ""}
          </div>
          ${this.activeSection === "edit-moves" && !isBattle ? `
            <div class="boss-moves-edit-grid">${[0, 1, 2, 3].map((idx) => this.moveEditableMarkup(this.state.bossMoves[idx], idx)).join("")}</div>
          ` : `
            <div class="move-grid boss-public-move-list">
              ${[0, 1, 2, 3].map((idx) => {
                const move = this.state.bossMoves[idx];
                return move
                  ? `<div class="boss-move-badge"><strong>${titleCase(move.name)}</strong><span class="type-badge type-${move.type.name}">${move.type.name}</span></div>`
                  : `<div class="boss-move-badge empty">Empty slot</div>`;
              }).join("")}
            </div>
          `}
        </article>
      </section>`;
    this.bind();
  }

  moveEditableMarkup(move, index) {
    const basePower = move?.basePower ?? move?.power ?? null;
    const customPower = move?.customPower ?? basePower;
    return `
      <div class="boss-move-selector">
        <strong>Move ${index + 1}</strong>
        <div class="boss-move-selector-search">
          <input type="text" class="move-search-input" data-boss-move-search="${index}" value="${move ? titleCase(move.name) : ""}" placeholder="Search boss move..." autocomplete="off" aria-expanded="false">
          ${move ? `<button type="button" class="button danger" data-clear-boss-move="${index}">Clear</button>` : ""}
          <div class="boss-move-results hidden"></div>
        </div>
        <div class="boss-move-edit-meta">${move ? `<span class="type-badge type-${move.type?.name || "normal"}">${move.type?.name || "normal"}</span><span>${titleCase(move.damage_class?.name || "status")}</span>` : "Choose a move"}</div>
        <label class="boss-move-power"><span>Custom Power</span><input type="number" data-boss-custom-power="${index}" value="${customPower ?? ""}"></label>
      </div>`;
  }

  bind() {
    const isBattle = this.state.appView === "battle";
    const toggleChangeBoss = () => {
      this.activeSection = this.activeSection === "change-boss" ? "none" : "change-boss";
      this.render();
    };
    const toggleEditMoves = () => {
      this.activeSection = this.activeSection === "edit-moves" ? "none" : "edit-moves";
      this.render();
    };
    this.root.querySelector("#section-btn-change-boss")?.addEventListener("click", toggleChangeBoss);
    this.root.querySelector("#section-btn-edit-moves")?.addEventListener("click", toggleEditMoves);

    if (this.activeSection === "change-boss" && !isBattle) {
      const input = this.root.querySelector("#boss-search");
      const results = this.root.querySelector("#boss-results");
      const showBossResults = (event) => {
        this.query = event.target.value.toLowerCase().trimStart();
        openSearchDropdown(event.target, results);
        const matched = this.filtered();
        const customSlug = this.query.trim().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
        const customOption = matched.length === 0 && customSlug && !BOSSES.includes(customSlug)
          ? `<button type="button" data-boss="${customSlug}">Load custom boss: ${displayName(customSlug)}</button>` : "";
        results.innerHTML = matched.map((name) => `<button type="button" data-boss="${name}">${displayName(name)}</button>`).join("") + customOption || "<p>No raid boss found.</p>";
        this.bindResultButtons();
      };
      input?.addEventListener("focus", showBossResults);
      input?.addEventListener("click", showBossResults);
      input?.addEventListener("input", showBossResults);
      this.bindResultButtons();
    }

    if (this.activeSection === "edit-moves" && !isBattle) {
      this.bindMoveSearch();
      this.root.querySelectorAll("[data-boss-custom-power]").forEach((input) => input.addEventListener("input", (event) => {
        const move = this.state.bossMoves[Number(event.target.dataset.bossCustomPower)];
        if (move) {
          move.customPower = event.target.value === "" ? null : Math.max(0, Number(event.target.value));
          this.state.emit("damage-input");
        }
      }));
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
        this.moveSearchTimer = setTimeout(() => this.showMoveResults(input, index), 80);
      };
      input.addEventListener("focus", show);
      input.addEventListener("click", show);
      input.addEventListener("input", show);
      input.closest(".boss-move-selector").addEventListener("focusout", () => setTimeout(() => {
        const container = input.closest(".boss-move-selector");
        if (!container.contains(document.activeElement)) container.querySelector(".boss-move-results")?.classList.add("hidden");
      }, 100));
    });
    this.root.querySelectorAll("[data-clear-boss-move]").forEach((button) => button.addEventListener("click", () => {
      this.state.bossMoves[Number(button.dataset.clearBossMove)] = null;
      this.state.emit("damage-input");
      this.render();
    }));
  }

  async showMoveResults(input, index) {
    const results = input.closest(".boss-move-selector").querySelector(".boss-move-results");
    openSearchDropdown(input, results);
    results.innerHTML = "<p>Loading moves…</p>";
    try {
      const source = await this.ensureGlobalMoves();
      const query = input.value.trim().toLowerCase().replaceAll(" ", "-");
      const names = (query ? source.filter((name) => name.includes(query)) : source).slice(0, 10);
      const matches = await Promise.all(names.map(async (name) => {
        try { return await getMove(name); } catch { return { name, type: { name: "normal" }, damage_class: { name: "status" } }; }
      }));
      results.innerHTML = matches.map((move) => `<button type="button" data-select-boss-move="${move.name}" data-move-index="${index}"><strong>${titleCase(move.name)}</strong><span>${titleCase(move.damage_class?.name || "status")}</span></button>`).join("") || "<p>No matching moves.</p>";
      results.querySelectorAll("[data-select-boss-move]").forEach((button) => button.addEventListener("click", () => this.selectMove(Number(button.dataset.moveIndex), button.dataset.selectBossMove)));
    } catch (error) {
      results.innerHTML = "<p>Moves could not be loaded. Try again.</p>";
      console.error("Boss move search failed", error);
    }
  }

  async selectMove(index, name) {
    try {
      this.state.bossMoves[index] = prepareMove(await getMove(name));
      this.state.emit("damage-input");
      this.render();
    } catch (error) {
      console.error("Boss move selection failed", error);
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
      const defaultMoves = pokemon.moves.map(({ move }) => move.name).sort().slice(0, 4);
      this.state.bossMoves = await Promise.all(defaultMoves.map(async (move) => {
        try { return prepareMove(await getMove(move)); } catch { return null; }
      }));
      while (this.state.bossMoves.length < 4) this.state.bossMoves.push(null);
      this.state.emit("boss");
      this.render();
    } catch (error) {
      this.root.innerHTML = `<section class="panel error-state"><h2>Boss unavailable</h2><p>Check your connection and retry.</p><button type="button" id="retry-boss" class="button primary">Retry</button></section>`;
      this.root.querySelector("#retry-boss")?.addEventListener("click", () => this.load(name));
      console.error("Boss load failed", error);
    } finally {
      this.root.classList.remove("is-loading");
    }
  }
}
