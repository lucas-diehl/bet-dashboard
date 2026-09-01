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
    .filter((b) => !isLatePgaOutright({ sport: b.sport, market: b.market, tags: b.tags, details: b.details, slate_date: b.slate_date }));
  const rawSlates = start ? ds.slates.filter((s) => s.slate_date >= start) : ds.slates;
  // User directive: treat EVERY play as LIVE — no paper mode anywhere, past or
  // future. Applied on read so it covers both the feed and Supabase paths without
  // a DB migration or per-model change. Remove to restore model-reported modes.
  const bets = rawBets.map((b) => (b.mode === "LIVE" ? b : { ...b, mode: "LIVE" as const }));
  const slates = rawSlates.map((s) => (s.mode === "LIVE" ? s : { ...s, mode: "LIVE" as const }));
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
