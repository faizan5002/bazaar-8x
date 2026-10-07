import type { APIRequestContext } from '@playwright/test';
import { expect, test } from './fixtures';
import { ADDRESS, API, apiAddToCart, apiCart, createShopper, fetchCatalog, wellStocked, type Shopper } from './helpers';

/**
 * Rules of the cart and orders API, tested directly (no browser). The browser journeys in buying.spec.ts cover the
 * happy path; this covers what the UI can't easily reach: validation, ownership, limits, concurrency, atomicity.
 * These tests don't depend on viewport, so they run once (in the desktop project) instead of four times.
 */
test.beforeEach(({}, testInfo) => test.skip(testInfo.project.name !== 'desktop', 'API-level tests run once'));
test.use({ allowErrors: true }); // most of these tests assert on 4xx responses

const bearer = (s: Shopper) => ({ authorization: `Bearer ${s.token}` });
const post = (request: APIRequestContext, path: string, s: Shopper | null, data: unknown) => request.post(`${API}${path}`, { headers: s ? bearer(s) : {}, data: data as object });
const messageOf = async (res: { json: () => Promise<{ message: string | string[] }> }) => [(await res.json()).message].flat().join(' ');

async function setup(request: APIRequestContext) {
  const all = await fetchCatalog(request);
  const stocked = wellStocked(all);
  return {
    all,
    plain: stocked.find((p) => p.freeShipping && p.variants.length === 0)!,
    variants: stocked.find((p) => p.variants.length > 0)!,
    paid: stocked.find((p) => !p.freeShipping)!,
    low: all.find((p) => p.stock > 0 && p.stock <= 10)!,
    out: all.find((p) => p.stock === 0)!,
  };
}

test.describe('authentication and ownership', () => {
  test('every cart and order route needs a valid token', async ({ request }) => {
    for (const [method, path] of [['get', '/cart'], ['post', '/cart/items'], ['patch', '/cart/items/1'], ['delete', '/cart/items/1'], ['delete', '/cart'], ['post', '/orders'], ['get', '/orders/BZR-1']] as const) {
      const res = await request[method](`${API}${path}`);
      expect(res.status(), `${method.toUpperCase()} ${path} without a token`).toBe(401);
    }
    expect((await request.get(`${API}/cart`, { headers: { authorization: 'Bearer not.a.jwt' } })).status()).toBe(401);
  });

  test("one shopper can't read, change or delete another's cart lines or orders", async ({ request }) => {
    const { plain } = await setup(request);
    const [a, b] = [await createShopper(request, 'own-a'), await createShopper(request, 'own-b')];
    const line = (await apiAddToCart(request, a, plain.id, 2)).items[0];

    expect((await request.patch(`${API}/cart/items/${line.id}`, { headers: bearer(b), data: { quantity: 5 } })).status()).toBe(404);
    expect((await request.delete(`${API}/cart/items/${line.id}`, { headers: bearer(b) })).status()).toBe(404);
    expect((await apiCart(request, a)).items[0].quantity, "the other shopper's attempts changed nothing").toBe(2);
    expect((await apiCart(request, b)).items, "…and B's own cart is untouched").toHaveLength(0);

    const order = await (await post(request, '/orders', a, { shippingAddress: ADDRESS, deliveryOption: 'standard', paymentMethod: 'card' })).json();
    expect((await request.get(`${API}/orders/${order.orderNumber}`, { headers: bearer(a) })).status()).toBe(200);
    expect((await request.get(`${API}/orders/${order.orderNumber}`, { headers: bearer(b) })).status(), "404, not 403: doesn't reveal the order exists").toBe(404);
  });
});

test.describe('adding to the cart', () => {
  test('validation: bad quantities, unknown products and variants, and unexpected fields are rejected', async ({ request }) => {
    const { variants, out } = await setup(request);
    const s = await createShopper(request, 'validate');
    const group = variants.variants[0];
    const cases: [string, unknown, number][] = [
      ['quantity 0', { productId: variants.id, quantity: 0 }, 400],
      ['quantity above the per-order limit', { productId: variants.id, quantity: 11 }, 400],
      ['fractional quantity', { productId: variants.id, quantity: 1.5 }, 400],
      ['non-numeric quantity', { productId: variants.id, quantity: 'many' }, 400],
      ['missing quantity', { productId: variants.id }, 400],
      ['product id 0', { productId: 0, quantity: 1 }, 400],
      ['unknown product', { productId: 999999, quantity: 1 }, 404],
      ['a client-supplied price', { productId: variants.id, quantity: 1, price: 0.01 }, 400],
      ['out-of-stock product', { productId: out.id, quantity: 1 }, 409],
      ['a variant group the product does not have', { productId: variants.id, quantity: 1, selectedVariants: { Nonsense: 'x' } }, 400],
      ['a variant option the product does not have', { productId: variants.id, quantity: 1, selectedVariants: { [group.name]: 'Not An Option' } }, 400],
    ];
    for (const [name, body, status] of cases) expect((await post(request, '/cart/items', s, body)).status(), name).toBe(status);
    expect((await apiCart(request, s)).items, 'none of the rejected requests added anything').toHaveLength(0);
  });

  test('adding the same product again merges into one line, taking the latest variant choice', async ({ request }) => {
    const { variants } = await setup(request);
    const s = await createShopper(request, 'merge');
    const group = variants.variants[0];
    await apiAddToCart(request, s, variants.id, 2, { [group.name]: group.options[0] });
    const cart = await apiAddToCart(request, s, variants.id, 1, { [group.name]: group.options[group.options.length - 1] });
    expect(cart.items).toHaveLength(1);
    expect(cart.items[0].quantity).toBe(3);
    expect(cart.items[0].selectedVariants[group.name]).toBe(group.options[group.options.length - 1]);
    expect(Object.keys(cart.items[0].selectedVariants), 'groups left unspecified default to their first option').toHaveLength(variants.variants.length);
  });

  test('simultaneous requests never create duplicate rows or crash', async ({ request }) => {
    const { plain } = await setup(request);
    const fresh = await createShopper(request, 'race-cart');
    const reads = await Promise.all(Array.from({ length: 6 }, () => request.get(`${API}/cart`, { headers: bearer(fresh) })));
    expect(reads.map((r) => r.status()), 'six first-ever reads of one cart').toEqual([200, 200, 200, 200, 200, 200]);

    const s = await createShopper(request, 'race-add');
    const adds = await Promise.all(Array.from({ length: 6 }, () => post(request, '/cart/items', s, { productId: plain.id, quantity: 2 })));
    expect(adds.every((r) => [201, 409].includes(r.status())), `statuses ${adds.map((r) => r.status())}`).toBeTruthy();
    const cart = await apiCart(request, s);
    expect(cart.items, 'exactly one row for the product').toHaveLength(1);
    expect(cart.items[0].quantity, 'capped at the per-order limit').toBe(10);
  });

  test('stock and per-order limits are enforced with a clear reason, and a refusal changes nothing', async ({ request }) => {
    const { low, plain } = await setup(request);
    const s = await createShopper(request, 'limits');

    await apiAddToCart(request, s, low.id, low.stock);
    let res = await post(request, '/cart/items', s, { productId: low.id, quantity: 1 });
    expect(res.status()).toBe(409);
    expect(await messageOf(res)).toMatch(new RegExp(`Only ${low.stock} in stock`));
    expect(await messageOf(res)).toContain(`You already have ${low.stock} in your cart`);

    await apiAddToCart(request, s, plain.id, 10);
    res = await post(request, '/cart/items', s, { productId: plain.id, quantity: 1 });
    expect(res.status()).toBe(409);
    expect(await messageOf(res)).toContain('The limit is 10 per order');

    const cart = await apiCart(request, s);
    expect(cart.items.find((i) => i.productId === low.id)?.quantity).toBe(low.stock);
    expect(cart.items.find((i) => i.productId === plain.id)?.quantity).toBe(10);
  });
});

test.describe('changing the cart', () => {
  test('update and remove: allowed values, limits, and clearing', async ({ request }) => {
    const { plain, low } = await setup(request);
    const s = await createShopper(request, 'edit');
    const line = (await apiAddToCart(request, s, plain.id, 3)).items[0];
    const lowLine = (await apiAddToCart(request, s, low.id, low.stock)).items.find((i) => i.productId === low.id)!;
    const patch = (id: number, quantity: number) => request.patch(`${API}/cart/items/${id}`, { headers: bearer(s), data: { quantity } });

    expect((await (await patch(line.id, 6)).json()).items.find((i: { id: number }) => i.id === line.id).quantity).toBe(6);
    expect((await (await patch(line.id, 1)).json()).items.find((i: { id: number }) => i.id === line.id).quantity).toBe(1);
    expect((await patch(line.id, 0)).status()).toBe(400);
    expect((await patch(line.id, 11)).status()).toBe(400);
    expect((await patch(lowLine.id, low.stock + 1)).status(), 'raising above stock').toBe(409);
    expect((await request.patch(`${API}/cart/items/abc`, { headers: bearer(s), data: { quantity: 1 } })).status()).toBe(400);

    const removed = await request.delete(`${API}/cart/items/${lowLine.id}`, { headers: bearer(s) });
    expect((await removed.json()).items.some((i: { id: number }) => i.id === lowLine.id)).toBe(false);
    expect((await request.delete(`${API}/cart/items/${lowLine.id}`, { headers: bearer(s) })).status(), 'removing it twice').toBe(404);

    const cleared = await (await request.delete(`${API}/cart`, { headers: bearer(s) })).json();
    expect(cleared.items).toHaveLength(0);
    expect(cleared.itemCount).toBe(0);
  });
});

test.describe('pricing', () => {
  test('subtotal, tax, shipping and every delivery option follow the published rules', async ({ request }) => {
    const { plain, paid } = await setup(request);
    const s = await createShopper(request, 'pricing');
    await apiAddToCart(request, s, plain.id, 3);
    let cart = await apiCart(request, s);
    const [standard, express] = [cart.deliveryOptions.find((o) => o.id === 'standard')!, cart.deliveryOptions.find((o) => o.id === 'express')!];

    expect(cart.subtotal).toBeCloseTo(plain.price * 3, 2);
    expect(cart.tax).toBeCloseTo(Math.round(cart.subtotal * 8) / 100, 2);
    expect(cart.shipping, 'every item ships free → standard shipping is free').toBe(0);
    expect(express.cost, 'express is a flat fee').toBe(14.99);
    expect(cart.total).toBeCloseTo(cart.subtotal + cart.shipping + cart.tax, 2);
    expect(standard.total).toBeCloseTo(cart.total, 2);
    expect(express.total).toBeCloseTo(cart.subtotal + cart.tax + 14.99, 2);
    expect(express.days).toBeLessThanOrEqual(standard.days);

    await apiAddToCart(request, s, paid.id, 1);
    cart = await apiCart(request, s);
    expect(cart.shipping, 'one item that does not ship free → flat standard fee').toBe(4.99);
    expect(cart.items.reduce((sum, i) => sum + i.lineTotal, 0)).toBeCloseTo(cart.subtotal, 2);
  });
});

test.describe('placing an order', () => {
  const order = (request: APIRequestContext, s: Shopper, over: Record<string, unknown> = {}) =>
    post(request, '/orders', s, { shippingAddress: ADDRESS, deliveryOption: 'standard', paymentMethod: 'card', ...over });

  test('invalid orders are rejected and the cart is left alone', async ({ request }) => {
    const { plain } = await setup(request);
    const s = await createShopper(request, 'order-invalid');

    const empty = await order(request, s);
    expect(empty.status()).toBe(400);
    expect(await messageOf(empty)).toMatch(/empty/i);

    await apiAddToCart(request, s, plain.id, 2);
    const cases: [string, Record<string, unknown>][] = [
      ['no address at all', { shippingAddress: undefined }], // regression: used to be accepted and stored as {}
      ['an empty address object', { shippingAddress: {} }],
      ['a missing city', { shippingAddress: { ...ADDRESS, city: '' } }],
      ['a malformed phone number', { shippingAddress: { ...ADDRESS, phone: 'call me' } }],
      ['an unknown delivery option', { deliveryOption: 'teleport' }],
      ['an unknown payment method', { paymentMethod: 'bitcoin' }],
      ['card details smuggled in', { cardNumber: '4242424242424242' }],
    ];
    for (const [name, over] of cases) expect((await order(request, s, over)).status(), name).toBe(400);
    expect((await apiCart(request, s)).itemCount, 'no rejected order consumed the cart').toBe(2);
  });

  test('a valid order matches the cart quote, snapshots its lines, takes stock, empties the cart and cannot be repeated', async ({ request }) => {
    const { plain, variants } = await setup(request);
    const s = await createShopper(request, 'order-ok');
    const group = variants.variants[0];
    const chosen = group.options[group.options.length - 1];
    await apiAddToCart(request, s, plain.id, 2);
    await apiAddToCart(request, s, variants.id, 1, { [group.name]: chosen });
    const quoted = await apiCart(request, s);
    const express = quoted.deliveryOptions.find((o) => o.id === 'express')!;
    const stock = async (id: number) => (await (await request.get(`${API}/products/${id}`)).json()).stock as number;
    const before = { plain: await stock(plain.id), variants: await stock(variants.id) };

    const res = await order(request, s, { deliveryOption: 'express', paymentMethod: 'cod' });
    expect(res.status()).toBe(201);
    const o = await res.json();
    expect(o.orderNumber).toMatch(/^BZR-\d{8}-\d{6}$/);
    expect(o.status).toBe('placed');
    expect(o.total, 'charged exactly what the cart quoted for express').toBeCloseTo(express.total, 2);
    expect(o.estimatedDelivery).toBe(express.estimatedDelivery);
    expect([o.deliveryOptionLabel, o.paymentMethod]).toEqual(['Express delivery', 'Cash on Delivery']);
    expect(o.shippingAddress).toMatchObject({ fullName: ADDRESS.fullName, phone: ADDRESS.phone });
    expect(o.items).toHaveLength(2);
    expect(o.items.find((i: { productId: number }) => i.productId === variants.id).selectedVariants[group.name]).toBe(chosen);
    for (const line of o.items) expect(line).toMatchObject({ title: expect.any(String), sellerName: expect.any(String), imageUrl: expect.any(String) });

    expect((await apiCart(request, s)).items, 'cart emptied').toHaveLength(0);
    expect(await stock(plain.id)).toBeLessThanOrEqual(before.plain - 2); // ≤ because other tests may be ordering it too
    expect(await stock(variants.id)).toBeLessThanOrEqual(before.variants - 1);
    expect((await order(request, s)).status(), 'a second submit has nothing to order').toBe(400);

    const read = await request.get(`${API}/orders/${o.orderNumber}`, { headers: bearer(s) });
    expect((await read.json()).total).toBeCloseTo(o.total, 2);
    expect((await request.get(`${API}/orders/BZR-00000000-000000`, { headers: bearer(s) })).status()).toBe(404);
  });

  test('if stock runs out before the order, it fails whole: 409, nothing taken, cart intact and flagged', async ({ request }) => {
    const { all, plain } = await setup(request);
    // A product with a modest amount of stock that this test can drain with a few orders of its own.
    const scarce = all.filter((p) => p.stock >= 12 && p.stock <= 30 && p.id !== plain.id && p.variants.length === 0).sort((a, b) => a.stock - b.stock)[0];
    test.skip(!scarce, 'seed data has no modestly stocked product left (run `npm run seed`)');
    const stockOf = async (id: number) => (await (await request.get(`${API}/products/${id}`)).json()).stock as number;

    const waiting = await createShopper(request, 'rollback-wait');
    const take = 10;
    await apiAddToCart(request, waiting, scarce.id, take);
    await apiAddToCart(request, waiting, plain.id, 1);
    const plainBefore = await stockOf(plain.id);

    const rival = await createShopper(request, 'rollback-rival');
    while ((await stockOf(scarce.id)) >= take) {
      const left = await stockOf(scarce.id);
      await apiAddToCart(request, rival, scarce.id, Math.min(10, left - (take - 1)));
      expect((await order(request, rival)).status()).toBe(201);
    }

    const failed = await order(request, waiting);
    expect(failed.status()).toBe(409);
    expect(await messageOf(failed)).toContain(scarce.title.slice(0, 20));
    expect(await stockOf(plain.id), "the OTHER item's stock was not taken (the whole order rolled back)").toBeGreaterThanOrEqual(plainBefore - 5); // not decremented by us; allow other tests' orders
    const cart = await apiCart(request, waiting);
    expect(cart.items, 'the cart is intact').toHaveLength(2);
    expect(cart.canCheckout, 'and it now flags the problem line').toBe(false);
    expect(cart.items.find((i) => i.productId === scarce.id)?.issue).not.toBeNull();
  });
});
