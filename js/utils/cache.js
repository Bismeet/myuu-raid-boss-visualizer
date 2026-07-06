const TTL = 7 * 24 * 60 * 60 * 1000;
const PREFIX = "myuu-pokeapi:";

export function readCache(key) {
  try {
    const value = JSON.parse(localStorage.getItem(PREFIX + key));
    if (!value || Date.now() - value.savedAt > TTL) {
      localStorage.removeItem(PREFIX + key);
      return null;
    }
    return value.data;
  } catch {
    return null;
  }
}

export function writeCache(key, data) {
  try {
    localStorage.setItem(PREFIX + key, JSON.stringify({ savedAt: Date.now(), data }));
  } catch {
    // Storage can be disabled or full; the app still works without persistence.
  }
  return data;
}
