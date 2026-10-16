import "server-only";
import { feedDir, type ContestsFile } from "@bet/contract";

// Today's ranked DK GPPs per sport: read from Postgres when DATA_SOURCE=supabase
// (so a cloud deploy can serve them), otherwise read the feed folder live
// (local/self-hosted) — same split as loadValues().
export async function loadContests(): Promise<ContestsFile[]> {
  const source = process.env.DATA_SOURCE ?? "mock";
  if (source === "supabase" && process.env.DATABASE_URL) {
    const [{ openDb }, { loadContestsFromDb }] = await Promise.all([import("@bet/db/upsert"), import("@bet/db/queries")]);
    const handle = openDb(process.env.DATABASE_URL);
    try {
      return await loadContestsFromDb(handle.db);
    } finally {
      await handle.close();
    }
  }
  const { loadContestsFromFeed } = await import("@bet/db/feed");
  return loadContestsFromFeed(feedDir());
}
