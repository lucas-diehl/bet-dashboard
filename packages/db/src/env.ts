import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

// Single source of truth for secrets: load DATABASE_URL / FEED_DIR / DATA_SOURCE from
// apps/web/.env.local into process.env (without overriding anything already set), so
// ingest / drizzle-kit push / seed all use the same values the web app does — including
// when ingest runs unattended from a Windows scheduled task.
export function loadEnv(): void {
  const here = dirname(fileURLToPath(import.meta.url)); // packages/db/src
  const root = resolve(here, "..", "..", ".."); // repo root
  const file = resolve(root, "apps", "web", ".env.local");
  if (!existsSync(file)) return;
  for (const line of readFileSync(file, "utf8").split(/\r?\n/)) {
    if (/^\s*#/.test(line) || !line.includes("=")) continue;
    const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
    if (!m) continue;
    const [, key, rawVal] = m;
    if (process.env[key] == null) process.env[key] = rawVal.trim().replace(/^["']|["']$/g, "");
  }
}
