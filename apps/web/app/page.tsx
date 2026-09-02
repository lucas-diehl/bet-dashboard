import { sportMeta } from "@bet/contract";
import { loadDataset, dataSourceLabel } from "@/lib/data";
import { betsForDate, datesWithBets, groupBySport } from "@/lib/select";
import { appToday, dayDiff } from "@/lib/time";
import { BetCard } from "@/components/BetCard";
import { cls, fmtDate } from "@/lib/format";
import Link from "next/link";

export const dynamic = "force-dynamic";

export default async function TodayPage({ searchParams }: { searchParams: Promise<{ date?: string }> }) {
  const sp = await searchParams;
  const ds = await loadDataset();
  const dates = datesWithBets(ds);
  const today = appToday();

  // Default to the real calendar day if it has bets; otherwise the nearest date
  // that does (never silently open on a random future slate).
  let date: string;
  if (sp.date && dates.includes(sp.date)) date = sp.date;
  else if (dates.includes(today)) date = today;
  else if (dates.length) date = dates.reduce((best, d) => (Math.abs(dayDiff(d, today)) < Math.abs(dayDiff(best, today)) ? d : best), dates[0]);
  else date = today;

  // Badge when the shown slate isn't today (past = no bets posted yet; future = upcoming).
  const offset = dayDiff(date, today);
  const dateBadge = offset === 0 ? null : offset < 0 ? { tone: "paper", text: `No bets posted for today — showing ${fmtDate(date)}` } : { tone: "live", text: `Upcoming — ${fmtDate(date)}` };

  const bets = betsForDate(ds, date);
  const groups = groupBySport(bets);

  const idx = dates.indexOf(date);
  const newer = idx > 0 ? dates[idx - 1] : null;
  const older = idx >= 0 && idx < dates.length - 1 ? dates[idx + 1] : null;

  const totalStake = bets.reduce((n, b) => n + b.stake_units, 0);

  // Day strip: newest-first (dates[] is already newest-first) so the current day
  // sits at the left and is visible without scrolling.
  const strip = dates;
  const dayLabel = (dt: string) => {
    const d = new Date(`${dt}T12:00:00`);
    return { wd: d.toLocaleDateString("en-US", { weekday: "short" }), dm: d.toLocaleDateString("en-US", { day: "numeric" }), mo: d.toLocaleDateString("en-US", { month: "short" }) };
  };

  return (
    <>
      <div style={{ paddingTop: 18 }}>
        <h1 style={{ fontSize: 22 }}>Today&apos;s Board</h1>
        <div className="updated">
          {bets.length} bets across {groups.length} sport{groups.length === 1 ? "" : "s"} · {totalStake.toFixed(2)}u staked
          {" · "}
          <span className={cls("pill", dataSourceLabel() === "live" ? "live" : "paper")} style={{ fontSize: 11 }}>{dataSourceLabel()} data</span>
        </div>
        {dateBadge ? (
          <div style={{ marginTop: 6 }}>
            <span className={cls("pill", dateBadge.tone)} style={{ fontSize: 11 }}>{dateBadge.text}</span>
          </div>
        ) : null}
      </div>

      {/* Day strip — pan across every day that has picks */}
      {strip.length > 1 ? (
        <div className="daystrip" role="tablist" aria-label="Pick days">
          {strip.map((dt) => {
            const l = dayLabel(dt);
            const on = dt === date;
            return (
              <Link key={dt} href={`/?date=${dt}`} className={cls("day-chip", on && "on")} aria-current={on ? "date" : undefined}>
                <span className="day-wd">{l.wd}</span>
                <span className="day-dm">{l.dm}</span>
                <span className="day-mo">{l.mo}</span>
              </Link>
            );
          })}
        </div>
      ) : null}

      {/* Sport quick-nav — tap to jump to a sport's cards */}
      {groups.length > 1 ? (
        <div className="sportnav">
          {groups.map((g) => {
            const meta = sportMeta(g.sport);
            return (
              <a key={g.sport} href={`#sec-${g.sport}`} className={cls("sport-chip", `s-${g.sport}`)}>
                <span className="emoji">{meta.emoji}</span>
                <span>{meta.label}</span>
                <span className="sport-chip-n">{g.bets.length}</span>
              </a>
            );
          })}
        </div>
      ) : null}

      {groups.length === 0 ? (
        <div className="empty">No bets recommended for {fmtDate(date)}.</div>
      ) : (
        groups.map((g) => {
          const meta = sportMeta(g.sport);
          const mode = g.bets[0]?.mode;
          return (
            <section id={`sec-${g.sport}`} className={cls("section", "sec-anchor", `s-${g.sport}`)} key={g.sport}>
              <div className="section-head">
                <span className="chip" />
                <span className="emoji">{meta.emoji}</span>
                <h2>{meta.full}</h2>
                <span className="count">{g.bets.length}</span>
                <span className="spacer" style={{ flex: 1 }} />
                {mode ? <span className={cls("pill", mode === "LIVE" ? "live" : "paper")}>{mode}</span> : null}
              </div>
              {g.bets.map((b) => (
                <BetCard bet={b} key={b.id} />
              ))}
            </section>
          );
        })
      )}
    </>
  );
}
