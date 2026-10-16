import Link from "next/link";
import { loadValues } from "@/lib/values";
import { loadPoolIndex, loadPoolPayload } from "@/lib/pools";
import { parsePool } from "@/lib/optimizer";
import { Optimizer } from "@/components/Optimizer";
import { cls } from "@/lib/format";
import { appToday } from "@/lib/time";

export const dynamic = "force-dynamic";

const SPORTS = ["golf", "wnba", "tennis", "nfl", "ncaaf"] as const;
const SPORT_META: Record<string, { label: string; cls: string }> = {
  golf: { label: "Golf", cls: "s-pga" },
  wnba: { label: "WNBA", cls: "s-wnba" },
  tennis: { label: "Tennis", cls: "s-tennis" },
  nfl: { label: "NFL", cls: "s-nfl" },
  ncaaf: { label: "CFB", cls: "s-ncaaf" },
};
const SITES = [
  { k: "draftkings", label: "DraftKings" },
  { k: "fanduel", label: "FanDuel" },
];
const siteKey = (s?: string): string => ((s ?? "").toLowerCase().includes("fan") ? "fanduel" : "draftkings");

export default async function DfsPage({ searchParams }: { searchParams: Promise<{ sport?: string; site?: string; slate?: string }> }) {
  const sp = await searchParams;
  // The optimizer only ever shows the CURRENT slate — never past dates. Anything
  // older than today is filtered out entirely (tabs, site toggle, and selector).
  const today = appToday();
  const index = (await loadPoolIndex()).filter((p) => p.slate_date >= today);

  // Value plays (values_<date>.json) are a separate feed from the optimizer
  // pools above, and a sport can have one without the other. NFL is exactly
  // that case: nfl-modeling publishes projections + DK salaries, but no
  // DFS-ENGINE pool is generated for it, so keying the tabs off pools alone
  // left the NFL tab permanently greyed out with the data sitting unused in
  // the database. loadValues() already existed and was imported by nothing.
  const allValues = (await loadValues()).filter((v) => v.slate_date >= today);

  const hasPool = (sport: string) => index.some((p) => p.sport === sport);
  const hasValues = (sport: string) => allValues.some((v) => v.sport === sport);
  const has = (sport: string) => hasPool(sport) || hasValues(sport);
  const sport = sp.sport && (SPORTS as readonly string[]).includes(sp.sport) && has(sp.sport) ? sp.sport : SPORTS.find(has) ?? "golf";

  // Site toggle draws from whichever feeds exist for this sport.
  const sitesForSport = [
    ...new Set([
      ...index.filter((p) => p.sport === sport).map((p) => siteKey(p.site)),
      ...allValues.filter((v) => v.sport === sport).map((v) => siteKey(v.site)),
    ]),
  ];
  const site = sp.site && sitesForSport.includes(sp.site) ? sp.site : sitesForSport.includes("draftkings") ? "draftkings" : sitesForSport[0] ?? "draftkings";

  const slates = index
    .filter((p) => p.sport === sport && siteKey(p.site) === site)
    .sort((a, b) => (a.slate_date !== b.slate_date ? (a.slate_date < b.slate_date ? 1 : -1) : (a.generated_at ?? "") < (b.generated_at ?? "") ? 1 : -1));
  const selected = (sp.slate && slates.find((s) => String(s.id) === sp.slate)) || slates[0];

  const payload = selected ? await loadPoolPayload(selected.id) : null;
  const pool = payload ? parsePool(payload) : null;

  // Pick one values file for this sport+site. Two producers can publish for the
  // same sport: dfs-engine emits the optimizer EXPOSURE view (share of GPP
  // lineups rostering each player), and nfl-modeling emits a plain
  // points-per-$1k view. Exposure is strictly more informative — it reflects
  // the optimizer and ownership, not just a ratio — so it wins regardless of
  // recency. Without this, a fresher plain-value file silently masks the
  // better board.
  const candidates = allValues.filter((v) => v.sport === sport && siteKey(v.site) === site);
  const hasExposure = (v: (typeof candidates)[number]) => v.values.some((x) => x.exposure != null);
  const byRecency = (a: (typeof candidates)[number], b: (typeof candidates)[number]) =>
    a.slate_date !== b.slate_date
      ? a.slate_date < b.slate_date
        ? 1
        : -1
      : (a.generated_at ?? "") < (b.generated_at ?? "")
        ? 1
        : -1;
  const exposureFiles = candidates.filter(hasExposure).sort(byRecency);
  const valuesFile = exposureFiles[0] ?? candidates.sort(byRecency)[0] ?? null;
  const valuePlays = valuesFile?.values ?? [];
  const showingExposure = valuesFile ? hasExposure(valuesFile) : false;
  // Position-grouped exposure view (team sports only) — same data as valuePlays,
  // just grouped 2-per-slot + FLEX. Only meaningful alongside the exposure view.
  const byPosition = showingExposure ? valuesFile?.by_position ?? null : null;

  const meta = SPORT_META[sport] ?? { label: sport.toUpperCase(), cls: "" };
  const siteLabel = SITES.find((x) => x.k === site)?.label ?? site;
  const href = (o: { sport?: string; site?: string; slate?: string | number }) =>
    `/dfs?sport=${o.sport ?? sport}&site=${o.site ?? site}${o.slate != null ? `&slate=${o.slate}` : ""}`;
  // Layout picker text: prefer the DFS engine's human label (e.g. "Full Slate (16
  // games)", "Showdown (NE @ SEA)", "Alt Slate (12 games, Sun Sep 13)") — falls back
  // to the old event/round/date combo for slates published before slate_label existed.
  const slateLabel = (s: { slate_date: string; slate_type?: string; round?: number; event?: string; slate_label?: string }) => {
    if (s.slate_label && s.slate_label !== "Main") return s.slate_label;
    return `${s.event ? `${s.event} · ` : ""}${s.slate_type === "single_round" && s.round ? `R${s.round} · ` : ""}${s.slate_date}`;
  };

  return (
    <div className={meta.cls}>
      <div style={{ paddingTop: 18 }}>
        <h1 style={{ fontSize: 22 }}>DFS Optimizer</h1>
        <div className="updated">Build lineups from the model&apos;s simulations — each run gives a fresh, diversified set.</div>
      </div>

      <div className="filters" style={{ marginTop: 12 }}>
        <div className="seg">
          {SPORTS.map((s) => (
            <Link key={s} href={href({ sport: s, site, slate: undefined })} className={cls(sport === s && "on", !has(s) && "off")} style={!has(s) ? { opacity: 0.45 } : undefined}>
              {SPORT_META[s].label}
            </Link>
          ))}
        </div>
        {sitesForSport.length > 0 && (
          <div className="seg">
            {SITES.filter((x) => sitesForSport.includes(x.k)).map((x) => (
              <Link key={x.k} href={href({ site: x.k, slate: undefined })} className={cls(site === x.k && "on")}>
                {x.label}
              </Link>
            ))}
          </div>
        )}
      </div>

      {slates.length > 1 && (
        <>
          <div className="updated" style={{ marginTop: 10 }}>
            {slates.length} layouts available — pick one:
          </div>
          <div className="filters" style={{ marginTop: 4 }}>
            <div className="seg">
              {slates.map((s) => (
                <Link key={s.id} href={href({ slate: s.id })} className={cls(selected && s.id === selected.id && "on")}>
                  {slateLabel(s)}
                </Link>
              ))}
            </div>
          </div>
        </>
      )}

      {index.length === 0 && valuePlays.length === 0 ? (
        <div className="empty">No slates posted for today yet — they appear after today&apos;s DFS-ENGINE run publishes.</div>
      ) : (
        <>
          {pool ? (
            <>
              <div className="section-head" style={{ marginTop: 16 }}>
                <span className="chip" />
                <h2>{meta.label} — {siteLabel}</h2>
              </div>
              <div className="updated" style={{ marginTop: -6 }}>
                {selected && slateLabel(selected) !== `${meta.label} — ${siteLabel}` ? <><strong style={{ color: "var(--text)" }}>{slateLabel(selected)}</strong>{" · "}</> : null}
                {selected?.event && selected.event !== selected?.slate_label ? <>{selected.event}{" · "}</> : null}
                {pool.roster.n ?? pool.cands[0]?.length} roster spots · ${pool.roster.cap.toLocaleString()} cap
                {" · "}{pool.players.length} players · {pool.cands.length.toLocaleString()} candidates
              </div>
              <Optimizer pool={pool} />
            </>
          ) : valuePlays.length === 0 ? (
            <div className="empty">No {siteLabel} {meta.label} slate available right now.</div>
          ) : null}

          {valuePlays.length > 0 ? (
            <>
              <div className="section-head" style={{ marginTop: pool ? 24 : 16 }}>
                <span className="chip" />
                <h2>{meta.label} — {showingExposure ? "Top Optimizer Plays" : "Value Plays"}</h2>
              </div>
              <div className="updated" style={{ marginTop: -6 }}>
                {showingExposure ? "Share of optimizer lineups rostering each player" : "Projected points per $1,000 of salary"}
                {valuesFile?.slate_date ? ` · ${valuesFile.slate_date}` : ""}
                {valuesFile?.slate_label ? ` · ${valuesFile.slate_label}` : ""}
                {" · "}{valuePlays.length} plays
                {pool ? null : " · projections only (no optimizer pool for this sport yet)"}
              </div>
              <div className="card" style={{ padding: "4px 12px" }}>
                <div className="chart-scroll">
                  <table className="grid-table">
                    <thead>
                      <tr>
                        <th>#</th>
                        <th style={{ textAlign: "left" }}>Player</th>
                        <th>Pos</th>
                        <th>Team</th>
                        <th>Salary</th>
                        <th>Proj</th>
                        <th className={showingExposure ? undefined : "hl"}>Pts / $1k</th>
                        {showingExposure ? <th className="hl">Exposure</th> : null}
                        <th>Own</th>
                        {showingExposure ? <th title="Exposure minus projected field ownership — how much more (or less) of the field you'd have on this player than everyone else.">Leverage</th> : null}
                        <th>Ceiling</th>
                      </tr>
                    </thead>
                    <tbody>
                      {valuePlays.map((v, i) => {
                        const leverage = showingExposure && v.exposure != null && v.ownership != null ? v.exposure - v.ownership : null;
                        return (
                          <tr key={`${v.name}-${i}`}>
                            <td>{v.rank ?? i + 1}</td>
                            <td style={{ textAlign: "left", fontWeight: 600 }} title={v.note ?? undefined}>
                              {v.name}
                            </td>
                            <td>{v.position ?? "—"}</td>
                            <td>{v.team ?? "—"}</td>
                            <td>${v.salary.toLocaleString()}</td>
                            <td>{v.proj.toFixed(1)}</td>
                            <td className={showingExposure ? undefined : "hl"}>{v.value.toFixed(2)}</td>
                            {showingExposure ? (
                              <td className="hl">{v.exposure != null ? `${Math.round(v.exposure * 100)}%` : "—"}</td>
                            ) : null}
                            <td>{v.ownership != null ? `${Math.round(v.ownership * 100)}%` : "—"}</td>
                            {showingExposure ? (
                              <td style={leverage != null ? { color: leverage >= 0 ? "var(--pos, #2e7d32)" : "var(--neg, #c62828)" } : undefined}>
                                {leverage != null ? `${leverage >= 0 ? "+" : ""}${Math.round(leverage * 100)}%` : "—"}
                              </td>
                            ) : null}
                            <td>{v.ceiling != null ? v.ceiling.toFixed(1) : "—"}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>

              {byPosition && Object.keys(byPosition).length > 0 ? (
                <>
                  <div className="section-head" style={{ marginTop: 20 }}>
                    <span className="chip" />
                    <h2>{meta.label} — By Position</h2>
                  </div>
                  <div className="updated" style={{ marginTop: -6 }}>Top optimizer plays at each roster slot (plus FLEX)</div>
                  <div className="card" style={{ padding: "4px 12px" }}>
                    <div className="chart-scroll" style={{ display: "flex", flexWrap: "wrap", gap: 16, padding: "10px 0" }}>
                      {Object.entries(byPosition).map(([pos, items]) => (
                        <div key={pos} style={{ minWidth: 180 }}>
                          <div style={{ fontWeight: 700, marginBottom: 4 }}>{pos}</div>
                          {items.map((v, i) => (
                            <div key={`${pos}-${i}`} style={{ fontSize: 13, padding: "2px 0" }}>
                              <span style={{ fontWeight: 600 }}>{v.name}</span>
                              {" — "}
                              {v.exposure != null ? `${Math.round(v.exposure * 100)}% exp` : "—"}
                              {v.ownership != null ? `, ${Math.round(v.ownership * 100)}% own` : ""}
                            </div>
                          ))}
                        </div>
                      ))}
                    </div>
                  </div>
                </>
              ) : null}
            </>
          ) : null}
        </>
      )}
    </div>
  );
}
