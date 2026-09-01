// Seeds the mock dataset into a real Postgres/Supabase database. Requires
// DATABASE_URL. Safe to re-run: it upserts on the natural keys. For the demo you
// do NOT need this — the web app defaults to the in-memory mock.
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { buildMockDataset } from "./mock";
import { SOURCES } from "@bet/contract";
import { bets, results, slates, sources } from "./schema";
import { loadEnv } from "./env";

async function main() {
  loadEnv();
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error("DATABASE_URL not set. This seed targets a real database; the demo uses the in-memory mock instead.");
    process.exit(1);
  }
  const sql = postgres(url, { max: 1 });
  const db = drizzle(sql);
  const data = buildMockDataset();

  // sources registry
  for (const s of Object.values(SOURCES)) {
    await db.insert(sources).values({ key: s.key, label: s.label, note: s.note }).onConflictDoNothing();
  }

  // map mock slate id -> db serial id
  const slateIdMap = new Map<string, number>();
  for (const s of data.slates) {
    const [row] = await db
      .insert(slates)
      .values({
        source: s.source,
        sport: s.sport,
        slateDate: s.slate_date,
        generatedAt: new Date(s.generated_at),
        modelVersion: s.model_version,
        mode: s.mode,
        eventContext: s.event_context,
        notes: s.notes,
      })
      .onConflictDoNothing()
      .returning({ id: slates.id });
    if (row) slateIdMap.set(s.id, row.id);
  }

  for (const b of data.bets) {
    const slateId = slateIdMap.get(b.slate_id);
    if (!slateId) continue;
    const [row] = await db
      .insert(bets)
      .values({
        slateId,
        betId: b.bet_id,
        source: b.source,
        sport: b.sport,
        slateDate: b.slate_date,
        mode: b.mode,
        event: b.event,
        eventStart: b.event_start ? new Date(b.event_start) : null,
        market: b.market,
        marketLabel: b.market_label,
        selection: b.selection,
        side: b.side ?? null,
        line: b.line ?? null,
        oddsAmerican: b.odds_american,
        book: b.book,
        modelProb: b.model_prob ?? null,
        marketProb: b.market_prob ?? null,
        edge: b.edge ?? null,
        evPct: b.ev_pct ?? null,
        stakeUnits: b.stake_units,
        confidence: b.confidence,
        tier: b.tier != null ? String(b.tier) : null,
        tags: b.tags,
        details: b.details,
      })
      .onConflictDoNothing()
      .returning({ id: bets.id });
    if (row && b.result) {
      await db
        .insert(results)
        .values({
          betPk: row.id,
          source: b.source,
          betId: b.bet_id,
          result: b.result,
          closingOddsAmerican: b.closing_odds_american ?? null,
          clvPct: b.clv_pct ?? null,
          pnlUnits: b.pnl_units ?? null,
          gradedAt: b.graded_at ? new Date(b.graded_at) : null,
          actual: b.actual ?? undefined,
        })
        .onConflictDoNothing();
    }
  }

  console.log(`Seeded ${data.slates.length} slates and ${data.bets.length} bets into the database.`);
  await sql.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
