import { loadEnv } from "@bet/db/env";
loadEnv();
const { openDb, markBetsTweeted, markResultsTweeted } = await import("@bet/db/upsert");
const { loadUntweetedBets, loadUntweetedResults, loadAllTimeRecord } = await import("@bet/db/queries");
const { xCredsFromEnv, postTweet, updateBio } = await import("./x.js");
const { formatPicksTweet, formatResultsTweet, formatBio } = await import("./format-tweet.js");

// Runs as a step after ingest in cfb.yml/nfl.yml/golf.yml (opted in per-workflow via
// the ingest composite action's post-to-x input — dfs.yml does NOT opt in, so DFS
// lineups never post). Batches whatever's pending since the last successful run into
// at most 2 tweets (new picks, then results) — free-tier volume stays low regardless
// of which/how many workflows ran today, since each bet/result is only ever queued
// once (tweetedAt null -> set). Also refreshes the account bio with the live all-time
// record whenever a results tweet actually posts ("as results come in").

async function main() {
  const creds = xCredsFromEnv();
  if (!creds) {
    console.log("X credentials not configured — skipping tweet step.");
    return;
  }
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL not set");

  const h = openDb(url);
  try {
    const pending = await loadUntweetedBets(h.db);
    const picksText = formatPicksTweet(pending);
    if (picksText) {
      console.log("Posting picks tweet:\n" + picksText);
      await postTweet(picksText, creds);
      await markBetsTweeted(h.db, pending.map((b) => b.id));
      console.log(`Tweeted ${pending.length} new pick(s).`);
    } else {
      console.log("No new picks to tweet.");
    }

    const graded = await loadUntweetedResults(h.db);
    const resultsText = formatResultsTweet(graded);
    if (resultsText) {
      console.log("Posting results tweet:\n" + resultsText);
      await postTweet(resultsText, creds);
      await markResultsTweeted(h.db, graded.map((r) => r.resultId));
      console.log(`Tweeted ${graded.length} result(s).`);

      const record = await loadAllTimeRecord(h.db);
      const bio = formatBio(record);
      console.log("Updating bio:\n" + bio);
      await updateBio(bio, creds);
    } else {
      console.log("No new results to tweet.");
    }
  } finally {
    await h.close();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
