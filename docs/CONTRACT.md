# The Picks Contract (v1.0)

This is the **only** thing a model needs to produce to appear on the dashboard.
Write a JSON file per sport per day into the shared feed folder; the ingest job
does the rest. Nothing about your model's internals matters here.

- **Feed folder:** `C:\Users\ljdie\OneDrive\Documents\dashboard_feed\`
- **Machine-readable schema:** `dashboard_feed\_schema\picks.schema.json` and
  `results.schema.json` (generated from the code — the source of truth).
- **Worked examples:** `dashboard_feed\_examples\` (one per market shape).
- **Validate what you wrote:** `pnpm ingest:dry` prints every file it accepts or
  rejects, with the exact reason.

There are two file types.

---

## 1. `picks_<date>.json` — what to bet

One file per **source + sport + date**, written when the model produces its board.

**Path:** `dashboard_feed\<source>\<sport>\picks_<YYYY-MM-DD>.json`
e.g. `dashboard_feed\golf-modeling\pga\picks_2026-07-22.json`

### File fields

| field | required | type | notes |
|---|---|---|---|
| `contract_version` | ✓ | string | `"1.0"` |
| `source` | ✓ | string | your project key — see registry below |
| `sport` | ✓ | string | canonical sport key — see below |
| `slate_date` | ✓ | `YYYY-MM-DD` | the betting day |
| `generated_at` | ✓ | ISO-8601 | timestamp with offset, e.g. `2026-07-22T13:05:00Z` |
| `mode` | ✓ | `LIVE` \| `PAPER` | `PAPER` while the model is still on its go/no-go gate |
| `model_version` | | string | free-form build id, for provenance |
| `event_context` | | string | slate/tournament label (e.g. the event name) |
| `notes` | | string | short note shown on the Sources card |
| `bets` | ✓ | array | may be empty — an empty array is a valid "no plays today" |

### Bet fields

Required per bet: **`bet_id`, `market`, `selection`, `odds_american`, `stake_units`.**
Everything else is optional — adopt incrementally.

| field | required | type | notes |
|---|---|---|---|
| `bet_id` | ✓ | string | **stable, unique per source.** Grading joins on this — keep it identical in the results file. Suggested: `<source>-<date>-<slug>`. |
| `market` | ✓ | string | canonical market category (below) |
| `selection` | ✓ | string | team / player / "Over" — what you're backing |
| `odds_american` | ✓ | int | e.g. `-110`, `+650`. Use `0` for DFS lineups (no odds). |
| `stake_units` | ✓ | number | recommended stake; `1` = your standard bet. `0` = informational. |
| `event` | | string | matchup / event label |
| `event_start` | | ISO-8601 \| null | scheduled start |
| `market_label` | | string | human label, required when `market` is `"other"` |
| `side` | | enum | `over`\|`under`\|`home`\|`away`\|`yes`\|`no` |
| `line` | | number \| null | spread / total number; null for ML / outrights |
| `book` | ✓ | string | sportsbook the price is from — must be exactly **`"FanDuel"`** or **`"DraftKings"`** (the only two books in use) |
| `model_prob` | | 0–1 | **strongly recommended** — powers win-rate / calibration |
| `market_prob` | | 0–1 | de-vigged market prob, if you compute it |
| `edge` | | number | usually `model_prob − market_prob` |
| `ev_pct` | | number | EV as a fraction of stake (`0.08` = +8%) |
| `confidence` | | enum | `low`\|`medium`\|`high` |
| `tier` | | number \| string | your own tier/rank bucket |
| `tags` | | string[] | free filters, e.g. `["longshot","1H"]` |
| `details` | | object | free-form extras rendered as-is (DFS lineup, SG splits, …) |

### Canonical keys

**Sports:** `cbb` `nba` `pga` `cfb` `wnba` `tennis` `nfl` `ncaaf` `mm`
(new ones are fine — they render with a neutral style until added to the registry).

**Markets:** `spread` `total` `moneyline` `team_total` `first_half_spread`
`first_half_total` `prop` `outright_win` `outright_top5` `outright_top10`
`outright_top20` `matchup` `dfs_lineup` `other`

**Books:** `FanDuel` `DraftKings` — the only two allowed. Every pick must be a line
offered on one of these, and `book` must be exactly one of those two strings. Take
the better of the two prices for the selection and record which book it came from.

**DFS:** represent each contest entry as one bet with `market: "dfs_lineup"`,
`odds_american: 0`, `stake_units` = normalized entry fee, and put the lineup in
`details`: `{ entry_fee, salary, proj, avg_own, players: [{name,pos,salary,proj,own}] }`.

---

## 2. `results_<date>.json` — how the bets did

Emitted once outcomes settle. Joins to the picks file by `bet_id`.

**Path:** `dashboard_feed\<source>\<sport>\results_<YYYY-MM-DD>.json`

| field | required | notes |
|---|---|---|
| `contract_version`, `source`, `sport`, `slate_date` | ✓ | must match the picks file |
| `graded_at` | ✓ | ISO-8601 timestamp |
| `results[]` | ✓ | one entry per graded bet |
| `results[].bet_id` | ✓ | must match a `bet_id` from the picks file |
| `results[].result` | ✓ | `win`\|`loss`\|`push`\|`void`\|`pending` |
| `results[].closing_odds_american` | | closing line, for CLV |
| `results[].clv_pct` | | CLV as a fraction, if you compute it |
| `results[].pnl_units` | | realized units. **If omitted, the dashboard derives it** from result + odds + stake. |
| `results[].actual` | | free-form (final score, finish, fantasy points) |

---

## Writing it from R (`jsonlite`)

```r
library(jsonlite)

picks <- list(
  contract_version = "1.0",
  source = "golf-modeling",
  sport  = "pga",
  slate_date   = format(Sys.Date(), "%Y-%m-%d"),
  generated_at = format(as.POSIXct(Sys.time(), tz = "UTC"), "%Y-%m-%dT%H:%M:%SZ"),
  mode = "PAPER",
  event_context = "Rocket Mortgage Classic",
  bets = list(
    list(
      bet_id = "golf-2026-07-22-scheffler-win",
      event = "Rocket Mortgage Classic",
      market = "outright_win",
      selection = "Scottie Scheffler",
      odds_american = 650L,
      book = "DraftKings",
      model_prob = 0.18,
      edge = 0.047,
      ev_pct = 0.31,
      stake_units = 0.5,
      confidence = "medium"
    )
  )
)

dir <- file.path(Sys.getenv("FEED_DIR",
  "C:/Users/ljdie/OneDrive/Documents/dashboard_feed"),
  "golf-modeling", "pga")
dir.create(dir, recursive = TRUE, showWarnings = FALSE)
write_json(picks, file.path(dir, sprintf("picks_%s.json", picks$slate_date)),
           auto_unbox = TRUE, pretty = TRUE, null = "null")
```

Notes for R authors:
- `auto_unbox = TRUE` so scalars aren't wrapped in arrays (but keep `bets` a `list()`
  so it always serializes as a JSON array — even with one bet).
- Use `null = "null"` and `NULL` (not `NA`) for absent optional values.
- An empty board is `bets = list()` — still write the file; it records "no plays".
- After writing, run `pnpm ingest:dry` to confirm it validates.

---

## Where each existing project plugs in (starting map)

This is the later, per-folder step — a first sketch of what each model should emit.

| source | sports | maps from | notes |
|---|---|---|---|
| `bet-screen` | `cbb`, `nba` | `cbb_predictions_today_v1_with_mc.csv`, `nba_predictions_today_v1.csv` | has market lines + win/cover probs already; mode currently `PAPER` per its README |
| `golf-modeling` | `pga` | `golf_picks/picks_<date>.csv` | already has `model_prob, market_prob, edge, ev, units` — near 1:1; `PAPER` until CLV gate passes |
| `cfb-modeling` | `cfb` | `weekly_picks_<season>_wk<n>.csv` | weekly cadence; pick files already carry outcome columns → easy results file |
| `dfs-engine` | `pga`,`wnba`,`tennis`,`nfl` | `spine\R\dashboard.R` JSON + DuckDB tables | already emits nearly this shape; adapter is mostly a field re-map |
| `kp-mm` | `cbb`,`mm` | `march_madness_v5_2026.csv` | tournament bracket probabilities |
| `ev-model` | `nba`,`nfl`,`cfb` | its Postgres `+EV` rows | fold in as a sportsbook line-shopping source |
