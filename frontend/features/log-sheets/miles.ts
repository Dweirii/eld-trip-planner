/**
 * Whole "total miles driving today" per sheet that add up exactly to the trip's rounded total.
 * Rounding each day on its own can drift (603.5 + 368.6 → 604 + 369 = 973 against 972), so the
 * leftover miles go to the days with the largest fractions (largest-remainder rounding).
 */
export function dailyMiles(perDay: readonly number[], totalMiles: number): number[] {
  const whole = perDay.map((value) => Math.floor(value));
  const fraction = (index: number) => perDay[index] - whole[index];
  // Largest fraction first; ties go to the earlier day.
  const byFraction = perDay.map((_, index) => index).sort((a, b) => fraction(b) - fraction(a) || a - b);
  let leftover = Math.round(totalMiles) - whole.reduce((sum, value) => sum + value, 0);
  // Missing miles go to the largest fractions; if the days overshoot, the smallest give them back.
  for (const index of leftover > 0 ? byFraction : [...byFraction].reverse()) {
    if (leftover === 0) break;
    if (leftover > 0) {
      whole[index] += 1;
      leftover -= 1;
    } else if (whole[index] > 0) {
      whole[index] -= 1;
      leftover += 1;
    }
  }
  return whole;
}
