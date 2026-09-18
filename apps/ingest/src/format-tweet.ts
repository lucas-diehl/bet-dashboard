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

/** One pick, one line: "🏈 9/20 New Orleans Saints -3.5 (0.6u)". Totals don't carry a
 *  team in `selection` (it's just "Under 48.5"), so those get the matchup prefixed from
 *  `event` ("Away @ Home" -> "Away / Home") — full team names, since there's no reliable
 *  nickname-shortening table to lean on. */
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
  return `${emoji} ${label}: ${prefix}${body} (${b.stakeUnits}u)`;
}

/** Batched "new picks" tweet, one pick per line, soonest kickoff first. Greedily fits as
 *  many full lines as possible under the 280-char limit, then a "+N more" line — no URL,
 *  so a heavy CFB day (20+ picks) still trims to a handful of lines rather than blowing
 *  the limit or listing everything. */
export function formatPicksTweet(rows: UntweetedBet[]): string | null {
  if (!rows.length) return null;
  const sorted = [...rows].sort((a, b) => {
    const ta = a.eventStart ? a.eventStart.getTime() : Infinity;
    const tb = b.eventStart ? b.eventStart.getTime() : Infinity;
    return ta - tb;
  });
  const header = `🔒 ${rows.length} new pick${rows.length === 1 ? "" : "s"}`;
  const lines = sorted.map(formatPickLine);

  const included: string[] = [];
  for (let i = 0; i < lines.length; i++) {
    const remainingAfterThis = lines.length - (i + 1);
    const trailer = remainingAfterThis > 0 ? [`+${remainingAfterThis} more`] : [];
    const candidate = [header, "", ...included, lines[i], ...trailer].join("\n");
    if (candidate.length > X_LIMIT) {
      const remainingNow = lines.length - included.length;
      const fallback = [header, "", ...included, `+${remainingNow} more`].join("\n");
      return fallback.length <= X_LIMIT ? fallback : header;
    }
    included.push(lines[i]);
  }
  return [header, "", ...included].join("\n");
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

const BIO_DISCLAIMER = "Model-generated paper picks. Not betting advice.";
const BIO_LIMIT = 160;

/** Live all-time record for the account bio, refreshed as results grade. Uses the same
 *  Rollup shape @bet/core's rollup() returns, so this is always the /tracker numbers,
 *  never a second computation that could drift from what the dashboard shows. */
export function formatBio(r: { wins: number; losses: number; pushes: number; units_pnl: number }): string {
  const record = `${r.wins}-${r.losses}${r.pushes ? `-${r.pushes}` : ""}`;
  const sign = r.units_pnl >= 0 ? "+" : "";
  const text = `${BIO_DISCLAIMER} | ${record} (${sign}${r.units_pnl.toFixed(2)}u)`;
  return text.length <= BIO_LIMIT ? text : `${BIO_DISCLAIMER} | ${record}`;
}
