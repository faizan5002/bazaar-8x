const currency = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' });

export const formatPrice = (amount: number) => currency.format(amount);

export const discountPercent = (price: number, originalPrice: number | null) =>
  originalPrice && originalPrice > price ? Math.round((1 - price / originalPrice) * 100) : 0;

/** "Tue, Oct 13" for a delivery `days` from now. */
export function deliveryDate(days: number, from = new Date()) {
  const d = new Date(from);
  d.setDate(d.getDate() + days);
  return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
}

/** "Fri, Oct 9" for a date-only string like "2026-10-09" (parsed as a local calendar date, so no timezone shift). */
export function formatDateOnly(isoDate: string) {
  const [y, m, d] = isoDate.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
}

/** "$4.99", or "FREE" for zero (shipping). */
export const formatShipping = (amount: number) => (amount === 0 ? 'FREE' : formatPrice(amount));

/** "September 15, 2026" */
export const formatDate = (iso: string) => new Date(iso).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });

const priceBound = (n: number) => (Number.isInteger(n) ? `$${n.toLocaleString('en-US')}` : formatPrice(n));

/** "$79–99" for whole-dollar ranges, "$9.99–$12.49" otherwise, and "$50" when min = max. */
export function formatPriceRange(min: number, max: number) {
  if (min === max) return priceBound(min);
  const wholeDollars = Number.isInteger(min) && Number.isInteger(max);
  return `${priceBound(min)}–${wholeDollars ? max.toLocaleString('en-US') : priceBound(max)}`;
}

/** "2026-12" → "December 2026". */
export function formatLaunchMonth(yearMonth: string) {
  const [y, m] = yearMonth.split('-').map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
}

/** "1,284 shoppers responded" / "1 shopper responded" / "Be the first to respond". */
export function responseCountText(count: number, tense: 'past' | 'perfect' = 'past') {
  if (count === 0) return 'Be the first to respond';
  const noun = count === 1 ? 'shopper' : 'shoppers';
  return `${count.toLocaleString('en-US')} ${noun} ${tense === 'past' ? 'responded' : count === 1 ? 'has responded' : 'have responded'}`;
}
