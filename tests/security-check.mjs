import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import quickCalcHandler from "../api/quick-calc.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const ignoredDirectories = new Set([".git", ".agents", "assets", "node_modules"]);
const ignoredFiles = new Set([".env"]);
const forbiddenEverywhere = [
  "7" + "." + "8",
  "63" + "00",
  "31" + "50",
  "final" + "Def",
  "final" + "Spd",
  "Normal " + "Lv200",
];
const forbiddenInCodeAndDocs = ["5" + "." + "4"];

function sourceFiles(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    if (ignoredDirectories.has(entry.name) || ignoredFiles.has(entry.name)) return [];
    const fullPath = path.join(directory, entry.name);
    if (entry.isDirectory()) return sourceFiles(fullPath);
    return /\.(?:js|mjs|json|html|css|md|example)$/.test(entry.name) || entry.name === ".gitignore" ? [fullPath] : [];
  });
}

for (const file of sourceFiles(root)) {
  const source = fs.readFileSync(file, "utf8");
  const tokens = file.endsWith(".css") ? forbiddenEverywhere : [...forbiddenEverywhere, ...forbiddenInCodeAndDocs];
  for (const token of tokens) {
    if (source.includes(token)) throw new Error(`${path.relative(root, file)} contains forbidden token ${token}`);
  }
}

const frontendSource = sourceFiles(path.join(root, "js"))
  .map((file) => fs.readFileSync(file, "utf8"))
  .join("\n");
for (const name of ["BOSS_DEF_MULTIPLIER", "BOSS_SPD_MULTIPLIER", "BOSS_HP_MULTIPLIER", "BOSS_LEVEL", "MYUU_DAMAGE_CAP"]) {
  if (frontendSource.includes(name)) throw new Error(`Frontend references server-only variable ${name}`);
}

const gitignore = fs.readFileSync(path.join(root, ".gitignore"), "utf8");
if (!/^\.env\s*$/m.test(gitignore) || !/^\.env\.\*\s*$/m.test(gitignore) || !/^!\.env\.example\s*$/m.test(gitignore)) {
  throw new Error("Environment ignore rules are incomplete.");
}

const originalFetch = globalThis.fetch;
const originalEnv = { ...process.env };
const originalConsoleError = console.error;
const serverErrorLogs = [];
const stats = [
  ["hp", 80], ["attack", 90], ["defense", 85],
  ["special-attack", 95], ["special-defense", 90], ["speed", 100],
].map(([name, base_stat]) => ({ base_stat, stat: { name } }));
const pokemon = {
  name: "test-mon",
  stats,
  types: [{ type: { name: "normal" } }],
  abilities: [{ ability: { name: "pressure" } }],
};
const move = { name: "tackle", power: 40, type: { name: "normal" }, damage_class: { name: "physical" } };

function responseRecorder() {
  return {
    statusCode: 0,
    payload: null,
    setHeader() {},
    status(code) { this.statusCode = code; return this; },
    json(payload) { this.payload = payload; return this; },
  };
}

try {
  console.error = (...args) => serverErrorLogs.push(args);
  delete process.env.BOSS_DEF_MULTIPLIER;
  delete process.env.BOSS_SPD_MULTIPLIER;
  delete process.env.BOSS_LEVEL;
  delete process.env.BOSS_HP_MULTIPLIER;
  delete process.env.MYUU_DAMAGE_CAP;
  globalThis.fetch = async () => { throw new Error("Missing configuration must fail before fetching"); };

  const unavailable = responseRecorder();
  await quickCalcHandler({ method: "POST", body: { boss: "mew", attacker: "mew", move: "tackle" } }, unavailable);
  if (unavailable.statusCode !== 503 || unavailable.payload?.error !== "Server calculation unavailable") {
    throw new Error("Missing server configuration did not fail safely.");
  }
  if (!serverErrorLogs.some(([message, details]) => (
    message === "[quick-calc api] request failed"
    && details?.code === "SERVER_CONFIG_UNAVAILABLE"
    && details?.configKey === "BOSS_LEVEL"
  ))) {
    throw new Error("Missing server configuration was not logged safely.");
  }

  Object.assign(process.env, {
    BOSS_DEF_MULTIPLIER: "2",
    BOSS_SPD_MULTIPLIER: "2",
    BOSS_LEVEL: "100",
    BOSS_HP_MULTIPLIER: "100",
    MYUU_DAMAGE_CAP: "1000",
  });
  globalThis.fetch = async (url) => ({
    ok: true,
    json: async () => String(url).includes("/move/") ? move : pokemon,
  });

  const success = responseRecorder();
  await quickCalcHandler({
    method: "POST",
    body: {
      boss: "mew",
      attacker: "mew",
      move: "tackle",
      level: 100,
      nature: "hardy",
      atkIv: 31,
      spaIv: 31,
      hitCount: 1,
      typeChanges: {},
    },
  }, success);
  if (success.statusCode !== 200) throw new Error("Configured server calculation failed.");
  if (Object.keys(success.payload).sort().join(",") !== "damageRange,summary") {
    throw new Error(`Server response exposed unexpected fields: ${Object.keys(success.payload).join(", ")}`);
  }

  const splitSuccess = responseRecorder();
  await quickCalcHandler({
    method: "POST",
    body: {
      boss: "mew",
      attacker: "mew",
      move: "tackle",
      level: 100,
      nature: "hardy",
      atkIv: 31,
      spaIv: 31,
      hitCount: 1,
      typeChanges: {},
      guardSplitOrder: ["custom"],
      splitterStats: { custom: { def: 1, spd: 1 } },
    },
  }, splitSuccess);
  const rangeMinimum = (range) => Number(String(range).split("-")[0].replaceAll(",", "").trim());
  if (splitSuccess.statusCode !== 200 || rangeMinimum(splitSuccess.payload?.damageRange) <= rangeMinimum(success.payload.damageRange)) {
    throw new Error("Server Guard Split inputs did not affect the damage result.");
  }
  if (Object.keys(splitSuccess.payload).sort().join(",") !== "damageRange,summary") {
    throw new Error("Guard Split response exposed server calculation internals.");
  }
} finally {
  console.error = originalConsoleError;
  globalThis.fetch = originalFetch;
  for (const key of Object.keys(process.env)) delete process.env[key];
  Object.assign(process.env, originalEnv);
}

console.log("Security checks passed.");
