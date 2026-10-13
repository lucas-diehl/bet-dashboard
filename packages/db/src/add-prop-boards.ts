// Additive migration: create the prop_boards table used by the /touchdowns tab.
//
// Written as explicit CREATE TABLE IF NOT EXISTS rather than `drizzle-kit push`
// because push diffs the whole schema and can propose destructive changes
// against a live database. This only ever adds, and is safe to re-run.
import postgres from "postgres";

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL not set");
  process.exit(1);
}

const sql = postgres(url, { max: 1 });

try {
  await sql`
    CREATE TABLE IF NOT EXISTS prop_boards (
      id            serial PRIMARY KEY,
      source        text NOT NULL,
      sport         text NOT NULL,
      market        text NOT NULL,
      slate_date    date NOT NULL,
      generated_at  timestamptz,
      mode          text,
      event_context text,
      notes         text,
      payload       text NOT NULL,
      updated_at    timestamptz NOT NULL DEFAULT now()
    )
  `;
  await sql`
    CREATE UNIQUE INDEX IF NOT EXISTS prop_boards_natural_key
      ON prop_boards (source, sport, market, slate_date)
  `;
  const [{ count }] = await sql<{ count: string }[]>`
    SELECT count(*)::text AS count FROM prop_boards
  `;
  console.log(`prop_boards ready (${count} existing row(s)).`);
} catch (e) {
  console.error("failed:", (e as Error).message);
  process.exitCode = 1;
} finally {
  await sql.end();
}
