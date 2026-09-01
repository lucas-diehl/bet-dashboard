import "server-only";
import { feedDir, safeParsePoolFile } from "@bet/contract";
import type { PoolMeta } from "@bet/db/queries";

// DFS optimizer pools: read from Postgres on a cloud deploy (DATA_SOURCE=supabase),
// else from the feed folder (local). Metadata (loadPoolIndex) is cheap and drives the
// selectors; the large payload (loadPoolPayload) is fetched only for the chosen slate.

async function fromFeed(): Promise<{ meta: PoolMeta[]; payloads: Map<number, string> }> {
  const meta: PoolMeta[] = [];
  const payloads = new Map<number, string>();
  const { readdirSync, readFileSync } = await import("node:fs");
  const { join } = await import("node:path");
  const dir = join(feedDir(), "dfs-engine", "pools");
  let files: string[] = [];
  try {
    files = readdirSync(dir).filter((f) => f.startsWith("pool_") && f.endsWith(".json")).sort();
  } catch {
    return { meta, payloads };
  }
  files.forEach((f, i) => {
    try {
      const raw = readFileSync(join(dir, f), "utf8");
      const r = safeParsePoolFile(JSON.parse(raw));
      if (r.ok && r.data) {
        const p = r.data;
        meta.push({
          id: i, source: p.source, sport: p.sport, site: p.site, slate_date: p.slate_date,
          slate_label: p.slate_label, slate_type: p.slate_type, round: p.round, event: p.event,
          generated_at: p.generated_at,
        });
        payloads.set(i, raw);
      }
    } catch {
      /* skip bad file */
    }
  });
  return { meta, payloads };
}

export async function loadPoolIndex(): Promise<PoolMeta[]> {
  const source = process.env.DATA_SOURCE ?? "mock";
  if (source === "supabase" && process.env.DATABASE_URL) {
    const [{ openDb }, { loadPoolIndex: q }] = await Promise.all([import("@bet/db/upsert"), import("@bet/db/queries")]);
    const h = openDb(process.env.DATABASE_URL);
    try {
      return await q(h.db);
    } finally {
      await h.close();
    }
  }
  return (await fromFeed()).meta;
}

export async function loadPoolPayload(id: number): Promise<string | null> {
  const source = process.env.DATA_SOURCE ?? "mock";
  if (source === "supabase" && process.env.DATABASE_URL) {
    const [{ openDb }, { loadPoolPayload: q }] = await Promise.all([import("@bet/db/upsert"), import("@bet/db/queries")]);
    const h = openDb(process.env.DATABASE_URL);
    try {
      return await q(h.db, id);
    } finally {
      await h.close();
    }
  }
  return (await fromFeed()).payloads.get(id) ?? null;
}
