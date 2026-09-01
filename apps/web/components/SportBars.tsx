import { sportMeta } from "@bet/contract";
import type { Rollup } from "@bet/core";
import { cls, fmtUnits } from "@/lib/format";

// Diverging bars: length encodes net units P&L, color encodes sign. Sport identity
// is the axis label (+ chip). Every bar is direct-labeled, so color is never the
// sole channel. Zero pinned to center.
export function SportBars({ bySport }: { bySport: { sport: string; roll: Rollup }[] }) {
  const rows = bySport.filter((s) => s.roll.graded > 0);
  if (rows.length === 0) return <div className="empty">No graded bets in range.</div>;
  const maxAbs = Math.max(...rows.map((s) => Math.abs(s.roll.units_pnl)), 1);

  return (
    <div>
      {rows.map(({ sport, roll }) => {
        const meta = sportMeta(sport);
        const pos = roll.units_pnl >= 0;
        const w = (Math.abs(roll.units_pnl) / maxAbs) * 50;
        const title = `${roll.wins}-${roll.losses}${roll.pushes ? `-${roll.pushes}` : ""} · ROI ${(roll.roi * 100).toFixed(1)}%`;
        return (
          <div className={cls("barrow", `s-${sport}`)} key={sport} title={title}>
            <div className="name"><span className="chip" />{meta.label}</div>
            <div className="bartrack">
              <div className="barzero" style={{ left: "50%" }} />
              <div className={cls("barfill", pos ? "pos" : "neg")} style={pos ? { left: "50%", width: `${w}%` } : { left: `${50 - w}%`, width: `${w}%` }} />
            </div>
            <div className={cls("val", pos ? "pos" : "neg")}>{fmtUnits(roll.units_pnl)}</div>
          </div>
        );
      })}
    </div>
  );
}
