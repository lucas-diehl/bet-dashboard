// Wipe the ingested tables so a fresh `pnpm ingest` rebuilds them from the feed.
// Safe: these tables are a projection of the feed folder (sources table is left intact).
// Requires DATABASE_URL (loaded from apps/web/.env.local).
import { sql } from "drizzle-orm";
import { openDb } from "./upsert";
import { loadEnv } from "./env";

loadEnv();
const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL not set.");
  process.exit(1);
}
const h = openDb(url);
await h.db.execute(sql`TRUNCATE TABLE results, bets, slates, dfs_values RESTART IDENTITY CASCADE`);
await h.close();
console.log("Reset: truncated results, bets, slates, dfs_values. Run `pnpm ingest` to rebuild from the feed.");
