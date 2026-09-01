import { profitUnitsOnWin, round2 } from "./odds";

export type ResultValue = "win" | "loss" | "push" | "void" | "pending";

/** The minimal shape metrics need — a bet joined to its grade (if any). */
export interface GradedRow {
  sport: string;
  slate_date: string;
  market: string;
  odds_american: number;
  stake_units: number;
  model_prob?: number | null;
  result?: ResultValue | null;
  pnl_units?: number | null;
  clv_pct?: number | null;
}

export interface Rollup {
  bets: number;
  graded: number;
  wins: number;
  losses: number;
  pushes: number;
  pending: number;
  units_staked: number;
  units_pnl: number;
  roi: number; // pnl / staked, over decided (win|loss) bets
  win_pct: number; // wins / (wins+losses)
  clv_avg: number | null;
  clv_beat_pct: number | null;
}

/**
 * Realized P&L in units for one row. Trusts a model-provided pnl_units when
 * present; otherwise derives it from result + odds + stake.
 */
export function settlePnlUnits(row: Pick<GradedRow, "result" | "odds_american" | "stake_units" | "pnl_units">): number {
  if (row.pnl_units != null) return row.pnl_units;
  switch (row.result) {
    case "win":
      return round2(profitUnitsOnWin(row.odds_american, row.stake_units));
    case "loss":
      return -row.stake_units;
    case "push":
    case "void":
      return 0;
    default:
      return 0; // pending / ungraded
  }
}

export function rollup(rows: GradedRow[]): Rollup {
  let wins = 0,
    losses = 0,
    pushes = 0,
    pending = 0,
    staked = 0,
    pnl = 0,
    clvSum = 0,
    clvN = 0,
    clvBeat = 0;

  for (const row of rows) {
    const r = row.result ?? "pending";
    if (r === "win") wins++;
    else if (r === "loss") losses++;
    else if (r === "push" || r === "void") pushes++;
    else pending++;

    // Action bets (decided) count toward staked + pnl. Pushes/voids return the
    // stake with no action, so they don't move ROI.
    if (r === "win" || r === "loss") {
      staked += row.stake_units;
      pnl += settlePnlUnits(row);
    }
    if (row.clv_pct != null) {
      clvSum += row.clv_pct;
      clvN++;
      if (row.clv_pct > 0) clvBeat++;
    }
  }

  const decided = wins + losses;
  return {
    bets: rows.length,
    graded: wins + losses + pushes,
    wins,
    losses,
    pushes,
    pending,
    units_staked: round2(staked),
    units_pnl: round2(pnl),
    roi: staked > 0 ? pnl / staked : 0,
    win_pct: decided > 0 ? wins / decided : 0,
    clv_avg: clvN > 0 ? clvSum / clvN : null,
    clv_beat_pct: clvN > 0 ? clvBeat / clvN : null,
  };
}

/** Group rows by a key and roll each group up. */
export function rollupBy<K extends keyof GradedRow>(rows: GradedRow[], key: K): Map<string, Rollup> {
  const groups = new Map<string, GradedRow[]>();
  for (const row of rows) {
    const k = String(row[key]);
    (groups.get(k) ?? groups.set(k, []).get(k)!).push(row);
  }
  const out = new Map<string, Rollup>();
  for (const [k, g] of groups) out.set(k, rollup(g));
  return out;
}

export interface BankrollPoint {
  date: string;
  day_pnl: number;
  cumulative: number;
}

/** Cumulative units P&L over time (decided bets only), one point per date. */
export function bankrollCurve(rows: GradedRow[], startUnits = 0): BankrollPoint[] {
  const byDate = new Map<string, number>();
  for (const row of rows) {
    if (row.result === "win" || row.result === "loss") {
      byDate.set(row.slate_date, (byDate.get(row.slate_date) ?? 0) + settlePnlUnits(row));
    }
  }
  const dates = [...byDate.keys()].sort();
  let cum = startUnits;
  return dates.map((date) => {
    const day = round2(byDate.get(date)!);
    cum = round2(cum + day);
    return { date, day_pnl: day, cumulative: cum };
  });
}
