# Bet Hub — review & work list

Audit date: **2026-08-18**. Reviewed: `apps/web` (all pages/components/CSS/lib), `packages/core`,
`packages/contract`, `packages/db`, `apps/ingest`, and the live contents of
`C:\Users\ljdie\OneDrive\Documents\dashboard_feed\`.

**Read this first (for the agent picking this up):**

- Items are ordered **P0 → P4**. P0 items are things the site is getting *wrong right now* —
  do those first and independently of everything else.
- Every claim below was verified against the code and against real feed files. Where a number
  is quoted (contrast ratios, dates, bet counts), it came from the actual data on 2026-08-18.
- Don't refactor broadly. This codebase's structure is good — hand-written CSS, inline SVG,
  a Zod contract as the only interface, pure math in `packages/core`. Keep all of that.
- After each group of changes: `pnpm build` must pass, and `pnpm ingest:dry` must still
  validate every file in the feed folder with zero rejections.

---

## P0 — the site is currently showing wrong information

### 1. "Now" is derived from the newest slate in the DB, not from the clock

This is one root cause with three visible symptoms. `latestDate(ds)` returns the **max
`slate_date` across all bets**, and it is used as the app's notion of "today" in three places.

Right now the feed contains forward-dated picks: `nfl-modeling/nfl/picks_2026-09-27.json` (NFL
Week 3), `picks_2026-09-13.json`, and `cfb-modeling/cfb/picks_2026-09-05.json`. So
`latestDate(ds)` = **2026-09-27**, six weeks in the future. Consequences:

| Where | File | What actually happens |
|---|---|---|
| Today's Board opens on the wrong day | [page.tsx:14](../apps/web/app/page.tsx#L14) — `dates[0]` | The default board is **2026-09-27 (NFL Week 3)**, not today. The user has to click `‹` six times to reach the current slate. |
| Tracker "30d" is empty | [select.ts:72](../apps/web/lib/select.ts#L72) — `anchor = latestDate(ds)` | 30d cutoff = 2026-08-28, which is after every graded bet. The 30d tab shows **zero bets**. |
| Sources reports every model as dead | [sources/page.tsx:10](../apps/web/app/sources/page.tsx#L10) + [select.ts:98](../apps/web/lib/select.ts#L98) | Page asks "who reported for Sep 27". Golf published *today* and is shown as **38 days stale**. |

**Fix:** introduce a single `appToday()` helper that returns the current calendar date in a
fixed configured timezone (`APP_TIMEZONE`, default `America/New_York`) via
`Intl.DateTimeFormat("en-CA", { timeZone })`. Then:

- Today's Board: default to `appToday()` if it has bets; otherwise the **nearest date with
  bets**, with a visible badge — `Showing Aug 20 · no bets posted for today` (past) or
  `Upcoming — Sep 27` (future). Never open silently on a date that isn't today.
- `withinRange()`: anchor to `appToday()`, not the max slate date.
- `sourceStatus()`: compute staleness against `appToday()`.
- Keep future slates reachable — add a small "Upcoming" affordance so forward-posted NFL/CFB
  picks are still browsable, just not the default view.

**Verify:** with the current feed, `/` opens on 2026-08-20 (or today) with an explanatory badge;
`/tracker?range=30` shows the golf bets; `/sources` shows golf as fresh (0d).

### 2. LIVE and PAPER bets are pooled into one P/L number

`trackerData()` never filters on `mode`, so paper bets are counted in Net Units, ROI, Record,
Win Rate, the bankroll curve, and the per-sport table exactly like real money.

With today's data this is not hypothetical. Inside `TRACKING_START=2026-08-05`:

- `golf 2026-08-06` — **PAPER**, graded 7-2
- `golf 2026-08-13` — **LIVE**, graded 9-3-1
- `golf 2026-08-20` — PAPER, 9 pending
- `nfl 2026-09-13`, `nfl 2026-09-27`, `cfb 2026-09-05` — all PAPER

So the headline "Net Units / ROI" on the Tracker is a blend of a paper 7-2 slate and a live
9-3-1 slate. The number on the front of the site does not mean what it looks like it means.

**Fix:** add a LIVE / PAPER / All segmented control to the Tracker (default **LIVE**), persisted
in the query string like `range` and `sport`. Show the active mode in the chart subtitle. On
Today's Board, keep the existing per-section mode pill but also mark individual PAPER cards so a
paper play is never mistaken for a live one at a glance. `mode` is already on `BetRow` and in the
`bets` table — no schema change needed.

**Verify:** `/tracker` (LIVE) shows 9-3-1 from the Aug 13 slate only; switching to All reproduces
today's blended number.

### 3. Bets render in arbitrary order

[queries.ts:10](../packages/db/src/queries.ts#L10) does `db.select().from(bets)` with no
`ORDER BY`, and [select.ts:27](../apps/web/lib/select.ts#L27) `groupBySport` preserves that
order. Postgres row order is not stable across updates, so the order of cards inside a sport
section can change between page loads for no reason.

**Fix:** sort explicitly inside a sport group — `event_start` ascending (nulls last), then
`ev_pct` descending, then `stake_units` descending. Add matching `ORDER BY` in the query so the
DB does the stable work.

### 4. Event times render in the server's timezone

[format.ts:31](../apps/web/lib/format.ts#L31) `fmtTime` calls `toLocaleTimeString` with no
`timeZone`, and its only caller — [BetCard.tsx:31](../apps/web/components/BetCard.tsx#L31) — is a
**server component**. On Vercel the server runs UTC, so an NFL 1:00 PM ET kickoff
(`2026-09-27T17:00:00Z`) displays as **5:00 PM**.

Same class of bug: [dfs/page.tsx:33](../apps/web/app/dfs/page.tsx#L33) `localToday()` builds
"today" from the server clock. After 8 PM ET the server has already rolled over to tomorrow, so
the DFS page decides there is no slate for today and silently drops into its "latest" fallback.

**Fix:** route both through the same `APP_TIMEZONE` used in P0-1. Add the timezone abbreviation
to the rendered time (`1:00 PM ET`) so it's unambiguous.

### 5. The Sources page claims demo data on a live site

[sources/page.tsx:67](../apps/web/app/sources/page.tsx#L67) hardcodes
`Currently showing <strong>demo data</strong>.` The site has been on Supabase since 2026-08-17.

**Fix:** use `dataSourceLabel()` (already exists in `lib/data.ts` and is already used on Today's
Board). While in there, show the **ingest** freshness too — max `uploaded_at` — since "the model
published" and "the uploader ran" are different failures and right now neither page distinguishes
them.

### 6. Re-ingesting a picks file does not update most fields, and never removes withdrawn bets

[upsert.ts:66-77](../packages/db/src/upsert.ts#L66-L77) — the `onConflictDoUpdate` set list only
refreshes `slateId, oddsAmerican, line, modelProb, stakeUnits, confidence, details`. It silently
drops re-emitted changes to **`evPct`, `edge`, `marketProb`, `book`, `market`, `marketLabel`,
`selection`, `side`, `event`, `eventStart`, `tags`, `tier`, `mode`**.

`evPct` matters most: it drives the dedupe tiebreak in `lib/data.ts` and (after P0-3) the card
ordering, so a stale EV distorts what the user sees first.

Separately, there is **no reconciliation**. When a picks file shrinks — the known recurring golf
problem, where the tournament file gets rewritten with fewer bets — the removed bets stay in the
DB forever as pending orphans. That is what produced the erroneous Fitzpatrick/Cantlay top-10
rows that had to be deleted by hand on 2026-08-13.

**Fix:**
- Extend the `set:` list to every column carried in the file.
- Add a reconcile step in `upsertPicksFile`: after upserting, delete bets for that
  `(source, sport, slate_date)` whose `bet_id` is not in the incoming file **and** which have no
  row in `results`. Log every deletion. Guard it behind `--reconcile` for one ingest cycle so the
  first run can be inspected before it's trusted.
- This fixes the golf stale-bet problem on the dashboard side, permanently, without waiting on
  the golf agent.

---

## P1 — the analysis itself

The data model is better than the analysis currently built on it. `model_prob` is present on
essentially every bet and is never used for anything. These are the changes that turn this from a
picks display into a tool that tells you whether the models are actually good.

### 7. Sample size is invisible, so every number reads as more certain than it is

The Tracker currently has roughly **22 graded bets**. An ROI computed on 22 bets is
indistinguishable from noise, but it's rendered in 27px bold next to a green arrow.

**Fix:** put `n` next to every rate, and a 95% confidence interval on ROI and win rate (Wilson
interval for win rate; bootstrap or normal-approx on unit ROI). Below a threshold (say n < 100),
grey the tile and label it `small sample`. This single change does more for decision quality than
any other item on this list.

### 8. Expected vs. actual — the model's own forecast is never scored

Every bet carries `ev_pct` and `model_prob`. Nobody compares them to what happened.

Add to the Tracker:

- **Expected units** = `Σ (stake_units × ev_pct)` over decided bets, shown beside realized Net
  Units. "Model said +2.4u, you got +5.1u" is the most informative sentence the site could print.
- **Expected win rate** = `Σ model_prob / n` vs actual win rate.
- A **calibration panel**: bucket bets by `model_prob` (0-10%, 10-20%, …), plot predicted vs
  observed hit rate against the diagonal. Reuse the existing inline-SVG approach — no library.
  Gate it behind a minimum n per bucket and say so when buckets are thin.

### 9. CLV is wired end-to-end but is always empty

`clv_pct` and `closing_odds_american` are in the contract, the schema, the queries, the `Rollup`,
the Tracker tile, and the by-sport table column. **Every golf results file emits both as null**,
so the CLV tile and column render `—` permanently. `clv_beat_pct` is computed in
[metrics.ts:96](../packages/core/src/metrics.ts#L96) and never displayed at all.

CLV is the best available early read on whether an edge is real — worth fixing properly rather
than hiding:

- Derive `clv_pct` when the model supplies `closing_odds_american` but not `clv_pct`:
  `impliedProb(closing) / impliedProb(taken) - 1`. `impliedProb` already exists in
  [odds.ts:12](../packages/core/src/odds.ts#L12) and is currently unused.
- Surface **CLV beat rate** (`clv_beat_pct`) alongside average CLV — beat rate is the more robust
  statistic on small samples.
- Until closing odds arrive, render an explicit `not captured yet` state rather than `—`, and add
  a line to `docs/CONTRACT.md` promoting `closing_odds_american` from "optional but valuable" to
  the strongly-recommended field it deserves to be. The NFL project already has The Odds API
  wired up and can capture closing lines; golf will need DataGolf.

### 10. No breakdowns beyond sport

The user bets golf matchups, golf top-10s, NFL spreads and NFL totals across three books.
Sport-level rollups can't answer "are my matchups carrying my outrights?" or "is bet365 pricing
me better than FanDuel?"

`rollupBy()` already exists in [metrics.ts:101](../packages/core/src/metrics.ts#L101) and is
**never called**. Add tables (reusing the existing `grid-table` styling) for **market**, **book**,
and **confidence/tier**. Same range + sport + mode filters apply.

### 11. Missing risk and streak metrics

The bankroll curve shows only cumulative units. Add:

- **Max drawdown** (peak-to-trough in units, and the dates it spanned)
- **Current streak** and longest win/loss streak
- **Units at risk right now** — total `stake_units` on pending bets. The Net Units tile's
  `Xu staked` sub-label uses decided-only stake, so open exposure is invisible.
- **Average odds** and **average stake**, which give the W-L record its context.

### 12. The bankroll chart's x-axis is index-based, not time-based

[BankrollChart.tsx:28](../apps/web/components/BankrollChart.tsx#L28) — `step = width/(n-1)`, one
even slot per date that has a decided bet. A four-week gap between graded slates renders exactly
as wide as two consecutive days, which straightens out the real shape of the curve. With
tournament golf posting weekly and NFL weekly, most gaps are large.

**Fix:** scale x by actual date. Keep the current y-axis but add intermediate ticks — right now
[BankrollChart.tsx:38](../apps/web/components/BankrollChart.tsx#L38) only draws min/0/max.

Also worth noting for whoever does this: the curve is keyed on **`slate_date`**, not settle date.
A golf tournament posted Thursday settles Sunday. For a bankroll curve, settlement date is the
honest x-axis. `graded_at` is already stored — use it when present and fall back to `slate_date`.

### 13. `pnl_units` from a model is trusted without a sanity check

[metrics.ts:37](../packages/core/src/metrics.ts#L37) returns a model-supplied `pnl_units`
verbatim, even if it contradicts `result` + `odds` + `stake`. One bad grading script silently
corrupts every downstream number.

**Fix:** always compute the derived value; if a supplied `pnl_units` differs by more than a cent,
use the derived one and surface the discrepancy (an `Anomalies` block on Sources, or a console
warning at ingest). Never fail silently on money math.

### 14. Ungraded bets age out with no alarm

Golf's 2026-08-20 slate has 9 pending bets. If the grading file never lands they stay pending
forever, quietly excluded from every rollup, and nothing on the site says so.

**Fix:** flag bets pending more than N days past `slate_date` (N=3, configurable) on the Sources
page as `awaiting grades`. This is the same monitoring surface as P0-1's staleness fix.

### 15. A "unit" is never defined

The entire site is denominated in units and nowhere says what a unit is worth. Add a bankroll /
unit-size setting (env var is fine — `UNIT_SIZE_USD`) and show a secondary dollar figure under
Net Units. It makes the drawdown number mean something.

---

## P2 — UI and mobile

This is a phone-first site. Several things only work with a mouse.

### 16. The bankroll chart tooltip is mouse-only

[BankrollChart.tsx:53](../apps/web/components/BankrollChart.tsx#L53) binds only `onMouseMove` /
`onMouseLeave`. On the phone — the primary device — the crosshair and tooltip **never appear**.
Add `onTouchStart` / `onTouchMove` (with `passive: false` and `preventDefault` to stop the page
scrolling under the drag), and keep the last touched point visible on release.

Same problem in [SportBars.tsx:21](../apps/web/components/SportBars.tsx#L21): record and ROI are
in a `title` attribute, which touch devices don't render at all. Move them to always-visible
secondary text or a tap-to-expand row.

### 17. Tap targets are below the accessible minimum

`.seg a` is `5px 11px` (~28px tall) and `.tab` is `7px 14px` (~34px). The iOS/WCAG guidance is
44px. The Today board's `‹` / `›` day-nav arrows are the worst offenders — small, and adjacent.
Bump the touch area (padding or a `::before` expander) without changing the visual size.

### 18. The tab bar can overflow the viewport

`.tabs` ([globals.css:110](../apps/web/app/globals.css#L110)) is a flex row with
`white-space: nowrap` on five tabs and no overflow handling. On a 320-360px phone, Today / DFS /
Tracker / Extras / Sources runs to roughly the full width and pushes the body into horizontal
scroll. Add `overflow-x: auto` + `scrollbar-width: none` + scroll-snap, and confirm at 320px.

### 19. Extras renders all 811 Elo rows in one table

[extras/page.tsx:47](../apps/web/app/extras/page.tsx#L47) maps every rating. That's ~3,200 DOM
nodes and a large HTML payload on a phone, for a page whose interesting content is the top ~50.

**Fix:** default to the top 50, add a name search box and a `Show all` toggle. Add a
`Δ since last update` sort. (The Elo file is 84KB on disk — it's also worth having the query
select only what's rendered.)

### 20. No loading or error states anywhere

Every page is `force-dynamic`, opens a fresh Supabase connection, and renders. There is **no
`loading.tsx` and no `error.tsx`** in the app. Tab navigation therefore stalls on a blank screen
for the duration of the DB round trip, and if Supabase is unreachable the user gets Next's
default error page.

**Fix:** add `loading.tsx` skeletons per route (they can be trivial — the tile/card shapes already
exist in CSS) and an `error.tsx` that says "can't reach the data store" with a retry button.

### 21. Smaller UI items

- **Today's Board has no filters and no summary of edge.** The header prints bets / sports /
  units staked but not total expected units. Add it, plus a sort control (EV / start time /
  stake) and a "hide graded" toggle once a slate has settled.
- **DFS is hardcoded to 10 rows** ([dfs/page.tsx:90](../apps/web/app/dfs/page.tsx#L90)) with no
  way to see more, and the footnote *"large-GPP, 40% max own, 20 entries"*
  ([dfs/page.tsx:172](../apps/web/app/dfs/page.tsx#L172)) is a hardcoded string that will lie the
  moment the optimizer config changes. Carry those parameters in the values file, or drop the
  specifics from the label.
- **Wide tables scroll with no affordance.** `.chart-scroll` gives 8-column tables horizontal
  scroll on a phone with no edge-fade or shadow hint. Add one.
- **Empty states are bare grey text.** "No bets recommended for Aug 20" could say *why* — which
  sources reported, whether it's a genuine no-play day or a silent pipeline — and link to Sources.
- **The Refresh button doesn't say when data was last refreshed.** Add a relative timestamp
  ("updated 4 min ago") using the max `uploaded_at`.

---

## P3 — design system and accessibility

The palette is well-organized and the light/dark override pattern (`prefers-color-scheme` plus a
`data-theme` override that wins both ways) is correct. Four concrete defects:

### 22. Semantic colors aren't theme-tuned, and several fail contrast

The sport colors get per-theme steps; `--good` and `--bad` **do not** — they're declared
identically in the light and dark blocks
([globals.css:14-15, 34-35, 51-52](../apps/web/app/globals.css#L14-L15)). Measured against the
surfaces they're actually used on:

| Token | On | Ratio | WCAG AA (4.5:1 for <18.66px) |
|---|---|---|---|
| `--muted` `#898781` | light `--surface` `#fcfcfb` | **~3.5:1** | ✗ fails |
| `--good` `#0ca30c` | light `--surface` | **~3.3:1** | ✗ fails |
| `--bad` `#d03b3b` | dark `--surface` `#1a1a19` | **~3.7:1** | ✗ fails |
| `--muted` | dark `--surface` | ~4.8:1 | ✓ |
| `--good` | dark `--surface` | ~5.2:1 | ✓ |

`--muted` carries the timestamps, table headers, tile labels, and chart ticks — all at 11-12.5px,
exactly where contrast matters most. `--good`/`--bad` carry the P/L numbers.

**Fix:** darken `--good` and `--muted` for light mode, lighten `--bad` for dark mode, targeting
≥4.5:1 in both themes. Re-run whatever validator produced the original palette. Don't change the
hues — just the steps.

### 23. `.s-pga` has no dark-mode step

Every sport gets a dark override except PGA — [globals.css:66-82](../apps/web/app/globals.css#L66-L82)
lists cbb, nba, cfb/ncaaf, wnba, tennis, nfl, mm. So `--sport: #008300` (a dark green) stays as-is
against the `#0d0d0d` page in dark mode. Golf is the most active sport in the feed, so this is the
most visible one. Add a lighter dark-mode step in line with the others.

### 24. Pinch-zoom is disabled

[layout.tsx:16](../apps/web/app/layout.tsx#L16) sets `maximumScale: 1`. That's a WCAG 1.4.4
failure and an unnecessary one — drop it. Nothing in the layout depends on it.

### 25. No keyboard or assistive-tech affordances

Verified absent across `apps/web`: any `:focus-visible` rule, any `aria-current`, any
`prefers-reduced-motion` guard.

- Add a visible focus ring on `.tab`, `.seg a`, `.iconbtn`, and the day-nav arrows.
- `aria-current="page"` on the active tab; `aria-pressed` on active `.seg` filters.
- Guard the Refresh spinner keyframes behind `prefers-reduced-motion: reduce`.
- Give the tables `<caption class="sr-only">` and `scope="col"` on headers.
- Give the bankroll chart a text alternative (`role="img"` + `aria-label` summarizing start,
  end, and change), since the tooltip is unreachable without a pointer.

### 26. PWA is incomplete

`manifest.webmanifest` ships a single SVG icon marked `purpose: "any maskable"`. Android/Chrome
install prompts want 192px and 512px PNGs — and `middleware.ts` already lists
`/icon-192.png`, `/icon-512.png`, `/apple-touch-icon.png` as public paths, but **none of those
files exist in `public/`**. Generate them. There's also no service worker, so there's no offline
view of the last board — worth adding for a phone-first app that gets opened in stadiums and bars.

---

## P4 — pipeline, performance, security

### 27. A new Postgres connection is opened and closed on every page render

[data.ts:16-24](../apps/web/lib/data.ts#L16-L24) and [values.ts:8-15](../apps/web/lib/values.ts#L8-L15)
call `openDb()` then `close()` per request, with `force-dynamic` on every page. That's connection
setup + TLS on every navigation, and it will exhaust the Supabase pooler under any concurrency.

**Fix:** hoist a module-scoped `postgres()` client and reuse it. Wrap the dataset read in
`unstable_cache` with a short TTL (30-60s) and a tag, and have the Refresh button call
`revalidateTag` — that keeps Refresh meaning "get fresh data" while normal navigation is instant.

### 28. Every page loads the entire dataset and filters in JS

`loadDatasetFromDb` selects **all** slates, **all** bets and **all** results on every request, then
`lib/select.ts` filters by date/range/sport in memory. Fine at today's ~60 bets; it degrades
linearly forever. Push the range/sport/mode filters into SQL before this gets uncomfortable.

### 29. The dedupe key can silently merge distinct bets

[data.ts:53](../apps/web/lib/data.ts#L53) keys on
`source|sport|slate_date|market|selection|opponent`. **`event` and `line` are not in the key.**
Two totals from the same source on the same day both selecting `"Over"` collapse into one, and
the other is dropped from both the board and the tracker.

Today this is latent, not active — NFL encodes the number into the selection (`"Over 46"`) and
golf matchups carry `details.opponent`, so nothing is currently being lost. But it's one
well-behaved model away from silently deleting bets.

**Fix:** add `event` and `line` to the key. Keep `book` out, so the "same bet priced at two books"
collapse still works as intended.

### 30. Ingest re-processes every file, every run, forever

`apps/ingest` walks the whole tree and re-upserts everything on each 10-minute run, including
2024 and 2025 backfill files that `TRACKING_START` then hides in the UI. The DB keeps rows the
site pretends don't exist.

**Fix:** skip files older than `TRACKING_START` at ingest, or track processed files by
`(path, mtime)`. Also: the process exits 0 even when files are rejected — make rejections a
non-zero exit so the Scheduled Task surfaces failure, and write a small run-log the Sources page
can read.

### 31. Credentials and access

Not urgent, but worth doing since this is a public URL over private betting data:

- `apps/web/.env.local` holds the Supabase **superuser** connection string in plaintext
  (git-ignored, correctly, and outside OneDrive — good). The web app only ever reads. Create a
  **read-only Postgres role** for the site and leave the write role to ingest.
- `SITE_PASSWORD` is `bethub-local` — a weak password on a publicly reachable URL.
- `/api/auth/login` has **no rate limiting**. A weak password plus unlimited attempts on a public
  endpoint is the one genuinely exploitable thing here. Add attempt throttling by IP.
- The session cookie is a 30-day JWT with no revocation path. Acceptable for single-user; just
  know that rotating `SESSION_SECRET` is the only way to invalidate.
- (Carried over, separate repo: the DataGolf key in
  `golf-modeling\claude\deploy\README_DEPLOY.md` still needs rotating.)

### 32. No tests on the money math

`pnpm contract:test` validates example payloads against the schema. There are **zero tests** for
`settlePnlUnits`, `rollup`, or `bankrollCurve` — the functions that decide every number on the
site. Add a small test file covering: American odds both signs, push/void excluded from ROI,
model-supplied vs derived `pnl_units`, empty input, and the curve's cumulative arithmetic.

---

## P5 — the strategic gap

Everything above makes the existing thing correct and polished. This is the one change that would
move it from *very good* to *best in class*, and it's a bigger piece of work — flagging it as a
decision rather than a task.

**The site tracks what the models recommended, not what the user actually bet.** There is no
record of whether a pick was placed, at what price it was actually taken, or at what stake. Every
number on the Tracker is therefore theoretical model performance, not realized bankroll
performance. The moment a line moves between the model run and the bet being placed — or a play is
skipped — the two diverge permanently.

Turning it into a real ledger means adding the first **write path** to the app:

- A tap target on each `BetCard`: `Placed` → confirm actual odds and stake (pre-filled from the
  recommendation), or `Skipped`.
- A `wagers` table keyed to `(source, bet_id)`, holding actual price, actual stake, book, and
  placed-at timestamp.
- Tracker gains a toggle: **Model P/L** vs **My P/L**, and a third derived number — *execution
  slippage*, the gap between the two. That number is worth real money to know.

This depends on nothing else in this document and can be scheduled independently. Do P0 and P1
first regardless.

---

## Suggested sequencing

1. **P0 1-6** — one focused pass. The site stops lying. Half a day.
2. **P1 7, 8, 10** — sample-size honesty, expected-vs-actual, market/book breakdowns. Highest
   analytical value per hour, and all three run on data already in the DB.
3. **P2 16-20 + P3 22-25** — mobile and accessibility pass. Mostly CSS and small components.
4. **P1 9, 11-15** — CLV (needs model-side cooperation), risk metrics, chart axis, guardrails.
5. **P4 27-32** — performance and hardening.
6. **P5** — decide whether to build the real wager ledger.

## Don't break these

- The Zod contract is the interface. Any change to `packages/contract/src/schema.ts` must stay
  backward compatible with every file currently in `dashboard_feed\` — check with
  `pnpm ingest:dry` before and after.
- No charting library, no CSS framework. Inline SVG and hand-written CSS are deliberate choices
  and they're working.
- `packages/core` stays pure and dependency-free — that's what makes the math testable.
- Preserve the light/dark override pattern exactly: `prefers-color-scheme` for the default plus
  `:root[data-theme=...]` overrides that win in **both** directions.
