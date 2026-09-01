# College basketball feed spec — `bet-screen` → Bet Hub

**Audience:** the CBB agent in the `bet-screen` project.
**Job:** after the daily model runs, write ONE JSON file of **spread (ATS) and Totals
(over/under) picks** into the shared feed folder. The dashboard reads it from there.

> This is the CBB-specific version of the general contract in
> [`../CONTRACT.md`](../CONTRACT.md). Same two market conventions as CFB.

- **Source key:** `bet-screen`  ·  **Sport:** `cbb`
- **File:** `dashboard_feed\bet-screen\cbb\picks_<YYYY-MM-DD>.json`
- **Cadence:** **daily** (one file per game day). Re-writing the same-dated file is fine.
- **Maps from:** `cbb_predictions_today_v1_with_mc.csv` — it already has `market_spread`,
  `market_total`, `prob_home_cover_market_spread`, and `prob_total_over`, which are
  exactly the fields below.
- **Mode:** `PAPER` until the model clears validation (your README currently says "do
  not bet"), then flip to `LIVE`.

> NBA later uses this same shape — just `sport: "nba"` and
> `dashboard_feed\bet-screen\nba\`.

---

## The picks file

```json
{
  "contract_version": "1.0",
  "source": "bet-screen",
  "sport": "cbb",
  "slate_date": "2026-01-15",
  "generated_at": "2026-01-15T14:30:00Z",
  "model_version": "cbb-v2-mc",
  "mode": "PAPER",
  "event_context": "Thursday slate",
  "bets": [
    {
      "bet_id": "bet-screen-2026-01-15-duke-unc-ats",
      "event": "Duke @ North Carolina",
      "event_start": "2026-01-16T00:00:00Z",
      "market": "spread",
      "selection": "Duke",
      "side": "away",
      "line": -3.5,
      "odds_american": -110,
      "book": "DraftKings",
      "model_prob": 0.58,
      "market_prob": 0.524,
      "edge": 0.056,
      "ev_pct": 0.07,
      "stake_units": 1.5,
      "confidence": "high",
      "tags": ["ats"],
      "details": { "pred_margin": 5.9, "market_spread": -3.5 }
    },
    {
      "bet_id": "bet-screen-2026-01-15-duke-unc-total",
      "event": "Duke @ North Carolina",
      "market": "total",
      "selection": "Under 148.5",
      "side": "under",
      "line": 148.5,
      "odds_american": -108,
      "book": "FanDuel",
      "model_prob": 0.55,
      "market_prob": 0.519,
      "edge": 0.031,
      "ev_pct": 0.03,
      "stake_units": 0.75,
      "confidence": "medium",
      "tags": ["total"],
      "details": { "pred_total": 143.2 }
    }
  ]
}
```

### The two conventions (identical to CFB)

**Totals (`market: "total"`)**
| field | value |
|---|---|
| `selection` | `"Under 148.5"` or `"Over 148.5"` — **include the number** (this is what the card shows) |
| `side` | `"under"` \| `"over"` |
| `line` | the total, e.g. `148.5` |

**Spread / ATS (`market: "spread"`)**
| field | value |
|---|---|
| `selection` | the **team** you're backing, e.g. `"Duke"` (no number) |
| `side` | `"home"` \| `"away"` |
| `line` | the **signed spread for that team**: `-3.5` (favored / laying) or `+6.5` (getting). Card renders `Duke -3.5`. |

*(First-half plays: use `market: "first_half_spread"` / `"first_half_total"`, same rules.)*

### Fields every bet needs

| field | required | notes |
|---|---|---|
| `bet_id` | ✓ | stable + unique, identical in the results file. e.g. `bet-screen-<date>-<away>-<home>-<market>` |
| `market` | ✓ | `"spread"` or `"total"` |
| `selection` | ✓ | team (spread) or `"Under N"`/`"Over N"` (total) |
| `line` | ✓ | signed spread, or the total number |
| `odds_american` | ✓ | the price, e.g. `-110` |
| `stake_units` | ✓ | recommended units |
| `book` | ✓ | **`"FanDuel"` or `"DraftKings"`** only — the book the line is from |
| `model_prob` | ✓ (strongly) | your cover / over-under probability, 0–1 (`prob_home_cover_market_spread`, `prob_total_over`) |
| `event` | ✓ (strongly) | matchup, `"Away @ Home"` |
| `event_start` | recommended | tip-off, ISO-8601 with offset |
| `market_prob`, `edge`, `ev_pct`, `confidence`, `tags`, `details` | optional | provenance / extras |

**No plays?** Still write the file with `"bets": []`.

---

## The results file (grade after the games)

**File:** `dashboard_feed\bet-screen\cbb\results_<YYYY-MM-DD>.json`

```json
{
  "contract_version": "1.0",
  "source": "bet-screen",
  "sport": "cbb",
  "slate_date": "2026-01-15",
  "graded_at": "2026-01-16T06:00:00Z",
  "results": [
    { "bet_id": "bet-screen-2026-01-15-duke-unc-ats",   "result": "win",  "closing_odds_american": -112, "pnl_units": 1.36, "actual": { "final_margin": 7 } },
    { "bet_id": "bet-screen-2026-01-15-duke-unc-total", "result": "loss", "closing_odds_american": -105, "pnl_units": -0.75, "actual": { "total_points": 151 } }
  ]
}
```

- `result`: `win` | `loss` | `push` | `void` | `pending`.
- `pnl_units`: optional — omit and the dashboard derives it from result + odds + stake.
- `closing_odds_american`: include it for the CLV column (your go/no-go signal).

---

## Produce it from R (`jsonlite`)

```r
library(jsonlite)
feed <- Sys.getenv("FEED_DIR", "C:/Users/ljdie/OneDrive/Documents/dashboard_feed")
d <- format(Sys.Date(), "%Y-%m-%d")

# `picks` = today's slip: away, home, market ("spread"|"total"), side, line,
#           odds, book, model_prob, market_prob, ev, units
mk <- function(r) {
  is_total <- r$market == "total"
  list(
    bet_id = sprintf("bet-screen-%s-%s-%s-%s", d,
      gsub("[^a-z0-9]", "", tolower(r$away)), gsub("[^a-z0-9]", "", tolower(r$home)), r$market),
    event = sprintf("%s @ %s", r$away, r$home),
    market = r$market,
    selection = if (is_total) sprintf("%s %s", tools::toTitleCase(r$side), r$line) else r$away,
    side = r$side,                       # "under"/"over" or "home"/"away"
    line = as.numeric(r$line),           # total number, or SIGNED spread for the team
    odds_american = as.integer(r$odds),
    book = r$book,                       # MUST be "FanDuel" or "DraftKings"
    model_prob = round(r$model_prob, 4),
    ev_pct = round(r$ev, 3),
    stake_units = round(r$units, 2)
  )
}
out <- list(contract_version="1.0", source="bet-screen", sport="cbb", slate_date=d,
  generated_at=format(as.POSIXct(Sys.time(), tz="UTC"), "%Y-%m-%dT%H:%M:%SZ"),
  model_version="cbb-v2-mc", mode="PAPER",
  bets=lapply(seq_len(nrow(picks)), function(i) mk(picks[i,])))
dir <- file.path(feed, "bet-screen", "cbb"); dir.create(dir, recursive=TRUE, showWarnings=FALSE)
write_json(out, file.path(dir, sprintf("picks_%s.json", d)), auto_unbox=TRUE, pretty=TRUE, null="null")
```

R gotchas: `list()` (not `c()`) for `bets`/`tags`/`details`; `auto_unbox = TRUE`;
`NULL` not `NA`; `as.integer()` for ints; **spread `line` is the signed number for the
team you back** (− favored, + getting).

---

## Validate + checklist

From `C:\dev\bet-dashboard`: `pnpm ingest:dry` (accept/reject each file with the reason).

- [ ] stable `bet_id` (same one you'll grade with)
- [ ] `market` = `"spread"` or `"total"`
- [ ] totals: `selection` = `"Under N"`; spreads: `selection` = team + **signed** `line`
- [ ] `odds_american`, `stake_units`, `model_prob`
- [ ] `book` = exactly `"FanDuel"` or `"DraftKings"`
- [ ] `event` (+ ideally `event_start`)
- [ ] `mode: "PAPER"` until validated
- [ ] a later `results_<date>.json` grading each `bet_id` (with closing odds for CLV)
