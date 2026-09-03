import Link from "next/link";
import { loadPoolIndex, loadPoolPayload } from "@/lib/pools";
import { parsePool } from "@/lib/optimizer";
import { Optimizer } from "@/components/Optimizer";
import { cls } from "@/lib/format";
import { appToday } from "@/lib/time";

export const dynamic = "force-dynamic";

const SPORTS = ["golf", "wnba", "tennis", "nfl"] as const;
const SPORT_META: Record<string, { label: string; cls: string }> = {
  golf: { label: "Golf", cls: "s-pga" },
  wnba: { label: "WNBA", cls: "s-wnba" },
  tennis: { label: "Tennis", cls: "s-tennis" },
  nfl: { label: "NFL", cls: "s-nfl" },
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

  const has = (sport: string) => index.some((p) => p.sport === sport);
  const sport = sp.sport && (SPORTS as readonly string[]).includes(sp.sport) && has(sp.sport) ? sp.sport : SPORTS.find(has) ?? "golf";

  const sitesForSport = [...new Set(index.filter((p) => p.sport === sport).map((p) => siteKey(p.site)))];
  const site = sp.site && sitesForSport.includes(sp.site) ? sp.site : sitesForSport.includes("draftkings") ? "draftkings" : sitesForSport[0] ?? "draftkings";

  const slates = index
    .filter((p) => p.sport === sport && siteKey(p.site) === site)
    .sort((a, b) => (a.slate_date !== b.slate_date ? (a.slate_date < b.slate_date ? 1 : -1) : (a.generated_at ?? "") < (b.generated_at ?? "") ? 1 : -1));
  const selected = (sp.slate && slates.find((s) => String(s.id) === sp.slate)) || slates[0];

  const payload = selected ? await loadPoolPayload(selected.id) : null;
  const pool = payload ? parsePool(payload) : null;

  const meta = SPORT_META[sport] ?? { label: sport.toUpperCase(), cls: "" };
  const siteLabel = SITES.find((x) => x.k === site)?.label ?? site;
  const href = (o: { sport?: string; site?: string; slate?: string | number }) =>
    `/dfs?sport=${o.sport ?? sport}&site=${o.site ?? site}${o.slate != null ? `&slate=${o.slate}` : ""}`;
  const slateLabel = (s: { slate_date: string; slate_type?: string; round?: number; event?: string }) =>
    `${s.event ? `${s.event} · ` : ""}${s.slate_type === "single_round" && s.round ? `R${s.round} · ` : ""}${s.slate_date}`;

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
        <div className="filters" style={{ marginTop: 8 }}>
          <div className="seg">
            {slates.map((s) => (
              <Link key={s.id} href={href({ slate: s.id })} className={cls(selected && s.id === selected.id && "on")}>
                {slateLabel(s)}
              </Link>
            ))}
          </div>
        </div>
      )}

      {index.length === 0 ? (
        <div className="empty">No slates posted for today yet — they appear after today&apos;s DFS-ENGINE run publishes.</div>
      ) : !pool ? (
        <div className="empty">No {siteLabel} {meta.label} slate available right now.</div>
      ) : (
        <>
          <div className="section-head" style={{ marginTop: 16 }}>
            <span className="chip" />
            <h2>{meta.label} — {siteLabel}{selected?.event ? ` — ${selected.event}` : ""}{selected?.slate_type === "single_round" && selected.round ? ` — Round ${selected.round}` : ""}</h2>
            <span className="count">{pool.players.length} players · {pool.cands.length.toLocaleString()} candidates</span>
          </div>
          <Optimizer pool={pool} />
        </>
      )}
    </div>
  );
}
