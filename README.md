# Myuu Raid — Pokémon Damage Visualizer

A no-build, single-page raid planner built with vanilla HTML, CSS, and JavaScript modules.

## Run locally

From this folder, start any static web server:

```powershell
python -m http.server 4173
```

Then open `http://127.0.0.1:4173`.

The static server is sufficient for setup editing, but accurate raid damage in Quick Calc and live Battle requires the `/api/quick-calc` and `/api/battle-damage` serverless functions. Configure every private deployment variable listed in `.env.example` and redeploy using a serverless environment that serves the `api` directory. When the private calculation endpoint or a required private variable is unavailable, damage resolution fails safely instead of exposing or reproducing the private defensive model in the browser.

The app uses PokeAPI for Pokémon, move, ability, and sprite fallback data. Successful API responses are cached in `localStorage` for seven days. Pokémon Showdown animated sprites are attempted first.
