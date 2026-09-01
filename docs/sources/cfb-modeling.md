# College football feed spec — `cfb-modeling` → Bet Hub

**Audience:** the agent/script that runs in `cfb-modeling`.
**Job:** after the weekly model runs, write ONE JSON file of **ATS (spread) and
Totals (over/under) picks** into the shared feed folder. The dashboard reads it from
there — the rest of the CFB pipeline doesn't change.

> Golf-style, but for two markets. This is the CFB-specific version of the general
> contract in [`../CONTRACT.md`](../CONTRACT.md).

Your two candidate edges map cleanly:
- **Totals** → `market: "total"` (your UNDER-only asymmetry — `05_bet_slip.R`)
- **ATS** → `market: "spread"` (early-season 4th-down aggressiveness — `06_early_ats.R`)

Both stay `mode: "PAPER"` until they clear forward validation.

---

## Where + when to write

- **File:** `dashboard_feed\cfb-modeling\cfb\picks_<YYYY-MM-DD>.json`
- **Cadence:** weekly. Use the **game day as `slate_date`** — for a standard week
  that's the **Saturday** (`weekly_picks_2026_wk<n>.csv` → the Saturday date). If you
  also bet Thu/Fri games, write a separate file per game day; the dashboard groups
  by `slate_date`.
- Re-writing the same-dated file is fine — ingest upserts on `source` + `bet_id`.

---

## The picks file (copy this shape)

```json
{
  "contract_version": "1.0",
  "source": "cfb-modeling",
  "sport": "cfb",
  "slate_date": "2026-09-05",
  "generated_at": "2026-09-03T15:00:00Z",
  "model_version": "ppp-xgb-2026",
  "mode": "PAPER",
  "event_context": "Week 2",
  "notes": "UNDER-only totals + early-season 4th-down ATS. Forward-validating.",
  "bets": [
    {
      "bet_id": "cfb-modeling-2026-wk2-osu-tex-under",
      "event": "Ohio State @ Texas",
      "event_start": "2026-09-05T23:30:00Z",
      "market": "total",
      "selection": "Under 52.5",
      "side": "under",
      "line": 52.5,
      "odds_american": -110,
      "book": "DraftKings",
      "model_prob": 0.57,
      "market_prob": 0.524,
      "edge": 0.046,
      "ev_pct": 0.06,
      "stake_units": 1.0,
      "confidence": "medium",
      "tags": ["UNDER4"],
      "details": { "proj_total": 47.1, "strategy": "UNDER4" }
    },
    {
      "bet_id": "cfb-modeling-2026-wk2-app-ga-ats",
      "event": "Appalachian State @ Georgia",
      "event_start": "2026-09-05T19:30:00Z",
      "market": "spread",
      "selection": "Appalachian State",
      "side": "away",
      "line": 24.5,
      "odds_american": -105,
      "book": "FanDuel",
      "model_prob": 0.54,
      "stake_units": 0.5,
      "confidence": "low",
      "tags": ["early_ats"],
      "details": { "go_rate_pick": 0.71, "tier": "A" }
    }
  ]
}
```

### The two conventions (this is the important part)

**Totals (`market: "total"`)**
| field | value |
|---|---|
| `selection` | `"Under 52.5"` or `"Over 52.5"` — **include the number** (this is what the card shows) |
| `side` | `"under"` \| `"over"` |
| `line` | the total, e.g. `52.5` (the machine-readable number) |

**ATS / spread (`market: "spread"`)**
| field | value |
|---|---|
| `selection` | the **team** you're backing, e.g. `"Appalachian State"` (no number) |
| `side` | `"home"` \| `"away"` |
| `line` | the **signed spread for that team**: `+24.5` (getting points) or `-7.5` (laying). The card renders `Appalachian State +24.5`. |

### Fields both markets need

| field | required | notes |
|---|---|---|
| `bet_id` | ✓ | stable + unique, identical in the results file. e.g. `cfb-modeling-<slate>-wk<n>-<awayslug>-<market>` |
| `market` | ✓ | `"total"` or `"spread"` |
| `odds_american` | ✓ | the price, e.g. `-110` |
| `stake_units` | ✓ | recommended units |
| `model_prob` | ✓ (strongly) | P(this bet wins), 0–1 — powers win-rate & calibration |
| `event` | ✓ (strongly) | matchup, e.g. `"Ohio State @ Texas"` |
| `event_start` | recommended | kickoff, ISO-8601 with offset |
| `market_prob`, `edge`, `ev_pct` | optional | if you compute them |
| `book` | **✓** | **`"FanDuel"` or `"DraftKings"`** only — `07_write_feed.R` currently omits this; add it, and only use lines offered on those two books |
| `confidence`, `tags` | optional | `tags` is handy here: `["UNDER4"]`, `["early_ats"]` |
| `details` | optional | free-form: `proj_total`, `proj_margin`, `go_rate_pick`, `tier`, `strategy`, … |

**No plays that week?** Still write the file with `"bets": []`. It records "CFB
reported, no plays" on the Sources page.

---

## The results file (grade it after the games)

Your `weekly_picks_*.csv` already carries outcome columns
(`actual_margin`, `total_points`, `over_hit`, `result`) — so grading is a direct map.

**File:** `dashboard_feed\cfb-modeling\cfb\results_<YYYY-MM-DD>.json` (same `slate_date`).

```json
{
  "contract_version": "1.0",
  "source": "cfb-modeling",
  "sport": "cfb",
  "slate_date": "2026-09-05",
  "graded_at": "2026-09-06T06:00:00Z",
  "results": [
    {
      "bet_id": "cfb-modeling-2026-wk2-osu-tex-under",
      "result": "win",
      "closing_odds_american": -108,
      "pnl_units": 0.91,
      "actual": { "total_points": 45, "line": 52.5 }
    },
    {
      "bet_id": "cfb-modeling-2026-wk2-app-ga-ats",
      "result": "loss",
      "closing_odds_american": -110,
      "pnl_units": -0.5,
      "actual": { "actual_margin": 35, "cover_line": 24.5 }
    }
  ]
}
```

- `result`: `win` | `loss` | `push` (spread/total lands exactly on the number) | `void` | `pending`.
- `pnl_units`: **optional** — omit and the dashboard derives it from `result` + odds + stake.
- `closing_odds_american`: include it for the CLV column (your go/no-go signal).
- `actual`: free-form — `total_points`, `actual_margin`, `over_hit` map straight from your CSV.

---

## Produce it from R (`jsonlite`)

```r
library(jsonlite)

feed <- Sys.getenv("FEED_DIR", "C:/Users/ljdie/OneDrive/Documents/dashboard_feed")
slate_date <- "2026-09-05"; week <- 2

# `picks` = your weekly slip with columns:
#   away, home, market ("total"|"spread"), side, line, odds, book, model_prob, market_prob, ev, units, tags...
mk <- function(r) {
  is_total <- r$market == "total"
  list(
    bet_id = sprintf("cfb-modeling-%s-wk%d-%s-%s", slate_date, week,
                     gsub("[^a-z]", "", tolower(r$away)), r$market),
    event = sprintf("%s @ %s", r$away, r$home),
    market = r$market,
    selection = if (is_total) sprintf("%s %s", tools::toTitleCase(r$side), r$line) else r$away,
    side = r$side,                    # "under"/"over" or "home"/"away"
    line = as.numeric(r$line),        # total number, or SIGNED spread for the team
    odds_american = as.integer(r$odds),
    book = r$book,                    # MUST be "FanDuel" or "DraftKings"
    model_prob = round(r$model_prob, 4),
    ev_pct = round(r$ev, 3),
    stake_units = round(r$units, 2),
    tags = list(if (is_total) "UNDER4" else "early_ats")
  )
}

out <- list(
  contract_version = "1.0",
  source = "cfb-modeling", sport = "cfb",
  slate_date = slate_date,
  generated_at = format(as.POSIXct(Sys.time(), tz = "UTC"), "%Y-%m-%dT%H:%M:%SZ"),
  model_version = "ppp-xgb-2026",
  mode = "PAPER",
  event_context = sprintf("Week %d", week),
  bets = lapply(seq_len(nrow(picks)), function(i) mk(picks[i, ]))
)

dir <- file.path(feed, "cfb-modeling", "cfb")
dir.create(dir, recursive = TRUE, showWarnings = FALSE)
write_json(out, file.path(dir, sprintf("picks_%s.json", slate_date)),
           auto_unbox = TRUE, pretty = TRUE, null = "null")
```

Same R gotchas as golf: `list()` (not `c()`) for `bets`/`tags`/`details`,
`auto_unbox = TRUE`, `NULL` not `NA`, `as.integer()` for ints. **For a spread, make
`line` the signed number for the team you're backing** (+ if getting points, − if laying).

---

## Validate before trusting it

From `C:\dev\bet-dashboard`:

```powershell
pnpm ingest:dry
```

Accept/reject per file with the exact field + reason. Machine-readable schema is at
`dashboard_feed\_schema\picks.schema.json`; a working reference file is at
`dashboard_feed\_examples\cfb-modeling\cfb\picks_2026-09-05.json`.

## Minimum checklist per pick

- [ ] stable `bet_id` (same one you'll grade with)
- [ ] `market` = `"total"` or `"spread"`
- [ ] totals: `selection` = `"Under 52.5"`, `side`, `line`
- [ ] spreads: `selection` = team, `side`, `line` = **signed** spread for that team
- [ ] `odds_american`, `stake_units`, `model_prob`
- [ ] `book` = exactly `"FanDuel"` or `"DraftKings"` (add to the emitter; only use those two books)
- [ ] `event` (+ ideally `event_start`)
- [ ] `mode: "PAPER"` until the edge clears forward validation
- [ ] a later `results_<date>.json` grading each `bet_id` (with closing odds for CLV)
