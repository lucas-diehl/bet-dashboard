import { z } from "zod";

// ---------------------------------------------------------------------------
// Bet Dashboard picks contract, v1.0
//
// This is THE interface between every model project and the dashboard. A model
// writes a `picks_<date>.json` file (validated by PicksFileSchema) and, once
// outcomes settle, a `results_<date>.json` file (ResultsFileSchema). Nothing
// else about a project's internals matters to the site.
//
// Field-level `.describe()` text is exported into the JSON Schema so this file
// is the single source of truth for the "directions" each folder's agent follows.
// ---------------------------------------------------------------------------

export const CONTRACT_VERSION = "1.0" as const;

const isoDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "must be YYYY-MM-DD")
  .describe("Calendar day this slate is for, YYYY-MM-DD (local betting day).");

// Timestamps are validated leniently (any non-empty string) to keep adoption
// easy, but models SHOULD emit ISO-8601 with an offset, e.g. 2026-07-22T13:05:00Z
// or 2026-07-22T09:05:00-04:00, so sorting by time is reliable.
const timestamp = z
  .string()
  .min(1)
  .describe("ISO-8601 timestamp with offset, e.g. 2026-07-22T13:05:00Z.");

export const ModeSchema = z
  .enum(["LIVE", "PAPER"])
  .describe(
    "LIVE = real money / validated edge. PAPER = tracked but not staked (model still on its go/no-go gate). Surfaced as a badge in the UI.",
  );

export const ConfidenceSchema = z
  .enum(["low", "medium", "high"])
  .describe("Coarse confidence bucket for quick visual sorting.");

export const SideSchema = z
  .enum(["over", "under", "home", "away", "yes", "no"])
  .describe("Directional side where the market has one (totals, spreads, props).");

export const ResultSchema = z
  .enum(["win", "loss", "push", "void", "pending"])
  .describe("Graded outcome of the bet. `pending` = not yet settled.");

// ---------------------------------------------------------------------------
// A single recommended bet.
// Required: bet_id, market, selection, odds_american, stake_units.
// Everything else is optional so projects can adopt incrementally.
// ---------------------------------------------------------------------------
export const BetSchema = z
  .object({
    bet_id: z
      .string()
      .min(1)
      .describe(
        "Stable, unique-per-source id. Grading joins on this, so it MUST stay identical between the picks file and the later results file. Suggested: <source>-<date>-<slug>.",
      ),
    sport: z
      .string()
      .optional()
      .describe("Canonical sport key (cbb, nba, pga, ...). Defaults to the file-level sport if omitted."),
    event: z
      .string()
      .optional()
      .describe("Human label for the game/event/tournament, e.g. 'Duke @ UNC' or 'Rocket Mortgage Classic'."),
    event_start: timestamp.nullable().optional().describe("Scheduled start of the event; null if unknown."),
    market: z
      .string()
      .min(1)
      .describe("Canonical market category (see MARKETS): spread | total | moneyline | outright_win | dfs_lineup | ..."),
    market_label: z
      .string()
      .optional()
      .describe("Human market label, required when market is 'other' or needs detail (e.g. 'First basket')."),
    selection: z
      .string()
      .min(1)
      .describe("What you are backing: team, player, 'Over', etc."),
    side: SideSchema.nullable().optional(),
    line: z
      .number()
      .nullable()
      .optional()
      .describe("Point spread or total number where applicable; null for moneyline/outrights."),
    odds_american: z
      .number()
      .int()
      .describe("American odds for this price, e.g. -110, +650. Required for P&L math."),
    book: z
      .string()
      .optional()
      .describe("Sportsbook the price is from. REQUIRED, and must be one of \"FanDuel\", \"DraftKings\", or \"bet365\" — the books in use."),
    model_prob: z
      .number()
      .min(0)
      .max(1)
      .nullable()
      .optional()
      .describe("Model's win probability (0-1). Strongly recommended — needed for calibration/accuracy views."),
    market_prob: z
      .number()
      .min(0)
      .max(1)
      .nullable()
      .optional()
      .describe("De-vigged market-implied probability (0-1), if you compute it."),
    edge: z.number().nullable().optional().describe("Model edge, typically model_prob - market_prob."),
    ev_pct: z.number().nullable().optional().describe("Expected value as a fraction of stake, e.g. 0.08 = +8% EV."),
    stake_units: z
      .number()
      .min(0)
      .describe("Recommended stake in units (1 unit = your standard bet). 0 = informational / no-bet."),
    confidence: ConfidenceSchema.optional(),
    tier: z
      .union([z.number(), z.string()])
      .optional()
      .describe("Optional model tier / rank if you bucket plays."),
    tags: z.array(z.string()).optional().describe("Free-form tags for filtering, e.g. ['longshot','1H']."),
    details: z
      .record(z.unknown())
      .optional()
      .describe("Free-form sport-specific extras (DFS lineup players, SG splits, etc.). Rendered as-is in the bet detail."),
  })
  .describe("A single recommended bet.");

export type Bet = z.infer<typeof BetSchema>;

// ---------------------------------------------------------------------------
// picks_<date>.json — one file per (source, sport, date).
// ---------------------------------------------------------------------------
export const PicksFileSchema = z
  .object({
    contract_version: z.string().describe("Contract version this file targets, e.g. '1.0'."),
    source: z.string().min(1).describe("Producing project key: bet-screen | golf-modeling | cfb-modeling | dfs-engine | kp-mm | ev-model."),
    sport: z.string().min(1).describe("Canonical sport key for this file."),
    slate_date: isoDate,
    generated_at: timestamp,
    model_version: z.string().optional().describe("Free-form model/build identifier for provenance."),
    mode: ModeSchema,
    event_context: z.string().optional().describe("Optional label for the whole slate, e.g. the tournament name."),
    notes: z.string().optional().describe("Optional free-text note shown on the source status card."),
    bets: z.array(BetSchema).describe("The recommended bets. May be empty (a valid 'no plays today' report)."),
  })
  .describe("A day's recommended bets from one model for one sport.");

export type PicksFile = z.infer<typeof PicksFileSchema>;

// ---------------------------------------------------------------------------
// results_<date>.json — grading, emitted once outcomes settle. Joins to bet_id.
// ---------------------------------------------------------------------------
export const GradeSchema = z
  .object({
    bet_id: z.string().min(1).describe("Must match the bet_id from the picks file."),
    result: ResultSchema,
    closing_odds_american: z
      .number()
      .int()
      .nullable()
      .optional()
      .describe("Closing line for this selection, for CLV. Optional but valuable."),
    clv_pct: z.number().nullable().optional().describe("Closing-line value as a fraction, if you compute it."),
    pnl_units: z
      .number()
      .nullable()
      .optional()
      .describe("Realized profit/loss in units. If omitted, the dashboard derives it from result + odds + stake_units."),
    actual: z.record(z.unknown()).optional().describe("Free-form actual outcome (final score, finish position, fantasy points)."),
  })
  .describe("Graded outcome for one previously-recommended bet.");

export type Grade = z.infer<typeof GradeSchema>;

export const ResultsFileSchema = z
  .object({
    contract_version: z.string(),
    source: z.string().min(1),
    sport: z.string().min(1),
    slate_date: isoDate,
    graded_at: timestamp,
    results: z.array(GradeSchema),
  })
  .describe("Grading update for a previously-emitted picks file.");

export type ResultsFile = z.infer<typeof ResultsFileSchema>;

// ---------------------------------------------------------------------------
// values_<date>.json — DFS value plays (display-only). A THIRD feed file type,
// alongside picks/results. One file per (source, sport, slate day). Read live by
// the /dfs page; never parsed as picks/results and never rejected by ingest.
// Unknown top-level / per-item fields are ignored (Zod strips them), not rejected.
// ---------------------------------------------------------------------------
export const ValueItemSchema = z
  .object({
    rank: z.number().int().optional().describe("1-based rank in value order; the page falls back to row order if omitted."),
    name: z.string().min(1).describe("Player name (required)."),
    team: z.string().optional().describe("Team abbreviation; may be empty/absent for golf & tennis."),
    position: z.string().optional().describe("Roster position; may be empty/absent for golf & tennis."),
    salary: z.number().int().describe("DK salary (required)."),
    proj: z.number().describe("Projected DK fantasy points (required)."),
    value: z.number().describe("Projected points per $1k salary (required) — the headline metric."),
    ceiling: z.number().optional().describe("Ceiling projection (optional)."),
    ownership: z.number().min(0).max(1).optional().describe("Projected FIELD ownership 0..1 (optional; omit if unknown)."),
    exposure: z
      .number()
      .min(0)
      .max(1)
      .optional()
      .describe("Optimizer exposure 0..1: share of the GPP optimizer's lineups that roster this player. The headline metric for the 'top optimizer plays' view."),
    note: z.string().optional().describe("Optional free-text note."),
  })
  .describe("One DFS play (value or optimizer-exposure).");

export type ValueItem = z.infer<typeof ValueItemSchema>;

export const ValuesFileSchema = z
  .object({
    contract_version: z.string(),
    source: z.string().min(1).describe("Producing project key — 'dfs-engine'."),
    sport: z.string().min(1).describe("DFS sport key: golf | wnba | tennis | nfl."),
    site: z.string().describe("DFS site, e.g. 'draftkings'."),
    slate_date: isoDate,
    slate_label: z.string().optional().describe("Slate label, e.g. 'Main', 'Afternoon'. Absent on single-round slates."),
    slate_type: z
      .string()
      .optional()
      .describe("'single_round' marks a round-specific golf slate rendered as its own 'Round N Simulator' panel; absent/other = full-tournament board. Never merge the two."),
    round: z.number().int().optional().describe("Round number 1-4 for single_round slates."),
    round_label: z.string().optional().describe("Panel header for a single_round slate, e.g. 'Round 1 (First-Round Leader)'."),
    event: z.string().optional().describe("Event/tournament name, e.g. 'BMW Championship' (single_round slates)."),
    generated_at: timestamp,
    values: z.array(ValueItemSchema).describe("Up to ~10 value plays, already sorted best value first. May be empty."),
  })
  .describe("A day's top DFS value plays for one sport (display-only). slate_type='single_round' is a distinct round slate.");

export type ValuesFile = z.infer<typeof ValuesFileSchema>;

// ---------------------------------------------------------------------------
// elo_<date>.json — player Elo ratings (display-only), shown on the Extras tab.
// A FOURTH feed file type, distinguished by its top-level `ratings` array. One
// file per (source, sport); each new emit REPLACES the prior snapshot for that
// (source, sport). Read live by the /extras page; never graded or staked.
// ---------------------------------------------------------------------------
export const EloRatingSchema = z
  .object({
    rank: z.number().int().optional().describe("1-based rank in Elo order; the page falls back to row order if omitted."),
    name: z.string().min(1).describe("Player name (required)."),
    elo: z.number().describe("Elo rating (required)."),
    change: z.number().optional().describe("Elo change since the previous update (optional; +/- points)."),
  })
  .describe("One player's Elo rating.");

export type EloRating = z.infer<typeof EloRatingSchema>;

export const EloFileSchema = z
  .object({
    contract_version: z.string(),
    source: z.string().min(1).describe("Producing project key, e.g. 'golf-modeling'."),
    sport: z.string().min(1).describe("Sport key these ratings are for, e.g. 'pga'."),
    generated_at: timestamp,
    ratings: z.array(EloRatingSchema).describe("Every player's Elo, best-rated first. Replaces the prior snapshot for this (source, sport)."),
  })
  .describe("A full Elo-rating snapshot for one sport's players (display-only, Extras tab).");

export type EloFile = z.infer<typeof EloFileSchema>;

// ---------------------------------------------------------------------------
// pool_<sport>_<date>_<site>.json — the SaberSim-style simulation payload the
// browser DFS optimizer consumes (from the DFS ENGINE's build_sim_payload). A
// FIFTH feed file type, distinguished by its top-level `draws` array. One file
// per (sport, site, slate). Large (draws = per-player simulated points), stored
// as a blob and read whole by the /dfs optimizer; not shown as picks/values.
// ---------------------------------------------------------------------------
export const PoolPlayerSchema = z
  .object({
    name: z.string().min(1),
    team: z.string().nullable().optional(),
    pos: z.string().optional().describe("Roster-eligible position (golf/tennis use a flat 'G'/'P')."),
    salary: z.number().int(),
    proj: z.number().describe("Projected mean fantasy points."),
    own: z.number().optional().describe("Projected field ownership 0..1."),
  })
  .describe("One player in the optimizer pool.");

export const PoolRosterSchema = z
  .object({
    n: z.number().int().nullable().optional().describe("Total roster slots."),
    cap: z.number().describe("Salary cap."),
    floor: z.number().optional().describe("Minimum salary spend."),
    slots: z.record(z.number()).nullable().optional().describe("Per-position slot minimums (team sports)."),
    flex: z.object({ positions: z.array(z.string()), count: z.number() }).nullable().optional().describe("FLEX slot config."),
    team_limit: z.number().nullable().optional(),
    max_per_game: z.number().nullable().optional(),
  })
  .describe("Roster construction rules for one site (salary cap, slots, flex, limits).");

export const PoolFileSchema = z
  .object({
    contract_version: z.string(),
    source: z.string().min(1).describe("Producing project key — 'dfs-engine'."),
    sport: z.string().min(1).describe("DFS sport key: golf | wnba | tennis | nfl."),
    site: z.string().describe("DFS site: draftkings | fanduel."),
    slate_date: isoDate,
    slate_label: z.string().optional(),
    slate_type: z.string().optional().describe("'single_round' for a round-specific golf slate."),
    round: z.number().int().optional(),
    event: z.string().optional(),
    generated_at: timestamp,
    // ---- build_sim_payload() output (SaberSim-style) ----
    k: z.number().int().describe("Number of down-sampled simulation columns."),
    field_size: z.number().int().optional(),
    qlevels: z.array(z.number()).describe("CDF quantile levels for the field-score grid."),
    roster: PoolRosterSchema,
    players: z.array(PoolPlayerSchema),
    draws: z.array(z.array(z.number())).describe("Per-player simulated points: P arrays of K ints (correlation baked in)."),
    fgrid: z.array(z.array(z.number())).describe("Field-score quantile grid: K arrays of Q ints."),
    gpp_mult: z.array(z.number()).describe("GPP payout multiplier vector by finish rank."),
    cash_mult: z.array(z.number()).describe("Cash/double-up payout multiplier vector."),
    cands: z.array(z.array(z.number().int())).describe("Candidate lineups as 0-based player-index arrays."),
    opt_k: z.number().int().optional().describe("Sim count the cand_metrics were graded on."),
    cand_metrics: z.array(z.record(z.unknown())).nullable().optional().describe("Per-candidate metrics (gppRoi, cash, top1, win, dupe, own, proj)."),
    contests: z.array(z.record(z.unknown())).optional().describe("Live contest options (name, fee, field, payout mult)."),
  })
  .describe("A SaberSim-style simulation pool for one DFS slate — the data feed for the browser optimizer.");

export type PoolFile = z.infer<typeof PoolFileSchema>;
export type PoolPlayer = z.infer<typeof PoolPlayerSchema>;
export type PoolRoster = z.infer<typeof PoolRosterSchema>;
