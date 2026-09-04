import "server-only";
import { feedDir, type BoardFile } from "@bet/contract";

// Model boards (one entry per game for a sport's slate): read from Postgres when
// DATA_SOURCE=supabase (so a cloud deploy can serve them), otherwise read the feed
// folder live (local/self-hosted). Mirrors loadElo().
export async function loadBoard(): Promise<BoardFile[]> {
  const source = process.env.DATA_SOURCE ?? "mock";
  if (source === "supabase" && process.env.DATABASE_URL) {
    const [{ openDb }, { loadBoardFromDb }] = await Promise.all([import("@bet/db/upsert"), import("@bet/db/queries")]);
    const handle = openDb(process.env.DATABASE_URL);
    try {
      return await loadBoardFromDb(handle.db);
    } finally {
      await handle.close();
    }
  }
  const { loadBoardFromFeed } = await import("@bet/db/feed");
  return loadBoardFromFeed(feedDir());
}
