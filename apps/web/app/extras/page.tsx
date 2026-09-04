import { loadElo } from "@/lib/elo";
import { loadBoard } from "@/lib/board";
import { fmtDate } from "@/lib/format";

export const dynamic = "force-dynamic";

function kickoff(iso?: string | null): string {
  if (!iso) return "TBD";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "TBD";
  return d.toLocaleString("en-US", { timeZone: "America/New_York", weekday: "short", hour: "numeric", minute: "2-digit" });
}

// Home spread shown from the favorite's side, e.g. "Alabama -28.5" / "Pk".
function spreadLabel(g: { spread?: number | null; home_team: string; away_team: string }): string {
  const s = g.spread;
  if (s == null) return "—";
  if (s === 0) return "Pk";
  return s < 0 ? `${g.home_team} ${s}` : `${g.away_team} -${s}`;
}

const confClass = (c?: string | null) => (c === "high" ? "pos" : c === "medium" ? "" : "");

// The Extras tab: reference views that aren't bets. CFB model board first, then golf Elo.
export default async function ExtrasPage() {
  const [boards, eloFiles] = await Promise.all([loadBoard(), loadElo()]);

  // pick the nearest upcoming CFB slate (else the most recent one)
  const todayET = new Date().toLocaleDateString("en-CA", { timeZone: "America/New_York" });
  const cfb = [...boards].filter((b) => b.sport === "cfb").sort((a, b) => (a.slate_date < b.slate_date ? -1 : 1));
  const board = cfb.find((b) => b.slate_date >= todayET) ?? cfb[cfb.length - 1] ?? null;
  const games = board?.games ?? [];
  const hasMargin = games.some((g) => g.proj_margin != null);

  const golf = eloFiles
    .filter((f) => f.sport === "pga")
    .sort((a, b) => (a.generated_at < b.generated_at ? 1 : -1))[0];
  const ratings = golf ? golf.ratings : [];
  const hasChange = ratings.some((r) => r.change != null);

  return (
    <div className="s-pga">
      <div style={{ paddingTop: 18 }}>
        <h1 style={{ fontSize: 22 }}>Extras</h1>
        <div className="updated">Reference views from your models · not bets</div>
      </div>

      {/* ---- CFB model board ---- */}
      <div className="section">
        <div className="section-head">
          <span className="chip" />
          <h2>CFB — Model Board</h2>
          {board ? (
            <span className="count">
              {board.event_context ? `${board.event_context} · ` : ""}
              {games.length} games
            </span>
          ) : null}
        </div>

        {!board || games.length === 0 ? (
          <div className="empty">No CFB slate yet. The model hasn&apos;t published a board file.</div>
        ) : (
          <>
            {board.notes ? (
              <div className="updated" style={{ marginBottom: 8 }}>
                {board.notes}
              </div>
            ) : null}
            <div className="card" style={{ padding: "4px 12px" }}>
              <div className="chart-scroll">
                <table className="grid-table">
                  <thead>
                    <tr>
                      <th>Kickoff</th>
                      <th style={{ textAlign: "left" }}>Game</th>
                      <th>Spread</th>
                      <th>Total</th>
                      <th className="hl">Model Tot</th>
                      <th>Total Lean</th>
                      {hasMargin ? <th>Proj Margin</th> : null}
                      {hasMargin ? <th>Spread Lean</th> : null}
                    </tr>
                  </thead>
                  <tbody>
                    {games.map((g, i) => {
                      const under = g.total_pick === "Under";
                      return (
                        <tr key={g.game_id ?? i}>
                          <td style={{ whiteSpace: "nowrap" }}>{kickoff(g.event_start)}</td>
                          <td style={{ textAlign: "left", fontWeight: 600 }}>
                            {g.away_team} <span style={{ opacity: 0.5 }}>@</span> {g.home_team}
                            {g.completed ? <span style={{ opacity: 0.5, fontWeight: 400 }}> · final</span> : null}
                          </td>
                          <td style={{ whiteSpace: "nowrap" }}>{spreadLabel(g)}</td>
                          <td>{g.total ?? "—"}</td>
                          <td className="hl">{g.proj_total ?? "—"}</td>
                          <td>
                            {g.total_pick ? (
                              <span className={g.total_play ? "pos" : ""} style={{ fontWeight: g.total_play ? 700 : 400 }}>
                                {g.total_pick}
                                {g.total_edge != null ? ` ${g.total_edge}` : ""}
                                {g.total_play ? " ●" : ""}
                              </span>
                            ) : (
                              "—"
                            )}
                          </td>
                          {hasMargin ? <td>{g.proj_margin != null ? (g.proj_margin > 0 ? `+${g.proj_margin}` : g.proj_margin) : "—"}</td> : null}
                          {hasMargin ? (
                            <td className={confClass(g.ats_conf)}>
                              {g.ats_pick ? `${g.ats_pick}${g.ats_edge != null ? ` (${g.ats_edge})` : ""}` : "—"}
                            </td>
                          ) : null}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
            <div className="updated" style={{ marginTop: 8 }}>
              {board.slate_date} · updated {board.generated_at ? fmtDate(board.generated_at) : "—"} · {board.mode} ·
              {" "}● = UNDER play (deployed edge). Spread leans are informational — the model does not beat the closing spread.
            </div>
          </>
        )}
      </div>

      {/* ---- Golf player Elo ---- */}
      <div className="section">
        <div className="section-head">
          <span className="chip" />
          <h2>Golf — Player Elo</h2>
          {golf ? <span className="count">{ratings.length} players</span> : null}
        </div>

        {!golf || ratings.length === 0 ? (
          <div className="empty">No Elo ratings yet. The golf model hasn&apos;t published a ratings file.</div>
        ) : (
          <>
            <div className="card" style={{ padding: "4px 12px" }}>
              <div className="chart-scroll">
                <table className="grid-table">
                  <thead>
                    <tr>
                      <th>Rank</th>
                      <th>Player</th>
                      <th className="hl">Elo</th>
                      {hasChange ? <th>Δ</th> : null}
                    </tr>
                  </thead>
                  <tbody>
                    {ratings.map((r, i) => (
                      <tr key={i}>
                        <td>{r.rank ?? i + 1}</td>
                        <td style={{ textAlign: "left", fontWeight: 600 }}>{r.name}</td>
                        <td className="hl">{Math.round(r.elo)}</td>
                        {hasChange ? (
                          <td className={r.change == null || r.change === 0 ? "" : r.change > 0 ? "pos" : "neg"}>
                            {r.change == null ? "—" : `${r.change > 0 ? "+" : r.change < 0 ? "−" : ""}${Math.abs(Math.round(r.change))}`}
                          </td>
                        ) : null}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
            <div className="updated" style={{ marginTop: 8 }}>
              Updated {golf.generated_at ? fmtDate(golf.generated_at) : "—"} · higher Elo = stronger current form
            </div>
          </>
        )}
      </div>
    </div>
  );
}
