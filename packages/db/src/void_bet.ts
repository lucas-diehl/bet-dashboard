// Void a single bet by bet_id: removes it from P&L (sets results.result='void',
// pnl_units=0) without deleting the row, so the board keeps a record that this was an
// intentional removal rather than a bet that just vanished. If the bet hasn't been
// graded yet (no row in `results`), inserts a void result directly; grade_*.R/py scripts
// for that source will see the bet_id already has a result and won't re-grade it.
//
// Context (2026-11-09): "nfl-modeling-2026-11-08-chasebrown-anytimetd" -- Chase Brown
// anytime-TD, CIN @ ATL, week 9 (2026-11-08), strategy_tier=EXPANDED. Confirmed via git
// history (NFL/outputs/td_2026_bet_card.csv, commit 3396d4c removed it from the current
// board snapshot once the game day rolled off) that this row cleared
// scripts/90_publish_td_picks.R's publish filter (tier in core/expanded, finite odds,
// valid book), so it should be live on the dashboard under this bet_id. Not independently
// confirmed against the DB itself (no DATABASE_URL access in this session) -- check the
// printed bet before passing --execute.
//
//   pnpm --filter @bet/db exec tsx src/void_bet.ts <bet_id>             # dry run
//   pnpm --filter @bet/db exec tsx src/void_bet.ts <bet_id> --execute   # writes
import { sql } from "drizzle-orm";
import { openDb } from "./upsert";
import { loadEnv } from "./env";

loadEnv();
const betId = process.argv[2];
const EXECUTE = process.argv.includes("--execute");
if (!betId) { console.error("usage: tsx src/void_bet.ts <bet_id> [--execute]"); process.exit(1); }

const h = openDb(process.env.DATABASE_URL!);
const q = async (s: any) => (await h.db.execute(s)) as unknown as any[];

const [bet] = await q(sql`SELECT id, bet_id, source, event, selection, slate_date, stake_units FROM bets WHERE bet_id = ${betId} LIMIT 1`);
if (!bet) { console.error(`no bet found with bet_id = ${betId}`); await h.close(); process.exit(1); }
console.log("bet:", bet);

const [existingResult] = await q(sql`SELECT * FROM results WHERE source = ${bet.source} AND bet_id = ${betId} LIMIT 1`);
console.log("existing result:", existingResult ?? "(none -- ungraded)");

if (EXECUTE) {
  if (existingResult) {
    await q(sql`UPDATE results SET result = 'void', pnl_units = 0 WHERE source = ${bet.source} AND bet_id = ${betId}`);
  } else {
    await q(sql`INSERT INTO results (bet_pk, source, bet_id, result, pnl_units, graded_at) VALUES (${bet.id}, ${bet.source}, ${betId}, 'void', 0, now())`);
  }
  console.log("voided.");
} else {
  console.log("\nDRY RUN -- pass --execute to write.");
}
await h.close();
