# Myuu Raid — Pokémon Damage Visualizer

A no-build, single-page raid planner built with vanilla HTML, CSS, and JavaScript modules.

## Run locally

From this folder, start any static web server:

```powershell
python -m http.server 4173
```

Then open `http://127.0.0.1:4173`.

The app uses PokeAPI for Pokémon, move, ability, and sprite fallback data. Successful API responses are cached in `localStorage` for seven days. Pokémon Showdown animated sprites are attempted first.
