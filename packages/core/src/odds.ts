// Odds conversions. American odds in, decimal / implied-probability out.

export function americanToDecimal(american: number): number {
  return american > 0 ? 1 + american / 100 : 1 + 100 / Math.abs(american);
}

export function decimalToAmerican(decimal: number): number {
  return decimal >= 2 ? Math.round((decimal - 1) * 100) : Math.round(-100 / (decimal - 1));
}

/** Vig-inclusive implied probability of a single American price. */
export function impliedProb(american: number): number {
  return american > 0 ? 100 / (american + 100) : Math.abs(american) / (Math.abs(american) + 100);
}

/** Profit (not total return) in units if a bet at these odds wins. */
export function profitUnitsOnWin(american: number, stakeUnits: number): number {
  return stakeUnits * (americanToDecimal(american) - 1);
}

export function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
