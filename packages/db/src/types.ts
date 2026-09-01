import type { ResultValue } from "@bet/core";

export type Mode = "LIVE" | "PAPER";

export interface SlateRow {
  id: string;
  source: string;
  sport: string;
  slate_date: string;
  generated_at: string;
  model_version?: string;
  mode: Mode;
  event_context?: string;
  notes?: string;
}

/** A bet joined with its grade (grade fields null until settled). This is the
 *  shape the UI consumes; the real Supabase provider produces it by joining the
 *  `bets` and `results` tables. */
export interface BetRow {
  id: string;
  slate_id: string;
  bet_id: string;
  source: string;
  sport: string;
  slate_date: string;
  generated_at: string;
  mode: Mode;
  event?: string;
  event_start?: string | null;
  market: string;
  market_label?: string;
  selection: string;
  side?: string | null;
  line?: number | null;
  odds_american: number;
  book?: string;
  model_prob?: number | null;
  market_prob?: number | null;
  edge?: number | null;
  ev_pct?: number | null;
  stake_units: number;
  confidence?: string;
  tier?: number | string;
  tags?: string[];
  details?: Record<string, unknown>;
  // grade
  result?: ResultValue | null;
  closing_odds_american?: number | null;
  clv_pct?: number | null;
  pnl_units?: number | null;
  graded_at?: string | null;
  actual?: Record<string, unknown> | null;
}

export interface Dataset {
  slates: SlateRow[];
  bets: BetRow[];
}
