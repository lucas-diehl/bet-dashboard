// Local uploader: scans the feed folder, validates every JSON file against the
// contract, and upserts valid files into Postgres. Runs where the models run
// (they write locally), scheduled via Windows Task Scheduler.
//
//   pnpm ingest        # validate + upsert (needs DATABASE_URL)
//   pnpm ingest:dry    # validate + report only, no writes
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import {
  classifyFeedFile,
  feedDir,
  safeParsePicksFile,
  safeParseResultsFile,
  safeParseValuesFile,
  safeParseEloFile,
  type PicksFile,
  type ResultsFile,
  type ValuesFile,
  type EloFile,
} from "@bet/contract";
import { loadEnv } from "@bet/db/env";

loadEnv(); // pull DATABASE_URL from apps/web/.env.local so scheduled runs have creds
const DRY = process.argv.includes("--dry") || !process.env.DATABASE_URL;

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    if (entry === "_schema" || entry === "_examples" || entry === "node_modules" || entry === "simulator") continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...walk(full));
    else if (entry.endsWith(".json")) out.push(full);
  }
  return out;
}

async function main() {
  const root = feedDir();
  console.log(`Scanning feed: ${root}`);
  let files: string[];
  try {
    files = walk(root);
  } catch {
    console.error(`Feed directory not found: ${root}. Set FEED_DIR or run 'pnpm contract:examples' first.`);
    process.exit(1);
  }

  const picks: PicksFile[] = [];
  const results: ResultsFile[] = [];
  const values: ValuesFile[] = [];
  const elos: EloFile[] = [];
  const problems: string[] = [];

  for (const file of files) {
    const rel = relative(root, file);
    let json: unknown;
    try {
      json = JSON.parse(readFileSync(file, "utf8"));
    } catch (e) {
      problems.push(`${rel}: invalid JSON (${(e as Error).message})`);
      continue;
    }
    const kind = classifyFeedFile(json);
    if (kind === "picks") {
      const r = safeParsePicksFile(json);
      if (r.ok && r.data) picks.push(r.data);
      else problems.push(`${rel}: ${(r.errors ?? []).join("; ")}`);
    } else if (kind === "results") {
      const r = safeParseResultsFile(json);
      if (r.ok && r.data) results.push(r.data);
      else problems.push(`${rel}: ${(r.errors ?? []).join("; ")}`);
    } else if (kind === "values") {
      const r = safeParseValuesFile(json);
      if (r.ok && r.data) values.push(r.data);
      else problems.push(`${rel}: ${(r.errors ?? []).join("; ")}`);
    } else if (kind === "elo") {
      const r = safeParseEloFile(json);
      if (r.ok && r.data) elos.push(r.data);
      else problems.push(`${rel}: ${(r.errors ?? []).join("; ")}`);
    } else {
      problems.push(`${rel}: unrecognized file (no 'bets', 'results', 'values', or 'ratings' key)`);
    }
  }

  const betCount = picks.reduce((n, p) => n + p.bets.length, 0);
  const gradeCount = results.reduce((n, r) => n + r.results.length, 0);
  const valuePlayCount = values.reduce((n, v) => n + v.values.length, 0);
  const eloPlayerCount = elos.reduce((n, e) => n + e.ratings.length, 0);
  console.log(`\nValidated: ${picks.length} picks files (${betCount} bets), ${results.length} results files (${gradeCount} grades), ${values.length} values files (${valuePlayCount} plays), ${elos.length} elo files (${eloPlayerCount} players)`);
  if (problems.length) {
    console.log(`\nRejected ${problems.length} file(s):`);
    for (const p of problems) console.log(`  ✗ ${p}`);
  }

  if (DRY) {
    console.log(`\n[dry run] no database writes.${!process.env.DATABASE_URL ? " (DATABASE_URL not set)" : ""}`);
    return;
  }

  const { upsertPicksFile, upsertResultsFile, upsertValuesFile, upsertEloFile, openDb } = await import("@bet/db");
  const handle = openDb(process.env.DATABASE_URL!);
  const reconcile = process.argv.includes("--reconcile");
  if (reconcile) console.log("reconcile ON: withdrawn (ungraded, no longer in file) bets will be removed.");
  for (const p of picks) await upsertPicksFile(handle.db, p, { reconcile });
  for (const r of results) await upsertResultsFile(handle.db, r);
  // Apply oldest-first so that when a legacy values_<date>.json and a newer
  // values_<date>_<site>.json collapse to the same (source,sport,site,date,label)
  // key, the newer file is upserted last and wins — independent of walk order.
  for (const v of [...values].sort((a, b) => (a.generated_at < b.generated_at ? -1 : 1))) await upsertValuesFile(handle.db, v);
  for (const e of elos) await upsertEloFile(handle.db, e);

  // DFS ENGINE's self-contained interactive simulator: upload the ~3.4MB HTML blob
  // only when it changed (by meta.json `updated`, else the file's mtime), so we don't
  // rewrite it to the DB on every 10-minute run. Served at /simulator behind auth.
  const { upsertAsset, loadAssetUpdated } = await import("@bet/db");
  const simHtmlPath = join(root, "dfs-engine", "simulator", "dashboard.html");
  try {
    let updated = statSync(simHtmlPath).mtime;
    try {
      const meta = JSON.parse(readFileSync(join(root, "dfs-engine", "simulator", "meta.json"), "utf8")) as { updated?: string };
      const d = meta.updated ? new Date(meta.updated) : null;
      if (d && !isNaN(d.getTime())) updated = d;
    } catch {
      /* meta.json optional — fall back to file mtime */
    }
    const stored = await loadAssetUpdated(handle.db, "dfs-simulator");
    if (!stored || Math.floor(new Date(stored).getTime() / 1000) !== Math.floor(updated.getTime() / 1000)) {
      const html = readFileSync(simHtmlPath, "utf8");
      await upsertAsset(handle.db, "dfs-simulator", html, updated);
      console.log(`Uploaded simulator HTML (${(html.length / 1024 / 1024).toFixed(1)} MB, updated ${updated.toISOString()}).`);
    } else {
      console.log("Simulator HTML unchanged — skipped.");
    }
  } catch {
    console.log("No simulator dashboard.html found — skipped.");
  }

  await handle.close();
  console.log(`\nUpserted ${picks.length} picks files, ${results.length} results files, ${values.length} values files, ${elos.length} elo files.`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
