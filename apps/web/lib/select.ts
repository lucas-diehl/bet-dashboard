import { bankrollCurve, rollup, type BankrollPoint, type GradedRow, type ResultValue, type Rollup } from "@bet/core";
import { SPORTS, SOURCES } from "@bet/contract";
import type { BetRow, Dataset, SlateRow } from "@bet/db/types";
import { appToday } from "./time";

export type TrackerMode = "LIVE" | "PAPER" | "all";

// Stable card order within a sport section: earliest kickoff first (nulls last),
// then highest EV, then largest stake. Deterministic across page loads.
export function betSort(a: BetRow, b: BetRow): number {
  const sa = a.event_start ?? null;
  const sb = b.event_start ?? null;
  if (sa !== sb) {
    if (sa == null) return 1;
    if (sb == null) return -1;
    if (sa !== sb) return sa < sb ? -1 : 1;
  }
  if ((b.ev_pct ?? -Infinity) !== (a.ev_pct ?? -Infinity)) return (b.ev_pct ?? -Infinity) - (a.ev_pct ?? -Infinity);
  return b.stake_units - a.stake_units;
}

const SPORT_ORDER = Object.keys(SPORTS);
export function sportRank(sport: string): number {
  const i = SPORT_ORDER.indexOf(sport);
  return i === -1 ? 999 : i;
}

export function latestDate(ds: Dataset): string {
  return ds.slates.reduce((max, s) => (s.slate_date > max ? s.slate_date : max), "0000-00-00");
}

export function datesWithBets(ds: Dataset): string[] {
  return [...new Set(ds.bets.map((b) => b.slate_date))].sort().reverse();
}

export function betsForDate(ds: Dataset, date: string): BetRow[] {
  return ds.bets.filter((b) => b.slate_date === date);
}

export interface SportGroup {
  sport: string;
  bets: BetRow[];
}
export function groupBySport(bets: BetRow[]): SportGroup[] {
  const map = new Map<string, BetRow[]>();
  for (const b of bets) (map.get(b.sport) ?? map.set(b.sport, []).get(b.sport)!).push(b);
  return [...map.entries()]
    .map(([sport, bets]) => ({ sport, bets: [...bets].sort(betSort) }))
    .sort((a, b) => sportRank(a.sport) - sportRank(b.sport));
}

export function toGradedRows(bets: BetRow[]): GradedRow[] {
  return bets.map((b) => ({
    sport: b.sport,
    slate_date: b.slate_date,
    market: b.market,
    odds_american: b.odds_american,
    stake_units: b.stake_units,
    model_prob: b.model_prob ?? null,
    result: (b.result ?? null) as ResultValue | null,
    pnl_units: b.pnl_units ?? null,
    clv_pct: b.clv_pct ?? null,
  }));
}

export type Range = "30" | "90" | "365" | "all";

function anchorMinusDays(anchor: string, days: number): string {
  const d = new Date(anchor + "T12:00:00Z");
  d.setUTCDate(d.getUTCDate() - days);
  return d.toISOString().slice(0, 10);
}

export function withinRange(bets: BetRow[], range: Range, anchor: string): BetRow[] {
  if (range === "all") return bets;
  const cutoff = anchorMinusDays(anchor, Number(range));
  return bets.filter((b) => b.slate_date >= cutoff);
}

export interface TrackerData {
  overall: Rollup;
  bySport: { sport: string; roll: Rollup }[];
  curve: BankrollPoint[];
  gradedCount: number;
}

/** Graded-only view for the tracker (pending bets excluded from P&L math).
 *  Anchored to the real calendar day, and filterable by LIVE/PAPER mode. */
export function trackerData(ds: Dataset, range: Range, sport: string | null, mode: TrackerMode = "all"): TrackerData {
  const anchor = appToday();
  let bets = withinRange(ds.bets, range, anchor);
  if (sport) bets = bets.filter((b) => b.sport === sport);
  if (mode !== "all") bets = bets.filter((b) => b.mode === mode);
  const rows = toGradedRows(bets);
  const bySportMap = new Map<string, GradedRow[]>();
  for (const r of rows) (bySportMap.get(r.sport) ?? bySportMap.set(r.sport, []).get(r.sport)!).push(r);
  const bySport = [...bySportMap.entries()]
    .map(([sport, g]) => ({ sport, roll: rollup(g) }))
    .sort((a, b) => b.roll.units_pnl - a.roll.units_pnl);
  return {
    overall: rollup(rows),
    bySport,
    curve: bankrollCurve(rows),
    gradedCount: rows.filter((r) => r.result === "win" || r.result === "loss" || r.result === "push").length,
  };
}

export interface SourceStatus {
  key: string;
  label: string;
  reported: boolean;
  slate?: SlateRow;
  betCount: number;
  daysStale: number | null;
}

export function sourceStatus(ds: Dataset, date: string): SourceStatus[] {
  return Object.values(SOURCES).map((meta) => {
    const slatesForSource = ds.slates.filter((s) => s.source === meta.key).sort((a, b) => (a.slate_date < b.slate_date ? 1 : -1));
    const todays = ds.slates.filter((s) => s.source === meta.key && s.slate_date === date);
    const betCount = ds.bets.filter((b) => b.source === meta.key && b.slate_date === date).length;
    const latest = slatesForSource[0];
    let daysStale: number | null = null;
    if (latest) {
      const diff = (new Date(date + "T12:00:00Z").getTime() - new Date(latest.slate_date + "T12:00:00Z").getTime()) / 86400000;
      daysStale = Math.max(0, Math.round(diff));
    }
    return { key: meta.key, label: meta.label, reported: todays.length > 0, slate: todays[0] ?? latest, betCount, daysStale };
  });
}
