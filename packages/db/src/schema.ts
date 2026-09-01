import { boolean, date, doublePrecision, index, integer, jsonb, pgTable, serial, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";

// Real Postgres/Supabase schema. The demo runs entirely on the in-memory mock
// (see mock.ts); this schema + seed.ts are used once a Supabase URL is wired up.

export const sources = pgTable("sources", {
  key: text("key").primaryKey(),
  label: text("label").notNull(),
  note: text("note"),
});

export const slates = pgTable(
  "slates",
  {
    id: serial("id").primaryKey(),
    source: text("source").notNull(),
    sport: text("sport").notNull(),
    slateDate: date("slate_date").notNull(),
    generatedAt: timestamp("generated_at", { withTimezone: true }).notNull(),
    modelVersion: text("model_version"),
    mode: text("mode").notNull(), // LIVE | PAPER
    eventContext: text("event_context"),
    notes: text("notes"),
    uploadedAt: timestamp("uploaded_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({ uniq: uniqueIndex("slates_natural_key").on(t.source, t.sport, t.slateDate) }),
);

export const bets = pgTable(
  "bets",
  {
    id: serial("id").primaryKey(),
    slateId: integer("slate_id")
      .notNull()
      .references(() => slates.id, { onDelete: "cascade" }),
    betId: text("bet_id").notNull(), // stable id from the model (join key for grading)
    source: text("source").notNull(),
    sport: text("sport").notNull(),
    slateDate: date("slate_date").notNull(),
    mode: text("mode").notNull(),
    event: text("event"),
    eventStart: timestamp("event_start", { withTimezone: true }),
    market: text("market").notNull(),
    marketLabel: text("market_label"),
    selection: text("selection").notNull(),
    side: text("side"),
    line: doublePrecision("line"),
    oddsAmerican: integer("odds_american").notNull(),
    book: text("book"),
    modelProb: doublePrecision("model_prob"),
    marketProb: doublePrecision("market_prob"),
    edge: doublePrecision("edge"),
    evPct: doublePrecision("ev_pct"),
    stakeUnits: doublePrecision("stake_units").notNull(),
    confidence: text("confidence"),
    tier: text("tier"),
    tags: jsonb("tags").$type<string[]>(),
    details: jsonb("details").$type<Record<string, unknown>>(),
  },
  (t) => ({ uniq: uniqueIndex("bets_source_betid").on(t.source, t.betId) }),
);

export const results = pgTable(
  "results",
  {
    id: serial("id").primaryKey(),
    betPk: integer("bet_pk")
      .notNull()
      .references(() => bets.id, { onDelete: "cascade" }),
    source: text("source").notNull(),
    betId: text("bet_id").notNull(),
    result: text("result").notNull(), // win | loss | push | void | pending
    closingOddsAmerican: integer("closing_odds_american"),
    clvPct: doublePrecision("clv_pct"),
    pnlUnits: doublePrecision("pnl_units"),
    cashed: boolean("cashed"),
    gradedAt: timestamp("graded_at", { withTimezone: true }),
    actual: jsonb("actual").$type<Record<string, unknown>>(),
  },
  (t) => ({ uniq: uniqueIndex("results_source_betid").on(t.source, t.betId) }),
);

// DFS value plays — display-only, one row per value item. Flat/denormalized so the
// /dfs page can query by sport and reconstruct a slate's list. A slate is replaced
// wholesale on ingest (delete rows for source+sport+slate_date+slate_label, re-insert).
export const dfsValues = pgTable(
  "dfs_values",
  {
    id: serial("id").primaryKey(),
    source: text("source").notNull(),
    sport: text("sport").notNull(),
    slateDate: date("slate_date").notNull(),
    site: text("site"),
    slateLabel: text("slate_label"),
    slateType: text("slate_type"), // 'single_round' = round-specific golf slate; else full tournament
    round: integer("round"),
    roundLabel: text("round_label"),
    event: text("event"),
    generatedAt: timestamp("generated_at", { withTimezone: true }),
    rank: integer("rank"),
    name: text("name").notNull(),
    team: text("team"),
    position: text("position"),
    salary: integer("salary").notNull(),
    proj: doublePrecision("proj").notNull(),
    value: doublePrecision("value").notNull(),
    ceiling: doublePrecision("ceiling"),
    ownership: doublePrecision("ownership"),
    exposure: doublePrecision("exposure"),
    note: text("note"),
  },
  (t) => ({ slateIdx: index("dfs_values_slate").on(t.source, t.sport, t.slateDate, t.slateLabel) }),
);

// Player Elo ratings — display-only (Extras tab), one row per player. A snapshot is
// replaced wholesale on ingest (delete rows for source+sport, re-insert).
export const eloRatings = pgTable(
  "elo_ratings",
  {
    id: serial("id").primaryKey(),
    source: text("source").notNull(),
    sport: text("sport").notNull(),
    generatedAt: timestamp("generated_at", { withTimezone: true }),
    rank: integer("rank"),
    name: text("name").notNull(),
    elo: doublePrecision("elo").notNull(),
    change: doublePrecision("change"),
  },
  (t) => ({ idx: index("elo_source_sport").on(t.source, t.sport) }),
);

// Large opaque blobs the site serves as-is (e.g. the DFS ENGINE's self-contained
// interactive simulator HTML). One row per key; replaced wholesale when `updated`
// changes. Kept out of the feed→dataset path — served directly by its own route.
export const assets = pgTable("assets", {
  key: text("key").primaryKey(),
  content: text("content").notNull(),
  updated: timestamp("updated", { withTimezone: true }),
  uploadedAt: timestamp("uploaded_at", { withTimezone: true }).defaultNow().notNull(),
});

// SaberSim-style simulation pools for the browser DFS optimizer — one row per slate
// holding the whole build_sim_payload() JSON (players + draws + fgrid + cands). Keyed
// by source/sport/site/slate_date/slate_type/round; replaced wholesale on ingest.
export const dfsPools = pgTable(
  "dfs_pools",
  {
    id: serial("id").primaryKey(),
    source: text("source").notNull(),
    sport: text("sport").notNull(),
    site: text("site").notNull(),
    slateDate: date("slate_date").notNull(),
    slateLabel: text("slate_label"),
    slateType: text("slate_type"),
    round: integer("round"),
    event: text("event"),
    payload: text("payload").notNull(), // the full pool JSON
    generatedAt: timestamp("generated_at", { withTimezone: true }),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({ idx: index("dfs_pools_slate").on(t.source, t.sport, t.site, t.slateDate) }),
);

export type SlateInsert = typeof slates.$inferInsert;
export type BetInsert = typeof bets.$inferInsert;
export type ResultInsert = typeof results.$inferInsert;
