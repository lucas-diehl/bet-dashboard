import { loadElo } from "@/lib/elo";
import { fmtDate } from "@/lib/format";

export const dynamic = "force-dynamic";

// The Extras tab: reference views that aren't bets. First up — golf player Elo
// ratings from the golf-modeling engine. More sports/tables can slot in here.
export default async function ExtrasPage() {
  const files = await loadElo();
  const golf = files
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
