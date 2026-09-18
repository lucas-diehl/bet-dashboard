import type { UntweetedBet, UntweetedResult } from "@bet/db/queries";

export const DASHBOARD_URL = "https://bet-dashboard-blond.vercel.app";
const X_LIMIT = 280;

const SPORT_LABEL: Record<string, { emoji: string; label: string }> = {
  cfb: { emoji: "🏈", label: "CFB" },
  ncaaf: { emoji: "🏈", label: "CFB" },
  nfl: { emoji: "🏈", label: "NFL" },
  golf: { emoji: "⛳", label: "Golf" },
  pga: { emoji: "⛳", label: "Golf" },
  tennis: { emoji: "🎾", label: "Tennis" },
  wnba: { emoji: "🏀", label: "WNBA" },
};
function sportInfo(sport: string) {
  return SPORT_LABEL[sport] ?? { emoji: "🎯", label: sport.toUpperCase() };
}

function formatSelection(market: string, selection: string, line: number | null): string {
  if (market === "spread" && line != null) return `${selection} ${line > 0 ? "+" : ""}${line}`;
  return selection;
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

/** Batched "new picks" tweet across every sport with a pending pick. Lists individual
 *  picks per sport up to the 280-char budget, then falls back to a count-only line for
 *  that sport (and finally for the whole tweet) if the detailed version won't fit —
 *  free-tier volume stays low either way since this is one tweet per run, not per pick. */
export function formatPicksTweet(rows: UntweetedBet[]): string | null {
  if (!rows.length) return null;
  const groups = groupBySport(rows);
  const header = `🔒 ${rows.length} new pick${rows.length === 1 ? "" : "s"}`;
  const footer = `Full board → ${DASHBOARD_URL}`;

  const lines: string[] = [];
  for (const [sport, picks] of groups) {
    const { emoji, label } = sportInfo(sport);
    const items = picks.map((p) => `${formatSelection(p.market, p.selection, p.line)} (${p.stakeUnits}u)`);
    lines.push(`${emoji} ${label} (${picks.length}): ${items.join(", ")}`);
  }

  const detailed = [header, "", ...lines, "", footer].join("\n");
  if (detailed.length <= X_LIMIT) return detailed;

  // fall back to count-only per sport
  const summaryLines = [...groups.entries()].map(([sport, picks]) => {
    const { emoji, label } = sportInfo(sport);
    return `${emoji} ${label}: ${picks.length}`;
  });
  const summary = [header, "", ...summaryLines, "", footer].join("\n");
  return summary.length <= X_LIMIT ? summary : `${header}\n\n${footer}`;
}

/** Batched results tweet: W-L-push + net units per sport. */
export function formatResultsTweet(rows: UntweetedResult[]): string | null {
  if (!rows.length) return null;
  const groups = groupBySport(rows);
  const header = `📊 ${rows.length} result${rows.length === 1 ? "" : "s"}`;
  const footer = `Full board → ${DASHBOARD_URL}`;

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

  const text = [header, "", ...lines, "", footer].join("\n");
  return text.length <= X_LIMIT ? text : `${header}\n\n${footer}`;
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
  const text = [header, lines.join(" · "), DASHBOARD_URL].join("\n");
  return text.length <= X_LIMIT ? text : `${header}\n${DASHBOARD_URL}`;
}
