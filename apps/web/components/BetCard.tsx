import { MARKET_LABELS } from "@bet/contract";
import type { BetRow } from "@bet/db/types";
import { cls, fmtOdds, fmtPct, fmtSignedPct, fmtTime, fmtUnits, signClass } from "@/lib/format";
import { appTimeZone } from "@/lib/time";

function marketLabel(b: BetRow): string {
  return b.market_label ?? MARKET_LABELS[b.market] ?? b.market;
}

interface Player {
  name: string;
  pos?: string;
  salary?: number;
  proj?: number;
  own?: number;
}

export function BetCard({ bet }: { bet: BetRow }) {
  const graded = bet.result && bet.result !== "pending";
  const players = (bet.details?.players as Player[] | undefined) ?? undefined;
  const opponent = bet.details?.opponent as string | undefined;

  return (
    <div className={cls("card bet", `s-${bet.sport}`)}>
      <div className="bet-top">
        <div>
          <div className="bet-sel">
            {bet.selection}
            {opponent ? <span className="bet-line muted" style={{ fontWeight: 500 }}> vs {opponent}</span> : null}
            {!opponent && bet.line != null && (bet.market === "spread" || bet.market === "first_half_spread") ? <span className="bet-line"> {bet.line > 0 ? "+" : ""}{bet.line}</span> : null}
          </div>
          {bet.event ? <div className="bet-event">{bet.event}{bet.event_start ? ` · ${fmtTime(bet.event_start, appTimeZone())}` : ""}</div> : null}
        </div>
        <div style={{ display: "flex", gap: 6, alignItems: "center", flex: "none" }}>
          {graded ? <span className={cls("res", bet.result!)}>{bet.result![0].toUpperCase()}</span> : null}
          {graded && bet.pnl_units != null ? <span className={cls("tabular", signClass(bet.pnl_units))} style={{ fontWeight: 700, fontSize: 14 }}>{fmtUnits(bet.pnl_units)}</span> : null}
        </div>
      </div>

      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 9 }}>
        <span className="pill market">{marketLabel(bet)}</span>
        {bet.mode === "PAPER" ? <span className="pill paper" title="Paper play — tracked, not staked">PAPER</span> : null}
        {bet.book ? <span className={cls("pill book", bet.book === "FanDuel" && "bk-fanduel", bet.book === "DraftKings" && "bk-draftkings", bet.book === "bet365" && "bk-bet365")}>{bet.book}</span> : null}
        {bet.confidence ? <span className={cls("pill", `conf-${bet.confidence}`)}>{bet.confidence}</span> : null}
        {bet.tags?.includes("gpp") ? <span className="pill book">GPP</span> : null}
      </div>

      <div className="bet-meta">
        {bet.odds_american !== 0 ? (
          <div className="kv"><span className="k">Odds</span><span className="v">{fmtOdds(bet.odds_american)}</span></div>
        ) : null}
        {bet.model_prob != null ? (
          <div className="kv"><span className="k">Model</span><span className="v">{fmtPct(bet.model_prob)}</span></div>
        ) : null}
        {bet.edge != null ? (
          <div className="kv"><span className="k">Edge</span><span className={cls("v", signClass(bet.edge))}>{fmtSignedPct(bet.edge)}</span></div>
        ) : null}
        {bet.ev_pct != null ? (
          <div className="kv"><span className="k">EV</span><span className={cls("v", signClass(bet.ev_pct))}>{fmtSignedPct(bet.ev_pct, 0)}</span></div>
        ) : null}
        <div className="kv"><span className="k">Stake</span><span className="v">{bet.stake_units.toFixed(2)}u</span></div>
        {graded && bet.clv_pct != null ? (
          <div className="kv"><span className="k">CLV</span><span className={cls("v", signClass(bet.clv_pct))}>{fmtSignedPct(bet.clv_pct)}</span></div>
        ) : null}
      </div>

      {players ? (
        <div style={{ marginTop: 10 }}>
          {bet.details?.proj != null ? (
            <div className="muted" style={{ fontSize: 12.5, marginBottom: 4 }}>
              Proj {String(bet.details.proj)} · Salary {Number(bet.details.salary ?? 0).toLocaleString()} · Own {String(bet.details.avg_own ?? "—")}%
            </div>
          ) : null}
          {players.map((p, i) => (
            <div className="player-row" key={i}>
              <span>{p.pos ? <span className="muted">{p.pos} </span> : null}{p.name}</span>
              <span className="tabular muted">{p.salary ? `$${p.salary.toLocaleString()}` : ""} {p.proj != null ? `· ${p.proj}` : ""} {p.own != null ? `· ${p.own}%` : ""}</span>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}
