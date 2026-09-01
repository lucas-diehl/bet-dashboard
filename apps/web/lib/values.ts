import "server-only";
import { feedDir, type ValuesFile } from "@bet/contract";

// DFS value plays: read from Postgres when DATA_SOURCE=supabase (so a cloud deploy
// can serve them), otherwise read the feed folder live (local/self-hosted).
export async function loadValues(): Promise<ValuesFile[]> {
  const source = process.env.DATA_SOURCE ?? "mock";
  if (source === "supabase" && process.env.DATABASE_URL) {
    const [{ openDb }, { loadValuesFromDb }] = await Promise.all([import("@bet/db/upsert"), import("@bet/db/queries")]);
    const handle = openDb(process.env.DATABASE_URL);
    try {
      return await loadValuesFromDb(handle.db);
    } finally {
      await handle.close();
    }
  }
  const { loadValuesFromFeed } = await import("@bet/db/feed");
  return loadValuesFromFeed(feedDir());
}
