import { NextResponse } from "next/server";
import { loadDataset } from "@/lib/data";
import { latestDate } from "@/lib/select";

// Lightweight freshness probe. The Refresh button primarily calls router.refresh()
// to re-render server components; this endpoint is handy for uptime checks / debug.
export async function GET() {
  const ds = await loadDataset();
  return NextResponse.json({
    now: new Date().toISOString(),
    latest_slate_date: latestDate(ds),
    slates: ds.slates.length,
    bets: ds.bets.length,
  });
}
