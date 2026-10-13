import "server-only";
import { feedDir, type PropsFile } from "@bet/contract";

// Player-level prop boards (one entry per priced PLAYER, grouped by game): read
// from Postgres when DATA_SOURCE=supabase so a cloud deploy can serve them,
// otherwise read the feed folder live. Mirrors loadBoard().
export async function loadProps(): Promise<PropsFile[]> {
  const source = process.env.DATA_SOURCE ?? "mock";
  if (source === "supabase" && process.env.DATABASE_URL) {
    const [{ openDb }, { loadPropsFromDb }] = await Promise.all([import("@bet/db/upsert"), import("@bet/db/queries")]);
    const handle = openDb(process.env.DATABASE_URL);
    try {
      return await loadPropsFromDb(handle.db);
    } finally {
      await handle.close();
    }
  }
  const { loadPropsFromFeed } = await import("@bet/db/feed");
  return loadPropsFromFeed(feedDir());
}
