// The app's wall clock. "Today", event times, and staleness must be computed
// against a fixed configured timezone — NOT the server's clock (Vercel runs UTC,
// which rolls the date over at 8 PM ET and shifts every rendered kickoff time).
// Override with APP_TIMEZONE; defaults to US Eastern.

export function appTimeZone(): string {
  return process.env.APP_TIMEZONE || "America/New_York";
}

/** Current calendar date in the app timezone, as YYYY-MM-DD. */
export function appToday(): string {
  // en-CA formats as YYYY-MM-DD.
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: appTimeZone(),
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

/** Whole-day difference a − b for two YYYY-MM-DD strings (positive if a is later). */
export function dayDiff(a: string, b: string): number {
  const ta = Date.parse(a + "T00:00:00Z");
  const tb = Date.parse(b + "T00:00:00Z");
  return Math.round((ta - tb) / 86400000);
}
