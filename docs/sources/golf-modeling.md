# Golf feed spec — `golf-modeling` → Bet Hub

**Audience:** the agent/script that runs in `golf-modeling`.
**Job:** after the model produces its board, write ONE JSON file of **72-hole
matchup picks** into the shared feed folder. The dashboard picks it up from there —
nothing else about the golf pipeline needs to change.

> This is the golf-specific version of the general contract in
> [`../CONTRACT.md`](../CONTRACT.md). Start here for matchups; add other markets
> (outrights, top-10s) later using the same file, just with different `market` values.

---

## What a 72-hole matchup is (for the fields)

A head-to-head bet: back **one golfer to finish the tournament (72 holes) ahead of
another**. So each pick has a **side you back** (`selection`), an **opponent**, a
**price** (`odds_american`), and your **model's probability** that your side wins the
matchup. Ties over 72 holes usually **push** (stake returned) unless the book prices
a "no tie" market — grade those as `push`.

---

## Where + when to write

- **File:** `dashboard_feed\golf-modeling\pga\picks_<YYYY-MM-DD>.json`
- **Feed root:** `C:\Users\ljdie\OneDrive\Documents\dashboard_feed\`
  (or the `FEED_DIR` env var).
- **`slate_date`:** the date you want the card to appear under — use the
  **tournament's first-round date** (Thursday for a standard event). Generate the
  file whenever you finalize matchups (typically Tue/Wed); the dashboard shows it as
  the newest board and `event_start` keeps tee times accurate.
- **One file per tournament week.** Re-writing the same-dated file is fine — the
  ingest upserts (idempotent on `source` + `bet_id`).

---

## The picks file (copy this shape)

```json
{
  "contract_version": "1.0",
  "source": "golf-modeling",
  "sport": "pga",
  "slate_date": "2026-07-23",
  "generated_at": "2026-07-22T13:05:00Z",
  "model_version": "targets-2026.07",
  "mode": "PAPER",
  "event_context": "Rocket Mortgage Classic",
  "notes": "72-hole matchups. Paper until mean CLV proves positive across more events.",
  "bets": [
    {
      "bet_id": "golf-modeling-2026-07-23-rmc-fitzpatrick-vs-morikawa",
      "event": "Rocket Mortgage Classic",
      "event_start": "2026-07-23T12:00:00Z",
      "market": "matchup",
      "market_label": "72-Hole Matchup",
      "selection": "Matt Fitzpatrick",
      "odds_american": -115,
      "book": "FanDuel",
      "model_prob": 0.55,
      "market_prob": 0.535,
      "edge": 0.015,
      "ev_pct": 0.05,
      "stake_units": 0.5,
      "confidence": "medium",
      "tags": ["matchup", "72_hole"],
      "details": { "opponent": "Collin Morikawa", "matchup_type": "72_hole", "sg_last_24": 1.1 }
    }
  ]
}
```

### Field-by-field (what the golf agent must produce)

| field | required | for a 72-hole matchup |
|---|---|---|
| `bet_id` | ✓ | **Stable, unique per pick, and identical in the results file.** Suggested: `golf-modeling-<slate_date>-<eventslug>-<a>-vs-<b>`. Don't reuse an id across weeks. |
| `market` | ✓ | always `"matchup"` |
| `market_label` | ✓* | `"72-Hole Matchup"` — this is what distinguishes it from a round matchup in the UI |
| `selection` | ✓ | the golfer you're backing |
| `details.opponent` | ✓* | the other golfer (the UI renders "Selection vs Opponent") |
| `odds_american` | ✓ | the price you're taking, e.g. `-115`, `+100` |
| `stake_units` | ✓ | recommended stake; `1` = your standard unit |
| `model_prob` | ✓ (strongly) | your model's P(selection wins the matchup), 0–1 — powers win-rate & calibration |
| `event` | ✓ (strongly) | tournament name |
| `event_start` | recommended | first-round tee time, ISO-8601 with offset |
| `market_prob` | optional | de-vigged implied prob of the price |
| `edge` | optional | `model_prob − market_prob` |
| `ev_pct` | optional | EV as a fraction of stake (`0.05` = +5%) |
| `book` | **✓** | **`"FanDuel"` or `"DraftKings"`** only — the book you took the price from. Replace the old `"best"` value. Only price matchups offered on FanDuel/DraftKings; skip any that aren't on either. |
| `confidence` | optional | `low` \| `medium` \| `high` |
| `tags` | optional | `["matchup","72_hole"]` |
| `details` | optional | any extras — `opponent` (needed), `matchup_type`, SG splits, etc. |

`✓*` = required for this to render as a proper matchup (opponent + the 72-hole label).

**Empty board is valid:** if there are no plays, still write the file with
`"bets": []`. It records "golf reported, no plays" on the Sources page.

---

## The results file (grade it after the tournament)

Written once the tournament settles. Joins to the picks by `bet_id`.

**File:** `dashboard_feed\golf-modeling\pga\results_<YYYY-MM-DD>.json` (same `slate_date`).

```json
{
  "contract_version": "1.0",
  "source": "golf-modeling",
  "sport": "pga",
  "slate_date": "2026-07-23",
  "graded_at": "2026-07-27T23:30:00Z",
  "results": [
    {
      "bet_id": "golf-modeling-2026-07-23-rmc-fitzpatrick-vs-morikawa",
      "result": "win",
      "closing_odds_american": -105,
      "clv_pct": 0.04,
      "pnl_units": 0.43,
      "actual": { "fitzpatrick_finish": 8, "morikawa_finish": 15 }
    }
  ]
}
```

- `result`: `win` | `loss` | `push` (72-hole tie) | `void` | `pending`.
- `pnl_units`: **optional** — if you leave it out, the dashboard computes it from
  `result` + `odds_american` + `stake_units`. Include it if you want to override
  (e.g. partial units, dead-heat rules).
- `closing_odds_american` (+ optional `clv_pct`): the closing matchup price, for the
  CLV column — this is your paper-trading go/no-go signal, so please include it.
- `actual`: free-form; finishing positions of both golfers is ideal.

---

## Produce it from R (`jsonlite`)

```r
library(jsonlite)

feed <- Sys.getenv("FEED_DIR", "C:/Users/ljdie/OneDrive/Documents/dashboard_feed")
event      <- "Rocket Mortgage Classic"
slate_date <- "2026-07-23"          # tournament first-round date

# `matchups` = your model's data frame with one row per 72-hole matchup:
#   pick, opponent, odds_american, model_prob, market_prob, book, sg_last_24, ...
bets <- lapply(seq_len(nrow(matchups)), function(i) {
  m <- matchups[i, ]
  list(
    bet_id       = sprintf("golf-modeling-%s-%s-vs-%s", slate_date,
                           gsub("[^a-z]", "", tolower(m$pick)),
                           gsub("[^a-z]", "", tolower(m$opponent))),
    event        = event,
    event_start  = "2026-07-23T12:00:00Z",
    market       = "matchup",
    market_label = "72-Hole Matchup",
    selection    = m$pick,
    odds_american = as.integer(m$odds_american),
    book         = m$book,          # MUST be "FanDuel" or "DraftKings" (not "best")
    model_prob   = round(m$model_prob, 4),
    market_prob  = round(m$market_prob, 4),
    edge         = round(m$model_prob - m$market_prob, 4),
    ev_pct       = round(m$ev, 3),
    stake_units  = round(m$units, 2),
    confidence   = if (m$model_prob > 0.58) "high" else if (m$model_prob > 0.53) "medium" else "low",
    tags         = list("matchup", "72_hole"),
    details      = list(opponent = m$opponent, matchup_type = "72_hole",
                        sg_last_24 = round(m$sg_last_24, 2))
  )
})

picks <- list(
  contract_version = "1.0",
  source = "golf-modeling", sport = "pga",
  slate_date = slate_date,
  generated_at = format(as.POSIXct(Sys.time(), tz = "UTC"), "%Y-%m-%dT%H:%M:%SZ"),
  model_version = "targets-2026.07",
  mode = "PAPER",
  event_context = event,
  bets = bets                 # keep as a list() so it's always a JSON array
)

dir <- file.path(feed, "golf-modeling", "pga")
dir.create(dir, recursive = TRUE, showWarnings = FALSE)
write_json(picks, file.path(dir, sprintf("picks_%s.json", slate_date)),
           auto_unbox = TRUE, pretty = TRUE, null = "null")
```

R gotchas: use `list()` (not `c()`) for `bets`, `tags`, and `details` so they nest
correctly; `auto_unbox = TRUE` unwraps scalars; use `NULL` (not `NA`) for missing
optional values; wrap integers you want as ints in `as.integer()`.

---

## Validate before trusting it

From `C:\dev\bet-dashboard`:

```powershell
pnpm ingest:dry
```

It scans the whole feed and prints, per file, ✓ accepted or ✗ rejected **with the
exact field + reason**. Fix any ✗ and re-run. There's also a machine-readable schema
at `dashboard_feed\_schema\picks.schema.json` you can validate against directly.

## Minimum checklist for each matchup pick

- [ ] stable `bet_id` (same one you'll use to grade it)
- [ ] `market: "matchup"` + `market_label: "72-Hole Matchup"`
- [ ] `selection` (your side) + `details.opponent` (the other golfer)
- [ ] `odds_american`, `stake_units`, `model_prob`
- [ ] `book` = exactly `"FanDuel"` or `"DraftKings"` (drop the old `"best"`)
- [ ] `event` (tournament) + ideally `event_start`
- [ ] `mode: "PAPER"` until the CLV gate clears
- [ ] a later `results_<date>.json` grading each `bet_id` (with closing odds for CLV)
