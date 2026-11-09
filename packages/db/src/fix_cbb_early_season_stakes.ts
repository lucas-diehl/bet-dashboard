// One-time correction: cut stake_units by 25% for every CBB (source="bet-screen",
// sport="cbb") bet in weeks 1-3 of the season, retroactively. Owner-directed
// 2026-11-09, following EARLY_SEASON_HANDOFF.md's confirmed finding (the real graded
// bet log: weeks 1-3 grade 52.2%/-0.3% ROI vs. 57.2%/+9.2% in weeks 4+). The matching
// prospective fix already ships in bet-screen/cbb/scripts/post_dashboard_picks.py
// (applies the same 0.75x to every NEW post before week 4) -- this script is only for
// bets that were posted to the DB *before* that fix existed.
//
// Why this can't go through the normal ingest/reconcile path: packages/db/src/upsert.ts's
// upsertPicksFile() deliberately FREEZES a posted bet's stake_units once it's in the DB
// ("Once a bet is on the board it is exactly what we grade against ... stake ... likewise
// locked"). That's correct behavior for the normal pipeline and must stay that way -- this
// script is an explicit, logged, one-time exception to it, run directly against the DB,
// not through upsertPicksFile.
//
// Safety:
//  - WEEK4_START matches post_dashboard_picks.py's constant exactly -- keep these in sync.
//  - Idempotency guard: skips any bet whose `details` already has `stake_note` set (the
//    marker the prospective fix stamps on already-cut bets) -- running this twice, or
//    running it after the prospective fix has also posted early-season bets, cannot
//    double-apply the cut.
//  - Dry run by default. Pass --execute to actually write.
//  - pnl_units for already-graded bets is scaled by the SAME 0.75 factor, not
//    recomputed from odds -- win/loss/push never changes with stake, so this is exact,
//    not an approximation, and avoids re-deriving the american-odds formula here.
//
//   pnpm --filter @bet/db exec tsx src/fix_cbb_early_season_stakes.ts            # dry run
//   pnpm --filter @bet/db exec tsx src/fix_cbb_early_season_stakes.ts --execute  # writes
import { sql } from "drizzle-orm";
import { openDb } from "./upsert";
import { loadEnv } from "./env";

loadEnv();
const EXECUTE = process.argv.includes("--execute");
const WEEK4_START = "2026-11-23"; // keep in sync with post_dashboard_picks.py's WEEK4_START
const STAKE_MULT = 0.75;

const h = openDb(process.env.DATABASE_URL!);
const q = async (s: any) => (await h.db.execute(s)) as unknown as any[];

const bets = await q(sql`
  SELECT id, bet_id, slate_date, stake_units, details
  FROM bets
  WHERE source = 'bet-screen' AND sport = 'cbb' AND slate_date < ${WEEK4_START}
  ORDER BY slate_date
`);
console.log(`found ${bets.length} cbb bets before ${WEEK4_START}`);

const alreadyCut = bets.filter((b: any) => b.details?.stake_note);
const toFix = bets.filter((b: any) => !b.details?.stake_note);
console.log(`  already marked cut (skipping): ${alreadyCut.length}`);
console.log(`  to fix: ${toFix.length}`);

let totalOldStake = 0, totalNewStake = 0;
for (const b of toFix) {
  const oldStake = Number(b.stake_units);
  const newStake = Math.round(oldStake * STAKE_MULT * 100) / 100;
  totalOldStake += oldStake; totalNewStake += newStake;

  const [result] = await q(sql`
    SELECT pnl_units FROM results WHERE source = 'bet-screen' AND bet_id = ${b.bet_id} LIMIT 1
  `);
  const oldPnl = result ? Number(result.pnl_units) : null;
  const newPnl = oldPnl == null ? null : Math.round(oldPnl * STAKE_MULT * 100) / 100;

  console.log(
    `  ${b.slate_date}  ${b.bet_id}  stake ${oldStake}u -> ${newStake}u` +
    (oldPnl != null ? `  pnl ${oldPnl.toFixed(2)}u -> ${newPnl!.toFixed(2)}u` : "  (ungraded)"),
  );

  if (EXECUTE) {
    const newDetails = { ...(b.details ?? {}), raw_stake_units: oldStake,
      stake_note: `cut 25% for weeks 1-3 (before ${WEEK4_START}) -- retroactive correction, see EARLY_SEASON_HANDOFF.md` };
    await q(sql`UPDATE bets SET stake_units = ${newStake}, details = ${JSON.stringify(newDetails)}::jsonb WHERE id = ${b.id}`);
    if (oldPnl != null) {
      await q(sql`UPDATE results SET pnl_units = ${newPnl} WHERE source = 'bet-screen' AND bet_id = ${b.bet_id}`);
    }
  }
}

console.log(`\ntotal stake: ${totalOldStake.toFixed(2)}u -> ${totalNewStake.toFixed(2)}u`);
console.log(EXECUTE ? "\nWROTE changes." : "\nDRY RUN -- pass --execute to write.");
await h.close();
