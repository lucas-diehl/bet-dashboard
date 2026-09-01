"use client";
import { useRef, useState } from "react";

interface Point {
  date: string;
  cumulative: number;
  day_pnl: number;
}

const VBW = 720;
const VBH = 240;
const padL = 8;
const padR = 44;
const padT = 14;
const padB = 22;

export function BankrollChart({ points }: { points: Point[] }) {
  const ref = useRef<SVGSVGElement>(null);
  const [hover, setHover] = useState<{ i: number; leftPx: number } | null>(null);

  if (points.length < 2) return <div className="empty">Not enough graded history yet to chart.</div>;

  const values = points.map((p) => p.cumulative);
  const min = Math.min(0, ...values);
  const max = Math.max(0, ...values);
  const span = max - min || 1;
  const n = points.length;
  const step = (VBW - padL - padR) / (n - 1);

  const x = (i: number) => padL + i * step;
  const y = (v: number) => padT + (1 - (v - min) / span) * (VBH - padT - padB);
  const yZero = y(0);

  const linePath = points.map((p, i) => `${i === 0 ? "M" : "L"}${x(i).toFixed(1)},${y(p.cumulative).toFixed(1)}`).join(" ");
  const areaPath = `${linePath} L${x(n - 1).toFixed(1)},${yZero.toFixed(1)} L${x(0).toFixed(1)},${yZero.toFixed(1)} Z`;

  // y-axis ticks (nice-ish): 0, min, max
  const ticks = Array.from(new Set([min, 0, max])).filter((v) => v >= min && v <= max);

  function onMove(e: React.MouseEvent<SVGSVGElement>) {
    const rect = ref.current!.getBoundingClientRect();
    const vbx = ((e.clientX - rect.left) * VBW) / rect.width;
    let i = Math.round((vbx - padL) / step);
    i = Math.max(0, Math.min(n - 1, i));
    setHover({ i, leftPx: (x(i) * rect.width) / VBW });
  }

  const hp = hover ? points[hover.i] : null;
  const end = points[n - 1];

  return (
    <div style={{ position: "relative" }}>
      <svg ref={ref} viewBox={`0 0 ${VBW} ${VBH}`} width="100%" style={{ display: "block", height: "auto" }} onMouseMove={onMove} onMouseLeave={() => setHover(null)}>
        {ticks.map((t, k) => (
          <g key={k}>
            <line className="grid" x1={padL} x2={VBW - padR} y1={y(t)} y2={y(t)} strokeDasharray={t === 0 ? "0" : "3 4"} opacity={t === 0 ? 0.9 : 0.6} />
            <text className="tick" x={VBW - padR + 6} y={y(t) + 3} textAnchor="start">{t > 0 ? "+" : ""}{t.toFixed(0)}u</text>
          </g>
        ))}
        <path className="series-area" d={areaPath} />
        <path className="series-line" d={linePath} />
        <circle className="dot" cx={x(n - 1)} cy={y(end.cumulative)} r="3.5" />
        {hp ? (
          <g>
            <line className="axis" x1={x(hover!.i)} x2={x(hover!.i)} y1={padT} y2={VBH - padB} opacity="0.5" />
            <circle cx={x(hover!.i)} cy={y(hp.cumulative)} r="4.5" fill="var(--accent)" stroke="var(--surface)" strokeWidth="2" />
          </g>
        ) : null}
      </svg>
      {hp ? (
        <div
          style={{
            position: "absolute",
            top: 6,
            left: Math.max(4, Math.min(hover!.leftPx - 60, 999)),
            background: "var(--surface)",
            border: "1px solid var(--border)",
            borderRadius: 9,
            padding: "6px 9px",
            pointerEvents: "none",
            fontSize: 12,
            boxShadow: "0 6px 20px rgba(0,0,0,0.18)",
            whiteSpace: "nowrap",
          }}
        >
          <div className="muted">{new Date(hp.date + "T12:00:00Z").toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" })}</div>
          <div className="tabular" style={{ fontWeight: 700 }}>
            {hp.cumulative > 0 ? "+" : ""}
            {hp.cumulative.toFixed(2)}u
            <span className="muted" style={{ fontWeight: 500 }}> · day {hp.day_pnl > 0 ? "+" : ""}{hp.day_pnl.toFixed(2)}u</span>
          </div>
        </div>
      ) : null}
    </div>
  );
}
