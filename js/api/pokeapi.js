import { readCache, writeCache } from "../utils/cache.js";

const API = "https://pokeapi.co/api/v2";

async function get(path) {
  const key = path.replaceAll("/", ":");
  const cached = readCache(key);
  if (cached) return cached;
  const response = await fetch(`${API}/${path}`);
  if (!response.ok) throw new Error(`PokeAPI returned ${response.status}`);
  return writeCache(key, await response.json());
}

export const getPokemon = (name) => get(`pokemon/${name}`);
export const getMove = (name) => get(`move/${name}`);
export const getItem = (name) => get(`item/${name}`);
export const getPokemonIndex = () => get("pokemon?limit=2000");
export const getMoveIndex = () => get("move?limit=2000");
export const getItemIndex = () => get("item?limit=3000");

export async function searchPokemon(query, limit = 12) {
  const data = await getPokemonIndex();
  const term = query.trim().toLowerCase();
  return data.results.filter(({ name }) => name.includes(term)).slice(0, limit);
}
