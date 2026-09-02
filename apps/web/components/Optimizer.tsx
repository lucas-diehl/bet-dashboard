"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import { generateLineups, type Pool, type OptResult, type ContestType } from "@/lib/optimizer";
import { cls } from "@/lib/format";

// Interactive DFS lineup optimizer over the DFS-ENGINE pool. A fresh random seed each
// build varies the lineups so no two runs/users match. No P&L / ROI / $ is surfaced —
// this is a build tool, not a tracker. SaberSim/Stokastic-style contest presets pick the
// objective (floor vs balanced vs ceiling), lineup count, and exposure for you.
const PRESETS: Record<ContestType, { label: string; sub: string; n: number; expo: number }> = {
  cash: { label: "Cash", sub: "Double-ups · highest floor", n: 5, expo: 1.0 },
  single: { label: "Single GPP", sub: "One-entry tourney · balanced", n: 1, expo: 1.0 },
  gpp20: { label: "20-Max GPP", sub: "20 diversified lineups", n: 20, expo: 0.5 },
  large: { label: "Large GPP", sub: "Mass-entry · ceiling + leverage", n: 60, expo: 0.3 },
};
const ORDER: ContestType[] = ["cash", "single", "gpp20", "large"];

export function Optimizer({ pool }: { pool: Pool }) {
  const rosterN = pool.roster.n ?? pool.cands[0]?.length ?? 6;
  const [contest, setContest] = useState<ContestType>("gpp20");
  const [nLineups, setNLineups] = useState(PRESETS.gpp20.n);
  const [maxExposure, setMaxExposure] = useState(PRESETS.gpp20.expo);
  const [locks, setLocks] = useState<Set<number>>(new Set());
  const [excludes, setExcludes] = useState<Set<number>>(new Set());
  const [result, setResult] = useState<OptResult | null>(null);

  const players = useMemo(() => pool.players.map((p, i) => ({ ...p, i })).sort((a, b) => b.proj - a.proj), [pool]);
  const individual = pool.sport === "golf" || pool.sport === "tennis";
  const expoOf = (i: number) => result?.exposure.find((e) => e.idx === i)?.pct ?? 0;

  const build = useCallback(
    (c: ContestType, n: number, expo: number, lk: Set<number>, ex: Set<number>) => {
      setResult(
        generateLineups(pool, {
          nLineups: n, contest: c, maxExposure: expo, locks: [...lk], excludes: [...ex],
          seed: (Math.random() * 2 ** 32) >>> 0, // fresh seed → different set every build
        }),
      );
    },
    [pool],
  );

  // Build once on load (and whenever the slate changes) so lineups are there immediately.
  useEffect(() => {
    setContest("gpp20"); setNLineups(PRESETS.gpp20.n); setMaxExposure(PRESETS.gpp20.expo);
    setLocks(new Set()); setExcludes(new Set());
    build("gpp20", PRESETS.gpp20.n, PRESETS.gpp20.expo, new Set(), new Set());
  }, [pool, build]);

  function pickContest(c: ContestType) {
    const p = PRESETS[c];
    setContest(c); setNLineups(p.n); setMaxExposure(p.expo);
    build(c, p.n, p.expo, locks, excludes); // apply immediately so the choice is visible
  }
  function regenerate() {
    build(contest, nLineups, maxExposure, locks, excludes);
  }
  // Lock/exclude toggles rebuild live (SaberSim-style).
  function toggle(which: "lock" | "excl", i: number) {
    const cur = which === "lock" ? locks : excludes;
    const other = which === "lock" ? excludes : locks;
    const next = new Set(cur);
    const nextOther = new Set(other);
    if (next.has(i)) next.delete(i);
    else { next.add(i); nextOther.delete(i); }
    const lk = which === "lock" ? next : nextOther;
    const ex = which === "lock" ? nextOther : next;
    setLocks(lk); setExcludes(ex);
    build(contest, nLineups, maxExposure, lk, ex);
  }

  return (
    <div className="section">
      {/* ---- contest presets ---- */}
      <div className="opt-contests">
        {ORDER.map((c) => (
          <button key={c} className={cls("opt-contest", contest === c && "on")} onClick={() => pickContest(c)}>
            <span className="opt-contest-label">{PRESETS[c].label}</span>
            <span className="opt-contest-sub">{PRESETS[c].sub}</span>
          </button>
        ))}
      </div>

      {/* ---- fine controls ---- */}
      <div className="card" style={{ padding: 14, display: "flex", flexWrap: "wrap", gap: 16, alignItems: "flex-end", marginTop: 10 }}>
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
        <button className="iconbtn" onClick={regenerate}
          style={{ height: 40, padding: "0 20px", background: "var(--accent)", color: "#fff", borderColor: "transparent", fontWeight: 700 }}>
          ⚡ Build lineups
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
                      onClick={() => toggle("lock", p.i)}>{locks.has(p.i) ? "✓" : "+"}</button>
                  </td>
                  <td>
                    <button className={cls("pill", excludes.has(p.i) && "paper")} style={{ cursor: "pointer" }}
                      onClick={() => toggle("excl", p.i)}>{excludes.has(p.i) ? "✕" : "–"}</button>
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
          <div className="subhead" style={{ marginTop: 16 }}>{result.lineups.length} {PRESETS[contest].label} lineup{result.lineups.length === 1 ? "" : "s"}</div>
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
          <div className="updated" style={{ marginTop: 8 }}>
            {contest === "cash" ? "Ranked by floor / double-up EV." : contest === "large" ? "Ranked by ceiling (P[1st]) with max uniqueness + leverage." : "Ranked by tournament ROI over the engine's 50k-sim field."}
            {" "}Each build reseeds — hit Build again for a different set.
          </div>
        </>
      )}
    </div>
  );
}
