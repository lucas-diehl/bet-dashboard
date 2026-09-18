import { loadEnv } from "@bet/db/env";
loadEnv();
const { openDb } = await import("@bet/db/upsert");
const { loadWeeklySummary } = await import("@bet/db/queries");
const { xCredsFromEnv, postTweet } = await import("./x.js");
const { formatWeeklyTweet } = await import("./format-tweet.js");

// Runs on its own weekly cron (not tied to any model run) — see tweet-weekly.yml.
// Summarizes results graded in the trailing 7 days, independent of the per-run
// picks/results tweets from tweet.ts.

async function main() {
  const creds = xCredsFromEnv();
  if (!creds) {
    console.log("X credentials not configured — skipping weekly tweet.");
    return;
  }
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL not set");

  const h = openDb(url);
  try {
    const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const summary = await loadWeeklySummary(h.db, since);
    const text = formatWeeklyTweet(summary);
    if (text) {
      console.log("Posting weekly recap:\n" + text);
      await postTweet(text, creds);
    } else {
      console.log("No graded results in the trailing 7 days — skipping weekly recap.");
    }
  } finally {
    await h.close();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
