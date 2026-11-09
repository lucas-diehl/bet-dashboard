// Read-only: every PGA bet (any market -- matchup or top_10) whose details.first_seen
// lands on or after its own slate_date (the tournament's start date). This is the
// retroactive cleanup target for "remove any bets selected after the tournament
// starts" -- broader than isLatePgaOutright, which only ever covered outright markets.
import { sql } from "drizzle-orm";
import { openDb } from "./upsert";
import { loadEnv } from "./env";

loadEnv();
const h = openDb(process.env.DATABASE_URL!);
const q = async (s: any) => (await h.db.execute(s)) as unknown as any[];

const rows = await q(sql`
  SELECT id, bet_id, slate_date, market, selection, stake_units, details->>'first_seen' as first_seen,
         (SELECT result FROM results r WHERE r.source = bets.source AND r.bet_id = bets.bet_id) as result
  FROM bets
  WHERE source = 'golf-modeling' AND sport = 'pga'
    AND details->>'first_seen' >= slate_date::text
  ORDER BY slate_date, market
`);
console.log(`found ${rows.length} PGA bets first_seen on/after their own slate_date:\n`);
const bySlate: Record<string, any[]> = {};
for (const r of rows) (bySlate[r.slate_date] ??= []).push(r);
for (const [slate, bets] of Object.entries(bySlate)) {
  console.log(`${slate}: ${bets.length}`);
  for (const b of bets) console.log(`  ${b.market.padEnd(8)} ${b.selection.padEnd(28)} first_seen=${b.first_seen}  stake=${b.stake_units}u  result=${b.result ?? "ungraded"}  ${b.bet_id}`);
}
console.log(`\ntotal: ${rows.length} (${rows.filter((r:any)=>r.result).length} already graded, ${rows.filter((r:any)=>!r.result).length} ungraded)`);
await h.close();
