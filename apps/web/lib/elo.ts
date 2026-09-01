import "server-only";
import { feedDir, type EloFile } from "@bet/contract";

// Player Elo snapshots: read from Postgres when DATA_SOURCE=supabase (so a cloud
// deploy can serve them), otherwise read the feed folder live (local/self-hosted).
export async function loadElo(): Promise<EloFile[]> {
  const source = process.env.DATA_SOURCE ?? "mock";
  if (source === "supabase" && process.env.DATABASE_URL) {
    const [{ openDb }, { loadEloFromDb }] = await Promise.all([import("@bet/db/upsert"), import("@bet/db/queries")]);
    const handle = openDb(process.env.DATABASE_URL);
    try {
      return await loadEloFromDb(handle.db);
    } finally {
      await handle.close();
    }
  }
  const { loadEloFromFeed } = await import("@bet/db/feed");
  return loadEloFromFeed(feedDir());
}
