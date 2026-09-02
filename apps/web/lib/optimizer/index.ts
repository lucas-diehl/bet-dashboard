// Browser DFS optimizer — turns a DFS-ENGINE pool (build_sim_payload) into a set of
// diversified lineups. It reuses the engine's pre-graded candidate set (`cands` +
// `cand_metrics`, graded on 50k sims), so ranking rests on real simulation, not a JS
// re-sim. Each run uses a fresh seed → the candidate scores get a small perturbation,
// so no two runs (or users) get identical lineups (SaberSim/Stokastic-style). No $/ROI
// is ever surfaced — GPP ranking uses the engine's optimality metric internally only.

export interface PoolPlayer {
  name: string;
  team?: string | null;
  pos?: string;
  salary: number;
  proj: number;
  own?: number;
}

export interface PoolRoster {
  n?: number | null;
  cap: number;
  floor?: number | null;
  slots?: Record<string, number> | null;
  flex?: { positions: string[]; count: number } | null;
  team_limit?: number | null;
  max_per_game?: number | null;
}

export interface CandMetric {
  gppRoi?: number;
  cash?: number;
  win?: number;
  top1?: number;
  fin?: number;
  dupe?: number;
  own?: number;
  proj?: number;
}

export interface Pool {
  sport: string;
  site: string;
  slate_date: string;
  slate_label?: string;
  slate_type?: string;
  round?: number;
  event?: string;
  k: number;
  field_size?: number;
  qlevels: number[];
  roster: PoolRoster;
  players: PoolPlayer[];
  draws: number[][];
  fgrid: number[][];
  gpp_mult: number[];
  cash_mult: number[];
  cands: number[][];
  opt_k?: number;
  cand_metrics?: (CandMetric | null)[] | null;
  contests?: unknown[];
}

export type ContestType = "cash" | "single" | "gpp20" | "large";

// SaberSim/Stokastic-style contest presets. Each ranks the engine's pre-graded
// candidates by a different metric and wants a different amount of run-to-run
// variety + lineup uniqueness:
//   cash   -> double-ups: rank by cash EV (floor), tight builds
//   single -> one-entry tournament: one balanced +ROI lineup
//   gpp20  -> 20-max tournament: diversified tournament-ROI set
//   large  -> mass multi-entry: rank by ceiling (P[1st]) with max uniqueness + leverage
export const CONTESTS: Record<ContestType, { metric: keyof CandMetric; jitter: number; overlap: number }> = {
  cash: { metric: "cash", jitter: 0.1, overlap: 0 },
  single: { metric: "gppRoi", jitter: 0.2, overlap: 0 },
  gpp20: { metric: "gppRoi", jitter: 0.3, overlap: 1 },
  large: { metric: "top1", jitter: 0.45, overlap: 2 },
};

export interface OptSettings {
  nLineups: number;
  contest: ContestType;
  maxExposure: number; // 0..1 per-player cap across the set
  locks: number[]; // player indices forced into every lineup
  excludes: number[]; // player indices removed from the pool
  maxOverlap?: number; // max shared players between any two lineups (default n - CONTESTS[contest].overlap)
  jitter?: number; // 0..1 randomization strength (default per contest)
  seed?: number;
}

export interface OptLineup {
  players: number[];
  salary: number;
  proj: number;
  ceiling: number;
  win: number; // P(finish 1st), percent
  own: number; // avg roster ownership, 0..1
}

export interface OptResult {
  lineups: OptLineup[];
  exposure: { idx: number; count: number; pct: number }[]; // per-player exposure in the set
  eligible: number; // candidates that survived locks/excludes
}

export function parsePool(json: string): Pool {
  return JSON.parse(json) as Pool;
}

// Deterministic PRNG (mulberry32) so a given seed reproduces a run.
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Lineup ceiling ≈ 85th percentile of its total across the K simulated draws.
function lineupCeiling(pool: Pool, idx: number[]): number {
  const K = pool.k;
  if (!K || !pool.draws.length) return 0;
  const totals = new Float64Array(K);
  for (const p of idx) {
    const d = pool.draws[p];
    if (!d) continue;
    for (let s = 0; s < K; s++) totals[s] += d[s] ?? 0;
  }
  const arr = Array.from(totals).sort((a, b) => a - b);
  return arr[Math.min(K - 1, Math.floor(0.85 * K))] ?? 0;
}

const num = (x: unknown): number | undefined => (typeof x === "number" && isFinite(x) ? x : undefined);
const sortKey = (a: number[]) => a.slice().sort((x, y) => x - y).join("-");

export function generateLineups(pool: Pool, settings: OptSettings): OptResult {
  const seed = settings.seed ?? ((Math.random() * 2 ** 32) >>> 0);
  const rng = mulberry32(seed);
  const n = pool.roster.n ?? pool.cands[0]?.length ?? 6;
  const cfg = CONTESTS[settings.contest] ?? CONTESTS.gpp20;
  const maxOverlap = settings.maxOverlap ?? Math.max(1, n - cfg.overlap);
  const capCount = Math.max(1, Math.ceil(settings.maxExposure * settings.nLineups));
  const jitter = settings.jitter ?? cfg.jitter;
  const locks = new Set(settings.locks);
  const excludes = new Set(settings.excludes);
  const contestKey = cfg.metric;

  // Candidates that satisfy locks (⊇) and excludes (∩ = ∅).
  const eligible = pool.cands
    .map((players, i) => ({ players, m: (pool.cand_metrics?.[i] ?? null) as CandMetric | null }))
    .filter(({ players }) => {
      for (const l of locks) if (!players.includes(l)) return false;
      for (const p of players) if (excludes.has(p)) return false;
      return true;
    });

  // Rank by the contest metric with a fresh seeded perturbation (run-to-run variety).
  const scored = eligible
    .map((c) => {
      const base = num(c.m?.[contestKey]) ?? num(c.m?.gppRoi) ?? num(c.m?.win) ?? num(c.m?.proj) ?? 0;
      return { ...c, score: base * (1 + (rng() - 0.5) * jitter) };
    })
    .sort((a, b) => b.score - a.score);

  // Exposure-capped, overlap-limited, dedup greedy portfolio.
  const chosen: typeof scored = [];
  const expo = new Map<number, number>();
  const seen = new Set<string>();
  for (const c of scored) {
    if (chosen.length >= settings.nLineups) break;
    if (c.players.some((p) => (expo.get(p) ?? 0) >= capCount)) continue;
    const k = sortKey(c.players);
    if (seen.has(k)) continue;
    if (chosen.some((o) => { const set = new Set(o.players); return c.players.filter((p) => set.has(p)).length > maxOverlap; })) continue;
    chosen.push(c);
    seen.add(k);
    for (const p of c.players) expo.set(p, (expo.get(p) ?? 0) + 1);
  }

  const lineups: OptLineup[] = chosen.map((c) => {
    const salary = c.players.reduce((s, p) => s + (pool.players[p]?.salary ?? 0), 0);
    const proj = num(c.m?.proj) ?? c.players.reduce((s, p) => s + (pool.players[p]?.proj ?? 0), 0);
    const own = num(c.m?.own) ?? c.players.reduce((s, p) => s + (pool.players[p]?.own ?? 0), 0) / Math.max(1, c.players.length);
    const win = (num(c.m?.win) ?? num(c.m?.top1) ?? 0) * 100;
    return {
      players: c.players,
      salary,
      proj: Math.round(proj * 10) / 10,
      ceiling: Math.round(lineupCeiling(pool, c.players) * 10) / 10,
      win: Math.round(win * 100) / 100,
      own,
    };
  });

  const exposure = [...expo.entries()]
    .map(([idx, count]) => ({ idx, count, pct: count / Math.max(1, chosen.length) }))
    .sort((a, b) => b.count - a.count);

  return { lineups, exposure, eligible: eligible.length };
}
