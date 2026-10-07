/**
 * The marketplace's (mock) pricing rules, in one place. The cart view and order creation both call this, so what the
 * shopper sees in the cart is exactly what is charged at checkout. The frontend never recomputes any of it.
 *
 *   Subtotal  Σ unit price × quantity
 *   Shipping  Standard: free when EVERY item ships free (the product page's "FREE delivery"), otherwise a flat $4.99.
 *             Express:  flat $14.99, faster.
 *   Tax       8% of the subtotal. A flat mock rate, not real tax logic.
 *
 * All arithmetic is done in integer cents so totals never drift (0.1 + 0.2 style errors).
 */

export type DeliveryOptionId = 'standard' | 'express';
export const DELIVERY_OPTION_IDS: DeliveryOptionId[] = ['standard', 'express'];

/** Most units of one product a single order may contain (the quantity picker never offers more). */
export const MAX_QUANTITY_PER_ITEM = 10;
export const TAX_RATE = 0.08;

const STANDARD_FEE_CENTS = 499;
const EXPRESS_FEE_CENTS = 1499;

export interface PricedLine {
  unitPrice: number;
  quantity: number;
  freeShipping: boolean;
  deliveryDays: number;
}

export interface DeliveryQuote {
  id: DeliveryOptionId;
  label: string;
  description: string;
  /** Shipping cost for this option. */
  cost: number;
  days: number;
  /** ISO date (YYYY-MM-DD). */
  estimatedDelivery: string;
  /** Grand total if the shopper picks this option. */
  total: number;
}

export interface Pricing {
  subtotal: number;
  tax: number;
  /** Standard delivery, so the cart can show a sensible default estimate. */
  shipping: number;
  total: number;
  deliveryOptions: DeliveryQuote[];
}

const cents = (amount: number) => Math.round(amount * 100);
const dollars = (c: number) => c / 100;
// Calendar dates use the server's local clock (not UTC), so an estimate agrees with the dates the storefront shows.
const pad = (n: number) => String(n).padStart(2, '0');
export const isoDate = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const addDays = (from: Date, days: number) => {
  const d = new Date(from);
  d.setDate(d.getDate() + days);
  return d;
};

const OPTION_COPY: Record<DeliveryOptionId, { label: string; description: (standardFee: number) => string }> = {
  standard: { label: 'Standard delivery', description: () => 'Free when every item ships free, otherwise a flat $4.99.' },
  express: { label: 'Express delivery', description: () => 'Faster delivery for a flat $14.99.' },
};

function price(lines: PricedLine[], option: DeliveryOptionId, today: Date) {
  const subtotalCents = lines.reduce((sum, l) => sum + cents(l.unitPrice) * l.quantity, 0);
  const taxCents = Math.round(subtotalCents * TAX_RATE);
  const standardDays = Math.max(1, ...lines.map((l) => l.deliveryDays));
  const shippingCents = option === 'express' ? EXPRESS_FEE_CENTS : lines.every((l) => l.freeShipping) ? 0 : STANDARD_FEE_CENTS;
  const days = option === 'express' ? Math.max(1, Math.ceil(standardDays / 2)) : standardDays;
  return { subtotalCents, taxCents, shippingCents, days, totalCents: subtotalCents + taxCents + shippingCents, estimatedDelivery: isoDate(addDays(today, days)) };
}

/** Prices a set of lines for one delivery option (used when an order is placed). */
export function priceFor(lines: PricedLine[], option: DeliveryOptionId, today = new Date()) {
  const p = price(lines, option, today);
  return {
    subtotal: dollars(p.subtotalCents),
    shipping: dollars(p.shippingCents),
    tax: dollars(p.taxCents),
    total: dollars(p.totalCents),
    days: p.days,
    estimatedDelivery: p.estimatedDelivery,
  };
}

/** Subtotal, tax, and every delivery option with its own cost, date and grand total (used for the cart and checkout). */
export function quote(lines: PricedLine[], today = new Date()): Pricing {
  const deliveryOptions = DELIVERY_OPTION_IDS.map((id): DeliveryQuote => {
    const p = price(lines, id, today);
    return {
      id,
      label: OPTION_COPY[id].label,
      description: OPTION_COPY[id].description(STANDARD_FEE_CENTS),
      cost: dollars(p.shippingCents),
      days: p.days,
      estimatedDelivery: p.estimatedDelivery,
      total: dollars(p.totalCents),
    };
  });
  const standard = price(lines, 'standard', today);
  return {
    subtotal: dollars(standard.subtotalCents),
    tax: dollars(standard.taxCents),
    shipping: dollars(standard.shippingCents),
    total: dollars(standard.totalCents),
    deliveryOptions,
  };
}
