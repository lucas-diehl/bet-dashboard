import Link from "next/link";
import type { ValuesFile } from "@bet/contract";
import { loadValues } from "@/lib/values";
import { appToday } from "@/lib/time";
import { cls } from "@/lib/format";

export const dynamic = "force-dynamic";

const DFS_SPORTS = ["golf", "wnba", "tennis", "nfl"] as const;
type DfsSport = (typeof DFS_SPORTS)[number];

const META: Record<DfsSport, { label: string; sportClass: string }> = {
  golf: { label: "Golf", sportClass: "s-pga" },
  wnba: { label: "WNBA", sportClass: "s-wnba" },
  tennis: { label: "Tennis", sportClass: "s-tennis" },
  nfl: { label: "NFL", sportClass: "s-nfl" },
};

const SITES = [
  { key: "draftkings", label: "DraftKings" },
  { key: "fanduel", label: "FanDuel" },
] as const;
type SiteKey = (typeof SITES)[number]["key"];

// Normalize a file's `site` field to a canonical key.
function siteKey(f: ValuesFile): string {
  const s = (f.site ?? "").toLowerCase();
  if (s.includes("fan") || s === "fd") return "fanduel";
  if (s.includes("draft") || s === "dk") return "draftkings";
  return s || "draftkings";
}

// The top-10 optimizer-exposure / value table, shared by the tournament board and
// the single-round simulator panel (identical values[] schema).
function ValuesTable({ values }: { values: ValuesFile["values"] }) {
  const rows = values.slice(0, 10);
  const hasTeam = rows.some((r) => (r.team ?? "").trim() !== "");
  const hasPos = rows.some((r) => (r.position ?? "").trim() !== "");
  const hasCeiling = rows.some((r) => r.ceiling != null);
  const hasOwn = rows.some((r) => r.ownership != null);
  const hasExposure = rows.some((r) => r.exposure != null);
  return (
    <div className="card" style={{ padding: "4px 12px" }}>
      <div className="chart-scroll">
        <table className="grid-table">
          <thead>
            <tr>
              <th>Rank</th>
              <th>Player</th>
              {hasTeam ? <th>Team</th> : null}
              {hasPos ? <th>Pos</th> : null}
              <th>Salary</th>
              <th>Proj</th>
              {hasExposure ? <th className="hl">Exp%</th> : null}
              <th className={hasExposure ? undefined : "hl"}>Value</th>
              {hasCeiling ? <th>Ceiling</th> : null}
              {hasOwn ? <th>Own%</th> : null}
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={i}>
                <td>{r.rank ?? i + 1}</td>
                <td style={{ textAlign: "left", fontWeight: 600 }}>{r.name}</td>
                {hasTeam ? <td>{r.team ?? ""}</td> : null}
                {hasPos ? <td>{r.position ?? ""}</td> : null}
                <td>${r.salary.toLocaleString()}</td>
                <td>{r.proj.toFixed(1)}</td>
                {hasExposure ? <td className="hl">{r.exposure != null ? `${Math.round(r.exposure * 100)}%` : "—"}</td> : null}
                <td className={hasExposure ? undefined : "hl"}>{r.value.toFixed(2)}</td>
                {hasCeiling ? <td>{r.ceiling != null ? r.ceiling.toFixed(1) : "—"}</td> : null}
                {hasOwn ? <td>{r.ownership != null ? `${Math.round(r.ownership * 100)}%` : "—"}</td> : null}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default async function DfsPage({ searchParams }: { searchParams: Promise<{ sport?: string; site?: string }> }) {
  const sp = await searchParams;
  const files = await loadValues();
  const today = appToday();

  // The full-tournament board never includes single-round slates — those get their
  // own panel and must never be merged in.
  const tournamentFiles = files.filter((f) => f.slate_type !== "single_round");

  // For a sport+site, pick today's tournament file; else the most recent one
  // (flagged "latest"). Date desc, then generated_at desc (newer suffixed file wins
  // over a legacy un-suffixed same-day DraftKings file).
  const pick = (sport: DfsSport, site: SiteKey): { file?: ValuesFile; isLatest: boolean } => {
    const forSel = tournamentFiles
      .filter((f) => f.sport === sport && siteKey(f) === site)
      .sort((a, b) => (a.slate_date !== b.slate_date ? (a.slate_date < b.slate_date ? 1 : -1) : (a.generated_at < b.generated_at ? 1 : -1)));
    const todays = forSel.find((f) => f.slate_date === today);
    if (todays) return { file: todays, isLatest: false };
    if (forSel[0]) return { file: forSel[0], isLatest: true };
    return { file: undefined, isLatest: false };
  };
  const plays = (sport: DfsSport, site: SiteKey) => pick(sport, site).file?.values.length ?? 0;
  const todayPlays = (sport: DfsSport, site: SiteKey) => {
    const p = pick(sport, site);
    return p.file && !p.isLatest ? p.file.values.length : 0;
  };

  // A live single-round golf slate for a site: the nearest round dated today-or-later
  // (posted a few hours before the round). A stale past round is not "live" — hidden.
  const roundFor = (site: SiteKey): ValuesFile | undefined =>
    files
      .filter((f) => f.sport === "golf" && f.slate_type === "single_round" && siteKey(f) === site && f.slate_date >= today && f.values.length > 0)
      .sort((a, b) => (a.slate_date !== b.slate_date ? (a.slate_date < b.slate_date ? -1 : 1) : a.generated_at < b.generated_at ? 1 : -1))[0];
  const golfRoundLive = SITES.some((x) => !!roundFor(x.key));

  // Default sport: prefer a sport with TODAY's plays (any site; WNBA first per spec),
  // then any sport with plays, else WNBA — but land on golf if a round slate is live
  // and nothing else has today's plays (so the simulator is discoverable).
  const anySite = (fn: (s: DfsSport, site: SiteKey) => number) => (s: DfsSport) => SITES.some((x) => fn(s, x.key) > 0);
  const todayWithPlays = DFS_SPORTS.filter(anySite(todayPlays));
  const anyWithPlays = DFS_SPORTS.filter(anySite(plays));
  let selected: DfsSport = "wnba";
  if (sp.sport && (DFS_SPORTS as readonly string[]).includes(sp.sport)) selected = sp.sport as DfsSport;
  else if (golfRoundLive) selected = "golf"; // a live round is time-sensitive — land here so it's never missed
  else if (todayWithPlays.includes("wnba")) selected = "wnba";
  else if (todayWithPlays.length) selected = todayWithPlays[0];
  else if (anyWithPlays.includes("wnba")) selected = "wnba";
  else if (anyWithPlays.length) selected = anyWithPlays[0];

  // Default site for the selected sport: prefer DraftKings with today's plays, then any
  // site with today's plays, then DraftKings with any plays, then any, else DraftKings.
  let site: SiteKey = "draftkings";
  if (sp.site && SITES.some((x) => x.key === sp.site)) site = sp.site as SiteKey;
  else {
    const withToday = SITES.filter((x) => todayPlays(selected, x.key) > 0).map((x) => x.key);
    const withAny = SITES.filter((x) => plays(selected, x.key) > 0).map((x) => x.key);
    if (withToday.includes("draftkings")) site = "draftkings";
    else if (withToday.length) site = withToday[0];
    else if (withAny.includes("draftkings")) site = "draftkings";
    else if (withAny.length) site = withAny[0];
  }

  const picked = pick(selected, site);
  const file = picked.file;
  const rows = file ? file.values.slice(0, 10) : [];
  const meta = META[selected];
  const siteLabel = SITES.find((x) => x.key === site)!.label;
  const hasExposure = rows.some((r) => r.exposure != null);

  // Round simulator: golf tab + a live round slate for the selected site.
  const round = selected === "golf" ? roundFor(site) : undefined;

  return (
    <div className={meta.sportClass}>
      <div style={{ paddingTop: 18 }}>
        <h1 style={{ fontSize: 22 }}>DFS Plays</h1>
        <div className="updated">Top players per sport for the day · read from your models</div>
      </div>

      <a
        href="/simulator"
        className="card"
        style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: 12, padding: "13px 15px", textDecoration: "none", color: "var(--text)", fontWeight: 600 }}
      >
        <span>🎰 Open the full interactive Monte-Carlo simulator</span>
        <span className="muted" aria-hidden>→</span>
      </a>

      <div className="filters" style={{ marginTop: 12 }}>
        <div className="seg">
          {DFS_SPORTS.map((s) => (
            <Link key={s} href={`/dfs?sport=${s}&site=${site}`} className={cls(selected === s && "on")}>
              {META[s].label}
            </Link>
          ))}
        </div>
        <div className="seg">
          {SITES.map((x) => (
            <Link key={x.key} href={`/dfs?sport=${selected}&site=${x.key}`} className={cls(site === x.key && "on")}>
              {x.label}
            </Link>
          ))}
        </div>
      </div>

      {!file || rows.length === 0 ? (
        <div className="empty">No {siteLabel} DFS slate for {meta.label} today.</div>
      ) : (
        <div className="section">
          <div className="section-head">
            <span className="chip" />
            <h2>
              {meta.label} — {siteLabel}
              {file.slate_label ? ` — ${file.slate_label}` : ""} — {file.slate_date}
            </h2>
            {picked.isLatest ? <span className="count">latest</span> : null}
          </div>
          <ValuesTable values={file.values} />
          <div className="updated" style={{ marginTop: 8 }}>
            {hasExposure ? "Exp% = optimizer exposure (large-GPP, 40% max own, 20 entries)" : `Value = projected ${siteLabel} points per $1k salary`}
            {picked.isLatest ? " · showing the latest available slate (no file for today)" : ""}
          </div>
        </div>
      )}

      {round ? (
        <div className="section" style={{ marginTop: 22 }}>
          <div className="section-head">
            <span className="chip" />
            <span className="emoji">⛳</span>
            <h2>{round.round_label ?? `Round ${round.round ?? ""} Simulator`}</h2>
            <span className="count">{round.slate_date}</span>
          </div>
          <div className="updated" style={{ marginBottom: 8 }}>
            {round.event ? `${round.event} · ` : ""}
            {siteLabel} single-round slate · same GPP optimizer (40% max exposure, 20 entries), scored for one round — salaries &amp; projections are single-round scale
          </div>
          <ValuesTable values={round.values} />
          <div className="updated" style={{ marginTop: 8 }}>
            Exp% = optimizer exposure · ranked by each golfer&apos;s exposure for this round
          </div>
        </div>
      ) : null}
    </div>
  );
}
