import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { classifyFeedFile, safeParsePicksFile, safeParseResultsFile, safeParseValuesFile, safeParseEloFile, safeParseBoardFile, type Grade, type PicksFile, type ValuesFile, type EloFile, type BoardFile } from "@bet/contract";
import type { ResultValue } from "@bet/core";
import type { BetRow, Dataset, Mode, SlateRow } from "./types";

// Reads the feed folder directly into a Dataset (no database). Used by the web app
// when DATA_SOURCE=feed — the fastest way to see real model output on the site, and
// a valid path for a locally-run or self-hosted dashboard. For a cloud deploy that
// can't see the local folder, use the ingest -> Postgres path instead.

function walk(dir: string): string[] {
  const out: string[] = [];
  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch {
    return out;
  }
  for (const e of entries) {
    if (e === "_schema" || e === "_examples" || e === "node_modules") continue;
    const full = join(dir, e);
    if (statSync(full).isDirectory()) out.push(...walk(full));
    else if (e.endsWith(".json")) out.push(full);
  }
  return out;
}

export function loadDatasetFromFeed(dir: string): Dataset {
  const picks: PicksFile[] = [];
  const grades = new Map<string, { g: Grade; graded_at: string }>();

  for (const file of walk(dir)) {
    let json: unknown;
    try {
      json = JSON.parse(readFileSync(file, "utf8"));
    } catch {
      continue;
    }
    const kind = classifyFeedFile(json);
    if (kind === "picks") {
      const r = safeParsePicksFile(json);
      if (r.ok && r.data) picks.push(r.data);
    } else if (kind === "results") {
      const r = safeParseResultsFile(json);
      if (r.ok && r.data) for (const gr of r.data.results) grades.set(`${r.data.source}:${gr.bet_id}`, { g: gr, graded_at: r.data.graded_at });
    }
  }

  const slates: SlateRow[] = [];
  const bets: BetRow[] = [];
  let sid = 0;
  let bid = 0;

  for (const p of picks) {
    const slateId = `s${++sid}`;
    slates.push({
      id: slateId,
      source: p.source,
      sport: p.sport,
      slate_date: p.slate_date,
      generated_at: p.generated_at,
      model_version: p.model_version,
      mode: p.mode as Mode,
      event_context: p.event_context,
      notes: p.notes,
    });
    for (const b of p.bets) {
      const gk = grades.get(`${p.source}:${b.bet_id}`);
      const g = gk?.g;
      bets.push({
        id: `b${++bid}`,
        slate_id: slateId,
        bet_id: b.bet_id,
        source: p.source,
        sport: b.sport ?? p.sport,
        slate_date: p.slate_date,
        generated_at: p.generated_at,
        mode: p.mode as Mode,
        event: b.event,
        event_start: b.event_start ?? null,
        market: b.market,
        market_label: b.market_label,
        selection: b.selection,
        side: b.side ?? null,
        line: b.line ?? null,
        odds_american: b.odds_american,
        book: b.book,
        model_prob: b.model_prob ?? null,
        market_prob: b.market_prob ?? null,
        edge: b.edge ?? null,
        ev_pct: b.ev_pct ?? null,
        stake_units: b.stake_units,
        confidence: b.confidence,
        tier: b.tier,
        tags: b.tags,
        details: b.details,
        result: (g?.result as ResultValue) ?? null,
        closing_odds_american: g?.closing_odds_american ?? null,
        clv_pct: g?.clv_pct ?? null,
        pnl_units: g?.pnl_units ?? null,
        graded_at: gk?.graded_at ?? null,
        actual: g?.actual ?? null,
      });
    }
  }

  return { slates, bets };
}

/** Read all values_*.json (DFS value plays) from the feed folder. Independent of
 *  picks/results and of DATA_SOURCE — the /dfs page always reads these live. */
export function loadValuesFromFeed(dir: string): ValuesFile[] {
  const out: ValuesFile[] = [];
  for (const file of walk(dir)) {
    if (!/values_[^\\/]*\.json$/.test(file)) continue;
    let json: unknown;
    try {
      json = JSON.parse(readFileSync(file, "utf8"));
    } catch {
      continue;
    }
    if (classifyFeedFile(json) !== "values") continue;
    const r = safeParseValuesFile(json);
    if (r.ok && r.data) out.push(r.data);
  }
  return out;
}

/** Read all Elo snapshot files (classified "elo") from the feed folder. Independent
 *  of picks/results and of DATA_SOURCE — the /extras page reads these live. */
export function loadEloFromFeed(dir: string): EloFile[] {
  const out: EloFile[] = [];
  for (const file of walk(dir)) {
    if (!file.endsWith(".json")) continue;
    let json: unknown;
    try {
      json = JSON.parse(readFileSync(file, "utf8"));
    } catch {
      continue;
    }
    if (classifyFeedFile(json) !== "elo") continue;
    const r = safeParseEloFile(json);
    if (r.ok && r.data) out.push(r.data);
  }
  return out;
}

/** Read all model board files (classified "board") from the feed folder. Independent
 *  of picks/results and of DATA_SOURCE — the /extras page reads these live. */
export function loadBoardFromFeed(dir: string): BoardFile[] {
  const out: BoardFile[] = [];
  for (const file of walk(dir)) {
    if (!file.endsWith(".json")) continue;
    let json: unknown;
    try {
      json = JSON.parse(readFileSync(file, "utf8"));
    } catch {
      continue;
    }
    if (classifyFeedFile(json) !== "board") continue;
    const r = safeParseBoardFile(json);
    if (r.ok && r.data) out.push(r.data);
  }
  return out;
}
