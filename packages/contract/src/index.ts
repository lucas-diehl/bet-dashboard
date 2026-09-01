import { PicksFileSchema, ResultsFileSchema, ValuesFileSchema, EloFileSchema, type PicksFile, type ResultsFile, type ValuesFile, type EloFile } from "./schema";

export * from "./schema";
export * from "./registry";

/**
 * Default feed directory (where models drop their JSON). Overridable with the
 * FEED_DIR env var. Kept in OneDrive so the R models can write to it directly.
 */
export function feedDir(): string {
  return process.env.FEED_DIR ?? "C:\\Users\\ljdie\\OneDrive\\Documents\\dashboard_feed";
}

export interface ParseResult<T> {
  ok: boolean;
  data?: T;
  errors?: string[];
}

function flatten(err: import("zod").ZodError): string[] {
  return err.issues.map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`);
}

/** Throwing parse — use when you want a hard failure on bad input. */
export function parsePicksFile(json: unknown): PicksFile {
  return PicksFileSchema.parse(json);
}

/** Safe parse returning a flat list of human-readable errors. */
export function safeParsePicksFile(json: unknown): ParseResult<PicksFile> {
  const r = PicksFileSchema.safeParse(json);
  return r.success ? { ok: true, data: r.data } : { ok: false, errors: flatten(r.error) };
}

export function parseResultsFile(json: unknown): ResultsFile {
  return ResultsFileSchema.parse(json);
}

export function safeParseResultsFile(json: unknown): ParseResult<ResultsFile> {
  const r = ResultsFileSchema.safeParse(json);
  return r.success ? { ok: true, data: r.data } : { ok: false, errors: flatten(r.error) };
}

export function parseValuesFile(json: unknown): ValuesFile {
  return ValuesFileSchema.parse(json);
}

export function safeParseValuesFile(json: unknown): ParseResult<ValuesFile> {
  const r = ValuesFileSchema.safeParse(json);
  return r.success ? { ok: true, data: r.data } : { ok: false, errors: flatten(r.error) };
}

export function parseEloFile(json: unknown): EloFile {
  return EloFileSchema.parse(json);
}

export function safeParseEloFile(json: unknown): ParseResult<EloFile> {
  const r = EloFileSchema.safeParse(json);
  return r.success ? { ok: true, data: r.data } : { ok: false, errors: flatten(r.error) };
}

/** Identify a feed file by its distinguishing top-level array key. */
export function classifyFeedFile(json: unknown): "picks" | "results" | "values" | "elo" | "unknown" {
  if (json && typeof json === "object") {
    if ("bets" in (json as object)) return "picks";
    if ("results" in (json as object)) return "results";
    if ("values" in (json as object)) return "values";
    if ("ratings" in (json as object)) return "elo";
  }
  return "unknown";
}
