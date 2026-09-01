import { and, eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { isLatePgaOutright, type PicksFile, type ResultsFile, type ValuesFile, type EloFile } from "@bet/contract";
import { assets, bets, dfsValues, eloRatings, results, slates } from "./schema";

export function openDb(url: string) {
  const isLocal = /localhost|127\.0\.0\.1/.test(url);
  // prepare:false works across Supabase session/transaction poolers; ssl required for remote.
  const sql = postgres(url, { max: 1, prepare: false, ssl: isLocal ? false : "require" });
  const db = drizzle(sql);
  return { db, close: () => sql.end() };
}
export type DbHandle = ReturnType<typeof openDb>;
export type Db = DbHandle["db"];

/** Upsert one picks file: replace the slate (by source+sport+date) and its bets.
 *  With { reconcile: true }, also delete bets for this slate that are NOT in the
 *  incoming file and have no grade yet (withdrawn/re-emitted-smaller — e.g. the
 *  golf tournament file shrinking). Graded bets are always kept. */
export async function upsertPicksFile(db: Db, p: PicksFile, opts?: { reconcile?: boolean }) {
  const [slate] = await db
    .insert(slates)
    .values({
      source: p.source,
      sport: p.sport,
      slateDate: p.slate_date,
      generatedAt: new Date(p.generated_at),
      modelVersion: p.model_version,
      mode: p.mode,
      eventContext: p.event_context,
      notes: p.notes,
    })
    .onConflictDoUpdate({
      target: [slates.source, slates.sport, slates.slateDate],
      set: { generatedAt: new Date(p.generated_at), mode: p.mode, modelVersion: p.model_version, eventContext: p.event_context, notes: p.notes },
    })
    .returning({ id: slates.id });

  // Drop PGA outrights that leaked in after the tournament started (first_seen >
  // slate_date). They must never be stored, graded, or counted. Matchups unaffected.
  const keptBets = p.bets.filter(
    (b) => !isLatePgaOutright({ sport: b.sport ?? p.sport, market: b.market, tags: b.tags, details: b.details, slate_date: p.slate_date }),
  );

  for (const b of keptBets) {
    await db
      .insert(bets)
      .values({
        slateId: slate.id,
        betId: b.bet_id,
        source: p.source,
        sport: b.sport ?? p.sport,
        slateDate: p.slate_date,
        mode: p.mode,
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
      .onConflictDoUpdate({
        target: [bets.source, bets.betId],
        // Refresh EVERY column the file carries — a re-emit must not leave stale
        // evPct/book/line/etc. (evPct drives the dedupe tiebreak and card order).
        set: {
          slateId: slate.id,
          sport: b.sport ?? p.sport,
          slateDate: p.slate_date,
          mode: p.mode,
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
        },
      });
  }

  if (opts?.reconcile) {
    const incoming = new Set(keptBets.map((b) => b.bet_id));
    const existing = await db
      .select({ id: bets.id, betId: bets.betId })
      .from(bets)
      .where(and(eq(bets.source, p.source), eq(bets.sport, p.sport), eq(bets.slateDate, p.slate_date)));
    for (const row of existing) {
      if (incoming.has(row.betId)) continue;
      const [graded] = await db
        .select({ id: results.id })
        .from(results)
        .where(and(eq(results.source, p.source), eq(results.betId, row.betId)))
        .limit(1);
      if (graded) continue; // never remove a bet that already has a result
      await db.delete(bets).where(eq(bets.id, row.id));
      console.log(`  reconcile: removed withdrawn bet ${p.source}/${row.betId} (${p.sport} ${p.slate_date})`);
    }
  }
}

/** Apply grades from one results file, joined to existing bets by (source, bet_id). */
export async function upsertResultsFile(db: Db, r: ResultsFile) {
  for (const g of r.results) {
    const [bet] = await db
      .select({ id: bets.id })
      .from(bets)
      .where(and(eq(bets.source, r.source), eq(bets.betId, g.bet_id)))
      .limit(1);
    if (!bet) continue;
    await db
      .insert(results)
      .values({
        betPk: bet.id,
        source: r.source,
        betId: g.bet_id,
        result: g.result,
        closingOddsAmerican: g.closing_odds_american ?? null,
        clvPct: g.clv_pct ?? null,
        pnlUnits: g.pnl_units ?? null,
        gradedAt: new Date(r.graded_at),
        actual: g.actual,
      })
      .onConflictDoUpdate({
        target: [results.source, results.betId],
        set: { result: g.result, closingOddsAmerican: g.closing_odds_american ?? null, clvPct: g.clv_pct ?? null, pnlUnits: g.pnl_units ?? null, gradedAt: new Date(r.graded_at), actual: g.actual },
      });
  }
}

/** Replace a DFS values slate: delete the existing rows for this
 *  source+sport+site+slate_date+slate_label+slate_type+round, then insert the new
 *  list. Site + slate_type + round are in the key so DraftKings/FanDuel, the full
 *  tournament board, and each single-round slate all coexist (never merged).
 *  Key columns are coalesced to non-null so the equality match is well-defined. */
export async function upsertValuesFile(db: Db, v: ValuesFile) {
  const label = v.slate_label ?? "";
  const stype = v.slate_type ?? "tournament";
  const rnd = v.round ?? 0;
  await db
    .delete(dfsValues)
    .where(
      and(
        eq(dfsValues.source, v.source),
        eq(dfsValues.sport, v.sport),
        eq(dfsValues.site, v.site),
        eq(dfsValues.slateDate, v.slate_date),
        eq(dfsValues.slateLabel, label),
        eq(dfsValues.slateType, stype),
        eq(dfsValues.round, rnd),
      ),
    );
  if (v.values.length === 0) return;
  await db.insert(dfsValues).values(
    v.values.map((it) => ({
      source: v.source,
      sport: v.sport,
      slateDate: v.slate_date,
      site: v.site,
      slateLabel: label,
      slateType: stype,
      round: rnd,
      roundLabel: v.round_label ?? null,
      event: v.event ?? null,
      generatedAt: new Date(v.generated_at),
      rank: it.rank ?? null,
      name: it.name,
      team: it.team ?? null,
      position: it.position ?? null,
      salary: it.salary,
      proj: it.proj,
      value: it.value,
      ceiling: it.ceiling ?? null,
      ownership: it.ownership ?? null,
      exposure: it.exposure ?? null,
      note: it.note ?? null,
    })),
  );
}

/** The `updated` timestamp currently stored for an asset key (ISO string), or null.
 *  Cheap — never selects the (large) content column. */
export async function loadAssetUpdated(db: Db, key: string): Promise<string | null> {
  const [row] = await db.select({ updated: assets.updated }).from(assets).where(eq(assets.key, key)).limit(1);
  return row?.updated ? row.updated.toISOString() : null;
}

/** Upsert one opaque asset blob (e.g. the simulator HTML) by key. */
export async function upsertAsset(db: Db, key: string, content: string, updated: Date | null) {
  await db
    .insert(assets)
    .values({ key, content, updated, uploadedAt: new Date() })
    .onConflictDoUpdate({ target: [assets.key], set: { content, updated, uploadedAt: new Date() } });
}

/** Replace an Elo snapshot: delete existing rows for this source+sport, then
 *  insert the new ratings list. */
export async function upsertEloFile(db: Db, e: EloFile) {
  await db.delete(eloRatings).where(and(eq(eloRatings.source, e.source), eq(eloRatings.sport, e.sport)));
  if (e.ratings.length === 0) return;
  await db.insert(eloRatings).values(
    e.ratings.map((r) => ({
      source: e.source,
      sport: e.sport,
      generatedAt: new Date(e.generated_at),
      rank: r.rank ?? null,
      name: r.name,
      elo: r.elo,
      change: r.change ?? null,
    })),
  );
}
