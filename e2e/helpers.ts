import type { APIRequestContext, Locator, Page } from '@playwright/test';
import { expect } from './fixtures';

export const API = 'http://localhost:3001/api';

export interface ApiProduct {
  id: number;
  title: string;
  brand: string;
  description: string;
  images: string[];
  features: string[];
  specifications: Record<string, string>;
  variants: { name: string; options: string[] }[];
  price: number;
  originalPrice: number | null;
  stock: number;
  ratingAverage: number;
  reviewCount: number;
  deliveryDays: number;
  freeShipping: boolean;
  isDeal: boolean;
  isFeatured: boolean;
  soldCount: number;
  createdAt: string;
  category: { slug: string; name: string };
  seller: { name: string; rating: number; description: string | null };
}

export interface ApiReview {
  id: number;
  authorName: string;
  rating: number;
  title: string;
  body: string;
  verifiedPurchase: boolean;
  createdAt: string;
}

/** Ground truth: the whole seeded catalog straight from the API. Tests compute expectations from it, not from magic numbers. */
export async function fetchCatalog(request: APIRequestContext): Promise<ApiProduct[]> {
  const res = await request.get(`${API}/products?limit=60`);
  expect(res.ok()).toBeTruthy();
  return (await res.json()).items;
}

/** Below 1024px the filters live in a drawer instead of the sidebar. */
export const usesDrawer = (page: Page) => page.viewportSize()!.width < 1024;

export async function expectNoHorizontalOverflow(page: Page) {
  const { scrollWidth, clientWidth } = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
  }));
  expect(scrollWidth, `page is ${scrollWidth}px wide in a ${clientWidth}px viewport`).toBeLessThanOrEqual(clientWidth);
}

export const cards = (page: Page) => page.getByTestId('product-card');

/**
 * Waits until the results on screen belong to the query currently in the address bar and have finished loading.
 * (Checking only for "not loading" is racy: right after a URL change the router's update is still pending and the
 * previous, already-settled results are on screen.)
 */
export async function waitForResults(page: Page) {
  await page.waitForFunction(() => document.querySelector('[data-results-for]')?.getAttribute('data-results-for') === location.search.replace(/^\?/, ''));
  await expect(page.locator('[aria-busy="true"]')).toHaveCount(0);
  await expect(page.getByRole('status')).not.toHaveText('Searching…');
}

/** Total number of results as announced in the results header. */
export async function resultTotal(page: Page): Promise<number> {
  await waitForResults(page);
  const text = (await page.getByRole('status').textContent()) ?? '';
  if (/^No results/.test(text)) return 0;
  const m = text.match(/of (\d+) results/) ?? text.match(/^(\d+) results?/);
  if (!m) throw new Error(`Could not read a result count from "${text}"`);
  return Number(m[1]);
}

export async function cardIds(page: Page): Promise<number[]> {
  const hrefs = await cards(page).evaluateAll((els) => els.map((e) => e.getAttribute('href')!));
  return hrefs.map((h) => Number(h.split('/').pop()));
}

/** Current price shown on each card on the page. */
export async function cardPrices(page: Page): Promise<number[]> {
  const texts = await cards(page).allTextContents();
  return texts.map((t) => Number(t.match(/\$([\d,]+\.\d{2})/)![1].replace(',', '')));
}

export async function cardRatings(page: Page): Promise<number[]> {
  const labels = await cards(page).locator('[aria-label$="out of 5 stars"]').evaluateAll((els) => els.map((e) => e.getAttribute('aria-label')!));
  return labels.map((l) => Number(l.split(' ')[0]));
}

/**
 * Runs `change` against the filter controls wherever they live at this viewport:
 * the sidebar (applies instantly) on wide screens, the drawer (needs "Apply filters") on narrow ones.
 */
export async function changeFilters(page: Page, change: (scope: Locator) => Promise<void>) {
  if (usesDrawer(page)) {
    await page.getByRole('button', { name: /^Filters/ }).click();
    const drawer = page.getByRole('dialog', { name: 'Filters' });
    await expect(drawer).toBeVisible();
    await change(drawer);
    await drawer.getByRole('button', { name: 'Apply filters' }).click();
    await expect(drawer).toBeHidden();
  } else {
    await change(page.getByRole('complementary', { name: 'Filters' }));
  }
  await waitForResults(page);
}

export const priceLabel = (lo: number | null, hi: number | null) => {
  const f = (n: number) => `\\$${n.toFixed(2)}`;
  if (lo !== null && hi !== null) return new RegExp(`${f(lo)} – ${f(hi)}`);
  if (hi !== null) return new RegExp(`Under ${f(hi)}`);
  return new RegExp(`${f(lo!)} & above`);
};

/**
 * Selects a radio/checkbox the way a user does (a click), then waits for it to read as checked.
 * Not `locator.check()`: that asserts the state flipped on the very next tick, but these controls are driven by the
 * URL, so they settle once the router's update has rendered.
 */
export async function pick(control: Locator) {
  await control.click();
  await expect(control).toBeChecked();
}

// ---- shoppers, carts and orders ----------------------------------------------------------------------------------------

export interface CartLineApi {
  id: number;
  productId: number;
  title: string;
  quantity: number;
  unitPrice: number;
  lineTotal: number;
  selectedVariants: Record<string, string>;
  maxQuantity: number;
  issue: { code: string; message: string } | null;
}
export interface CartApi {
  items: CartLineApi[];
  itemCount: number;
  subtotal: number;
  shipping: number;
  tax: number;
  total: number;
  canCheckout: boolean;
  deliveryOptions: { id: 'standard' | 'express'; label: string; cost: number; days: number; estimatedDelivery: string; total: number }[];
}

export interface Shopper {
  name: string;
  email: string;
  password: string;
  token: string;
}

/** A brand-new account for this test alone (so parallel tests never share a cart). `npm run seed` deletes @e2e.bazaar.test accounts. */
export async function createShopper(request: APIRequestContext, label = 'shopper'): Promise<Shopper> {
  const name = `E2E ${label}`;
  const email = `${label}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@e2e.bazaar.test`;
  const password = 'E2eShopper123!';
  const res = await request.post(`${API}/auth/register`, { data: { name, email, password } });
  expect(res.ok(), 'registering a test shopper').toBeTruthy();
  return { name, email, password, token: (await res.json()).accessToken };
}

/** Signs the browser in before any page script runs, as if the shopper had logged in earlier. */
export async function signInAs(page: Page, shopper: Shopper) {
  await page.addInitScript((token) => localStorage.setItem('bazaar.token', token), shopper.token);
}

const auth = (shopper: Shopper) => ({ authorization: `Bearer ${shopper.token}` });

export async function apiCart(request: APIRequestContext, shopper: Shopper): Promise<CartApi> {
  const res = await request.get(`${API}/cart`, { headers: auth(shopper) });
  expect(res.ok()).toBeTruthy();
  return res.json();
}

export async function apiAddToCart(request: APIRequestContext, shopper: Shopper, productId: number, quantity: number, selectedVariants?: Record<string, string>) {
  const res = await request.post(`${API}/cart/items`, { headers: auth(shopper), data: { productId, quantity, selectedVariants } });
  expect(res.ok(), `adding product ${productId} to the cart: ${await res.text()}`).toBeTruthy();
  return (await res.json()) as CartApi;
}

export const ADDRESS = {
  fullName: 'Ada Lovelace',
  line1: '12 Analytical Way',
  line2: 'Flat 3',
  city: 'London',
  state: 'Greater London',
  postalCode: 'N1 9GU',
  country: 'United Kingdom',
  phone: '+44 20 7946 0000',
};

export async function apiPlaceOrder(request: APIRequestContext, shopper: Shopper, deliveryOption: 'standard' | 'express' = 'standard') {
  const res = await request.post(`${API}/orders`, { headers: auth(shopper), data: { shippingAddress: ADDRESS, deliveryOption, paymentMethod: 'card' } });
  expect(res.ok(), `placing an order: ${await res.text()}`).toBeTruthy();
  return res.json();
}

/** Products with plenty of stock, most plentiful first, so repeated test runs don't use up the same few units. */
export const wellStocked = (all: ApiProduct[]) => all.filter((p) => p.stock >= 50).sort((a, b) => b.stock - a.stock);

export async function fillAddress(page: Page, address: Partial<typeof ADDRESS>) {
  const fields: Record<string, string> = { fullName: 'Full name', line1: 'Street address', line2: 'Apartment, suite, etc.', city: 'City', state: 'State / Province', postalCode: 'Postal code', country: 'Country', phone: 'Phone' };
  for (const [key, label] of Object.entries(fields)) {
    const value = (address as Record<string, string | undefined>)[key];
    if (value !== undefined) await page.getByLabel(label, { exact: false }).first().fill(value);
  }
}

export const money = (n: number) => `$${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
export const cartLink = (page: Page) => page.getByRole('link', { name: /^Cart, \d+ items?/ });

// ---- demand validation ("Coming soon") ----------------------------------------------------------------------------------

export const unique = () => `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

const bearer = (s: Shopper) => ({ authorization: `Bearer ${s.token}` });

export interface ApiValidation {
  id: number;
  title: string;
  tagline: string;
  priceMin: number;
  priceMax: number;
  responseCount: number;
  status: 'open' | 'closed';
  category: { slug: string; name: string };
  seller: { id: number; name: string; slug: string };
  expectedLaunch: string;
  features: string[];
  description: string;
  priceBuckets: { index: number; label: string }[];
}

/** A shopper who has opened a store, so they can propose products. */
export async function createSeller(request: APIRequestContext, label = 'store'): Promise<{ owner: Shopper; store: { id: number; name: string; slug: string } }> {
  const owner = await createShopper(request, label);
  const res = await request.post(`${API}/sellers`, { headers: bearer(owner), data: { name: `E2E ${label} ${unique()}`, description: 'A store created by the tests' } });
  expect(res.status(), await res.text()).toBe(201);
  return { owner, store: await res.json() };
}

/** Creates an open demand test priced $40-60 (buckets: Under $40 | $40–$47 | $47–$53 | $53–$60 | Over $60). */
export async function createValidation(request: APIRequestContext, owner: Shopper, over: Record<string, unknown> = {}): Promise<ApiValidation> {
  const categories: { id: number; slug: string }[] = await (await request.get(`${API}/categories`)).json();
  const d = new Date();
  d.setMonth(d.getMonth() + 3);
  const res = await request.post(`${API}/seller/validations`, {
    headers: bearer(owner),
    data: {
      title: `E2E Idea ${unique()}`,
      tagline: 'A test of whether anyone wants this',
      description: 'A product idea created by the automated tests.\nIt has a second line of description.',
      categoryId: categories.find((c) => c.slug === 'fashion')!.id,
      images: ['https://images.unsplash.com/photo-1553062407-98eeb64c6a62?w=800'],
      features: ['Light', 'Durable', 'Packable'],
      priceMin: 40,
      priceMax: 60,
      expectedLaunch: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`,
      ...over,
    },
  });
  expect(res.status(), await res.text()).toBe(201);
  return res.json();
}

export async function closeValidation(request: APIRequestContext, owner: Shopper, id: number) {
  const res = await request.patch(`${API}/seller/validations/${id}`, { headers: bearer(owner), data: { status: 'closed' } });
  expect(res.status(), await res.text()).toBe(200);
}

export async function apiRespond(request: APIRequestContext, who: Shopper, id: number, data: Record<string, unknown>) {
  const res = await request.put(`${API}/validations/${id}/response`, { headers: bearer(who), data });
  expect(res.ok(), await res.text()).toBeTruthy();
  return res.json();
}

export async function apiMyResponse(request: APIRequestContext, who: Shopper, id: number) {
  const res = await request.get(`${API}/validations/${id}/response`, { headers: bearer(who) });
  expect(res.ok()).toBeTruthy();
  return (await res.json()).response as { interest: string; priceBucket: number | null; topFeature: string | null } | null;
}

export async function apiValidationList(request: APIRequestContext, query = ''): Promise<{ items: ApiValidation[]; total: number }> {
  const res = await request.get(`${API}/validations${query}`);
  expect(res.ok()).toBeTruthy();
  return res.json();
}

export const validationCards = (scope: Page | Locator) => scope.getByTestId('validation-card');

// ---- seller hub ---------------------------------------------------------------------------------------------------------

export interface SellerResultsApi {
  validation: { id: number; title: string; status: 'open' | 'closed'; priceMin: number; priceMax: number };
  totalResponses: number;
  interest: { interested: { count: number; percent: number }; maybe: { count: number; percent: number }; notInterested: { count: number; percent: number } };
  signal: { total: number; score: number; level: string; label: string; reliable: boolean; openPercent: number; interestedPercent: number; maybePercent: number; notInterestedPercent: number; minResponses: number };
  priceBuckets: { index: number; label: string; count: number; percent: number }[];
  priceAnswered: number;
  features: { name: string; count: number; percent: number }[];
  featureAnswered: number;
  insights: { preferredPrice: { index: number; label: string } | null; pricePressure: { flagged: boolean; percent: number; bucket: { label: string } }; topFeature: { name: string } | null };
}

/** Signs in one of the seeded demo accounts through the API: `seller` (Trailmate), `maker` (Kindred), `demo` (shopper). */
export async function seedLogin(request: APIRequestContext, who: 'seller' | 'maker' | 'demo'): Promise<Shopper> {
  const email = `${who}@seed.bazaar.test`;
  const res = await request.post(`${API}/auth/login`, { data: { email, password: 'DemoPass123!' } });
  expect(res.ok(), `signing in as ${email}`).toBeTruthy();
  const body = await res.json();
  return { name: body.user.name, email, password: 'DemoPass123!', token: body.accessToken };
}

export async function apiSellerList(request: APIRequestContext, who: Shopper): Promise<{ id: number; title: string; status: string; responseCount: number; interestedPercent: number; maybePercent: number; notInterestedPercent: number; signal: { label: string; level: string; score: number } }[]> {
  const res = await request.get(`${API}/seller/validations`, { headers: bearer(who) });
  expect(res.ok()).toBeTruthy();
  return (await res.json()).items;
}

export async function apiSellerResults(request: APIRequestContext, who: Shopper, id: number): Promise<SellerResultsApi> {
  const res = await request.get(`${API}/seller/validations/${id}/results`, { headers: bearer(who) });
  expect(res.ok(), await res.text()).toBeTruthy();
  return res.json();
}

/** Signs in through the sign-in form, the way a person does. */
export async function uiSignIn(page: Page, who: { email: string; password: string }) {
  await page.getByLabel('Email').fill(who.email);
  await page.getByLabel('Password').fill(who.password);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
}

/** The "Sell" / "Seller hub" entry in the navigation bar. */
export const sellerNavLink = (page: Page, name: 'Sell' | 'Seller hub') => page.getByRole('navigation', { name: 'Categories' }).getByRole('link', { name, exact: true });
