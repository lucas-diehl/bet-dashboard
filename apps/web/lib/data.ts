import "server-only";
import { isLatePgaOutright } from "@bet/contract";
import type { BetRow, Dataset } from "@bet/db/types";

// Data provider. Three sources:
//   mock     (default) — in-memory demo dataset, zero setup
//   feed              — read the shared feed folder directly (real model output, local)
//   supabase          — read the Postgres DB (for a cloud deploy)
async function loadRaw(): Promise<Dataset> {
  const source = process.env.DATA_SOURCE ?? "mock";

  if (source === "feed") {
    const [{ loadDatasetFromFeed }, { feedDir }] = await Promise.all([import("@bet/db/feed"), import("@bet/contract")]);
    return loadDatasetFromFeed(feedDir());
  }

  if (source === "supabase" && process.env.DATABASE_URL) {
    const [{ openDb }, { loadDatasetFromDb }] = await Promise.all([import("@bet/db/upsert"), import("@bet/db/queries")]);
    const handle = openDb(process.env.DATABASE_URL);
    try {
      return await loadDatasetFromDb(handle.db);
    } finally {
      await handle.close();
    }
  }

  const { buildMockDataset } = await import("@bet/db/mock");
  return buildMockDataset();
}

export async function loadDataset(): Promise<Dataset> {
  const ds = await loadRaw();
  // Fresh-start cutoff: ignore anything dated before TRACKING_START (YYYY-MM-DD),
  // so historical/backfill/test slates don't count toward the tracker or board.
  const start = process.env.TRACKING_START;
  const rawBets = (start ? ds.bets.filter((b) => b.slate_date >= start) : ds.bets)
    // Drop PGA outrights that leaked in after the tournament started (first_seen >
    // slate_date) — never grade, log, or count them. Matchups are unaffected.
    .filter((b) => !isLatePgaOutright({ sport: b.sport, market: b.market, tags: b.tags, details: b.details, slate_date: b.slate_date }))
    // User directive (2026-10-21): NFL spread/total ("ATS and O/U") picks are not
    // used any more — hide them everywhere, including already-graded history, not
    // just new ones. The model stopped generating new rows (NFL/scripts/57_publish_
    // weekly_picks.R), but old rows stay in the DB; filtered here, on read, so
    // nothing has to be deleted and every page (board, tracker, extras) is covered
    // from one place, same pattern as the PGA-outright filter above.
    .filter((b) => !(b.sport === "nfl" && (b.market === "spread" || b.market === "total")))
    // User directive (2026-11-01): CFB totals ("we are not going to bet these anymore")
    // off the board, same treatment — ATS (spread) is untouched and still live. The
    // model stopped staking new ones (cfb-modeling/07_write_feed.R, EMIT_TOTAL defaults
    // off) but old rows stay in the DB; filtered here so history disappears too, not
    // just future picks.
    .filter((b) => !(b.sport === "cfb" && b.market === "total"));
  const rawSlates = start ? ds.slates.filter((s) => s.slate_date >= start) : ds.slates;
  // User directive: treat EVERY play as LIVE — no paper mode anywhere, past or
  // future. Applied on read so it covers both the feed and Supabase paths without
  // a DB migration or per-model change. Remove to restore model-reported modes.
  //
  // CBB carve-out (2026-11-18): model isn't expected to be profitable before week 5
  // (season starts counting live 2026-11-30) — CBB games before that date are tagged
  // PAPER instead of LIVE, so they still show (with the paper badge) but never count
  // toward the tracker. This is permanent per game date, not a rolling window: a CBB
  // game before the cutoff stays PAPER even after 2026-11-30 passes. Remove the CBB
  // branch (or adjust CBB_PAPER_CUTOFF) to end this early or restore normal treatment.
  const CBB_PAPER_CUTOFF = "2026-11-30";
  const modeFor = (sport: string, slate_date: string) => (sport === "cbb" && slate_date < CBB_PAPER_CUTOFF ? "PAPER" : "LIVE") as const;
  const bets = rawBets.map((b) => {
    const mode = modeFor(b.sport, b.slate_date);
    return b.mode === mode ? b : { ...b, mode };
  });
  const slates = rawSlates.map((s) => {
    const mode = modeFor(s.sport, s.slate_date);
    return s.mode === mode ? s : { ...s, mode };
  });
  return { slates, bets: dedupeBets(bets) };
}

// Collapse duplicate logical bets — same source/sport/date/market/selection/opponent
// (e.g. one matchup priced on multiple books, or re-emitted across runs with new bet_ids).
// Keep the graded copy if any (so the tracker counts a settled result exactly once),
// otherwise the best-EV / most-recent copy. Prevents duplicates being listed or double-graded.
function dedupeBets(bets: BetRow[]): BetRow[] {
  const graded = (b: BetRow) => (b.result && b.result !== "pending" ? 1 : 0);
  const better = (a: BetRow, b: BetRow) => {
    if (graded(a) !== graded(b)) return graded(a) > graded(b);
    if ((a.ev_pct ?? -1) !== (b.ev_pct ?? -1)) return (a.ev_pct ?? -1) > (b.ev_pct ?? -1);
    return (a.generated_at ?? "") >= (b.generated_at ?? "");
  };
  const best = new Map<string, BetRow>();
  for (const b of bets) {
    const key = `${b.source}|${b.sport}|${b.slate_date}|${b.market}|${b.selection}|${(b.details?.opponent as string) ?? ""}`;
    const cur = best.get(key);
    if (!cur || better(b, cur)) best.set(key, b);
  }
  return [...best.values()];
}

export function dataSourceLabel(): string {
  const source = process.env.DATA_SOURCE ?? "mock";
  if (source === "supabase" && process.env.DATABASE_URL) return "live";
  if (source === "feed") return "feed";
  return "demo";
}
