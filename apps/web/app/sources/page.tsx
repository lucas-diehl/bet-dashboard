import { sourceMeta, sportMeta } from "@bet/contract";
import { loadDataset, dataSourceLabel } from "@/lib/data";
import { sourceStatus } from "@/lib/select";
import { appToday } from "@/lib/time";
import { cls, fmtDate } from "@/lib/format";

export const dynamic = "force-dynamic";

export default async function SourcesPage() {
  const ds = await loadDataset();
  const date = appToday();
  const statuses = sourceStatus(ds, date);
  const source = dataSourceLabel();
  const sourceText = source === "live" ? "live data from Supabase" : source === "feed" ? "data read live from the feed folder" : "demo data";

  return (
    <>
      <div style={{ paddingTop: 18 }}>
        <h1 style={{ fontSize: 22 }}>Sources</h1>
        <div className="updated">Which models reported for {fmtDate(date)}</div>
      </div>

      <div className="section">
        {statuses.map((s) => {
          const meta = sourceMeta(s.key);
          const tone = s.reported ? "good" : s.daysStale != null && s.daysStale <= 8 ? "warn" : "muted";
          return (
            <div className="card" key={s.key}>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <span
                  style={{
                    width: 10,
                    height: 10,
                    borderRadius: "50%",
                    flex: "none",
                    background: tone === "good" ? "var(--good)" : tone === "warn" ? "var(--warn)" : "var(--muted)",
                  }}
                />
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 650 }}>{meta.label}</div>
                  <div className="muted" style={{ fontSize: 12.5 }}>
                    {meta.sports.map((sp) => sportMeta(sp).label).join(" · ")}
                    {meta.note ? ` — ${meta.note}` : ""}
                  </div>
                </div>
                <div style={{ textAlign: "right" }}>
                  {s.reported ? (
                    <>
                      <span className={cls("pill", s.slate?.mode === "LIVE" ? "live" : "paper")}>{s.slate?.mode ?? ""}</span>
                      <div className="muted" style={{ fontSize: 12, marginTop: 3 }}>{s.betCount} bets today</div>
                    </>
                  ) : (
                    <div className="muted" style={{ fontSize: 12.5 }}>
                      {s.daysStale != null ? `last ${fmtDate(s.slate!.slate_date)} (${s.daysStale}d ago)` : "no data yet"}
                    </div>
                  )}
                </div>
              </div>
              {s.reported && s.slate?.notes ? <div className="notes">{s.slate.notes}</div> : null}
            </div>
          );
        })}
      </div>

      <div className="section">
        <div className="subhead">About the feed</div>
        <div className="card muted" style={{ fontSize: 13, lineHeight: 1.6 }}>
          Each model writes a standardized <code>picks_&lt;date&gt;.json</code> into the shared feed folder; the local ingest
          job validates it against the contract and upserts it here. This page flags any model that has gone quiet so a
          silent pipeline is obvious. Currently showing <strong>{sourceText}</strong>.
        </div>
      </div>
    </>
  );
}
