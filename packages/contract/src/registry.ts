// Canonical registries shared by every model, the ingest layer, and the UI.
// These are intentionally data (not enums baked into the schema) so new sports /
// sources can be added without a breaking contract change. The schema validates
// `sport` and `source` as strings; unknown values still ingest and render with a
// neutral fallback style — they just won't get a custom label/color until added here.

export type SportKey =
  | "cbb" | "nba" | "pga" | "cfb" | "wnba" | "tennis" | "nfl" | "ncaaf" | "mm";

export interface SportMeta {
  key: string;
  label: string;   // short display label
  full: string;    // full name
  hue: number;     // 0-360, used by the UI to derive an accent color
  emoji: string;
}

// hue values are spaced around the wheel so sports stay visually distinct.
export const SPORTS: Record<string, SportMeta> = {
  cbb:    { key: "cbb",    label: "CBB",    full: "College Basketball", hue: 28,  emoji: "🏀" },
  nba:    { key: "nba",    label: "NBA",    full: "NBA",                hue: 12,  emoji: "🏀" },
  pga:    { key: "pga",    label: "PGA",    full: "PGA Tour",           hue: 140, emoji: "⛳" },
  cfb:    { key: "cfb",    label: "CFB",    full: "College Football",   hue: 255, emoji: "🏈" },
  wnba:   { key: "wnba",   label: "WNBA",   full: "WNBA",               hue: 320, emoji: "🏀" },
  tennis: { key: "tennis", label: "Tennis", full: "Tennis",            hue: 80,  emoji: "🎾" },
  nfl:    { key: "nfl",    label: "NFL",    full: "NFL",                hue: 210, emoji: "🏈" },
  ncaaf:  { key: "ncaaf",  label: "NCAAF",  full: "College Football",   hue: 270, emoji: "🏈" },
  mm:     { key: "mm",     label: "MM",     full: "March Madness",      hue: 45,  emoji: "🏆" },
};

export function sportMeta(key: string): SportMeta {
  return SPORTS[key] ?? { key, label: key.toUpperCase(), full: key, hue: 200, emoji: "🎯" };
}

export function isKnownSport(key: string): boolean {
  return key in SPORTS;
}

// The model projects that feed the dashboard. Used for the source registry / status
// view. `source` in the contract is a free string; this is the display registry.
export interface SourceMeta {
  key: string;
  label: string;
  sports: string[];   // sports this project is expected to report
  note?: string;
}

export const SOURCES: Record<string, SourceMeta> = {
  "bet-screen":    { key: "bet-screen",    label: "Bet Screen",    sports: ["cbb", "nba"] },
  "golf-modeling": { key: "golf-modeling", label: "Golf Modeling", sports: ["pga"] },
  "cfb-modeling":  { key: "cfb-modeling",  label: "CFB Modeling",  sports: ["cfb"] },
  "dfs-engine":    { key: "dfs-engine",    label: "DFS Engine",    sports: ["pga", "wnba", "tennis", "nfl"] },
  "kp-mm":         { key: "kp-mm",         label: "KenPom / MM",   sports: ["cbb", "mm"] },
  "nfl-modeling":  { key: "nfl-modeling",  label: "NFL Modeling",  sports: ["nfl"] },
  "ev-model":      { key: "ev-model",      label: "EV Model",      sports: ["nba", "nfl", "cfb"], note: "Sportsbook +EV / CLV finder" },
};

export function sourceMeta(key: string): SourceMeta {
  return SOURCES[key] ?? { key, label: key, sports: [] };
}

// Canonical bet-market categories. Drives grouping + coloring in the UI. Models
// should map their native market to one of these; anything unusual can use "other"
// plus a human `market_label` on the bet.
export const MARKETS = [
  "spread",
  "total",
  "moneyline",
  "team_total",
  "first_half_spread",
  "first_half_total",
  "prop",
  "outright_win",
  "outright_top5",
  "outright_top10",
  "outright_top20",
  "matchup",
  "dfs_lineup",
  "other",
] as const;

export type MarketKey = (typeof MARKETS)[number];

// The only sportsbooks in use. Every pick must be listed on one of these, and the
// bet's `book` must be exactly one of these strings.
export const BOOKS = ["FanDuel", "DraftKings", "bet365"] as const;
export type Book = (typeof BOOKS)[number];

export const MARKET_LABELS: Record<string, string> = {
  spread: "Spread",
  total: "Total",
  moneyline: "Moneyline",
  team_total: "Team Total",
  first_half_spread: "1H Spread",
  first_half_total: "1H Total",
  prop: "Prop",
  outright_win: "Outright",
  outright_top5: "Top 5",
  outright_top10: "Top 10",
  outright_top20: "Top 20",
  // aliases some model agents emit for golf outrights
  win: "Win",
  outright: "Outright",
  top_5: "Top 5",
  top_10: "Top 10",
  top_20: "Top 20",
  matchup: "Matchup",
  dfs_lineup: "DFS Lineup",
  other: "Other",
};

// A full-tournament golf outright (win / top-5 / top-10 / top-20) — as opposed to a
// round-by-round matchup, which is legitimately placed during the tournament.
export function isGolfOutrightMarket(market: string, tags?: string[]): boolean {
  if (tags?.includes("outright")) return true;
  return /^outright/.test(market) || /^top[_]?\d/.test(market) || market === "win";
}

// A PGA outright that was NOT frozen before the tournament started. Outrights must be
// locked in pre-tournament: the field is "frozen before the tournament starts" (first
// tee on the slate/first-round date), so a legit one is first generated STRICTLY
// BEFORE the slate date. `details.first_seen >= slate_date` marks anything first seen
// on the start day or later (a mid-tournament leak, e.g. a top-10 priced once Round 1
// is underway). These must not be graded, logged, or counted. Round-by-round matchups
// are unaffected. Returns false when first_seen is unknown.
export function isLatePgaOutright(args: {
  sport?: string;
  market: string;
  tags?: string[];
  details?: Record<string, unknown> | null;
  slate_date: string;
}): boolean {
  if (args.sport !== "pga") return false;
  if (!isGolfOutrightMarket(args.market, args.tags)) return false;
  const firstSeen = args.details?.first_seen;
  return typeof firstSeen === "string" && firstSeen >= args.slate_date;
}
