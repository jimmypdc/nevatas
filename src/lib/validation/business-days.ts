// Business-days arithmetic. Counts Mon–Fri in UTC, ignoring federal holidays.
//
// Federal holiday handling is intentionally out of Phase 1 scope: a holiday
// calendar must be plan-region-aware (US federal vs state vs banking holidays
// vs custom) and pulled from a maintained source. Phase 1 over-counts by at
// most ~10 days per year, biasing the validator toward earlier warnings —
// the conservative direction for a compliance-flagging tool.

const MS_PER_DAY = 86_400_000;

export function isWeekend(date: Date): boolean {
  const day = date.getUTCDay();
  return day === 0 || day === 6;
}

// Inclusive of `from`, exclusive of `to`. Returns 0 if to <= from.
export function businessDaysBetween(from: Date, to: Date): number {
  const startUtc = Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), from.getUTCDate());
  const endUtc = Date.UTC(to.getUTCFullYear(), to.getUTCMonth(), to.getUTCDate());
  if (endUtc <= startUtc) return 0;
  let count = 0;
  for (let t = startUtc; t < endUtc; t += MS_PER_DAY) {
    if (!isWeekend(new Date(t))) count++;
  }
  return count;
}
