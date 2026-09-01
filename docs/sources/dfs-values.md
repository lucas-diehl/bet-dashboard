# DFS values feed spec — `dfs-engine` → Bet Hub `/dfs` page

**Audience:** the DFS ENGINE (`write_dfs_values()` in `jobs/dfs_values.R`).
**Job:** one JSON file per sport per slate day listing the **top ~10 players**, for
the display-only `/dfs` page. Not a bet; no picks/results pipeline involved.

- **File:** `<FEED_DIR>/dfs-engine/<sport>/values_<YYYY-MM-DD>.json` (`sport` = `golf`|`wnba`|`tennis`|`nfl`)
- Identified by a top-level **`values`** array. `values` may be empty (no slate).
- Read live locally; ingested to Postgres for the deployed site (a slate is replaced
  wholesale on each ingest).

## What to show: optimizer exposure (not raw value)

Show the **top 10 players by exposure when running a large-GPP optimizer at 40% max
ownership for 20 entries** — i.e., who the optimizer keeps selecting. For each player:

- `exposure` = (# of the 20 lineups that roster the player) / 20, as **0..1**. With a
  40% cap this tops out at ~0.40.
- **Sort the list by `exposure` descending** and keep the top 10 (`values` is shown in
  the order given — the page does not re-sort).

Run the optimizer once per slate (the existing `spine` optimizer at GPP settings, 20
lineups, 40% max exposure), tally per-player exposure, and emit the top 10.

## Item schema

| field | req | notes |
|---|---|---|
| `name` | ✓ | player |
| `salary` | ✓ | DK salary (int) |
| `proj` | ✓ | projected DK points |
| `value` | ✓ | proj per $1k (kept as a secondary column) |
| `exposure` | ✓* | **0..1 optimizer exposure — the headline column.** Include this for the exposure view. |
| `rank` | | 1..10 in exposure order (page falls back to row order) |
| `team`, `position` | | shown for wnba/nfl; leave blank/absent for golf & tennis |
| `ceiling` | | optional |
| `ownership` | | projected **field** ownership 0..1 (distinct from `exposure`; both shown so you can eyeball leverage) |

`✓*` = required for the exposure view; if omitted the page falls back to showing `value`.

## File shape

```json
{
  "contract_version": "1.0",
  "source": "dfs-engine",
  "sport": "wnba",
  "site": "draftkings",
  "slate_date": "2026-08-11",
  "slate_label": "Main",
  "generated_at": "2026-08-11T20:00:00Z",
  "values": [
    { "rank": 1, "name": "A'ja Wilson", "team": "LVA", "position": "F", "salary": 11200,
      "proj": 51.2, "value": 4.57, "ceiling": 63.0, "ownership": 0.34, "exposure": 0.40 }
  ]
}
```

Unknown fields are ignored (not rejected). Validate with `pnpm ingest:dry` from
`C:\dev\bet-dashboard`. Reference: `dashboard_feed\_examples\dfs-engine\wnba\values_2026-08-10.json`.
