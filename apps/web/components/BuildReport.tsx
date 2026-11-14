import type { BuildReportData } from "@/lib/optimizer";

// Engine build diagnostics (dfs-engine spine/R/report_card.R): how the 20-lineup set was
// built, plus alerts. Server component — pure render, no state.
const pct = (x?: number | null) => (x == null || Number.isNaN(x) ? "—" : `${Math.round(x * 100)}%`);
const signedPct = (x?: number | null) => (x == null || Number.isNaN(x) ? "—" : `${x >= 0 ? "+" : ""}${Math.round(x * 100)}%`);
const SHAPE_LABELS: Record<string, string> = {
  naked_qb: "Naked QB",
  qb_plus_1: "QB + 1",
  qb_plus_2: "QB + 2",
  bring_back: "Bring-back",
  rb_own_dst: "RB + own DST",
};

export function BuildReport({
  report,
  alerts,
  provisional,
}: {
  report?: BuildReportData | null;
  alerts?: { lineup: number; built?: string; players_out: string[] }[] | null;
  provisional?: boolean;
}) {
  if (!report && !(alerts && alerts.length) && !provisional) return null;
  const n = report?.lineups ?? 0;
  return (
    <>
      <div className="section-head" style={{ marginTop: 20 }}>
        <span className="chip" />
        <h2>Build Report</h2>
      </div>
      {provisional ? (
        <div className="card" style={{ padding: "8px 12px", borderLeft: "3px solid #f9a825", marginBottom: 8 }}>
          <strong>Provisional build</strong> — built before game day. Projections, ownership and injury news usually move a lot by
          lock; rebuild closer to kickoff.
        </div>
      ) : null}
      {alerts && alerts.length ? (
        <div className="card" style={{ padding: "8px 12px", borderLeft: "3px solid #c62828", marginBottom: 8 }}>
          <strong>Heads up:</strong> {alerts.length} lineup{alerts.length > 1 ? "s" : ""} from the previous build include player(s) no
          longer in the pool:{" "}
          {[...new Set(alerts.flatMap((a) => a.players_out))].join(", ")}.
        </div>
      ) : null}
      {report ? (
        <div className="card" style={{ padding: "10px 12px", fontSize: 13 }}>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 24 }}>
            {report.depth ? (
              <div style={{ minWidth: 200 }}>
                <div style={{ fontWeight: 700, marginBottom: 4 }}>Selection depth</div>
                <div>Pool: {report.depth.pool_size.toLocaleString()} candidates</div>
                <div>Avg rank {report.depth.avg_rank} · median {report.depth.median_rank}</div>
                <div>Worst rank {report.depth.worst_rank} · first skipped #{report.depth.first_skipped}</div>
                {report.depth.direct_solves ? <div>{report.depth.direct_solves} solved directly (caps binding)</div> : null}
              </div>
            ) : null}
            {report.shapes ? (
              <div style={{ minWidth: 160 }}>
                <div style={{ fontWeight: 700, marginBottom: 4 }}>Lineup shapes</div>
                {Object.entries(report.shapes).map(([k, v]) => (
                  <div key={k}>
                    {SHAPE_LABELS[k] ?? k}: {v}/{n}
                  </div>
                ))}
              </div>
            ) : null}
            {report.positions_used ? (
              <div style={{ minWidth: 140 }}>
                <div style={{ fontWeight: 700, marginBottom: 4 }}>Distinct players</div>
                {Object.entries(report.positions_used).map(([k, v]) => (
                  <div key={k}>
                    {k}: {v}
                  </div>
                ))}
              </div>
            ) : null}
            {report.overlap_pairs ? (
              <div style={{ minWidth: 160 }}>
                <div style={{ fontWeight: 700, marginBottom: 4 }}>Lineup pairs sharing N players</div>
                {Object.entries(report.overlap_pairs)
                  .filter(([, v]) => v > 0)
                  .map(([k, v]) => (
                    <div key={k}>
                      {k} shared: {v}
                    </div>
                  ))}
              </div>
            ) : null}
          </div>

          <div style={{ display: "flex", flexWrap: "wrap", gap: 24, marginTop: 12 }}>
            {report.leverage && report.leverage.length ? (
              <div style={{ minWidth: 220 }}>
                <div style={{ fontWeight: 700, marginBottom: 4 }}>Leverage (exposure − ownership)</div>
                {report.leverage.map((r) => (
                  <div key={`l-${r.name}`}>
                    {r.name} <span style={{ color: "var(--pos, #2e7d32)" }}>{signedPct(r.lev)}</span> ({pct(r.exposure)} vs {pct(r.own)})
                  </div>
                ))}
              </div>
            ) : null}
            {report.fades && report.fades.length ? (
              <div style={{ minWidth: 220 }}>
                <div style={{ fontWeight: 700, marginBottom: 4 }}>Fades</div>
                {report.fades.map((r) => (
                  <div key={`f-${r.name}`}>
                    {r.name} <span style={{ color: "var(--neg, #c62828)" }}>{signedPct(r.lev)}</span> ({pct(r.exposure)} vs {pct(r.own)})
                  </div>
                ))}
              </div>
            ) : null}
            {report.vacated_bumps && report.vacated_bumps.length ? (
              <div style={{ minWidth: 220 }}>
                <div style={{ fontWeight: 700, marginBottom: 4 }}>Injury bumps (vacated work)</div>
                {report.vacated_bumps.map((r) => (
                  <div key={`v-${r.name}`}>
                    {r.name} +{r.bump.toFixed(1)} → {r.proj.toFixed(1)}
                    {r.sim_coupled ? " (if starter sits)" : ""}
                  </div>
                ))}
              </div>
            ) : null}
            {report.second_opinion && report.second_opinion.length ? (
              <div style={{ minWidth: 240 }}>
                <div style={{ fontWeight: 700, marginBottom: 4 }}>Big gaps vs a second source</div>
                {report.second_opinion.map((r) => (
                  <div key={`s-${r.name}`} title={r.note ?? undefined}>
                    {r.name}: ours {r.ours.toFixed(1)} / other {r.other == null ? "not projected" : r.other.toFixed(1)}
                  </div>
                ))}
              </div>
            ) : null}
          </div>

          {report.chalk && report.chalk.length ? (
            <div style={{ marginTop: 12 }}>
              <div style={{ fontWeight: 700, marginBottom: 4 }}>Good chalk / bad chalk (most-owned players)</div>
              <div className="chart-scroll">
                <table className="grid-table">
                  <thead>
                    <tr>
                      <th style={{ textAlign: "left" }}>Player</th>
                      <th>Pos</th>
                      <th>Salary</th>
                      <th>Own</th>
                      <th>Proj</th>
                      <th>Pts/$1k</th>
                      <th>2nd source</th>
                      <th>Call</th>
                      <th style={{ textAlign: "left" }}>Why</th>
                    </tr>
                  </thead>
                  <tbody>
                    {report.chalk.map((c) => (
                      <tr key={`c-${c.name}`}>
                        <td style={{ textAlign: "left", fontWeight: 600 }}>{c.name}</td>
                        <td>{c.pos}</td>
                        <td>${c.salary.toLocaleString()}</td>
                        <td>{pct(c.own)}</td>
                        <td>{c.proj.toFixed(1)}</td>
                        <td>{c.value.toFixed(2)}</td>
                        <td>{c.other == null ? "—" : c.other.toFixed(1)}</td>
                        <td style={{ fontWeight: 700, color: c.verdict === "good" ? "var(--pos, #2e7d32)" : c.verdict === "bad" ? "var(--neg, #c62828)" : undefined }}>
                          {c.verdict.toUpperCase()}
                        </td>
                        <td style={{ textAlign: "left" }}>{c.why}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ) : null}

          {report.hidden_gems && report.hidden_gems.length ? (
            <div style={{ marginTop: 12 }}>
              <div style={{ fontWeight: 700, marginBottom: 4 }}>Hidden gems — chalky players, rare combination (informational)</div>
              {report.hidden_gems.map((g, i) => (
                <div key={`g-${i}`} style={{ padding: "2px 0" }}>
                  {g.proj.toFixed(1)} proj · {pct(g.avg_own)} avg own · {Math.round(g.uniqueness_pct * 100)}th pct unique — {g.players.join(", ")}
                </div>
              ))}
            </div>
          ) : null}
        </div>
      ) : null}
    </>
  );
}
