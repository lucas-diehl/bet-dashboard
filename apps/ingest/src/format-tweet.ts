import type { UntweetedBet, UntweetedResult } from "@bet/db/queries";

const X_LIMIT = 280;

const SPORT_LABEL: Record<string, { emoji: string; label: string }> = {
  cfb: { emoji: "🏈", label: "CFB" },
  ncaaf: { emoji: "🏈", label: "CFB" },
  nfl: { emoji: "🏈", label: "NFL" },
  golf: { emoji: "⛳", label: "PGA" },
  pga: { emoji: "⛳", label: "PGA" },
  tennis: { emoji: "🎾", label: "TEN" },
  wnba: { emoji: "🏀", label: "WNBA" },
};
function sportInfo(sport: string) {
  return SPORT_LABEL[sport] ?? { emoji: "🎯", label: sport.toUpperCase() };
}

function formatEventDate(d: Date | null): string {
  if (!d) return "";
  // kickoff date, ET (matches how the dashboard shows game times elsewhere)
  return new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", month: "numeric", day: "numeric" }).format(d);
}

function groupBySport<T extends { sport: string }>(rows: T[]): Map<string, T[]> {
  const m = new Map<string, T[]>();
  for (const r of rows) {
    const arr = m.get(r.sport) ?? [];
    arr.push(r);
    m.set(r.sport, arr);
  }
  return m;
}

function formatOdds(n: number): string {
  return n > 0 ? `+${n}` : `${n}`;
}

/** One pick, one line: "🏈 NFL: 9/20 New Orleans Saints -3.5 (-110, 0.6u)". Totals don't
 *  carry a team in `selection` (it's just "Under 48.5"), so those get the matchup
 *  prefixed from `event` ("Away @ Home" -> "Away / Home") — full team names, since
 *  there's no reliable nickname-shortening table to lean on. */
function formatPickLine(b: UntweetedBet): string {
  const { emoji, label } = sportInfo(b.sport);
  const date = formatEventDate(b.eventStart);
  const prefix = date ? `${date} ` : "";
  let body: string;
  if (b.market === "total" && b.event) {
    body = `${b.event.replace(" @ ", " / ")} ${b.selection}`;
  } else if (b.market === "spread" && b.line != null) {
    body = `${b.selection} ${b.line > 0 ? "+" : ""}${b.line}`;
  } else {
    body = b.selection;
  }
  return `${emoji} ${label}: ${prefix}${body} (${formatOdds(b.oddsAmerican)}, ${b.stakeUnits}u)`;
}

// Reserve enough room for the biggest realistic header — "🔒 999 new picks (99/99)" —
// so every chunk uses the same budget and the two-pass split below (chunk first, THEN
// number the parts once the total is known) never has a chunk that turns out oversized
// once its real header is attached.
const PICK_HEADER_RESERVE = 40;

/** Every posted pick, as a THREAD — one tweet per line if that's what it takes, no
 *  "+N more" truncation. One pick per line, soonest kickoff first, chunked so each part
 *  stays under 280 chars; parts are numbered ("(2/5)") once there's more than one. This
 *  spends one API call per tweet in the thread, so a heavy week (30+ picks) costs
 *  several credits, not one — see postThread() in x.ts for how the reply chain posts. */
export function formatPicksThread(rows: UntweetedBet[]): string[] {
  if (!rows.length) return [];
  const sorted = [...rows].sort((a, b) => {
    const ta = a.eventStart ? a.eventStart.getTime() : Infinity;
    const tb = b.eventStart ? b.eventStart.getTime() : Infinity;
    return ta - tb;
  });
  const lines = sorted.map(formatPickLine);
  const budget = X_LIMIT - PICK_HEADER_RESERVE;

  const chunks: string[][] = [];
  let current: string[] = [];
  let currentLen = 0;
  for (const line of lines) {
    const added = current.length ? 1 + line.length : line.length; // +1 for the newline join
    if (current.length && currentLen + added > budget) {
      chunks.push(current);
      current = [line];
      currentLen = line.length;
    } else {
      current.push(line);
      currentLen += added;
    }
  }
  if (current.length) chunks.push(current);

  const total = chunks.length;
  return chunks.map((chunkLines, i) => {
    const header =
      total > 1
        ? `🔒 ${rows.length} new picks (${i + 1}/${total})`
        : `🔒 ${rows.length} new pick${rows.length === 1 ? "" : "s"}`;
    return [header, "", ...chunkLines].join("\n");
  });
}

/** Batched results tweet: W-L-push + net units per sport. */
export function formatResultsTweet(rows: UntweetedResult[]): string | null {
  if (!rows.length) return null;
  const groups = groupBySport(rows);
  const header = `📊 ${rows.length} result${rows.length === 1 ? "" : "s"}`;

  const lines = [...groups.entries()].map(([sport, results]) => {
    const { emoji, label } = sportInfo(sport);
    const w = results.filter((r) => r.result === "win").length;
    const l = results.filter((r) => r.result === "loss").length;
    const p = results.filter((r) => r.result === "push").length;
    const units = results.reduce((a, r) => a + (r.pnlUnits ?? 0), 0);
    const record = p > 0 ? `${w}W-${l}L-${p}P` : `${w}W-${l}L`;
    const sign = units >= 0 ? "+" : "";
    return `${emoji} ${label}: ${record} (${sign}${units.toFixed(2)}u)`;
  });

  const text = [header, "", ...lines].join("\n");
  return text.length <= X_LIMIT ? text : header;
}

/** Once-weekly recap across all sports. */
export function formatWeeklyTweet(rows: { sport: string; wins: number; losses: number; pushes: number; pnlUnits: number }[]): string | null {
  if (!rows.length) return null;
  const totalW = rows.reduce((a, r) => a + r.wins, 0);
  const totalL = rows.reduce((a, r) => a + r.losses, 0);
  const totalP = rows.reduce((a, r) => a + r.pushes, 0);
  const totalUnits = rows.reduce((a, r) => a + r.pnlUnits, 0);
  const sign = totalUnits >= 0 ? "+" : "";
  const header = `📅 Week recap: ${totalW}-${totalL}${totalP ? `-${totalP}` : ""}, ${sign}${totalUnits.toFixed(2)}u`;
  const lines = rows.map((r) => {
    const { label } = sportInfo(r.sport);
    return `${label} ${r.wins}-${r.losses}${r.pushes ? `-${r.pushes}` : ""}`;
  });
  const text = [header, lines.join(" · ")].join("\n");
  return text.length <= X_LIMIT ? text : header;
}

const BIO_LIMIT = 160;

export interface BioSportRecord {
  wins: number;
  losses: number;
  pushes: number;
  units_pnl: number;
  roi: number; // fraction, e.g. 0.34 -> "+34%"
}

function sportLine(sport: string, r: BioSportRecord, withRoi: boolean): string {
  const { label } = sportInfo(sport);
  const record = `${r.wins}-${r.losses}${r.pushes ? `-${r.pushes}` : ""}`;
  const uSign = r.units_pnl >= 0 ? "+" : "";
  const units = `${uSign}${r.units_pnl.toFixed(1)}u`;
  if (!withRoi) return `${label} ${record} ${units}`;
  const rSign = r.roi >= 0 ? "+" : "";
  return `${label} ${record} ${units} ${rSign}${Math.round(r.roi * 100)}%`;
}

const BIO_DISCLAIMER = "Paper picks, not advice.";

/** Live per-sport record for the account bio, refreshed as results grade. Built from
 *  @bet/core's rollupBy() output — the SAME numbers /tracker's per-sport table shows, so
 *  the bio never drifts from the dashboard. Only sports with at least one decided (win
 *  or loss) bet are shown, so a sport that's only ever posted pending picks doesn't show
 *  a meaningless "0-0". One sport per line for readability. Falls back in order —
 *  disclaimer w/ ROI, no disclaimer w/ ROI, disclaimer w/o ROI, no disclaimer w/o ROI,
 *  each dropping least-active sports first — until something fits X's 160-char bio
 *  limit. At today's 3-sport scale there's plenty of room for the full version; this
 *  only matters if the roster grows a lot. */
export function formatBio(bySport: Map<string, BioSportRecord>): string {
  const active = [...bySport.entries()]
    .filter(([, r]) => r.wins + r.losses > 0)
    .sort(([, a], [, b]) => b.wins + b.losses - (a.wins + a.losses)); // most-decided first, for the drop-order below

  for (const withRoi of [true, false]) {
    for (let n = active.length; n > 0; n--) {
      const lines = active
        .slice(0, n)
        .sort(([a], [b]) => a.localeCompare(b)) // display order: alphabetical
        .map(([sport, r]) => sportLine(sport, r, withRoi));
      for (const candidate of [[BIO_DISCLAIMER, ...lines].join("\n"), lines.join("\n")]) {
        if (candidate.length <= BIO_LIMIT) return candidate;
      }
    }
  }
  return "";
}
