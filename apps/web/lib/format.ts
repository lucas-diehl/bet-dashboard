export function cls(...parts: (string | false | null | undefined)[]): string {
  return parts.filter(Boolean).join(" ");
}

export function fmtOdds(n: number | null | undefined): string {
  if (n == null || n === 0) return "—";
  return n > 0 ? `+${n}` : `${n}`;
}

export function fmtUnits(n: number | null | undefined, withU = true): string {
  if (n == null) return "—";
  const s = `${n > 0 ? "+" : n < 0 ? "−" : ""}${Math.abs(n).toFixed(2)}`;
  return withU ? `${s}u` : s;
}

export function fmtPct(n: number | null | undefined, digits = 0): string {
  if (n == null) return "—";
  return `${(n * 100).toFixed(digits)}%`;
}

export function fmtSignedPct(n: number | null | undefined, digits = 1): string {
  if (n == null) return "—";
  return `${n > 0 ? "+" : n < 0 ? "−" : ""}${Math.abs(n * 100).toFixed(digits)}%`;
}

export function fmtDate(iso: string): string {
  const d = new Date(iso.length <= 10 ? iso + "T12:00:00Z" : iso);
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
}

export function fmtTime(iso: string | null | undefined, timeZone?: string): string {
  if (!iso) return "";
  const d = new Date(iso);
  const t = d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", timeZone });
  if (!timeZone) return t;
  // Append the timezone abbreviation (e.g. "1:00 PM EDT") so a server-rendered
  // time is unambiguous rather than silently in UTC.
  const abbr = new Intl.DateTimeFormat("en-US", { timeZone, timeZoneName: "short" })
    .formatToParts(d)
    .find((p) => p.type === "timeZoneName")?.value;
  return abbr ? `${t} ${abbr}` : t;
}

export function signClass(n: number | null | undefined): string {
  if (n == null || n === 0) return "";
  return n > 0 ? "pos" : "neg";
}
