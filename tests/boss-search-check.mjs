import assert from "node:assert/strict";
import { BOSSES, normalizeBossSearch, searchBosses } from "../js/data/bosses.js";

assert(BOSSES.includes("latias"), "Latias must be available as a raid boss");
assert(BOSSES.includes("latios"), "Latios must be available as a raid boss");
assert.deepEqual(searchBosses("lati"), ["latias", "latios"]);
assert(searchBosses("mew").includes("mew"));
assert(searchBosses("mew").includes("mewtwo"));
assert(searchBosses("gira").includes("giratina-altered"));
assert.equal(normalizeBossSearch("Ho-Oh"), normalizeBossSearch("ho oh"));

console.log("All boss search checks passed successfully!");
