import Link from "next/link";
import { loadProps } from "@/lib/props";
import { cls } from "@/lib/format";
import { appToday } from "@/lib/time";

export const dynamic = "force-dynamic";

// Every priced player for a touchdown market, grouped into a collapsible block
// per game. Deliberately shows the WHOLE field, not just the bets: a player who
// did not clear the threshold is still worth seeing next to the number, and the
// reason he was skipped (QB, excluded price band) is spelled out rather than
// leaving a silent gap in the list.

type Search = { sport?: string; date?: string; open?: string; view?: string };

const pct = (v: number | null | undefined, d = 1) =>
  v == null || !isFinite(v) ? "—" : `${(v * 100).toFixed(d)}%`;

const american = (v: number | null | undefined) =>
  v == null || !isFinite(v) ? "—" : v > 0 ? `+${Math.round(v)}` : `${Math.round(v)}`;

const signed = (v: number | null | undefined, d = 1) =>
  v == null || !isFinite(v) ? "—" : `${v > 0 ? "+" : ""}${(v * 100).toFixed(d)}%`;

function kickoff(iso?: string | null) {
  if (!iso) return "";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "";
  return d.toLocaleString("en-US", {
    timeZone: "America/New_York",
    weekday: "short",
    hour: "numeric",
    minute: "2-digit",
  });
}

// How long ago a bet was locked in. Shown instead of a bare timestamp because
// the useful question is "how stale is this price", not "what time was it".
// A play taken three days out and one grabbed Sunday morning read differently.
function postedAgo(iso?: string | null) {
  if (!iso) return null;
  const d = new Date(iso);
  if (isNaN(d.getTime())) return null;
  const mins = Math.round((Date.now() - d.getTime()) / 60000);
  if (mins < 0) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 36) return `${hrs}h ago`;
  return `${Math.round(hrs / 24)}d ago`;
}

function postedExact(iso?: string | null) {
  if (!iso) return undefined;
  const d = new Date(iso);
  if (isNaN(d.getTime())) return undefined;
  return `Posted ${d.toLocaleString("en-US", { timeZone: "America/New_York", dateStyle: "medium", timeStyle: "short" })} ET`;
}

export default async function TouchdownsPage({ searchParams }: { searchParams: Promise<Search> }) {
  const sp = await searchParams;
  const all = await loadProps();

  if (all.length === 0) {
    return (
      <div style={{ paddingTop: 18 }}>
        <h1 style={{ fontSize: 22 }}>Touchdowns</h1>
        <div className="empty">
          No touchdown board published yet — it appears after the weekly model run.
        </div>
      </div>
    );
  }

  const sports = [...new Set(all.map((p) => p.sport))];
  const sport = sp.sport && sports.includes(sp.sport) ? sp.sport : sports[0];

  // Newest slate at or after today, else the most recent one.
  const today = appToday();
  const forSport = all
    .filter((p) => p.sport === sport)
    .sort((a, b) => (a.slate_date < b.slate_date ? -1 : 1));
  const upcoming = forSport.filter((p) => p.slate_date >= today);
  // `sp.date && find(...)` would widen to "" when the param is an empty string,
  // so the lookup is done explicitly.
  const requested = sp.date ? forSport.find((p) => p.slate_date === sp.date) : undefined;
  const file = requested ?? upcoming[0] ?? forSport[forSport.length - 1];

  // Defensive de-dup: one row per (player, team), best price (lowest market
  // probability) kept. The producing script already guarantees this, but a
  // player shown twice with two different books is a visible, confusing
  // failure mode on a page that reads straight from the database - cheap
  // insurance against any future upstream regression rather than trusting the
  // invariant silently.
  const seen = new Map<string, (typeof file.props)[number]>();
  for (const p of file?.props ?? []) {
    const key = `${p.player.trim().toLowerCase()}|${(p.team ?? "").trim().toLowerCase()}`;
    const prev = seen.get(key);
    if (!prev || (p.market_prob ?? Infinity) < (prev.market_prob ?? Infinity)) {
      seen.set(key, p);
    }
  }
  const rows = [...seen.values()];

  const totalBets = rows.filter((r) => r.is_bet).length;
  const positiveEdge = rows.filter((r) => (r.edge ?? 0) > 0).length;

  // Default to the staked picks only - the full field (hundreds of unstaked
  // players, kept per the original "every player, every game" board design)
  // buried the ~20 actual bets in noise. "Full field" is one click away via
  // the toggle below, not gone.
  const view = sp.view === "all" ? "all" : "picks";
  const displayRows = view === "picks" && totalBets > 0 ? rows.filter((r) => r.is_bet) : rows;

  // Group by game, ordered by kickoff.
  const games = new Map<string, typeof displayRows>();
  for (const r of displayRows) {
    const key = r.game_id ?? r.event ?? "—";
    if (!games.has(key)) games.set(key, []);
    games.get(key)!.push(r);
  }
  const ordered = [...games.entries()].sort((a, b) => {
    const sa = a[1][0]?.event_start ?? "";
    const sb = b[1][0]?.event_start ?? "";
    return sa < sb ? -1 : sa > sb ? 1 : 0;
  });

  const href = (o: { sport?: string; date?: string; view?: string }) =>
    `/touchdowns?sport=${o.sport ?? sport}${o.date ?? file?.slate_date ? `&date=${o.date ?? file?.slate_date}` : ""}&view=${o.view ?? view}`;

  return (
    <div>
      <div style={{ paddingTop: 18 }}>
        <h1 style={{ fontSize: 22 }}>Touchdowns</h1>
        <div className="updated">
          {file?.market_label ?? "Anytime touchdown"} — every priced player, best available
          number vs the model. Expand a game to see its field.
        </div>
      </div>

      <div className="filters" style={{ marginTop: 12 }}>
        {sports.length > 1 && (
          <div className="seg">
            {sports.map((s) => (
              <Link key={s} href={href({ sport: s, date: undefined })} className={cls(sport === s && "on")}>
                {s.toUpperCase()}
              </Link>
            ))}
          </div>
        )}
        {forSport.length > 1 && (
          <div className="seg">
            {forSport.map((p) => (
              <Link key={p.slate_date} href={href({ date: p.slate_date })} className={cls(file?.slate_date === p.slate_date && "on")}>
                {p.slate_date}
              </Link>
            ))}
          </div>
        )}
        {totalBets > 0 && (
          <div className="seg">
            <Link href={href({ view: "picks" })} className={cls(view === "picks" && "on")}>
              Picks ({totalBets})
            </Link>
            <Link href={href({ view: "all" })} className={cls(view === "all" && "on")}>
              Full field ({rows.length})
            </Link>
          </div>
        )}
      </div>

      <div className="updated" style={{ marginTop: 8 }}>
        {file?.event_context ? <strong style={{ color: "var(--text)" }}>{file.event_context}</strong> : null}
        {file?.event_context ? " · " : ""}
        {view === "picks" && totalBets > 0
          ? `${totalBets} staked picks · ${ordered.length} game${ordered.length === 1 ? "" : "s"}`
          : `${rows.length} players · ${ordered.length} games · ${positiveEdge} with positive edge · ${totalBets} staked`}
        {file?.generated_at ? ` · board refreshed ${postedAgo(file.generated_at) ?? ""}` : ""}
        {file?.notes ? ` · ${file.notes}` : ""}
      </div>

      {ordered.map(([key, list], gi) => {
        const head = list[0];
        // Best edge in the game drives the summary chip, so a collapsed game
        // still advertises whether it is worth opening.
        const best = list.reduce<number | null>(
          (m, r) => (r.edge != null && (m == null || r.edge > m) ? r.edge : m),
          null,
        );
        const staked = list.filter((r) => r.is_bet).length;
        const sorted = [...list].sort((a, b) => (b.edge ?? -99) - (a.edge ?? -99));
        return (
          <details key={key} open={view === "picks" || gi === 0 || sp.open === key} style={{ marginTop: 12 }}>
            <summary style={{ cursor: "pointer", padding: "8px 0" }}>
              <strong style={{ fontSize: 15 }}>{head?.event ?? key}</strong>
              <span className="updated" style={{ marginLeft: 10 }}>
                {kickoff(head?.event_start)} · {list.length} players
                {best != null ? ` · best edge ${signed(best)}` : ""}
                {staked > 0 ? ` · ${staked} staked` : ""}
              </span>
            </summary>
            <div className="card" style={{ padding: "4px 12px" }}>
              <div className="chart-scroll">
                <table className="grid-table">
                  <thead>
                    <tr>
                      <th style={{ textAlign: "left" }}>Player</th>
                      <th>Pos</th>
                      <th>Team</th>
                      <th>Best line</th>
                      <th>Book</th>
                      <th>Market</th>
                      <th className="hl">Model</th>
                      <th className="hl">Edge</th>
                      <th>EV / 1u</th>
                      <th>Books</th>
                      <th>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {sorted.map((r, i) => (
                      <tr key={`${r.player}-${i}`}>
                        <td style={{ textAlign: "left", fontWeight: r.is_bet ? 700 : 500 }}>
                          {r.player}
                          {r.is_bet ? <span style={{ color: "var(--accent)" }}> ●</span> : null}
                        </td>
                        <td>{r.position ?? "—"}</td>
                        <td>{r.team ?? "—"}</td>
                        <td style={{ whiteSpace: "nowrap" }}>{american(r.best_odds)}</td>
                        <td style={{ whiteSpace: "nowrap" }}>{r.best_book ?? "—"}</td>
                        <td>{pct(r.market_prob)}</td>
                        <td className="hl">{pct(r.model_prob)}</td>
                        <td className="hl" style={{ color: (r.edge ?? 0) > 0 ? "var(--good)" : undefined }}>
                          {signed(r.edge)}
                        </td>
                        <td style={{ color: (r.ev ?? 0) > 0 ? "var(--good)" : undefined }}>
                          {r.ev == null || !isFinite(r.ev) ? "—" : `${r.ev > 0 ? "+" : ""}${r.ev.toFixed(2)}u`}
                        </td>
                        <td>{r.books ?? "—"}</td>
                        <td style={{ whiteSpace: "nowrap" }} title={postedExact(r.posted_at)}>
                          {r.is_bet ? (
                            <>
                              <span style={{ color: "var(--accent)", fontWeight: 600 }}>
                                BET {r.stake != null ? `${r.stake}u` : ""}
                              </span>
                              {/* The price we actually took, shown whenever the
                                  market has since moved off it. */}
                              {r.posted_odds != null && r.posted_odds !== r.best_odds ? (
                                <span className="updated"> @ {american(r.posted_odds)}</span>
                              ) : null}
                              {postedAgo(r.posted_at) ? (
                                <span className="updated"> · {postedAgo(r.posted_at)}</span>
                              ) : null}
                            </>
                          ) : r.excluded_reason ? (
                            r.excluded_reason
                          ) : r.tier === "WATCHLIST" ? (
                            // Cleared the edge threshold but lost out to the weekly
                            // bet cap (config/td_2026.yml strategy.weekly_bet_cap) -
                            // spelled out so it reads as "not staked", not as a pick.
                            <span className="updated">Capped — not staked</span>
                          ) : (
                            "—"
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </details>
        );
      })}
    </div>
  );
}
