# NFL feed spec — `nfl-modeling` → Bet Hub

**Audience:** the NFL agent.
**Job:** each week write ONE JSON file of **spread (ATS), Totals (over/under), and
player-prop picks** into the shared feed folder. The dashboard reads it from there.

> NFL-specific version of the general contract in [`../CONTRACT.md`](../CONTRACT.md).
> Spreads/totals work exactly like CFB/CBB; **player props are a new shape — see below.**

- **Source key:** `nfl-modeling`  ·  **Sport:** `nfl`
- **File:** `dashboard_feed\nfl-modeling\nfl\picks_<YYYY-MM-DD>.json`
- **Cadence:** weekly. Use the **game day as `slate_date`** — Sunday for the main
  slate; write a separate file for Thursday / Monday games if you bet them. One file
  per game day; re-writing the same-dated file is fine.
- **Mode:** `PAPER` until each market clears forward validation, then `LIVE`.

---

## The picks file (all three markets)

```json
{
  "contract_version": "1.0",
  "source": "nfl-modeling",
  "sport": "nfl",
  "slate_date": "2026-09-13",
  "generated_at": "2026-09-11T15:00:00Z",
  "model_version": "nfl-v1",
  "mode": "PAPER",
  "event_context": "Week 2",
  "bets": [
    {
      "bet_id": "nfl-modeling-2026-wk2-cin-kc-ats",
      "event": "Bengals @ Chiefs", "event_start": "2026-09-13T20:25:00Z",
      "market": "spread", "selection": "Kansas City Chiefs", "side": "home", "line": -3.5,
      "odds_american": -110, "book": "DraftKings",
      "model_prob": 0.57, "edge": 0.046, "ev_pct": 0.06, "stake_units": 1.0, "confidence": "medium",
      "tags": ["spread"]
    },
    {
      "bet_id": "nfl-modeling-2026-wk2-cin-kc-total",
      "event": "Bengals @ Chiefs",
      "market": "total", "selection": "Under 47.5", "side": "under", "line": 47.5,
      "odds_american": -108, "book": "FanDuel",
      "model_prob": 0.55, "stake_units": 0.75, "confidence": "low", "tags": ["total"]
    },
    {
      "bet_id": "nfl-modeling-2026-wk2-mahomes-passyds-o",
      "event": "Bengals @ Chiefs",
      "market": "prop", "market_label": "Passing Yards",
      "selection": "Patrick Mahomes Over 275.5", "side": "over", "line": 275.5,
      "odds_american": -115, "book": "DraftKings",
      "model_prob": 0.58, "ev_pct": 0.05, "stake_units": 1.0, "confidence": "medium",
      "tags": ["prop", "pass_yds"],
      "details": { "player": "Patrick Mahomes", "stat": "pass_yds", "team": "KC" }
    },
    {
      "bet_id": "nfl-modeling-2026-wk2-barkley-anytimetd",
      "event": "Eagles @ Cowboys",
      "market": "prop", "market_label": "Anytime TD",
      "selection": "Saquon Barkley Anytime TD", "side": "yes", "line": null,
      "odds_american": 130, "book": "FanDuel",
      "model_prob": 0.52, "ev_pct": 0.19, "stake_units": 0.5, "confidence": "medium",
      "tags": ["prop", "anytime_td"],
      "details": { "player": "Saquon Barkley", "stat": "anytime_td", "team": "PHI" }
    }
  ]
}
```

### Spreads & totals (same as CFB/CBB)

**Spread (`market: "spread"`)** — `selection` = team, `side` = `home`/`away`,
`line` = **signed** spread for that team (`-3.5` laying, `+6.5` getting). Card renders
`Kansas City Chiefs -3.5`.

**Total (`market: "total"`)** — `selection` = `"Under 47.5"` / `"Over 47.5"` (include the
number), `side` = `under`/`over`, `line` = the total.

### Player props (`market: "prop"`) — the new shape

| field | required | value |
|---|---|---|
| `market` | ✓ | `"prop"` |
| `market_label` | ✓ | the prop type shown on the pill: `"Passing Yards"`, `"Rushing Yards"`, `"Receptions"`, `"Anytime TD"`, … |
| `selection` | ✓ | the **full readable pick, including the number**: `"Patrick Mahomes Over 275.5"`. (Props do **not** get a line appended by the UI — the number lives in the selection.) |
| `side` | ✓ | `"over"` / `"under"` for line props; `"yes"` / `"no"` for yes/no props (Anytime TD) |
| `line` | ✓* | the prop number (`275.5`). Use `null` for yes/no props with no number (Anytime TD). |
| `odds_american` | ✓ | the price |
| `book` | ✓ | **`"FanDuel"` or `"DraftKings"`** only |
| `model_prob` | ✓ (strongly) | your probability the prop hits, 0–1 |
| `stake_units` | ✓ | recommended units |
| `details` | recommended | `{ player, stat, team }` — machine-readable; `stat` e.g. `pass_yds`, `rush_yds`, `receptions`, `anytime_td` |
| `event`, `event_start`, `market_prob`, `edge`, `ev_pct`, `confidence`, `tags` | optional/recommended | provenance |

`bet_id` for props: make it player+stat+side specific and stable, e.g.
`nfl-modeling-<slate>-<player>-<stat>-<o|u>`.

**No plays?** Write the file with `"bets": []`.

---

## The results file (grade after the games)

**File:** `dashboard_feed\nfl-modeling\nfl\results_<YYYY-MM-DD>.json`

```json
{
  "contract_version": "1.0", "source": "nfl-modeling", "sport": "nfl",
  "slate_date": "2026-09-13", "graded_at": "2026-09-14T06:00:00Z",
  "results": [
    { "bet_id": "nfl-modeling-2026-wk2-cin-kc-ats",        "result": "win",  "closing_odds_american": -108, "pnl_units": 0.91, "actual": { "final_margin": 6 } },
    { "bet_id": "nfl-modeling-2026-wk2-mahomes-passyds-o", "result": "loss", "closing_odds_american": -120, "pnl_units": -1.0, "actual": { "pass_yds": 254 } },
    { "bet_id": "nfl-modeling-2026-wk2-barkley-anytimetd", "result": "win",  "closing_odds_american": 115,  "pnl_units": 0.65, "actual": { "tds": 1 } }
  ]
}
```

- `result`: `win` | `loss` | `push` (prop lands exactly on the number) | `void` (player inactive) | `pending`.
- `pnl_units`: optional — omit and the dashboard derives it from result + odds + stake.
- `closing_odds_american`: include it for the CLV column.
- `actual`: the realized stat (`pass_yds`, `tds`, `final_margin`, …).

---

## Produce it from R (`jsonlite`)

```r
library(jsonlite)
feed <- Sys.getenv("FEED_DIR", "C:/Users/ljdie/OneDrive/Documents/dashboard_feed")
slate_date <- "2026-09-13"; week <- 2
compact <- function(l) l[!vapply(l, is.null, logical(1))]
slug <- function(x) gsub("[^a-z0-9]", "", tolower(x))

# sides = away, home, market ("spread"|"total"), side, line, odds, book, model_prob, ev, units
mk_side <- function(r) compact(list(
  bet_id = sprintf("nfl-modeling-%s-wk%d-%s-%s-%s", slate_date, week, slug(r$away), slug(r$home), r$market),
  event = sprintf("%s @ %s", r$away, r$home), market = r$market,
  selection = if (r$market=="total") sprintf("%s %s", tools::toTitleCase(r$side), r$line) else r$team,
  side = r$side, line = as.numeric(r$line), odds_american = as.integer(r$odds),
  book = r$book, model_prob = round(r$model_prob,4), ev_pct = round(r$ev,3), stake_units = round(r$units,2)))

# props = player, team, stat, stat_label, side ("over"/"under"/"yes"), line (or NA), odds, book, model_prob, ev, units, event
mk_prop <- function(r) compact(list(
  bet_id = sprintf("nfl-modeling-%s-%s-%s-%s", slate_date, slug(r$player), r$stat, substr(r$side,1,1)),
  event = r$event, market = "prop", market_label = r$stat_label,
  selection = if (is.na(r$line)) sprintf("%s %s", r$player, tools::toTitleCase(gsub("_"," ",r$stat)))
              else sprintf("%s %s %s", r$player, tools::toTitleCase(r$side), r$line),
  side = r$side, line = if (is.na(r$line)) NULL else as.numeric(r$line),
  odds_american = as.integer(r$odds), book = r$book,
  model_prob = round(r$model_prob,4), ev_pct = round(r$ev,3), stake_units = round(r$units,2),
  tags = list("prop", r$stat),
  details = list(player = r$player, stat = r$stat, team = r$team)))

bets <- c(lapply(seq_len(nrow(sides)), function(i) mk_side(sides[i,])),
          lapply(seq_len(nrow(props)), function(i) mk_prop(props[i,])))
out <- list(contract_version="1.0", source="nfl-modeling", sport="nfl", slate_date=slate_date,
  generated_at=format(as.POSIXct(Sys.time(),tz="UTC"),"%Y-%m-%dT%H:%M:%SZ"),
  model_version="nfl-v1", mode="PAPER", event_context=sprintf("Week %d", week), bets=bets)
dir <- file.path(feed,"nfl-modeling","nfl"); dir.create(dir, recursive=TRUE, showWarnings=FALSE)
write_json(out, file.path(dir, sprintf("picks_%s.json", slate_date)), auto_unbox=TRUE, pretty=TRUE, null="null")
```

R gotchas: `list()` (not `c()`) for nested objects; `auto_unbox = TRUE`; `NULL` not
`NA` for absent values (e.g. a yes/no prop's `line`); `as.integer()` for ints.

---

## Validate + checklist

From `C:\dev\bet-dashboard`: `pnpm ingest:dry`. Reference file:
`dashboard_feed\_examples\nfl-modeling\nfl\picks_2026-09-13.json`.

- [ ] stable `bet_id` per pick (same one you'll grade with)
- [ ] spreads: team + **signed** `line`; totals: `"Under N"` + `line`
- [ ] props: `market:"prop"` + `market_label` (stat) + `selection` with the number + `side` + `line` (or `null`) + `details.player/stat`
- [ ] `odds_american`, `stake_units`, `model_prob`
- [ ] `book` = exactly `"FanDuel"` or `"DraftKings"`
- [ ] `event` (+ ideally `event_start`)
- [ ] `mode: "PAPER"` until validated
- [ ] a later `results_<date>.json` grading each `bet_id` (with closing odds for CLV)
