"use client";
import { useMemo, useState } from "react";
import { generateLineups, type Pool, type OptResult } from "@/lib/optimizer";
import { cls } from "@/lib/format";

// Interactive DFS lineup optimizer. Runs entirely in the browser off the DFS-ENGINE
// pool; a fresh random seed each "Generate" varies the lineups so no two runs match.
// No P&L / ROI / $ figures — this is a build tool, not a tracker.
export function Optimizer({ pool }: { pool: Pool }) {
  const rosterN = pool.roster.n ?? pool.cands[0]?.length ?? 6;
  const [nLineups, setNLineups] = useState(20);
  const [contest, setContest] = useState<"gpp" | "cash">("gpp");
  const [maxExposure, setMaxExposure] = useState(0.4);
  const [locks, setLocks] = useState<Set<number>>(new Set());
  const [excludes, setExcludes] = useState<Set<number>>(new Set());
  const [result, setResult] = useState<OptResult | null>(null);
  const [busy, setBusy] = useState(false);

  const players = useMemo(() => pool.players.map((p, i) => ({ ...p, i })).sort((a, b) => b.proj - a.proj), [pool]);
  const individual = pool.sport === "golf" || pool.sport === "tennis";
  const expoOf = (i: number) => result?.exposure.find((e) => e.idx === i)?.pct ?? 0;

  function toggle(set: Set<number>, i: number, other: Set<number>, setThis: (s: Set<number>) => void, setOther: (s: Set<number>) => void) {
    const next = new Set(set);
    if (next.has(i)) next.delete(i);
    else { next.add(i); if (other.has(i)) { const o = new Set(other); o.delete(i); setOther(o); } }
    setThis(next);
  }

  function generate() {
    setBusy(true);
    // fresh seed each click → different diversified set every run
    const r = generateLineups(pool, {
      nLineups, contest, maxExposure, locks: [...locks], excludes: [...excludes],
      seed: (Math.random() * 2 ** 32) >>> 0,
    });
    setResult(r);
    setBusy(false);
  }

  return (
    <div className="section">
      {/* ---- controls ---- */}
      <div className="card" style={{ padding: 14, display: "flex", flexWrap: "wrap", gap: 16, alignItems: "flex-end" }}>
        <div>
          <label className="subhead" style={{ margin: 0 }}>Contest</label>
          <div className="seg" style={{ marginTop: 4 }}>
            <button className={cls(contest === "gpp" && "on")} onClick={() => setContest("gpp")}>GPP</button>
            <button className={cls(contest === "cash" && "on")} onClick={() => setContest("cash")}>Cash</button>
          </div>
        </div>
        <div>
          <label className="subhead" style={{ margin: 0 }}>Lineups</label>
          <input type="number" min={1} max={150} value={nLineups} onChange={(e) => setNLineups(Math.max(1, Math.min(150, +e.target.value || 1)))}
            style={{ display: "block", marginTop: 4, width: 72, height: 34, borderRadius: 8, border: "1px solid var(--border)", background: "var(--surface-2)", color: "var(--text)", padding: "0 10px", fontSize: 14 }} />
        </div>
        <div>
          <label className="subhead" style={{ margin: 0 }}>Max exposure {Math.round(maxExposure * 100)}%</label>
          <input type="range" min={5} max={100} step={5} value={maxExposure * 100} onChange={(e) => setMaxExposure(+e.target.value / 100)}
            style={{ display: "block", marginTop: 8, width: 160 }} />
        </div>
        <div style={{ flex: 1 }} />
        <button className={cls("iconbtn", busy && "busy")} onClick={generate} disabled={busy}
          style={{ height: 40, padding: "0 20px", background: "var(--accent)", color: "#fff", borderColor: "transparent", fontWeight: 700 }}>
          {busy ? "…" : "⚡ Generate lineups"}
        </button>
      </div>

      {(locks.size > 0 || excludes.size > 0) && (
        <div className="updated" style={{ marginTop: 8 }}>
          {locks.size > 0 ? `${locks.size} locked` : ""}{locks.size > 0 && excludes.size > 0 ? " · " : ""}{excludes.size > 0 ? `${excludes.size} excluded` : ""}
          {result && ` · ${result.eligible.toLocaleString()} eligible lineups`}
        </div>
      )}

      {/* ---- player pool ---- */}
      <div className="subhead" style={{ marginTop: 16 }}>Player pool</div>
      <div className="card" style={{ padding: "4px 12px" }}>
        <div className="chart-scroll">
          <table className="grid-table">
            <thead>
              <tr>
                <th>Player</th>
                {!individual ? <th>Team</th> : null}
                {!individual ? <th>Pos</th> : null}
                <th>Salary</th>
                <th>Proj</th>
                <th>Own%</th>
                <th className="hl">Exp%</th>
                <th>Lock</th>
                <th>Excl</th>
              </tr>
            </thead>
            <tbody>
              {players.map((p) => (
                <tr key={p.i}>
                  <td style={{ textAlign: "left", fontWeight: 600 }}>{p.name}</td>
                  {!individual ? <td>{p.team ?? ""}</td> : null}
                  {!individual ? <td>{p.pos ?? ""}</td> : null}
                  <td>${p.salary.toLocaleString()}</td>
                  <td>{p.proj.toFixed(1)}</td>
                  <td>{p.own != null ? `${Math.round(p.own * 100)}%` : "—"}</td>
                  <td className="hl">
                    <div className="barrow" style={{ minWidth: 60 }}>
                      <div className="bartrack"><div className="barfill pos" style={{ width: `${Math.round(expoOf(p.i) * 100)}%` }} /></div>
                      <span className="tabular">{result ? `${Math.round(expoOf(p.i) * 100)}%` : "—"}</span>
                    </div>
                  </td>
                  <td>
                    <button className={cls("pill", locks.has(p.i) && "live")} style={{ cursor: "pointer" }}
                      onClick={() => toggle(locks, p.i, excludes, setLocks, setExcludes)}>{locks.has(p.i) ? "✓" : "+"}</button>
                  </td>
                  <td>
                    <button className={cls("pill", excludes.has(p.i) && "paper")} style={{ cursor: "pointer" }}
                      onClick={() => toggle(excludes, p.i, locks, setExcludes, setLocks)}>{excludes.has(p.i) ? "✕" : "–"}</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* ---- generated lineups ---- */}
      {result && (
        <>
          <div className="subhead" style={{ marginTop: 16 }}>{result.lineups.length} lineups</div>
          {result.lineups.length === 0 ? (
            <div className="empty">No lineups fit those constraints — loosen locks/excludes or raise max exposure.</div>
          ) : (
            <div className="card" style={{ padding: "4px 12px" }}>
              <div className="chart-scroll">
                <table className="grid-table">
                  <thead>
                    <tr>
                      <th>#</th>
                      <th style={{ textAlign: "left" }}>Lineup</th>
                      <th>Salary</th>
                      <th>Proj</th>
                      <th>Ceiling</th>
                      <th className="hl">Win%</th>
                      <th>Own</th>
                    </tr>
                  </thead>
                  <tbody>
                    {result.lineups.map((l, i) => (
                      <tr key={i}>
                        <td>{i + 1}</td>
                        <td style={{ textAlign: "left" }}>{l.players.map((p) => pool.players[p]?.name).join(", ")}</td>
                        <td>${l.salary.toLocaleString()}</td>
                        <td>{l.proj.toFixed(1)}</td>
                        <td>{l.ceiling.toFixed(1)}</td>
                        <td className="hl">{l.win.toFixed(2)}%</td>
                        <td>{Math.round(l.own * (rosterN || 1) * 100) / 100}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
          <div className="updated" style={{ marginTop: 8 }}>Each Generate reseeds — run again for a different set. Win% is P(1st) over the engine's 50k-sim field.</div>
        </>
      )}
    </div>
  );
}
