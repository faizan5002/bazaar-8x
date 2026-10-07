import type { Page } from '@playwright/test';
import { expect, test } from './fixtures';
import {
  ADDRESS,
  API,
  apiAddToCart,
  apiCart,
  apiPlaceOrder,
  cartLink,
  createShopper,
  expectNoHorizontalOverflow,
  fetchCatalog,
  fillAddress,
  money,
  signInAs,
  wellStocked,
  type ApiProduct,
} from './helpers';

// ---- data -------------------------------------------------------------------------------------------------------------

async function products(request: Parameters<typeof fetchCatalog>[0], variantIndex = 0) {
  const all = await fetchCatalog(request);
  const stocked = wellStocked(all);
  const find = (what: string, pred: (p: ApiProduct) => boolean) => {
    const p = stocked.find(pred);
    if (!p) throw new Error(`No well-stocked product that is: ${what}. Run \`npm run seed\` to restore stock.`);
    return p;
  };
  const withVariants = stocked.filter((p) => p.variants.length > 0)[variantIndex] ?? find('has variants', (p) => p.variants.length > 0);
  return {
    all,
    /** has variants, so we can check the chosen option travels into the cart */
    withVariants,
    /** no variants, ships free */
    freeShip: find('free shipping, no variants', (p) => p.freeShipping && p.variants.length === 0),
    /** does not ship free: standard delivery costs money (never the same product as withVariants, so carts get two distinct lines) */
    paidShip: find('paid shipping', (p) => !p.freeShipping && p.id !== withVariants.id),
    lowStock: all.find((p) => p.stock > 0 && p.stock <= 10)!,
    outOfStock: all.find((p) => p.stock === 0)!,
  };
}

const badge = (page: Page) => cartLink(page);
const expectBadge = (page: Page, n: number) => expect(badge(page)).toHaveAttribute('aria-label', `Cart, ${n} ${n === 1 ? 'item' : 'items'}`);
const shortDate = (iso: string) => {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
};

// ---- signed out -------------------------------------------------------------------------------------------------------

test.describe('signed out', () => {
  test('the cart badge shows 0', async ({ page }) => {
    await page.goto('/');
    await expectBadge(page, 0);
  });

  test('Add to Cart and Buy Now ask for sign-in without calling the cart API; signing in returns to the product', async ({ page, request }) => {
    const { withVariants: p } = await products(request);
    const shopper = await createShopper(request, 'signedout');
    const cartCalls: string[] = [];
    page.on('request', (r) => /\/api\/(cart|orders)/.test(r.url()) && cartCalls.push(`${r.method()} ${r.url()}`));

    await page.goto(`/products/${p.id}`);
    await page.getByRole('button', { name: 'Add to Cart' }).click();
    const prompt = page.getByRole('alert').filter({ hasText: 'Sign in to add items to your cart' });
    await expect(prompt).toBeVisible();
    await page.getByRole('button', { name: 'Buy Now' }).click();
    await expect(page.getByRole('alert').filter({ hasText: 'Sign in to buy this item' })).toBeVisible();
    expect(cartCalls, 'nothing was sent to the cart API').toEqual([]);
    await expectBadge(page, 0);

    await page.getByRole('alert').getByRole('link', { name: 'Sign in' }).click();
    await expect(page).toHaveURL(/\/login$/);
    await expect(page.getByText('Please sign in to continue')).toBeVisible();
    await page.getByLabel('Email').fill(shopper.email);
    await page.getByLabel('Password').fill(shopper.password);
    await page.getByRole('button', { name: 'Sign in', exact: true }).click();

    await expect(page).toHaveURL(new RegExp(`/products/${p.id}$`)); // right back where they were
    await page.getByRole('button', { name: 'Add to Cart' }).click();
    await expect(page.getByRole('status').filter({ hasText: 'Added to cart' })).toBeVisible();
    await expectBadge(page, 1);
  });

  test('/cart and /checkout send you to sign in, then bring you back', async ({ page, request }) => {
    const shopper = await createShopper(request, 'redirect');
    for (const path of ['/cart', '/checkout']) {
      await page.goto(path);
      await expect(page).toHaveURL(/\/login$/);
      await page.getByLabel('Email').fill(shopper.email);
      await page.getByLabel('Password').fill(shopper.password);
      await page.getByRole('button', { name: 'Sign in', exact: true }).click();
      await expect(page).toHaveURL(new RegExp(`${path}$`));
      await expect(page.getByRole('heading', { level: 1 })).toHaveText(path === '/cart' ? 'Shopping cart' : 'Checkout');
      await page.evaluate(() => localStorage.clear()); // sign out for the next round
    }
  });

  test.describe('another account', () => {
    test.use({ allowErrors: true }); // the server's 404 for someone else's order is exactly what is being tested

    test("can't open someone else's order confirmation", async ({ page, request }) => {
    const { freeShip } = await products(request);
    const owner = await createShopper(request, 'owner');
    await apiAddToCart(request, owner, freeShip.id, 1);
    const order = await apiPlaceOrder(request, owner);

    const stranger = await createShopper(request, 'stranger');
    await signInAs(page, stranger);
    await page.goto(`/orders/${order.orderNumber}/confirmation`);
    await expect(page.getByRole('heading', { level: 1 })).toHaveText("We couldn't find that order");
    });
  });
});

// ---- the critical journey ---------------------------------------------------------------------------------------------

test.describe('critical journey: product → cart → checkout → confirmation', () => {
  test('a shopper buys a product end to end', async ({ page, request }, testInfo) => {
    test.skip(!['desktop', 'mobile'].includes(testInfo.project.name), 'the full journey runs at desktop and mobile widths');
    // Desktop and mobile run in parallel and each places a real order, so each gets its own product: its exact stock check can't race.
    const { withVariants: p } = await products(request, testInfo.project.name === 'mobile' ? 1 : 0);
    const shopper = await createShopper(request, 'journey');
    await signInAs(page, shopper);
    const orderPosts: string[] = [];
    page.on('request', (r) => r.method() === 'POST' && /\/api\/orders$/.test(r.url()) && orderPosts.push(r.url()));

    const group = p.variants[0];
    const chosen = group.options[group.options.length - 1];
    const stockBefore = p.stock;

    await test.step('open the product and add 2, with a chosen variant', async () => {
      await page.goto(`/products/${p.id}`);
      await expectBadge(page, 0);
      await page.getByTestId('variants').getByRole('radio', { name: chosen, exact: true }).click();
      await page.getByLabel('Quantity').selectOption('2');
      await page.getByRole('button', { name: 'Add to Cart' }).click();

      const success = page.getByRole('status').filter({ hasText: 'Added to cart' });
      await expect(success).toContainText(`Added 2 × ${p.title}`);
      await expect(success).toContainText('Your cart now has 2 items');
      await expect(page).toHaveURL(new RegExp(`/products/${p.id}$`)); // stays on the product page
      await expectBadge(page, 2);

      const cart = await apiCart(request, shopper);
      expect(cart.items).toHaveLength(1);
      expect(cart.items[0]).toMatchObject({ productId: p.id, quantity: 2 });
      expect(cart.items[0].selectedVariants[group.name]).toBe(chosen); // the real selection reached the server
    });

    await test.step('adding the same product again merges into one line', async () => {
      await page.getByLabel('Quantity').selectOption('1');
      await page.getByRole('button', { name: 'Add to Cart' }).click();
      await expectBadge(page, 3);
      const cart = await apiCart(request, shopper);
      expect(cart.items).toHaveLength(1);
      expect(cart.items[0].quantity).toBe(3);
    });

    await test.step('open the cart: the page shows exactly what the server holds', async () => {
      await badge(page).click();
      await expect(page).toHaveURL(/\/cart$/);
      await expect(page.getByRole('heading', { level: 1 })).toHaveText('Shopping cart');
      const row = page.getByTestId('cart-item');
      await expect(row).toHaveCount(1);
      await expect(row).toContainText(p.title);
      await expect(row).toContainText(`Sold by ${p.seller.name}`);
      await expect(row).toContainText(`${group.name}: ${chosen}`);
      await expect(row.getByRole('combobox', { name: /Quantity for/ })).toHaveValue('3');
      await expect(row.getByTestId('line-total').first()).toHaveText(money(p.price * 3));

      const cart = await apiCart(request, shopper);
      const totals = page.getByTestId('totals');
      await expect(totals.getByTestId('totals-subtotal')).toHaveText(money(cart.subtotal));
      await expect(totals.getByTestId('totals-shipping')).toHaveText(cart.shipping === 0 ? 'FREE' : money(cart.shipping));
      await expect(totals.getByTestId('totals-tax')).toHaveText(money(cart.tax));
      await expect(totals.getByTestId('totals-total')).toHaveText(money(cart.total));
      expect(cart.subtotal).toBeCloseTo(p.price * 3, 2);
      expect(cart.total).toBeCloseTo(cart.subtotal + cart.shipping + cart.tax, 2);
      await expect(page.getByText(/estimates: mock values/)).toBeVisible();
      await expect(page.getByRole('link', { name: 'Continue shopping' })).toBeVisible();
    });

    await test.step('change the quantity', async () => {
      await page.getByTestId('cart-item').getByRole('combobox', { name: /Quantity for/ }).selectOption('4');
      await expect(page.getByRole('status').filter({ hasText: 'Updated the quantity' })).toBeVisible();
      await expect(page.getByTestId('cart-item').getByTestId('line-total').first()).toHaveText(money(p.price * 4));
      await expect(page.getByTestId('totals-subtotal')).toHaveText(money(p.price * 4));
      await expectBadge(page, 4);
      expect((await apiCart(request, shopper)).items[0].quantity).toBe(4);
    });

    await test.step('remove it: empty state, badge 0, and it stays empty after a refresh', async () => {
      await page.getByRole('button', { name: `Remove ${p.title} from cart` }).click();
      await expect(page.getByRole('heading', { name: 'Your cart is empty' })).toBeVisible();
      await expectBadge(page, 0);
      expect((await apiCart(request, shopper)).items).toHaveLength(0);
      await page.reload();
      await expect(page.getByRole('heading', { name: 'Your cart is empty' })).toBeVisible();
      await expectBadge(page, 0);
    });

    await test.step('add it again; the cart survives a refresh', async () => {
      await page.getByRole('link', { name: 'Continue shopping' }).first().click();
      await page.goto(`/products/${p.id}`);
      await page.getByTestId('variants').getByRole('radio', { name: chosen, exact: true }).click();
      await page.getByLabel('Quantity').selectOption('2');
      await page.getByRole('button', { name: 'Add to Cart' }).click();
      await expectBadge(page, 2);
      await page.goto('/cart');
      await page.reload();
      await expect(page.getByTestId('cart-item')).toHaveCount(1);
      await expect(page.getByTestId('cart-item').getByRole('combobox', { name: /Quantity for/ })).toHaveValue('2');
      await expectBadge(page, 2);
    });

    await test.step('checkout: required fields are enforced and nothing is sent', async () => {
      await page.getByRole('link', { name: 'Proceed to checkout' }).click();
      await expect(page).toHaveURL(/\/checkout$/);
      await expect(page.getByTestId('summary-item')).toHaveCount(1);
      await page.getByLabel('Full name').fill(''); // prefilled from the account; clear it to prove it is required
      await page.getByRole('button', { name: 'Place your order' }).click();

      await expect(page.getByRole('alert').filter({ hasText: 'highlighted fields' })).toContainText('6 highlighted fields');
      for (const msg of ['Enter your full name.', 'Enter your street address.', 'Enter your city.', 'Enter your state or province.', 'Enter a valid postal code.', 'Enter a phone number']) {
        await expect(page.getByText(msg, { exact: false })).toBeVisible();
      }
      await expect(page.getByLabel('Full name')).toBeFocused(); // focus jumps to the first invalid field
      await expect(page).toHaveURL(/\/checkout$/);
      expect(orderPosts, 'an invalid form must not reach the API').toEqual([]);
      await expect(page.getByLabel('Street address')).toHaveAttribute('aria-invalid', 'true');
    });

    await test.step('fix the fields; a bad phone number is rejected, a good one accepted', async () => {
      await fillAddress(page, { ...ADDRESS, phone: 'call me maybe' });
      await page.getByRole('button', { name: 'Place your order' }).click();
      await expect(page.getByText('Enter a phone number')).toBeVisible();
      await expect(page.getByLabel('Phone')).toBeFocused();
      expect(orderPosts).toEqual([]);
      await page.getByLabel('Phone').fill(ADDRESS.phone);
      await expect(page.getByText('Enter a phone number')).toHaveCount(0); // the error clears as you fix it
    });

    await test.step('choose express delivery and cash on delivery; the summary follows the choice', async () => {
      const cart = await apiCart(request, shopper);
      const express = cart.deliveryOptions.find((o) => o.id === 'express')!;
      const standard = cart.deliveryOptions.find((o) => o.id === 'standard')!;
      await expect(page.getByTestId('totals-total')).toHaveText(money(standard.total)); // standard by default
      await page.getByRole('radio', { name: /Express delivery/ }).check();
      await expect(page.getByTestId('totals-shipping')).toHaveText(money(express.cost));
      await expect(page.getByTestId('totals-total')).toHaveText(money(express.total));
      await expect(page.getByTestId('summary-eta')).toHaveText(shortDate(express.estimatedDelivery));
      await page.getByRole('radio', { name: /Cash on Delivery/ }).check();
      await expect(page.getByRole('radio', { name: /Cash on Delivery/ })).toBeChecked();
      await expect(page.getByRole('radio', { name: /Credit \/ Debit Card/ })).not.toBeChecked();
    });

    let orderNumber = '';
    let expressTotal = 0;
    await test.step('place the order', async () => {
      const cart = await apiCart(request, shopper);
      const express = cart.deliveryOptions.find((o) => o.id === 'express')!;
      expressTotal = express.total;
      await page.getByRole('button', { name: 'Place your order' }).click();
      await expect(page).toHaveURL(/\/orders\/BZR-\d{8}-\d{6}\/confirmation$/);
      expect(orderPosts, 'exactly one order was created').toHaveLength(1);

      await expect(page.getByTestId('confirmation-title')).toHaveText('Thank you, your order has been placed');
      orderNumber = (await page.getByTestId('order-number').textContent())!;
      expect(orderNumber).toMatch(/^BZR-\d{8}-\d{6}$/);
      await expect(page.getByTestId('order-total')).toHaveText(money(express.total));
      await expect(page.getByTestId('order-eta')).toHaveText(shortDate(express.estimatedDelivery));
      await expect(page.getByTestId('order-status')).toHaveText('placed');

      const items = page.getByTestId('order-item');
      await expect(items).toHaveCount(1);
      await expect(items.first()).toContainText(p.title);
      await expect(items.first()).toContainText(`2 × ${money(p.price)}`);
      await expect(items.first()).toContainText(`${group.name}: ${chosen}`);
      const address = page.getByTestId('order-address');
      await expect(address).toContainText(ADDRESS.fullName);
      await expect(address).toContainText(ADDRESS.line1);
      await expect(address).toContainText(`${ADDRESS.city}, ${ADDRESS.state} ${ADDRESS.postalCode}`);
      await expect(address).toContainText(ADDRESS.country);
      await expect(page.getByText('Express delivery, arriving about')).toBeVisible();
      await expect(page.getByText('Cash on Delivery')).toBeVisible();
      await expect(page.getByRole('link', { name: 'Continue shopping' })).toBeVisible();
      await expectNoHorizontalOverflow(page);
    });

    await test.step('the cart was cleared and stock was taken', async () => {
      await expectBadge(page, 0);
      expect((await apiCart(request, shopper)).items).toHaveLength(0);
      const after = await (await request.get(`${API}/products/${p.id}`)).json();
      expect(after.stock, 'two units left the shelf').toBe(stockBefore - 2);
    });

    await test.step('refreshing the confirmation shows the same order; the cart and checkout are empty', async () => {
      await page.reload();
      await expect(page.getByTestId('order-number')).toHaveText(orderNumber);
      await expect(page.getByTestId('order-total')).toHaveText(money(expressTotal));
      await page.goto('/cart');
      await expect(page.getByRole('heading', { name: 'Your cart is empty' })).toBeVisible();
      await page.goto('/checkout');
      await expect(page.getByRole('heading', { name: 'Your cart is empty' })).toBeVisible();
      await expect(page.getByRole('button', { name: 'Place your order' })).toHaveCount(0); // nothing to order: no double orders
    });
  });

  test('Buy Now adds the chosen quantity and goes straight to checkout', async ({ page, request }) => {
    const { freeShip: p } = await products(request);
    const shopper = await createShopper(request, 'buynow');
    await signInAs(page, shopper);
    await page.goto(`/products/${p.id}`);
    await page.getByLabel('Quantity').selectOption('3');
    await page.getByRole('button', { name: 'Buy Now' }).click();
    await expect(page).toHaveURL(/\/checkout$/);
    await expect(page.getByTestId('summary-item')).toHaveCount(1);
    await expect(page.getByTestId('summary-item')).toContainText(`3 × ${money(p.price)}`);
    await expectBadge(page, 3);
    expect((await apiCart(request, shopper)).items[0].quantity).toBe(3);
  });

  test('the cart badge is there on every page and survives a refresh', async ({ page, request }) => {
    const { freeShip: p } = await products(request);
    const shopper = await createShopper(request, 'badge');
    await apiAddToCart(request, shopper, p.id, 3);
    await signInAs(page, shopper);
    for (const path of ['/', '/search?q=pro', `/products/${p.id}`]) {
      await page.goto(path);
      await expectBadge(page, 3);
    }
    await page.reload();
    await expectBadge(page, 3);
  });

  test('signing out clears the cart badge', async ({ page, request }) => {
    const { freeShip: p } = await products(request);
    const shopper = await createShopper(request, 'signout');
    await apiAddToCart(request, shopper, p.id, 2);
    await signInAs(page, shopper);
    await page.goto('/');
    await expectBadge(page, 2);
    await page.getByRole('button', { name: 'Sign out' }).first().click();
    await expectBadge(page, 0);
  });
});

// ---- limits and unavailable items -------------------------------------------------------------------------------------

test.describe('stock limits and unavailable items', () => {
  test.use({ allowErrors: true }); // the server's 409 refusals are the point of these tests

  test('asking for more than is in stock is refused with the real reason, and the cart is unchanged', async ({ page, request }) => {
    const { lowStock: p } = await products(request);
    const shopper = await createShopper(request, 'limit');
    await signInAs(page, shopper);
    await page.goto(`/products/${p.id}`);

    const qty = page.getByLabel('Quantity');
    await expect(qty.locator('option')).toHaveCount(p.stock); // the picker never offers more than exists
    await qty.selectOption(String(p.stock));
    await page.getByRole('button', { name: 'Add to Cart' }).click();
    await expectBadge(page, p.stock);

    await qty.selectOption('1');
    await page.getByRole('button', { name: 'Add to Cart' }).click();
    const refusal = page.getByRole('alert').filter({ hasText: `Only ${p.stock} in stock` });
    await expect(refusal).toContainText(`You already have ${p.stock} in your cart`);
    await expect(page.getByRole('status').filter({ hasText: 'Added to cart' })).toHaveCount(0); // no fake success
    await expectBadge(page, p.stock);
    expect((await apiCart(request, shopper)).items[0].quantity).toBe(p.stock);
  });

  test('an out-of-stock product cannot be bought: no buttons on the page, and the API refuses too', async ({ page, request }) => {
    const { outOfStock: p } = await products(request);
    const shopper = await createShopper(request, 'oos');
    await signInAs(page, shopper);
    await page.goto(`/products/${p.id}`);
    await expect(page.getByRole('button', { name: 'Add to Cart' })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Buy Now' })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Currently unavailable' })).toBeDisabled();

    const res = await request.post(`${API}/cart/items`, { headers: { authorization: `Bearer ${shopper.token}` }, data: { productId: p.id, quantity: 1 } });
    expect(res.status()).toBe(409);
    expect((await res.json()).message).toContain('currently unavailable');
    await expectBadge(page, 0);
  });

  test('a cart line that stopped being available is flagged and blocks checkout', async ({ page, request }) => {
    const { freeShip: p } = await products(request);
    const shopper = await createShopper(request, 'flagged');
    await apiAddToCart(request, shopper, p.id, 2);
    const real = await apiCart(request, shopper);
    // The same cart, but as the server would report it if the product sold out after being added.
    const soldOut = { ...real, canCheckout: false, items: real.items.map((i) => ({ ...i, stock: 0, maxQuantity: 0, issue: { code: 'unavailable', message: 'Currently unavailable. Remove it to continue.' } })) };
    await signInAs(page, shopper);
    await page.route('**/api/cart', (route) => (route.request().method() === 'GET' ? route.fulfill({ json: soldOut }) : route.continue()));

    await page.goto('/cart');
    await expect(page.getByTestId('cart-item')).toContainText('Currently unavailable. Remove it to continue.');
    await expect(page.getByRole('button', { name: 'Proceed to checkout' })).toBeDisabled();
    await expect(page.getByRole('link', { name: 'Proceed to checkout' })).toHaveCount(0);

    await page.goto('/checkout');
    await expect(page.getByText('Some items in your cart need attention')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Place your order' })).toBeDisabled();
  });
});

// ---- honest failures --------------------------------------------------------------------------------------------------

test.describe('when the API fails the page says so, and never pretends it worked', () => {
  test.use({ allowErrors: true });

  test('Add to Cart: a server error and a dead network both show an error, with no success message', async ({ page, request }) => {
    const { freeShip: p } = await products(request);
    const shopper = await createShopper(request, 'fail-add');
    await signInAs(page, shopper);
    await page.goto(`/products/${p.id}`);
    const add = page.getByRole('button', { name: 'Add to Cart' });

    await page.route('**/api/cart/items', (route) => route.fulfill({ status: 500, json: { message: 'Internal server error' } }));
    await add.click();
    await expect(page.getByRole('alert').filter({ hasText: 'Internal server error' })).toBeVisible();
    await expect(page.getByText('Added to cart')).toHaveCount(0);
    await expectBadge(page, 0);

    await page.unroute('**/api/cart/items');
    await page.route('**/api/cart/items', (route) => route.abort('connectionrefused'));
    await add.click();
    await expect(page.getByRole('alert').filter({ hasText: "couldn't reach the store, so nothing was added" })).toBeVisible();
    await expect(page.getByText('Added to cart')).toHaveCount(0);
    await expectBadge(page, 0);
    expect((await apiCart(request, shopper)).items).toHaveLength(0);

    // …and once the network is back, the same button works.
    await page.unroute('**/api/cart/items');
    await add.click();
    await expect(page.getByRole('status').filter({ hasText: 'Added to cart' })).toBeVisible();
    await expectBadge(page, 1);
  });

  test('cart page: a failed load offers Try again; a failed quantity change leaves the old quantity and says so', async ({ page, request }) => {
    const { freeShip: p } = await products(request);
    const shopper = await createShopper(request, 'fail-cart');
    await apiAddToCart(request, shopper, p.id, 2);
    await signInAs(page, shopper);

    let failLoad = true;
    await page.route('**/api/cart', (route) => (failLoad && route.request().method() === 'GET' ? route.fulfill({ status: 500, json: { message: 'boom' } }) : route.continue()));
    await page.goto('/cart');
    await expect(page.getByRole('alert')).toContainText("couldn't load your cart");
    failLoad = false;
    await page.getByRole('button', { name: 'Try again' }).click();
    const qty = page.getByRole('combobox', { name: /Quantity for/ });
    await expect(qty).toHaveValue('2');

    await page.route('**/api/cart/items/*', (route) => (route.request().method() === 'PATCH' ? route.fulfill({ status: 500, json: { message: 'Could not update the cart.' } }) : route.continue()));
    await qty.selectOption('5');
    await expect(page.getByRole('alert').filter({ hasText: 'Could not update the cart.' })).toBeVisible();
    await expect(qty).toHaveValue('2'); // not left showing a quantity the server never accepted
    await expectBadge(page, 2);
    expect((await apiCart(request, shopper)).items[0].quantity).toBe(2);
  });

  test('checkout: a failed order shows the error, stays on checkout and keeps the cart; a stock refusal is shown verbatim', async ({ page, request }) => {
    const { freeShip: p } = await products(request);
    const shopper = await createShopper(request, 'fail-order');
    await apiAddToCart(request, shopper, p.id, 1);
    await signInAs(page, shopper);
    await page.goto('/checkout');
    await fillAddress(page, ADDRESS);
    const place = page.getByRole('button', { name: 'Place your order' });

    await page.route('**/api/orders', (route) => (route.request().method() === 'POST' ? route.fulfill({ status: 500, json: { message: 'Internal server error' } }) : route.continue()));
    await place.click();
    await expect(page.getByRole('alert').filter({ hasText: 'Internal server error' })).toBeVisible();
    await expect(page).toHaveURL(/\/checkout$/);
    await expect(page.getByTestId('confirmation-title')).toHaveCount(0);
    await expectBadge(page, 1);

    await page.unroute('**/api/orders');
    await page.route('**/api/orders', (route) => (route.request().method() === 'POST' ? route.fulfill({ status: 409, json: { message: '"Some Product": only 1 left in stock. Update your cart and try again.' } }) : route.continue()));
    await place.click();
    await expect(page.getByRole('alert').filter({ hasText: 'only 1 left in stock' })).toBeVisible();

    await page.unroute('**/api/orders');
    await page.route('**/api/orders', (route) => route.abort('connectionrefused'));
    await place.click();
    await expect(page.getByRole('alert').filter({ hasText: 'your order was NOT placed' })).toBeVisible();
    expect((await apiCart(request, shopper)).items, 'the cart is intact after every failure').toHaveLength(1);

    // The address typed so far survives a refresh (a draft, never payment details).
    await page.unroute('**/api/orders');
    await page.reload();
    await expect(page.getByLabel('Street address')).toHaveValue(ADDRESS.line1);
    await expect(page.getByLabel('City')).toHaveValue(ADDRESS.city);
  });
});

// ---- layout at every size ---------------------------------------------------------------------------------------------

test.describe('responsive layout', () => {
  test('cart, checkout and confirmation: no overflow, controls usable', async ({ page, request }) => {
    const { withVariants, paidShip, freeShip } = await products(request);
    const shopper = await createShopper(request, 'layout');
    await apiAddToCart(request, shopper, withVariants.id, 2);
    await apiAddToCart(request, shopper, paidShip.id, 1);
    await signInAs(page, shopper);

    await page.goto('/cart');
    await expect(page.getByTestId('cart-item')).toHaveCount(2);
    await expectNoHorizontalOverflow(page);
    const qty = (await page.getByRole('combobox', { name: /Quantity for/ }).first().boundingBox())!;
    expect(qty.height, 'touch-sized quantity control').toBeGreaterThanOrEqual(40);
    await expect(page.getByRole('link', { name: 'Proceed to checkout' })).toBeVisible();

    await page.goto('/checkout');
    await expect(page.getByTestId('summary-item')).toHaveCount(2);
    await expectNoHorizontalOverflow(page);
    for (const label of ['Full name', 'Street address', 'City', 'Phone']) {
      const box = (await page.getByLabel(label).first().boundingBox())!;
      expect(box.height, `${label} input is touch-sized`).toBeGreaterThanOrEqual(40);
      expect(box.x + box.width, `${label} input fits the viewport`).toBeLessThanOrEqual(page.viewportSize()!.width);
    }
    await page.getByRole('button', { name: 'Place your order' }).click(); // shows the error layout too
    await expectNoHorizontalOverflow(page);
    await expect(page.getByRole('button', { name: 'Place your order' })).toBeVisible();

    // A confirmation page, from an order placed through the API.
    const buyer = await createShopper(request, 'layout-order');
    await apiAddToCart(request, buyer, freeShip.id, 2);
    const order = await apiPlaceOrder(request, buyer, 'express');
    const confirmation = await page.context().newPage();
    await confirmation.addInitScript((t) => localStorage.setItem('bazaar.token', t), buyer.token);
    await confirmation.goto(`/orders/${order.orderNumber}/confirmation`);
    await expect(confirmation.getByTestId('confirmation-title')).toBeVisible();
    await expectNoHorizontalOverflow(confirmation);
  });

  test('empty cart and empty checkout fit the screen', async ({ page, request }) => {
    const shopper = await createShopper(request, 'empty');
    await signInAs(page, shopper);
    for (const path of ['/cart', '/checkout']) {
      await page.goto(path);
      await expect(page.getByRole('heading', { name: 'Your cart is empty' })).toBeVisible();
      await expectNoHorizontalOverflow(page);
    }
  });
});
