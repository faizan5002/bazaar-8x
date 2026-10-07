/** Expected launch months are "YYYY-MM" strings; these helpers keep the "is this a sensible month?" rule in one place. */

/** Furthest ahead a seller may say they'll launch. */
export const MAX_LAUNCH_MONTHS_AHEAD = 36;

const monthIndex = (ym: string) => {
  const [year, month] = ym.split('-').map(Number);
  return year * 12 + (month - 1);
};

export const currentMonth = (now = new Date()) => `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

/** Returns a message if `ym` isn't a sensible launch month (already past, or too far away), otherwise null. */
export function launchMonthProblem(ym: string, now = new Date()): string | null {
  const ahead = monthIndex(ym) - monthIndex(currentMonth(now));
  if (ahead < 0) return 'expectedLaunch cannot be in the past';
  if (ahead > MAX_LAUNCH_MONTHS_AHEAD) return `expectedLaunch must be within the next ${MAX_LAUNCH_MONTHS_AHEAD} months`;
  return null;
}
