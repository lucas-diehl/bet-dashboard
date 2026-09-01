import "server-only";
import { feedDir } from "@bet/contract";

// The DFS ENGINE's self-contained interactive simulator HTML. Read from Postgres on
// a cloud deploy (DATA_SOURCE=supabase), else straight from the feed folder (local).
export async function loadSimulator(): Promise<{ content: string; updated: string | null } | null> {
  const source = process.env.DATA_SOURCE ?? "mock";
  if (source === "supabase" && process.env.DATABASE_URL) {
    const [{ openDb }, { loadAsset }] = await Promise.all([import("@bet/db/upsert"), import("@bet/db/queries")]);
    const handle = openDb(process.env.DATABASE_URL);
    try {
      return await loadAsset(handle.db, "dfs-simulator");
    } finally {
      await handle.close();
    }
  }
  try {
    const { readFileSync, statSync } = await import("node:fs");
    const { join } = await import("node:path");
    const dir = join(feedDir(), "dfs-engine", "simulator");
    const content = readFileSync(join(dir, "dashboard.html"), "utf8");
    let updated: string | null = null;
    try {
      updated = (JSON.parse(readFileSync(join(dir, "meta.json"), "utf8")) as { updated?: string }).updated ?? null;
    } catch {
      /* no meta.json */
    }
    if (!updated) updated = statSync(join(dir, "dashboard.html")).mtime.toISOString();
    return { content, updated };
  } catch {
    return null;
  }
}
