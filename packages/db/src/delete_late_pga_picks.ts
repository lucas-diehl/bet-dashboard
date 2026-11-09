// Deletes every PGA bet (any market) whose details.first_seen is on/after its own
// slate_date -- the retroactive side of "remove any bets selected after the
// tournament starts" (2026-11-09). Cascades to `results` via bets.id's FK
// (onDelete: cascade), so no separate results cleanup is needed. Dry run by default.
//
//   pnpm --filter @bet/db exec tsx src/delete_late_pga_picks.ts            # dry run
//   pnpm --filter @bet/db exec tsx src/delete_late_pga_picks.ts --execute  # deletes
import { sql } from "drizzle-orm";
import { openDb } from "./upsert";
import { loadEnv } from "./env";

loadEnv();
const EXECUTE = process.argv.includes("--execute");
const h = openDb(process.env.DATABASE_URL!);
const q = async (s: any) => (await h.db.execute(s)) as unknown as any[];

const rows = await q(sql`
  SELECT id, bet_id, slate_date, market, selection,
         (SELECT result FROM results r WHERE r.source = bets.source AND r.bet_id = bets.bet_id) as result
  FROM bets
  WHERE source = 'golf-modeling' AND sport = 'pga' AND details->>'first_seen' >= slate_date::text
  ORDER BY slate_date
`);
console.log(`${rows.length} late-selected PGA bets to delete:`);
const tally: Record<string, number> = {};
for (const r of rows) {
  console.log(`  ${r.slate_date}  ${r.market.padEnd(8)} ${r.selection.padEnd(28)} result=${r.result ?? "ungraded"}  ${r.bet_id}`);
  tally[r.result ?? "ungraded"] = (tally[r.result ?? "ungraded"] ?? 0) + 1;
}
console.log("tally:", tally);

if (EXECUTE) {
  for (const r of rows) await q(sql`DELETE FROM bets WHERE id = ${r.id}`);
  console.log(`\nDeleted ${rows.length} bets (results cascaded).`);
} else {
  console.log("\nDRY RUN -- pass --execute to delete.");
}
await h.close();
