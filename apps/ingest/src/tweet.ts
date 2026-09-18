import { loadEnv } from "@bet/db/env";
loadEnv();
const { openDb, markBetsTweeted, markResultsTweeted } = await import("@bet/db/upsert");
const { loadUntweetedBets, loadUntweetedResults, loadAllTimeRecordBySport } = await import("@bet/db/queries");
const { xCredsFromEnv, postThread, postTweet, updateBio, DuplicateTweetError } = await import("./x.js");
const { formatPicksThread, formatResultsTweet, formatBio } = await import("./format-tweet.js");

// Runs as a step after ingest in cfb.yml/nfl.yml/golf.yml (opted in per-workflow via
// the ingest composite action's post-to-x input — dfs.yml does NOT opt in, so DFS
// lineups never post). Batches whatever's pending since the last successful run into
// a picks thread (every pick, no truncation — see formatPicksThread) plus one results
// tweet, since each bet/result is only ever queued once (tweetedAt null -> set). Also
// refreshes the account bio with the live per-sport record whenever a results tweet
// actually posts ("as results come in").

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
    const parts = formatPicksThread(pending);
    if (parts.length) {
      console.log(`Posting picks thread (${parts.length} tweet(s)):`);
      parts.forEach((p, i) => console.log(`--- part ${i + 1}/${parts.length} ---\n${p}`));
      await postThread(parts, creds);
      await markBetsTweeted(h.db, pending.map((b) => b.id));
      console.log(`Tweeted ${pending.length} new pick(s) across ${parts.length} tweet(s).`);
    } else {
      console.log("No new picks to tweet.");
    }

    const graded = await loadUntweetedResults(h.db);
    const resultsText = formatResultsTweet(graded);
    if (resultsText) {
      console.log("Posting results tweet:\n" + resultsText);
      try {
        await postTweet(resultsText, creds);
      } catch (e) {
        if (!(e instanceof DuplicateTweetError)) throw e;
        // Already said, verbatim, in an earlier post — treat as done rather than get
        // this batch of results permanently stuck retrying an identical rejection.
        console.warn("Results tweet was a duplicate — already posted, marking tweeted anyway.");
      }
      await markResultsTweeted(h.db, graded.map((r) => r.resultId));
      console.log(`Tweeted ${graded.length} result(s).`);

      // Bio failure shouldn't fail the whole step — the results tweet above already
      // posted and is already marked tweeted, so retrying this run wouldn't re-post it
      // anyway. account/update_profile.json is a v1.1 endpoint; if X ever gates it
      // behind a paid tier this logs and moves on instead of red-X'ing the workflow.
      try {
        const bySport = await loadAllTimeRecordBySport(h.db);
        const bio = formatBio(bySport);
        console.log("Updating bio:\n" + bio);
        await updateBio(bio, creds);
      } catch (e) {
        console.error("Bio update failed (non-fatal):", e);
      }
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
