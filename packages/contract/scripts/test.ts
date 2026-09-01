// Minimal self-test: every example must validate, and a deliberately malformed
// payload must be rejected. Exits non-zero on any failure so it can gate CI.
import { safeParsePicksFile, safeParseResultsFile, safeParseValuesFile } from "../src/index";
import { examplePicks, exampleResults, exampleValues } from "../src/examples";

let failures = 0;
const ok = (name: string) => console.log(`  ✓ ${name}`);
const bad = (name: string, errs?: string[]) => {
  console.error(`  ✗ ${name}${errs ? "\n      " + errs.join("\n      ") : ""}`);
  failures++;
};

console.log("Positive cases (must pass):");
for (const p of examplePicks) {
  const r = safeParsePicksFile(p);
  r.ok ? ok(`picks ${p.source}/${p.sport} ${p.slate_date}`) : bad(`picks ${p.source}/${p.sport}`, r.errors);
}
for (const r of exampleResults) {
  const res = safeParseResultsFile(r);
  res.ok ? ok(`results ${r.source}/${r.sport} ${r.slate_date}`) : bad(`results ${r.source}/${r.sport}`, res.errors);
}
for (const v of exampleValues) {
  const res = safeParseValuesFile(v);
  res.ok ? ok(`values ${v.source}/${v.sport} ${v.slate_date} (${v.values.length})`) : bad(`values ${v.source}/${v.sport}`, res.errors);
}

console.log("\nNegative cases (must fail):");
const badPicks = {
  contract_version: "1.0",
  source: "bet-screen",
  sport: "cbb",
  slate_date: "not-a-date",
  generated_at: "2026-01-15T14:30:00Z",
  mode: "LIVE",
  bets: [{ bet_id: "x", market: "spread", selection: "Duke" /* missing odds_american, stake_units */ }],
};
const neg = safeParsePicksFile(badPicks);
neg.ok ? bad("malformed picks was accepted") : ok("malformed picks rejected");

console.log(failures === 0 ? "\nAll contract tests passed." : `\n${failures} contract test(s) failed.`);
process.exit(failures === 0 ? 0 : 1);
