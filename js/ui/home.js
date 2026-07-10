import { displayName, fallbackSprite, spriteUrl, titleCase } from "../utils/format.js";

export class HomeView {
  constructor(root, state, navigate) {
    this.root = root;
    this.state = state;
    this.navigate = navigate;
    this.message = "";
  }

  render() {
    const boss = this.state.boss;
    const team = this.state.team.filter((slot) => slot.pokemon);
    const battleLabel = this.state.needsResume
      ? "Resume Battle"
      : this.state.battleActive
        ? "Return to Battle"
        : "Start Battle";

    this.root.innerHTML = `
      <section class="home-hero" aria-labelledby="home-title">
        <div class="home-hero-copy">
          <span class="eyebrow">Myuu raid command</span>
          <h1 id="home-title">Your next legendary encounter starts here.</h1>
          <p>Build a six-Pokémon raid line, prepare the target, then play the full 21-turn battle in one focused workspace.</p>
          <div class="home-actions">
            <button type="button" class="button primary" data-home-view="team-builder">Build Your Team</button>
            <button type="button" class="button" data-home-view="boss-builder">Choose Raid Boss</button>
            <button type="button" class="button battle-cta" data-home-battle>${battleLabel}</button>
          </div>
          <span class="home-status" role="status">${this.message}</span>
        </div>
        <div class="home-encounter-card">
          <span class="encounter-kicker">Current encounter</span>
          ${boss ? `
            <img src="${spriteUrl(boss.name)}" data-fallback="${fallbackSprite(boss)}" alt="${displayName(boss.name)}">
            <div><strong>${displayName(boss.name)}</strong><span>Raid target</span></div>
          ` : `
            <div class="home-empty-ball">?</div>
            <div><strong>No boss selected</strong><span>Visit Boss Builder to choose one.</span></div>
          `}
        </div>
      </section>

      <section class="home-overview" aria-label="Current raid setup">
        <article class="home-overview-card">
          <div class="overview-heading">
            <div><span class="eyebrow">Strike team</span><h2>${team.length} / 6 ready</h2></div>
            <button type="button" class="text-button" data-home-view="team-builder">Edit team →</button>
          </div>
          <div class="home-party">
            ${this.state.team.map((slot, index) => slot.pokemon ? `
              <div class="home-party-slot">
                <span>0${index + 1}</span>
                <img src="${spriteUrl(slot.pokemon.name)}" data-fallback="${fallbackSprite(slot.pokemon)}" alt="">
                <strong>${displayName(slot.pokemon.name)}</strong>
                <small>${titleCase(slot.item || "No item")}</small>
              </div>
            ` : `
              <div class="home-party-slot empty"><span>0${index + 1}</span><i>+</i><strong>Open slot</strong><small>Add Pokémon</small></div>
            `).join("")}
          </div>
        </article>

        <article class="home-guide-card">
          <span class="eyebrow">Route guide</span>
          <h2>Ready in three steps</h2>
          <ol>
            <li><span>1</span><div><strong>Assemble the team</strong><small>Set moves, items, abilities, and spreads.</small></div></li>
            <li><span>2</span><div><strong>Prepare the boss</strong><small>Choose a legendary target and moveset.</small></div></li>
            <li><span>3</span><div><strong>Enter battle</strong><small>Play turns in the full-width battle room.</small></div></li>
          </ol>
        </article>
      </section>`;

    this.bind();
  }

  bind() {
    this.root.querySelectorAll("[data-home-view]").forEach((button) => {
      button.addEventListener("click", () => this.navigate(button.dataset.homeView));
    });

    this.root.querySelector("[data-home-battle]")?.addEventListener("click", () => {
      try {
        if (this.state.needsResume) {
          this.state.needsResume = false;
          this.state.battleActive = true;
          this.state.uiMode = "battle";
        } else if (!this.state.battleActive) {
          this.state.startBattle();
        }
        this.message = "";
        this.navigate("battle");
        window.myuuRaid?.renderAll();
      } catch (error) {
        this.message = error.message;
        this.render();
      }
    });

    this.root.querySelectorAll("img[data-fallback]").forEach((img) => img.addEventListener("error", () => {
      if (img.dataset.fallback && img.src !== img.dataset.fallback) img.src = img.dataset.fallback;
    }, { once: true }));
  }
}
