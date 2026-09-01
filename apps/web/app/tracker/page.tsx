import Link from "next/link";
import { SPORTS, sportMeta, MARKET_LABELS } from "@bet/contract";
import { settlePnlUnits } from "@bet/core";
import { loadDataset } from "@/lib/data";
import { trackerData, sportRank, withinRange, type Range } from "@/lib/select";
import { appToday } from "@/lib/time";
import { StatTile } from "@/components/StatTile";
import { BankrollChart } from "@/components/BankrollChart";
import { SportBars } from "@/components/SportBars";
import { cls, fmtPct, fmtSignedPct, fmtUnits, fmtOdds, fmtDate, signClass } from "@/lib/format";

const RESULT_META: Record<string, { text: string; tone: string }> = {
  win: { text: "Won", tone: "pos" },
  loss: { text: "Lost", tone: "neg" },
  push: { text: "Push", tone: "" },
  void: { text: "Void", tone: "" },
  pending: { text: "Pending", tone: "" },
};

function selectionLabel(b: { selection: string; line?: number | null; details?: Record<string, unknown> }): string {
  const opp = (b.details?.opponent as string) ?? "";
  if (opp) return `${b.selection} vs ${opp}`;
  if (b.line != null) return `${b.selection} ${b.line > 0 ? "+" : ""}${b.line}`;
  return b.selection;
}

export const dynamic = "force-dynamic";

const RANGES: { k: Range; label: string }[] = [
  { k: "30", label: "30d" },
  { k: "90", label: "90d" },
  { k: "365", label: "1y" },
  { k: "all", label: "All" },
];

export default async function TrackerPage({ searchParams }: { searchParams: Promise<{ range?: string; sport?: string }> }) {
  const sp = await searchParams;
  const range = (["30", "90", "365", "all"].includes(sp.range ?? "") ? sp.range : "all") as Range;
  const sport = sp.sport && SPORTS[sp.sport] ? sp.sport : null;

  const ds = await loadDataset();
  const t = trackerData(ds, range, sport);
  const o = t.overall;
  const availableSports = [...new Set(ds.bets.map((b) => b.sport))].sort((a, b) => sportRank(a) - sportRank(b));

  // Per-bet ledger, respecting the active range + sport filters, most recent first.
  const anchor = appToday();
  const logBets = withinRange(ds.bets, range, anchor)
    .filter((b) => !sport || b.sport === sport)
    .sort((a, b) => (a.slate_date !== b.slate_date ? (a.slate_date < b.slate_date ? 1 : -1) : (b.ev_pct ?? -1) - (a.ev_pct ?? -1)));

  const href = (r: Range, s: string | null) => `/tracker?range=${r}${s ? `&sport=${s}` : ""}`;

  return (
    <>
      <div style={{ paddingTop: 18 }}>
        <h1 style={{ fontSize: 22 }}>Tracker</h1>
        <div className="updated">Accuracy &amp; P/L across your models · {t.gradedCount} graded bets</div>
      </div>

      <div className="filters" style={{ marginTop: 12 }}>
        <div className="seg">
          {RANGES.map((r) => (
            <Link key={r.k} href={href(r.k, sport)} className={cls(range === r.k && "on")}>{r.label}</Link>
          ))}
        </div>
        <div className="seg">
          <Link href={href(range, null)} className={cls(!sport && "on")}>All sports</Link>
          {availableSports.map((s) => (
            <Link key={s} href={href(range, s)} className={cls(sport === s && "on")}>{sportMeta(s).label}</Link>
          ))}
        </div>
      </div>

      <div className="tiles" style={{ marginTop: 14 }}>
        <StatTile label="Net Units" value={fmtUnits(o.units_pnl)} tone={signClass(o.units_pnl) as "pos" | "neg" | ""} sub={`${o.units_staked.toFixed(1)}u staked`} />
        <StatTile label="ROI" value={fmtSignedPct(o.roi, 1)} tone={signClass(o.roi) as "pos" | "neg" | ""} sub="return on stake" />
        <StatTile label="Record" value={`${o.wins}-${o.losses}${o.pushes ? `-${o.pushes}` : ""}`} sub={`${o.pending} pending`} />
        <StatTile label="Win Rate" value={fmtPct(o.win_pct)} sub={o.clv_avg != null ? `CLV ${fmtSignedPct(o.clv_avg)}` : "—"} />
      </div>

      <div className="section">
        <div className="chart-card">
          <div className="chart-title">Bankroll (cumulative units)</div>
          <div className="chart-sub">{sport ? sportMeta(sport).full : "All sports"} · {range === "all" ? "full history" : `last ${range} days`}</div>
          <BankrollChart points={t.curve} />
        </div>
      </div>

      <div className="section">
        <div className="chart-card">
          <div className="chart-title">Net units by sport</div>
          <div className="chart-sub">Green = profit, red = loss. Hover a row for record &amp; ROI.</div>
          <SportBars bySport={t.bySport} />
        </div>
      </div>

      <div className="section">
        <div className="subhead">By sport</div>
        <div className="card" style={{ padding: "4px 12px" }}>
          <div className="chart-scroll">
            <table className="grid-table">
              <thead>
                <tr>
                  <th>Sport</th>
                  <th>Bets</th>
                  <th>Record</th>
                  <th>Win%</th>
                  <th>Units</th>
                  <th>ROI</th>
                  <th>CLV</th>
                </tr>
              </thead>
              <tbody>
                {t.bySport.filter((s) => s.roll.graded > 0).map(({ sport: s, roll }) => (
                  <tr key={s} className={`s-${s}`}>
                    <td><span className="name"><span className="chip" />{sportMeta(s).label}</span></td>
                    <td>{roll.bets}</td>
                    <td>{roll.wins}-{roll.losses}{roll.pushes ? `-${roll.pushes}` : ""}</td>
                    <td>{fmtPct(roll.win_pct)}</td>
                    <td className={signClass(roll.units_pnl)}>{fmtUnits(roll.units_pnl)}</td>
                    <td className={signClass(roll.roi)}>{fmtSignedPct(roll.roi, 1)}</td>
                    <td className={signClass(roll.clv_avg)}>{roll.clv_avg != null ? fmtSignedPct(roll.clv_avg) : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <div className="section">
        <div className="subhead">Bet log · {logBets.length} bets</div>
        {logBets.length === 0 ? (
          <div className="empty">No bets in this range.</div>
        ) : (
          <div className="card" style={{ padding: "4px 12px" }}>
            <div className="chart-scroll">
              <table className="grid-table">
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Sport</th>
                    <th>Market</th>
                    <th style={{ textAlign: "left" }}>Selection</th>
                    <th>Odds</th>
                    <th>Stake</th>
                    <th>Result</th>
                    <th>P/L</th>
                  </tr>
                </thead>
                <tbody>
                  {logBets.map((b) => {
                    const res = b.result ?? "pending";
                    const rm = RESULT_META[res] ?? RESULT_META.pending;
                    const graded = res !== "pending";
                    const pnl = graded
                      ? settlePnlUnits({ result: res, odds_american: b.odds_american, stake_units: b.stake_units, pnl_units: b.pnl_units ?? null })
                      : null;
                    return (
                      <tr key={b.id} className={`s-${b.sport}`}>
                        <td>{fmtDate(b.slate_date)}</td>
                        <td><span className="name"><span className="chip" />{sportMeta(b.sport).label}</span></td>
                        <td>{b.market_label ?? MARKET_LABELS[b.market] ?? b.market}</td>
                        <td style={{ textAlign: "left", fontWeight: 600 }}>{selectionLabel(b)}</td>
                        <td>{fmtOdds(b.odds_american)}</td>
                        <td>{b.stake_units.toFixed(2)}u</td>
                        <td className={rm.tone}>{rm.text}</td>
                        <td className={graded ? signClass(pnl) : ""}>{graded ? fmtUnits(pnl) : "—"}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </>
  );
}
