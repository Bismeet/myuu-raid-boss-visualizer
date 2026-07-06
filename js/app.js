import { BattleState } from "./core/battle-state.js";
import { Simulator } from "./core/simulator.js";
import { BossPanel } from "./ui/boss-panel.js";
import { TeamBuilder } from "./ui/team-builder.js";
import { BattleScene } from "./ui/battle-scene.js";
import { Summary } from "./ui/summary.js";
import { HomeView } from "./ui/home.js";
import { SetupPersistence } from "./utils/persistence.js";
import { displayName } from "./utils/format.js";

const VIEWS = new Set(["home", "team-builder", "boss-builder", "battle"]);
const state = new BattleState();
const simulator = new Simulator(state);
const persistence = new SetupPersistence(state);
await persistence.load(true);

const initialHash = window.location.hash.slice(1);
state.appView = VIEWS.has(initialHash) ? initialHash : "home";

const bossPanel = new BossPanel(document.querySelector("#boss-panel"), state);
const teamBuilder = new TeamBuilder(document.querySelector("#team-builder"), state, persistence);
const battleScene = new BattleScene(document.querySelector("#battle-scene"), state, simulator);
const summary = new Summary(document.querySelector("#summary"), state);
const homeView = new HomeView(document.querySelector("#home-page"), state, navigate);

function navigate(view, { replace = false } = {}) {
  const nextView = VIEWS.has(view) ? view : "home";
  state.appView = nextView;
  const nextHash = `#${nextView}`;
  if (window.location.hash !== nextHash) {
    window.history[replace ? "replaceState" : "pushState"](null, "", nextHash);
  }
  renderAll();
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function updateAppView() {
  const currentView = VIEWS.has(state.appView) ? state.appView : "home";
  const appLayout = document.querySelector(".app-layout");
  const viewMap = {
    home: document.querySelector("#home-view"),
    "team-builder": document.querySelector("#team-builder-view"),
    "boss-builder": document.querySelector("#boss-builder-view"),
    battle: document.querySelector("#battle-view"),
  };

  Object.entries(viewMap).forEach(([name, element]) => {
    if (element) element.hidden = name !== currentView;
  });

  document.querySelectorAll("[data-app-view]").forEach((link) => {
    const active = link.dataset.appView === currentView;
    link.classList.toggle("active", active);
    if (active) link.setAttribute("aria-current", "page");
    else link.removeAttribute("aria-current");
  });

  if (state.battleActive && state.uiMode !== "battle") state.uiMode = "battle";
  if (!state.battleActive && state.uiMode !== "builder") state.uiMode = "builder";

  const battleModeClass = currentView === "battle" && state.battleActive ? " battle-mode" : "";
  appLayout.className = `app-layout app-shell view-${currentView}${state.battleActive ? " has-active-battle" : ""}${battleModeClass}`;
  document.body.classList.toggle("is-battle-mode", currentView === "battle" && state.battleActive);
  document.querySelector('[data-app-view="battle"]')?.classList.toggle("has-live-battle", state.battleActive);
}

function renderBattleGate() {
  const gate = document.querySelector("#battle-gate");
  const scene = document.querySelector("#battle-scene");
  const report = document.querySelector("#summary");
  const hasReport = state.battleLog.length > 0 || state.results.length > 0;

  scene.hidden = !state.battleActive;
  gate.hidden = state.battleActive;
  report.hidden = state.battleActive || !hasReport;
  if (state.battleActive) return;

  const readyCount = state.team.filter((slot) => slot.pokemon).length;
  const bossName = state.boss ? displayName(state.boss.name) : "No boss selected";
  gate.innerHTML = `
    <section class="battle-gate-card" aria-labelledby="battle-gate-title">
      <span class="eyebrow">Battle room</span>
      <h1 id="battle-gate-title">Enter the raid arena</h1>
      <p>Your current setup will be used to begin a new 21-turn encounter.</p>
      <div class="battle-gate-status">
        <div class="${state.boss ? "ready" : ""}"><span>Raid target</span><strong>${bossName}</strong></div>
        <div class="${readyCount ? "ready" : ""}"><span>Strike team</span><strong>${readyCount} / 6 ready</strong></div>
      </div>
      <div class="battle-gate-actions">
        <button type="button" class="button primary" data-gate-start ${state.boss && readyCount ? "" : "disabled"}>Start New Battle</button>
        <button type="button" class="button" data-gate-view="team-builder">Edit Team</button>
        <button type="button" class="button" data-gate-view="boss-builder">Edit Boss</button>
      </div>
      <span class="battle-gate-message" role="status"></span>
    </section>`;

  gate.querySelectorAll("[data-gate-view]").forEach((button) => {
    button.addEventListener("click", () => navigate(button.dataset.gateView));
  });
  gate.querySelector("[data-gate-start]")?.addEventListener("click", () => {
    try {
      state.startBattle();
      state.appView = "battle";
      renderAll();
    } catch (error) {
      gate.querySelector(".battle-gate-message").textContent = error.message;
    }
  });
}

function renderAll() {
  updateAppView();
  bossPanel.render();
  teamBuilder.render();
  battleScene.render();
  summary.render();
  homeView.render();
  renderBattleGate();
}

state.addEventListener("team", () => {
  updateAppView();
  teamBuilder.render();
  homeView.render();
  if (state.battleActive) battleScene.render();
  renderBattleGate();
});

state.addEventListener("boss", () => {
  updateAppView();
  bossPanel.render();
  homeView.render();
  if (state.battleActive) battleScene.render();
  renderBattleGate();
});

state.addEventListener("simulation", () => {
  updateAppView();
  bossPanel.render();
  battleScene.render();
  summary.render();
  homeView.render();
  renderBattleGate();
});

state.addEventListener("damage-input", () => {
  if (state.results.length) {
    const limit = state.cursor || state.results.length;
    state.results = simulator.run(limit);
  }
  updateAppView();
  bossPanel.render();
  if (state.battleActive) battleScene.render();
  summary.render();
  homeView.render();
  renderBattleGate();
});

state.addEventListener("restore", renderAll);
window.addEventListener("hashchange", () => {
  const hashView = window.location.hash.slice(1);
  navigate(VIEWS.has(hashView) ? hashView : "home", { replace: !VIEWS.has(hashView) });
});
window.addEventListener("popstate", () => {
  const hashView = window.location.hash.slice(1);
  state.appView = VIEWS.has(hashView) ? hashView : "home";
  renderAll();
});

persistence.attach();
window.myuuRaid = {
  state,
  simulator,
  persistence,
  bossPanel,
  teamBuilder,
  battleScene,
  summary,
  homeView,
  navigate,
  renderAll,
};

navigate(state.appView, { replace: !initialHash });
