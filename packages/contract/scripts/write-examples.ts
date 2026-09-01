// Writes the canonical example payloads into <feed>/_examples/ as real files a
// model author can copy. Each example is validated against the schema first, so
// this doubles as a check that the examples themselves stay contract-valid.
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { parsePicksFile, parseResultsFile, parseValuesFile, feedDir } from "../src/index";
import { examplePicks, exampleResults, exampleValues } from "../src/examples";

const base = join(feedDir(), "_examples");
let count = 0;

for (const p of examplePicks) {
  parsePicksFile(p); // throws if the example is invalid
  const dir = join(base, p.source, p.sport);
  mkdirSync(dir, { recursive: true });
  const file = join(dir, `picks_${p.slate_date}.json`);
  writeFileSync(file, JSON.stringify(p, null, 2));
  console.log(`picks   ${p.source}/${p.sport}/picks_${p.slate_date}.json (${p.bets.length} bets)`);
  count++;
}

for (const r of exampleResults) {
  parseResultsFile(r);
  const dir = join(base, r.source, r.sport);
  mkdirSync(dir, { recursive: true });
  const file = join(dir, `results_${r.slate_date}.json`);
  writeFileSync(file, JSON.stringify(r, null, 2));
  console.log(`results ${r.source}/${r.sport}/results_${r.slate_date}.json (${r.results.length} grades)`);
  count++;
}

for (const v of exampleValues) {
  parseValuesFile(v);
  const dir = join(base, v.source, v.sport);
  mkdirSync(dir, { recursive: true });
  const file = join(dir, `values_${v.slate_date}.json`);
  writeFileSync(file, JSON.stringify(v, null, 2));
  console.log(`values  ${v.source}/${v.sport}/values_${v.slate_date}.json (${v.values.length} plays)`);
  count++;
}

console.log(`\nWrote ${count} example files to ${base}`);
