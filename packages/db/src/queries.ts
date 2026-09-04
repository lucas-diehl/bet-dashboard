import { desc, eq, sql } from "drizzle-orm";
import type { Db } from "./upsert";
import { assets, bets, dfsPools, dfsValues, eloRatings, modelBoards, results, slates } from "./schema";

export interface PoolMeta {
  id: number;
  source: string;
  sport: string;
  site: string;
  slate_date: string;
  slate_label?: string;
  slate_type?: string;
  round?: number;
  event?: string;
  generated_at: string | null;
}

/** List available DFS pools — metadata only (NOT the large payload), for the optimizer's selectors. */
export async function loadPoolIndex(db: Db): Promise<PoolMeta[]> {
  const rows = await db
    .select({
      id: dfsPools.id, source: dfsPools.source, sport: dfsPools.sport, site: dfsPools.site,
      slateDate: dfsPools.slateDate, slateLabel: dfsPools.slateLabel, slateType: dfsPools.slateType,
      round: dfsPools.round, event: dfsPools.event, generatedAt: dfsPools.generatedAt,
    })
    .from(dfsPools);
  return rows.map((r) => ({
    id: r.id, source: r.source, sport: r.sport, site: r.site, slate_date: String(r.slateDate),
    slate_label: r.slateLabel ?? undefined, slate_type: r.slateType ?? undefined,
    round: r.round ?? undefined, event: r.event ?? undefined,
    generated_at: r.generatedAt ? r.generatedAt.toISOString() : null,
  }));
}

/** The full pool payload JSON (string) for one pool id. */
export async function loadPoolPayload(db: Db, id: number): Promise<string | null> {
  const [r] = await db.select({ payload: dfsPools.payload }).from(dfsPools).where(eq(dfsPools.id, id)).limit(1);
  return r?.payload ?? null;
}

/** Read one asset blob (content + updated) by key, e.g. the simulator HTML. */
export async function loadAsset(db: Db, key: string): Promise<{ content: string; updated: string | null } | null> {
  const [row] = await db.select().from(assets).where(eq(assets.key, key)).limit(1);
  return row ? { content: row.content, updated: row.updated ? row.updated.toISOString() : null } : null;
}
import type { BetRow, Dataset, Mode, SlateRow } from "./types";
import type { ResultValue } from "@bet/core";
import type { ValuesFile, EloFile, BoardFile } from "@bet/contract";

/** Read the full dataset from Postgres, joining bets to their grades. Used by the
 *  web app when DATA_SOURCE=supabase. */
export async function loadDatasetFromDb(db: Db): Promise<Dataset> {
  const [slateRows, betRows, resultRows] = await Promise.all([
    db.select().from(slates),
    // Stable order (earliest kickoff first, then EV, then stake) so raw fetch order
    // doesn't drift between updates; the UI re-sorts per group but this is the anchor.
    db.select().from(bets).orderBy(sql`${bets.eventStart} asc nulls last`, desc(bets.evPct), desc(bets.stakeUnits)),
    db.select().from(results),
  ]);

  const resBy = new Map(resultRows.map((r) => [`${r.source}:${r.betId}`, r]));

  const outSlates: SlateRow[] = slateRows.map((s) => ({
    id: String(s.id),
    source: s.source,
    sport: s.sport,
    slate_date: String(s.slateDate),
    generated_at: s.generatedAt.toISOString(),
    model_version: s.modelVersion ?? undefined,
    mode: s.mode as Mode,
    event_context: s.eventContext ?? undefined,
    notes: s.notes ?? undefined,
  }));

  const outBets: BetRow[] = betRows.map((b) => {
    const g = resBy.get(`${b.source}:${b.betId}`);
    return {
      id: String(b.id),
      slate_id: String(b.slateId),
      bet_id: b.betId,
      source: b.source,
      sport: b.sport,
      slate_date: String(b.slateDate),
      generated_at: "",
      mode: b.mode as Mode,
      event: b.event ?? undefined,
      event_start: b.eventStart ? b.eventStart.toISOString() : null,
      market: b.market,
      market_label: b.marketLabel ?? undefined,
      selection: b.selection,
      side: b.side ?? null,
      line: b.line ?? null,
      odds_american: b.oddsAmerican,
      book: b.book ?? undefined,
      model_prob: b.modelProb ?? null,
      market_prob: b.marketProb ?? null,
      edge: b.edge ?? null,
      ev_pct: b.evPct ?? null,
      stake_units: b.stakeUnits,
      confidence: b.confidence ?? undefined,
      tier: b.tier ?? undefined,
      tags: b.tags ?? undefined,
      details: b.details ?? undefined,
      result: (g?.result as ResultValue) ?? null,
      closing_odds_american: g?.closingOddsAmerican ?? null,
      clv_pct: g?.clvPct ?? null,
      pnl_units: g?.pnlUnits ?? null,
      graded_at: g?.gradedAt ? g.gradedAt.toISOString() : null,
      actual: g?.actual ?? null,
    };
  });

  return { slates: outSlates, bets: outBets };
}

/** Read DFS value plays from Postgres and reconstruct ValuesFile[] (one per slate),
 *  each with its list ordered best value first. Used by /dfs when DATA_SOURCE=supabase. */
export async function loadValuesFromDb(db: Db): Promise<ValuesFile[]> {
  const rows = await db.select().from(dfsValues);
  const byslate = new Map<string, ValuesFile>();
  for (const r of rows) {
    const key = `${r.source}|${r.sport}|${r.site ?? ""}|${String(r.slateDate)}|${r.slateLabel ?? ""}|${r.slateType ?? ""}|${r.round ?? 0}`;
    let f = byslate.get(key);
    if (!f) {
      f = {
        contract_version: "1.0",
        source: r.source,
        sport: r.sport,
        site: r.site ?? "",
        slate_date: String(r.slateDate),
        slate_label: r.slateLabel ?? "",
        slate_type: r.slateType ?? undefined,
        round: r.round ?? undefined,
        round_label: r.roundLabel ?? undefined,
        event: r.event ?? undefined,
        generated_at: r.generatedAt ? r.generatedAt.toISOString() : "",
        values: [],
      };
      byslate.set(key, f);
    }
    f.values.push({
      rank: r.rank ?? undefined,
      name: r.name,
      team: r.team ?? undefined,
      position: r.position ?? undefined,
      salary: r.salary,
      proj: r.proj,
      value: r.value,
      ceiling: r.ceiling ?? undefined,
      ownership: r.ownership ?? undefined,
      exposure: r.exposure ?? undefined,
      note: r.note ?? undefined,
    });
  }
  for (const f of byslate.values()) {
    f.values.sort((a, b) => {
      const ra = a.rank ?? 1e9;
      const rb = b.rank ?? 1e9;
      return ra !== rb ? ra - rb : b.value - a.value;
    });
  }
  return [...byslate.values()];
}

/** Read model boards from Postgres (one blob per source+sport+slate_date). Used by
 *  /extras when DATA_SOURCE=supabase. Each row's payload IS a full BoardFile. */
export async function loadBoardFromDb(db: Db): Promise<BoardFile[]> {
  const rows = await db.select({ payload: modelBoards.payload }).from(modelBoards);
  const out: BoardFile[] = [];
  for (const r of rows) {
    try {
      out.push(JSON.parse(r.payload) as BoardFile);
    } catch {
      /* skip corrupt payloads */
    }
  }
  return out;
}

/** Read Elo snapshots from Postgres and reconstruct EloFile[] (one per source+sport),
 *  each ordered by rank (then Elo desc). Used by /extras when DATA_SOURCE=supabase. */
export async function loadEloFromDb(db: Db): Promise<EloFile[]> {
  const rows = await db.select().from(eloRatings);
  const bykey = new Map<string, EloFile>();
  for (const r of rows) {
    const key = `${r.source}|${r.sport}`;
    let f = bykey.get(key);
    if (!f) {
      f = {
        contract_version: "1.0",
        source: r.source,
        sport: r.sport,
        generated_at: r.generatedAt ? r.generatedAt.toISOString() : "",
        ratings: [],
      };
      bykey.set(key, f);
    }
    f.ratings.push({ rank: r.rank ?? undefined, name: r.name, elo: r.elo, change: r.change ?? undefined });
  }
  for (const f of bykey.values()) {
    f.ratings.sort((a, b) => {
      const ra = a.rank ?? 1e9;
      const rb = b.rank ?? 1e9;
      return ra !== rb ? ra - rb : b.elo - a.elo;
    });
  }
  return [...bykey.values()];
}
