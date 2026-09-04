import { and, eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { isLatePgaOutright, type PicksFile, type ResultsFile, type ValuesFile, type EloFile, type PoolFile, type BoardFile } from "@bet/contract";
import { assets, bets, dfsPools, dfsValues, eloRatings, modelBoards, results, slates } from "./schema";

export function openDb(url: string) {
  const isLocal = /localhost|127\.0\.0\.1/.test(url);
  // prepare:false works across Supabase session/transaction poolers; ssl required for remote.
  const sql = postgres(url, { max: 1, prepare: false, ssl: isLocal ? false : "require" });
  const db = drizzle(sql);
  return { db, close: () => sql.end() };
}
export type DbHandle = ReturnType<typeof openDb>;
export type Db = DbHandle["db"];

/** Upsert one picks file: refresh the slate (by source+sport+date), then insert any
 *  new bets. Existing bets are FROZEN — a re-emit can add new picks and fill fields
 *  that were missing at post time, but it can never change a posted pick's terms
 *  (line/odds/side/selection/stake/etc.), so the board always reflects exactly what
 *  we graded against (see the freeze block below).
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
    const incoming = {
      slateId: slate.id,
      betId: b.bet_id,
      source: p.source,
      sport: b.sport ?? p.sport,
      slateDate: p.slate_date,
      mode: p.mode,
      event: b.event ?? null,
      eventStart: b.event_start ? new Date(b.event_start) : null,
      market: b.market,
      marketLabel: b.market_label ?? null,
      selection: b.selection,
      side: b.side ?? null,
      line: b.line ?? null,
      oddsAmerican: b.odds_american,
      book: b.book ?? null,
      modelProb: b.model_prob ?? null,
      marketProb: b.market_prob ?? null,
      edge: b.edge ?? null,
      evPct: b.ev_pct ?? null,
      stakeUnits: b.stake_units,
      confidence: b.confidence ?? null,
      tier: b.tier != null ? String(b.tier) : null,
      tags: b.tags ?? null,
      details: b.details ?? null,
    };

    const [existing] = await db
      .select()
      .from(bets)
      .where(and(eq(bets.source, p.source), eq(bets.betId, b.bet_id)))
      .limit(1);

    if (!existing) {
      await db.insert(bets).values(incoming);
      continue;
    }

    // FREEZE the posted pick. Once a bet is on the board it is exactly what we grade
    // against, so a re-emit must never change its terms — TCU -7.5 must not silently
    // become -9.5, odds/side/selection/stake are likewise locked. A re-emit may only
    // FILL a field that was missing (null) at post time; slate_id is housekeeping and
    // is kept current. This makes the whole snapshot immutable per (source, bet_id).
    const keep = <T>(prior: T, next: T): T => (prior !== null && prior !== undefined ? prior : next);
    const frozen = {
      slateId: slate.id,
      sport: keep(existing.sport, incoming.sport),
      slateDate: keep(existing.slateDate, incoming.slateDate),
      mode: keep(existing.mode, incoming.mode),
      event: keep(existing.event, incoming.event),
      eventStart: keep(existing.eventStart, incoming.eventStart),
      market: keep(existing.market, incoming.market),
      marketLabel: keep(existing.marketLabel, incoming.marketLabel),
      selection: keep(existing.selection, incoming.selection),
      side: keep(existing.side, incoming.side),
      line: keep(existing.line, incoming.line),
      oddsAmerican: keep(existing.oddsAmerican, incoming.oddsAmerican),
      book: keep(existing.book, incoming.book),
      modelProb: keep(existing.modelProb, incoming.modelProb),
      marketProb: keep(existing.marketProb, incoming.marketProb),
      edge: keep(existing.edge, incoming.edge),
      evPct: keep(existing.evPct, incoming.evPct),
      stakeUnits: keep(existing.stakeUnits, incoming.stakeUnits),
      confidence: keep(existing.confidence, incoming.confidence),
      tier: keep(existing.tier, incoming.tier),
      tags: keep(existing.tags, incoming.tags),
      details: keep(existing.details, incoming.details),
    };
    const termChanged =
      (incoming.line != null && existing.line != null && incoming.line !== existing.line) ||
      (existing.oddsAmerican != null && incoming.oddsAmerican !== existing.oddsAmerican) ||
      (incoming.side != null && existing.side != null && incoming.side !== existing.side) ||
      (incoming.selection !== existing.selection) ||
      (incoming.stakeUnits != null && existing.stakeUnits != null && incoming.stakeUnits !== existing.stakeUnits);
    if (termChanged) {
      console.log(
        `  freeze: kept posted terms for ${p.source}/${b.bet_id} — re-emit tried ${existing.selection} ${existing.side ?? ""} ${existing.line ?? ""} @${existing.oddsAmerican}/${existing.stakeUnits}u → ${incoming.selection} ${incoming.side ?? ""} ${incoming.line ?? ""} @${incoming.oddsAmerican}/${incoming.stakeUnits}u (ignored)`,
      );
    }
    await db.update(bets).set(frozen).where(eq(bets.id, existing.id));
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
/** Replace a model board: delete the existing row for source+sport+slate_date, then
 *  insert the whole BoardFile as a JSON blob (display-only, Extras tab). */
export async function upsertBoardFile(db: Db, b: BoardFile) {
  await db
    .delete(modelBoards)
    .where(and(eq(modelBoards.source, b.source), eq(modelBoards.sport, b.sport), eq(modelBoards.slateDate, b.slate_date)));
  await db.insert(modelBoards).values({
    source: b.source,
    sport: b.sport,
    slateDate: b.slate_date,
    generatedAt: b.generated_at ? new Date(b.generated_at) : null,
    mode: b.mode,
    eventContext: b.event_context ?? null,
    notes: b.notes ?? null,
    payload: JSON.stringify(b),
    updatedAt: new Date(),
  });
}

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

/** Replace a DFS pool: delete the existing row for this
 *  source+sport+site+slate_date+slate_type+round, then insert the new payload blob.
 *  slate_type/round are coalesced (tournament/0) so the key match is well-defined. */
export async function upsertPoolFile(db: Db, p: PoolFile) {
  const stype = p.slate_type ?? "tournament";
  const rnd = p.round ?? 0;
  await db
    .delete(dfsPools)
    .where(
      and(
        eq(dfsPools.source, p.source),
        eq(dfsPools.sport, p.sport),
        eq(dfsPools.site, p.site),
        eq(dfsPools.slateDate, p.slate_date),
        eq(dfsPools.slateType, stype),
        eq(dfsPools.round, rnd),
      ),
    );
  await db.insert(dfsPools).values({
    source: p.source,
    sport: p.sport,
    site: p.site,
    slateDate: p.slate_date,
    slateLabel: p.slate_label ?? null,
    slateType: stype,
    round: rnd,
    event: p.event ?? null,
    payload: JSON.stringify(p),
    generatedAt: p.generated_at ? new Date(p.generated_at) : null,
    updatedAt: new Date(),
  });
}
