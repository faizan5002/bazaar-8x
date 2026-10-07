/**
 * Preferred-price buckets for a demand validation. ONE function, used by the validation detail API, by response
 * validation (is this `priceBucket` real?) and by the analytics, so all three always agree.
 *
 * For a proposed range [min, max] there are always five buckets:
 *
 *     0 Under min   |  1 lower third  |  2 middle third  |  3 upper third  |  4 Over max
 *     (open below)     [min, a)          [a, b)             [b, max]          (open above)
 *
 *   e.g. $79–99  →  Under $79 · $79–$86 · $86–$92 · $92–$99 · Over $99
 *
 * The outer two are the useful part: "Under" says shoppers expect to pay less than proposed (price pressure),
 * "Over" says there is room to charge more.
 *
 * Rounding rule: the inner boundaries a = min + width/3 and b = min + 2·width/3 are rounded
 *   – to whole dollars when the range is at least $6 wide (so every bucket is at least ~$1 wide and boundaries stay
 *     strictly increasing: $79–99 gives a = 85.67 → 86, b = 92.33 → 92);
 *   – to the nearest cent otherwise (narrow ranges such as $9.99–12.49 keep their precision).
 * min and max are used exactly as given. If min equals max the three middle buckets collapse to that single price;
 * their indices and labels are still valid, the interesting signal is just the outer two.
 */

export const PRICE_BUCKET_COUNT = 5;
/** Ranges at least this wide (in dollars) get whole-dollar inner boundaries. */
const WHOLE_DOLLAR_MIN_WIDTH = 6;

export interface PriceBucket {
  /** 0–4: the value stored as `ValidationResponse.priceBucket`. */
  index: number;
  label: string;
  /** Lower bound (inclusive), or null for the open-ended "Under" bucket. */
  min: number | null;
  /** Upper bound, or null for the open-ended "Over" bucket. */
  max: number | null;
}

const toCents = (n: number) => Math.round(n * 100);

/** "$79", "$79.50": whole dollars stay clean, anything else gets two decimals. */
const money = (cents: number) => (cents % 100 === 0 ? `$${cents / 100}` : `$${(cents / 100).toFixed(2)}`);

export function priceBuckets(priceMin: number, priceMax: number): PriceBucket[] {
  if (!(priceMin > 0) || !(priceMax >= priceMin)) throw new RangeError(`Invalid price range ${priceMin}–${priceMax}`);

  const lo = toCents(priceMin);
  const hi = toCents(priceMax);
  const width = hi - lo;
  const roundTo = width >= WHOLE_DOLLAR_MIN_WIDTH * 100 ? 100 : 1; // cents
  const inner = (third: number) => Math.round((lo + (width * third) / 3) / roundTo) * roundTo;
  const a = inner(1);
  const b = inner(2);

  const bound = (from: number, to: number) => (from === to ? money(from) : `${money(from)}–${money(to)}`);
  return [
    { index: 0, label: `Under ${money(lo)}`, min: null, max: lo / 100 },
    { index: 1, label: bound(lo, a), min: lo / 100, max: a / 100 },
    { index: 2, label: bound(a, b), min: a / 100, max: b / 100 },
    { index: 3, label: bound(b, hi), min: b / 100, max: hi / 100 },
    { index: 4, label: `Over ${money(hi)}`, min: hi / 100, max: null },
  ];
}
