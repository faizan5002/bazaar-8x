/**
 * How strong is the demand for a validated product? One small module, like pricing.ts, so the seller dashboard,
 * the results page and the tests all use the same rule. Tune the thresholds here.
 *
 *   score = interested% + maybe% × 0.5          (0–100)
 *
 *   ≥ 60            → Strong demand signal
 *   40 – 59.99      → Moderate demand signal
 *   < 40            → Weak demand signal
 *   < 30 responses  → Too early to tell        (the score is still reported; it just isn't trusted yet)
 *
 * This is a signal of customer intent, not a sales forecast.
 */

export const MIN_RESPONSES_FOR_SIGNAL = 30;
export const STRONG_SCORE = 60;
export const MODERATE_SCORE = 40;
/** A "maybe" counts for half an "interested". */
export const MAYBE_WEIGHT = 0.5;

export type SignalLevel = 'strong' | 'moderate' | 'weak' | 'early';

export const SIGNAL_LABELS: Record<SignalLevel, string> = {
  strong: 'Strong demand signal',
  moderate: 'Moderate demand signal',
  weak: 'Weak demand signal',
  early: 'Too early to tell',
};

export interface InterestCounts {
  interested: number;
  maybe: number;
  notInterested: number;
}

export interface DemandSignal {
  total: number;
  interestedPercent: number;
  maybePercent: number;
  notInterestedPercent: number;
  /** Share who are Interested or Maybe (computed from the exact counts, so it never drifts from the two rounded parts). */
  openPercent: number;
  score: number;
  level: SignalLevel;
  label: string;
  /** False while there are fewer than MIN_RESPONSES_FOR_SIGNAL responses. */
  reliable: boolean;
  minResponses: number;
}

/** Percentage of `total`, to one decimal place. 0 when there is nothing to divide by. */
export const percent = (count: number, total: number) => (total > 0 ? Math.round((count / total) * 1000) / 10 : 0);

export function demandSignal(counts: InterestCounts): DemandSignal {
  const total = counts.interested + counts.maybe + counts.notInterested;
  const interestedPercent = percent(counts.interested, total);
  const maybePercent = percent(counts.maybe, total);
  const notInterestedPercent = percent(counts.notInterested, total);
  const openPercent = percent(counts.interested + counts.maybe, total);
  // Score from the exact shares (not the rounded ones) so rounding can't tip a borderline case.
  const exact = total > 0 ? ((counts.interested + counts.maybe * MAYBE_WEIGHT) / total) * 100 : 0;
  const score = Math.round(exact * 10) / 10;

  const reliable = total >= MIN_RESPONSES_FOR_SIGNAL;
  const level: SignalLevel = !reliable ? 'early' : score >= STRONG_SCORE ? 'strong' : score >= MODERATE_SCORE ? 'moderate' : 'weak';
  return { total, interestedPercent, maybePercent, notInterestedPercent, openPercent, score, level, label: SIGNAL_LABELS[level], reliable, minResponses: MIN_RESPONSES_FOR_SIGNAL };
}
