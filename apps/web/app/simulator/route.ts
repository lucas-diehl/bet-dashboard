import { loadSimulator } from "@/lib/simulator";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Serve the latest self-contained simulator HTML as a standalone document (not wrapped
// in the app layout). Gated to the owner by middleware (bh_sim cookie). Served
// BYTE-FOR-BYTE — no injection — so nothing can corrupt the page's inline scripts or
// embedded payload (an earlier "refreshed" badge that string-replaced </body> could
// land inside the app's JS and blank the page).
export async function GET() {
  const sim = await loadSimulator();
  if (!sim) {
    return new Response(
      "<!doctype html><meta charset=utf-8><body style=\"font-family:system-ui;padding:40px;color:#333\">Simulator not available yet — it appears after the next DFS ENGINE run is ingested.</body>",
      { status: 503, headers: { "content-type": "text/html; charset=utf-8" } },
    );
  }
  return new Response(sim.content, { headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" } });
}
