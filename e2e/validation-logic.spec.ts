import { expect, test } from '@playwright/test';
import { demandSignal, MIN_RESPONSES_FOR_SIGNAL, percent } from '../backend/src/common/demand-signal';
import { priceBuckets } from '../backend/src/common/price-buckets';
import { launchMonthProblem } from '../backend/src/validations/launch-month';

/**
 * Pure logic, tested directly (no server, no browser). These two modules decide what shoppers are asked and what
 * sellers are told, so their rules are pinned down exactly.
 */
test.beforeEach(({}, testInfo) => test.skip(testInfo.project.name !== 'desktop', 'pure logic runs once'));

test.describe('price buckets', () => {
  test('the documented example: $79–99', () => {
    expect(priceBuckets(79, 99).map((b) => b.label)).toEqual(['Under $79', '$79–$86', '$86–$92', '$92–$99', 'Over $99']);
  });

  test('indices, bounds and open ends', () => {
    const buckets = priceBuckets(79, 99);
    expect(buckets.map((b) => b.index)).toEqual([0, 1, 2, 3, 4]);
    expect(buckets[0]).toMatchObject({ min: null, max: 79 }); // open below
    expect(buckets[1]).toMatchObject({ min: 79, max: 86 });
    expect(buckets[2]).toMatchObject({ min: 86, max: 92 });
    expect(buckets[3]).toMatchObject({ min: 92, max: 99 });
    expect(buckets[4]).toMatchObject({ min: 99, max: null }); // open above
  });

  test('wide ranges round to whole dollars; narrow ones keep their cents', () => {
    expect(priceBuckets(24, 34).map((b) => b.label)).toEqual(['Under $24', '$24–$27', '$27–$31', '$31–$34', 'Over $34']);
    expect(priceBuckets(9.99, 12.49).map((b) => b.label)).toEqual(['Under $9.99', '$9.99–$10.82', '$10.82–$11.66', '$11.66–$12.49', 'Over $12.49']);
  });

  test('always five buckets with strictly increasing inner boundaries, across many ranges', () => {
    for (const [lo, hi] of [[1, 2], [5, 11.5], [10, 40], [79, 99], [120.5, 149.99], [0.5, 100000], [3, 9], [49, 50]]) {
      const b = priceBuckets(lo, hi);
      expect(b).toHaveLength(5);
      const edges = [b[0].max!, b[1].max!, b[2].max!, b[3].max!];
      expect(edges[0], `${lo}–${hi}`).toBe(lo);
      expect(edges[3], `${lo}–${hi}`).toBe(hi);
      for (let i = 1; i < edges.length; i++) expect(edges[i], `${lo}–${hi} boundary ${i}`).toBeGreaterThan(edges[i - 1]);
    }
  });

  test('a fixed price (min = max) still yields five valid buckets; invalid ranges are refused', () => {
    const fixed = priceBuckets(50, 50);
    expect(fixed.map((b) => b.index)).toEqual([0, 1, 2, 3, 4]);
    expect(fixed[0].label).toBe('Under $50');
    expect(fixed[4].label).toBe('Over $50');
    expect(() => priceBuckets(0, 10)).toThrow(RangeError);
    expect(() => priceBuckets(-5, 10)).toThrow(RangeError);
    expect(() => priceBuckets(20, 10)).toThrow(RangeError);
    expect(() => priceBuckets(Number.NaN, 10)).toThrow(RangeError);
  });
});

test.describe('demand signal', () => {
  const signal = (interested: number, maybe: number, notInterested: number) => demandSignal({ interested, maybe, notInterested });

  test('score = interested% + maybe% × 0.5, with the labels from the brief', () => {
    const flagship = signal(860, 270, 154); // the seeded Smart Travel Backpack
    expect(flagship).toMatchObject({ total: 1284, interestedPercent: 67, maybePercent: 21, notInterestedPercent: 12, openPercent: 88, score: 77.5, level: 'strong', label: 'Strong demand signal' });
    expect(signal(1, 1, 1).openPercent, 'Interested + Maybe from the exact counts, not the sum of two rounded shares').toBe(66.7);
    expect(signal(0, 0, 0).openPercent).toBe(0);
    expect(signal(50, 20, 30)).toMatchObject({ score: 60, level: 'strong' }); // boundary: exactly 60 is strong
    expect(signal(50, 18, 32)).toMatchObject({ score: 59, level: 'moderate', label: 'Moderate demand signal' });
    expect(signal(40, 0, 60)).toMatchObject({ score: 40, level: 'moderate' }); // boundary: exactly 40 is moderate
    expect(signal(39, 0, 61)).toMatchObject({ score: 39, level: 'weak', label: 'Weak demand signal' });
    expect(signal(0, 0, 100)).toMatchObject({ score: 0, level: 'weak' });
    expect(signal(100, 0, 0)).toMatchObject({ score: 100, level: 'strong' });
  });

  test('"maybe" counts for half an "interested"', () => {
    expect(signal(0, 100, 0).score).toBe(50);
    expect(signal(0, 100, 0).level).toBe('moderate');
  });

  test(`fewer than ${MIN_RESPONSES_FOR_SIGNAL} responses is "Too early to tell", but the score is still reported`, () => {
    const early = signal(25, 4, 0); // 29 responses, near-unanimous
    expect(early).toMatchObject({ total: 29, level: 'early', label: 'Too early to tell', reliable: false, minResponses: 30 });
    expect(early.score).toBeGreaterThan(90);
    expect(signal(26, 4, 0)).toMatchObject({ total: 30, level: 'strong', reliable: true }); // 30 is enough
  });

  test('no responses: all zeros and "Too early to tell", never NaN', () => {
    expect(signal(0, 0, 0)).toMatchObject({ total: 0, interestedPercent: 0, maybePercent: 0, notInterestedPercent: 0, score: 0, level: 'early' });
  });

  test('the score uses exact shares, so rounding the displayed percentages cannot tip a borderline case', () => {
    // 1/3 each: shown as 33.3 / 33.3 / 33.3, exact score 50.0 → moderate.
    expect(signal(100, 100, 100)).toMatchObject({ interestedPercent: 33.3, score: 50, level: 'moderate' });
    expect(percent(1, 3)).toBe(33.3);
    expect(percent(5, 0)).toBe(0);
  });
});

test.describe('launch month', () => {
  const now = new Date(2026, 9, 15); // 15 Oct 2026
  test('the current month and the near future are fine; the past and the far future are not', () => {
    expect(launchMonthProblem('2026-10', now)).toBeNull();
    expect(launchMonthProblem('2026-12', now)).toBeNull();
    expect(launchMonthProblem('2029-10', now)).toBeNull(); // exactly 36 months ahead
    expect(launchMonthProblem('2026-09', now)).toMatch(/past/);
    expect(launchMonthProblem('2025-12', now)).toMatch(/past/);
    expect(launchMonthProblem('2029-11', now)).toMatch(/36 months/);
  });
});
