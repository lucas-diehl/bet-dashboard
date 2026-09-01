import type { ResultValue } from "@bet/core";
import type { BetRow, Dataset, Mode, SlateRow } from "./types";

// Deterministic mock dataset: a realistic multi-sport ledger with weeks of graded
// history plus today's live picks, so the dashboard renders fully populated with
// zero cloud setup. Everything is seeded, so re-runs and tests are stable.

const TODAY = "2026-07-22";

function mulberry32(seed: number) {
  return function () {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rng = mulberry32(20260722);
const rand = () => rng();
const pick = <T>(arr: T[]): T => arr[Math.floor(rand() * arr.length)];
const int = (lo: number, hi: number) => lo + Math.floor(rand() * (hi - lo + 1));
const round = (n: number, p = 2) => Math.round(n * 10 ** p) / 10 ** p;

function dateMinus(base: string, days: number): string {
  const d = new Date(base + "T12:00:00Z");
  d.setUTCDate(d.getUTCDate() - days);
  return d.toISOString().slice(0, 10);
}
function tsFor(date: string, hour: number): string {
  return `${date}T${String(hour).padStart(2, "0")}:00:00Z`;
}

const TEAMS = {
  cbb: ["Duke", "North Carolina", "Kansas", "Baylor", "Gonzaga", "Houston", "Purdue", "UConn", "Arizona", "Tennessee", "Marquette", "Auburn"],
  nba: ["Celtics", "Nuggets", "Lakers", "Bucks", "Thunder", "Knicks", "Timberwolves", "Suns", "76ers", "Mavericks"],
  cfb: ["Ohio State", "Georgia", "Texas", "Alabama", "Michigan", "Oregon", "Penn State", "Notre Dame", "LSU", "Ole Miss"],
};
const GOLFERS = ["Scottie Scheffler", "Rory McIlroy", "Patrick Cantlay", "Xander Schauffele", "Collin Morikawa", "Matt Fitzpatrick", "Ludvig Aberg", "Tommy Fleetwood", "Viktor Hovland", "Justin Thomas"];
const WNBA = ["A'ja Wilson", "Caitlin Clark", "Breanna Stewart", "Sabrina Ionescu", "Napheesa Collier", "Alyssa Thomas", "Kelsey Plum", "Nneka Ogwumike", "Rhyne Howard", "Arike Ogunbowale"];
const TENNIS = ["Carlos Alcaraz", "Jannik Sinner", "Novak Djokovic", "Alexander Zverev", "Daniil Medvedev", "Taylor Fritz", "Andrey Rublev", "Casper Ruud"];
const GOLF_EVENTS = ["Rocket Mortgage Classic", "John Deere Classic", "Genesis Scottish Open", "The Open Championship", "3M Open", "Travelers Championship"];

let slateSeq = 0;
let betSeq = 0;

function matchup(sport: keyof typeof TEAMS): { event: string; home: string; away: string } {
  const pool = TEAMS[sport];
  const away = pick(pool);
  let home = pick(pool);
  while (home === away) home = pick(pool);
  return { event: `${away} @ ${home}`, home, away };
}

/** Draw a result consistent with model_prob so calibration looks sane. */
function drawResult(prob: number, allowPush: boolean): ResultValue {
  if (allowPush && rand() < 0.04) return "push";
  return rand() < prob ? "win" : "loss";
}

function americanFor(prob: number): number {
  // Price a touch better than fair so recommended bets carry a small positive edge.
  const p = Math.min(0.97, Math.max(0.03, prob));
  const fairDec = 1 / p;
  const offeredDec = fairDec * (1.02 + rand() * 0.06);
  const a = offeredDec >= 2 ? (offeredDec - 1) * 100 : -100 / (offeredDec - 1);
  return Math.round(a / 5) * 5;
}

function makeBet(slate: SlateRow, partial: Partial<BetRow> & Pick<BetRow, "market" | "selection" | "model_prob">, graded: boolean): BetRow {
  const prob = partial.model_prob ?? null;
  const odds = partial.odds_american ?? (prob != null ? americanFor(prob) : 0);
  const hasOdds = odds !== 0;
  const dec = hasOdds ? (odds > 0 ? odds / 100 + 1 : 100 / -odds + 1) : null;
  const marketProb = dec ? round(1 / dec, 4) : null;
  const id = `b${++betSeq}`;
  const row: BetRow = {
    id,
    slate_id: slate.id,
    bet_id: `${slate.source}-${slate.slate_date}-${id}`,
    source: slate.source,
    sport: slate.sport,
    slate_date: slate.slate_date,
    generated_at: slate.generated_at,
    mode: slate.mode,
    event: partial.event,
    event_start: partial.event_start ?? tsFor(slate.slate_date, int(18, 23)),
    market: partial.market,
    market_label: partial.market_label,
    selection: partial.selection,
    side: partial.side ?? null,
    line: partial.line ?? null,
    odds_american: odds,
    book: partial.book ?? pick(["FanDuel", "DraftKings"]),
    model_prob: prob,
    market_prob: marketProb,
    edge: prob != null && marketProb != null ? round(prob - marketProb, 4) : null,
    ev_pct: prob != null && dec ? round(prob * dec - 1, 3) : null,
    stake_units: partial.stake_units ?? round(0.25 + rand() * 1.75, 2),
    confidence: partial.confidence ?? (prob == null ? undefined : prob > 0.58 ? "high" : prob > 0.53 ? "medium" : "low"),
    tags: partial.tags,
    details: partial.details,
    result: null,
    closing_odds_american: null,
    clv_pct: null,
    pnl_units: null,
    graded_at: null,
    actual: null,
  };
  if (graded && prob != null) {
    const allowPush = row.market === "spread" || row.market === "total" || row.market === "matchup";
    const result = drawResult(prob, allowPush);
    row.result = result;
    // CLV: good models beat the close slightly on average
    const clv = round((rand() - 0.42) * 0.14, 3);
    row.clv_pct = clv;
    row.closing_odds_american = Math.round((odds + (clv < 0 ? 12 : -8)) / 5) * 5;
    row.graded_at = tsFor(dateMinus(slate.slate_date, -1), 6);
  }
  return row;
}

function newSlate(source: string, sport: string, date: string, mode: Mode, ctx?: string, notes?: string): SlateRow {
  return {
    id: `s${++slateSeq}`,
    source,
    sport,
    slate_date: date,
    generated_at: tsFor(date, int(12, 16)),
    model_version: `${sport}-mock`,
    mode,
    event_context: ctx,
    notes,
  };
}

export function buildMockDataset(): Dataset {
  slateSeq = 0;
  betSeq = 0;
  const slates: SlateRow[] = [];
  const bets: BetRow[] = [];

  const addSlate = (s: SlateRow, rows: BetRow[]) => {
    slates.push(s);
    bets.push(...rows);
  };

  // --- PGA (golf-modeling): weekly, PAPER, 10 weeks incl. today (today live) ---
  for (let w = 9; w >= 0; w--) {
    const date = dateMinus(TODAY, w * 7);
    const live = w === 0;
    const ev = pick(GOLF_EVENTS);
    const s = newSlate("golf-modeling", "pga", date, "PAPER", ev, live ? "Paper until mean CLV proves positive." : undefined);
    const rows: BetRow[] = [];
    const nOut = int(2, 3);
    for (let i = 0; i < nOut; i++) {
      const p = round(0.1 + rand() * 0.22, 3);
      rows.push(makeBet(s, { market: rand() < 0.5 ? "outright_win" : "outright_top10", selection: pick(GOLFERS), event: ev, tags: ["outright"], model_prob: p, odds_american: americanFor(p), stake_units: round(0.25 + rand(), 2) }, !live));
    }
    const nMatch = int(1, 2);
    for (let i = 0; i < nMatch; i++) {
      const p = round(0.52 + rand() * 0.1, 3);
      const a = pick(GOLFERS);
      let b = pick(GOLFERS);
      while (b === a) b = pick(GOLFERS);
      rows.push(makeBet(s, { market: "matchup", market_label: "72-Hole Matchup", selection: a, event: ev, tags: ["matchup", "72_hole"], model_prob: p, details: { opponent: b, matchup_type: "72_hole", sg_last_24: round(rand() * 2 - 0.4, 2) } }, !live));
    }
    addSlate(s, rows);
  }

  // --- WNBA DFS (dfs-engine): ~3 slates/week for 5 weeks, LIVE, today live -----
  for (const d of dayOffsets(35, 2, 3)) {
    const date = dateMinus(TODAY, d);
    const live = d === 0;
    const s = newSlate("dfs-engine", "wnba", date, "LIVE", "WNBA main slate");
    const rows: BetRow[] = [];
    const nLineups = int(1, 2);
    for (let i = 0; i < nLineups; i++) {
      const players = Array.from({ length: 6 }, () => ({ name: pick(WNBA), pos: pick(["G", "F", "C"]), salary: int(5, 11) * 1000, proj: round(20 + rand() * 32, 1), own: int(6, 42) }));
      const p = round(0.34 + rand() * 0.14, 3); // "cash rate" proxy
      rows.push(
        makeBet(
          s,
          {
            market: "dfs_lineup",
            market_label: i === 0 ? "DK GPP lineup" : "DK cash lineup",
            selection: `${i === 0 ? "GPP" : "Cash"} Lineup #${i + 1}`,
            event: `WNBA ${i === 0 ? "GPP" : "Cash"} — $${pick([3, 5, 10, 20])}`,
            odds_american: 0,
            model_prob: null,
            stake_units: 1,
            tags: [i === 0 ? "gpp" : "cash", "wnba"],
            details: { entry_fee: pick([3, 5, 10]), salary: 49000 + int(0, 900), proj: round(240 + rand() * 40, 1), avg_own: round(15 + rand() * 12, 1), players },
          },
          !live,
        ),
      );
      // grade DFS by cash proxy since model_prob is null
      if (!live) {
        const won = rand() < p;
        const last = rows[rows.length - 1];
        last.result = won ? "win" : "loss";
        last.pnl_units = won ? round(0.6 + rand() * 3, 2) : -1;
        last.graded_at = tsFor(dateMinus(date, -1), 6);
      }
    }
    addSlate(s, rows);
  }

  // --- Tennis (dfs-engine): moneyline + matchup, 4 weeks, today live ----------
  for (const d of dayOffsets(28, 2, 4)) {
    const date = dateMinus(TODAY, d);
    const live = d === 0;
    const s = newSlate("dfs-engine", "tennis", date, "LIVE", "ATP slate");
    const rows: BetRow[] = [];
    const n = int(2, 4);
    for (let i = 0; i < n; i++) {
      const p = round(0.5 + rand() * 0.14, 3);
      rows.push(makeBet(s, { market: "moneyline", selection: pick(TENNIS), event: `${pick(TENNIS)} vs ${pick(TENNIS)}`, model_prob: p }, !live));
    }
    addSlate(s, rows);
  }

  // --- CBB (bet-screen): season block Jan–Mar 2026, graded, LIVE --------------
  for (const date of enumerateWeekly("2026-01-08", "2026-03-12", 2)) {
    const s = newSlate("bet-screen", "cbb", date, "LIVE", "CBB slate");
    const rows: BetRow[] = [];
    const n = int(2, 4);
    for (let i = 0; i < n; i++) {
      const m = matchup("cbb");
      const market = pick(["spread", "total", "moneyline", "first_half_spread"]);
      const p = round(0.5 + rand() * 0.12, 3);
      rows.push(makeBet(s, { market, selection: market === "total" ? `${pick(["Over", "Under"])} ${int(128, 158)}.5` : m.away, side: market === "total" ? "under" : "away", line: market.includes("spread") ? int(1, 12) + 0.5 : market === "total" ? int(128, 158) + 0.5 : null, event: m.event, model_prob: p }, true));
    }
    addSlate(s, rows);
  }

  // --- NBA (bet-screen): Jan–Apr 2026, graded, LIVE ---------------------------
  for (const date of enumerateWeekly("2026-01-10", "2026-04-05", 3)) {
    const s = newSlate("bet-screen", "nba", date, "LIVE", "NBA slate");
    const rows: BetRow[] = [];
    const n = int(1, 3);
    for (let i = 0; i < n; i++) {
      const m = matchup("nba");
      const market = pick(["spread", "total", "moneyline"]);
      const p = round(0.5 + rand() * 0.1, 3);
      rows.push(makeBet(s, { market, selection: market === "total" ? `${pick(["Over", "Under"])} ${int(210, 240)}.5` : m.away, event: m.event, model_prob: p, line: market === "spread" ? int(1, 10) + 0.5 : null }, true));
    }
    addSlate(s, rows);
  }

  // --- CFB (cfb-modeling): Sep–Dec 2025, weekly, PAPER ------------------------
  for (const date of enumerateWeekly("2025-09-06", "2025-12-06", 7)) {
    const s = newSlate("cfb-modeling", "cfb", date, "PAPER", "Weekly card", "UNDER-only + early-ATS, forward-validating.");
    const rows: BetRow[] = [];
    const n = int(2, 3);
    for (let i = 0; i < n; i++) {
      const m = matchup("cfb");
      const total = pick([true, false, true]); // UNDER-biased, matching the model's edge
      const p = round(0.52 + rand() * 0.1, 3);
      const num = total ? int(44, 60) + 0.5 : int(3, 21) + 0.5;
      rows.push(makeBet(s, {
        market: total ? "total" : "spread",
        selection: total ? `Under ${num}` : m.away, // spread: back the away dog getting points
        side: total ? "under" : "away",
        line: num,
        event: m.event,
        model_prob: p,
        tags: total ? ["UNDER4"] : ["early_ats"],
      }, true));
    }
    addSlate(s, rows);
  }

  return { slates, bets };
}

/** Day-offset list for a sport's history that always includes 0 (today). */
function dayOffsets(maxD: number, minStep: number, maxStep: number): number[] {
  const out = [0];
  let d = minStep + Math.floor(rand() * (maxStep - minStep + 1));
  while (d <= maxD) {
    out.push(d);
    d += minStep + Math.floor(rand() * (maxStep - minStep + 1));
  }
  return out;
}

function enumerateWeekly(start: string, end: string, stepDays: number): string[] {
  const out: string[] = [];
  const d = new Date(start + "T12:00:00Z");
  const stop = new Date(end + "T12:00:00Z");
  while (d <= stop) {
    out.push(d.toISOString().slice(0, 10));
    d.setUTCDate(d.getUTCDate() + stepDays);
  }
  return out;
}

export const MOCK_TODAY = TODAY;
