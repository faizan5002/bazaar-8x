import type { Page, Request } from '@playwright/test';
import { expect, test } from './fixtures';
import {
  API,
  apiRespond,
  apiSellerList,
  apiSellerResults,
  createSeller,
  createShopper,
  createValidation,
  expectNoHorizontalOverflow,
  seedLogin,
  sellerNavLink,
  signInAs,
  uiSignIn,
  unique,
  type Shopper,
} from './helpers';

/**
 * The seller side of demand validation: opening a store, the seller hub, creating a demand test (with its live preview)
 * and reading its results. Expectations come from the API (the frontend only displays the API's numbers); tests that
 * change anything use their own throwaway seller. The seeded accounts are only read.
 */

const resultsUrl = (id: number) => `/seller/validations/${id}`;
const isPost = (r: Request) => r.method() === 'POST' && /\/api\/seller\/validations$/.test(r.url());
const asJson = (r: Request) => JSON.parse(r.postData() ?? '{}');

/** Browser signed in as `who` (set before any page script runs). */
async function open(page: Page, who: Shopper, url: string) {
  await signInAs(page, who);
  await page.goto(url);
}

async function categories(request: Parameters<typeof createSeller>[0]) {
  const all: { id: number; name: string; slug: string }[] = await (await request.get(`${API}/categories`)).json();
  return all;
}

const field = (page: Page, label: string) => page.getByLabel(label, { exact: true });

/** Fills the create form with a valid proposal. */
async function fillValid(page: Page, over: { title?: string; features?: string[]; min?: string; max?: string; category?: string } = {}) {
  await field(page, 'Product title').fill(over.title ?? `E2E Backpack ${unique()}`);
  await field(page, 'Tagline').fill('A smarter carry-on built for modern travelers');
  await field(page, 'Description').fill('A carry-on backpack with a built-in charger and anti-theft zips, made for people who travel light.');
  await field(page, 'Category').selectOption({ label: over.category ?? 'Fashion' });
  await field(page, 'Image link 1').fill('https://images.unsplash.com/photo-1553062407-98eeb64c6a62?w=800');
  const features = over.features ?? ['USB-C charging', 'Waterproof', 'Anti-theft design'];
  for (let i = 0; i < features.length; i++) {
    if ((await page.getByLabel(`Feature ${i + 1}`, { exact: true }).count()) === 0) await page.getByRole('button', { name: 'Add feature' }).click();
    await field(page, `Feature ${i + 1}`).fill(features[i]);
  }
  await field(page, 'Minimum price').fill(over.min ?? '79');
  await field(page, 'Maximum price').fill(over.max ?? '99');
}

// ---- entry point and signing up ------------------------------------------------------------------------------------------

test.describe('opening a seller account', () => {
  test('a signed-out visitor can read /sell and is asked to sign in; signing in returns to the sign-up form', async ({ page, request }) => {
    const shopper = await createShopper(request, 'sell-out');
    await page.goto('/sell');
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Test demand before you build.');
    await expect(page.getByText('Have a product idea? Show it to shoppers, collect demand signals, and learn what price and features they actually want before investing in inventory.')).toBeVisible();
    await expect(sellerNavLink(page, 'Sell')).toHaveAttribute('aria-current', 'page');
    await expect(page.getByRole('form', { name: 'Open a seller account' })).toHaveCount(0);

    await page.getByRole('link', { name: 'Sign in to continue' }).click();
    await expect(page.getByText('Please sign in to continue')).toBeVisible();
    await uiSignIn(page, shopper);
    await expect(page).toHaveURL(/\/sell$/);
    await expect(page.getByRole('form', { name: 'Open a seller account' })).toBeVisible();
  });

  test('a signed-in shopper sees the sign-up form and "Sell" in the navigation; seller pages send them there', async ({ page, request }) => {
    const shopper = await createShopper(request, 'sell-form');
    await open(page, shopper, '/sell');
    await expect(page.getByRole('form', { name: 'Open a seller account' })).toBeVisible();
    await expect(sellerNavLink(page, 'Sell')).toBeVisible();
    await expect(sellerNavLink(page, 'Seller hub')).toHaveCount(0);
    await page.goto('/seller');
    await expect(page).toHaveURL(/\/sell$/);
    await page.goto('/seller/validations/new');
    await expect(page).toHaveURL(/\/sell$/);
  });

  test('opening a store works: the shopper becomes a seller, lands in the hub, and the navigation changes', async ({ page, request }) => {
    const shopper = await createShopper(request, 'sell-open');
    await open(page, shopper, '/sell');
    const storeName = `Brightside Bags ${unique()}`;
    await field(page, 'Store name').fill(storeName);
    await page.getByLabel('Store description').fill('Bags, brightly.');
    await page.getByRole('button', { name: 'Open a seller account' }).click();

    await expect(page).toHaveURL(/\/seller$/);
    await expect(page.getByRole('heading', { level: 1, name: 'Seller hub' })).toBeVisible();
    await expect(page.getByTestId('store-name')).toHaveText(storeName);
    await expect(sellerNavLink(page, 'Seller hub')).toHaveAttribute('aria-current', 'page');
    await expect(sellerNavLink(page, 'Sell')).toHaveCount(0);

    const me = await (await request.get(`${API}/auth/me`, { headers: { authorization: `Bearer ${shopper.token}` } })).json();
    expect(me.seller).toMatchObject({ name: storeName });
    await page.reload(); // the hub survives a refresh: the seller comes from /auth/me
    await expect(page.getByTestId('store-name')).toHaveText(storeName);

    await page.goto('/sell'); // a store owner has nothing to sign up for
    await expect(page).toHaveURL(/\/seller$/);
  });

  test('a store name that is too short is caught before anything is sent', async ({ page, request }) => {
    const shopper = await createShopper(request, 'sell-short');
    const posts: string[] = [];
    page.on('request', (r) => r.method() === 'POST' && /\/api\/sellers$/.test(r.url()) && posts.push(r.url()));
    await open(page, shopper, '/sell');
    await field(page, 'Store name').fill('A');
    await expect(page.getByText('Store name must be at least 2 characters.')).toBeVisible();
    await page.getByRole('button', { name: 'Open a seller account' }).click();
    await expect(page.getByRole('alert')).toContainText('store name');
    expect(posts).toEqual([]);
  });

  test.describe('duplicate accounts', () => {
    test.use({ allowErrors: true }); // the API refuses with 409: that is the point

    test('opening a second store (the first opened elsewhere) is refused with a clear message and a way to the hub', async ({ page, request }) => {
      const shopper = await createShopper(request, 'sell-dup');
      await open(page, shopper, '/sell'); // the page still thinks there is no store...
      await expect(page.getByRole('form', { name: 'Open a seller account' })).toBeVisible();
      const first = await request.post(`${API}/sellers`, { headers: { authorization: `Bearer ${shopper.token}` }, data: { name: `Elsewhere Store ${unique()}` } });
      expect(first.status()).toBe(201); // ...because the store was opened in another tab
      await field(page, 'Store name').fill(`Second Store ${unique()}`);
      await page.getByRole('button', { name: 'Open a seller account' }).click();
      await expect(page.getByRole('alert')).toContainText('already have a seller account');
      await page.getByRole('alert').getByRole('link', { name: 'Go to Seller hub' }).click();
      await expect(page).toHaveURL(/\/seller$/);
    });

    test("a failed request doesn't pretend the store was created", async ({ page, request }) => {
      const shopper = await createShopper(request, 'sell-fail');
      let fail = true;
      await page.route(/\/api\/sellers$/, (route) => (fail ? route.abort('failed') : route.continue()));
      await open(page, shopper, '/sell');
      await field(page, 'Store name').fill(`Retry Store ${unique()}`);
      await page.getByRole('button', { name: 'Open a seller account' }).click();
      await expect(page.getByRole('alert')).toContainText('NOT created');
      await expect(page).toHaveURL(/\/sell$/);
      fail = false;
      await page.getByRole('button', { name: 'Open a seller account' }).click();
      await expect(page).toHaveURL(/\/seller$/);
    });
  });

  test('signed-out visitors to the hub use the normal sign-in flow and come back', async ({ page, request }) => {
    const { owner } = await createSeller(request, 'hub-signin');
    await page.goto('/seller');
    await expect(page).toHaveURL(/\/login$/);
    await expect(page.getByText('Please sign in to continue')).toBeVisible();
    await uiSignIn(page, owner);
    await expect(page).toHaveURL(/\/seller$/);
    await expect(page.getByRole('heading', { level: 1, name: 'Seller hub' })).toBeVisible();
  });
});

// ---- the hub -------------------------------------------------------------------------------------------------------------

test.describe('the seller hub', () => {
  test("lists only the seller's own demand tests, with the API's numbers and signal labels", async ({ page, request }) => {
    const seller = await seedLogin(request, 'seller');
    const api = await apiSellerList(request, seller);
    await open(page, seller, '/seller');
    await expect(page.getByTestId('store-name')).toHaveText('Trailmate Travel Gear');
    await expect(page.getByTestId('seller-validation')).toHaveCount(api.length);

    // Newest first, exactly as the API lists them.
    const titles = await page.getByTestId('seller-validation').getByRole('heading').allTextContents();
    expect(titles).toEqual(api.map((v) => v.title));
    // ...and none of the other seeded store's tests.
    await expect(page.getByText('Modular Desk Organizer System')).toHaveCount(0);
    await expect(page.getByText('Self-Stirring Insulated Mug')).toHaveCount(0);

    for (const v of api) {
      const row = page.getByTestId('seller-validation').filter({ hasText: v.title });
      await expect(row.getByTestId('signal-label')).toHaveText(v.signal.label);
      await expect(row.getByTestId('response-total')).toHaveText(`${v.responseCount.toLocaleString('en-US')} ${v.responseCount === 1 ? 'response' : 'responses'}`);
      await expect(row.getByTestId('interest-split')).toHaveText(`${v.interestedPercent}% Interested · ${v.maybePercent}% Maybe · ${v.notInterestedPercent}% Not interested`);
      await expect(row.getByTestId('status-badge')).toHaveText(v.status === 'open' ? 'Open' : 'Closed');
    }
  });

  test('the seeded flagship shows its 1,284+ responses and a strong signal', async ({ page, request }) => {
    const seller = await seedLogin(request, 'seller');
    const api = (await apiSellerList(request, seller)).find((v) => v.title === 'Smart Travel Backpack')!;
    expect(api.responseCount).toBeGreaterThanOrEqual(1284); // the seeded shoppers, plus any real ones since
    await open(page, seller, '/seller');
    const row = page.getByTestId('seller-validation').filter({ hasText: 'Smart Travel Backpack' });
    await expect(row).toContainText(`${api.responseCount.toLocaleString('en-US')} responses`);
    await expect(row).toContainText('67% Interested · 21% Maybe · 12% Not interested');
    await expect(row).toContainText('Strong demand signal');
    await expect(row.getByRole('link', { name: /View results/ })).toHaveAttribute('href', /\/seller\/validations\/\d+$/);
  });

  test('a low-volume test says "Too early to tell"', async ({ page, request }) => {
    const maker = await seedLogin(request, 'maker');
    await open(page, maker, '/seller');
    const row = page.getByTestId('seller-validation').filter({ hasText: 'Modular Desk Organizer System' });
    await expect(row).toContainText('18 responses');
    await expect(row.getByTestId('signal-label')).toHaveText('Too early to tell');
  });

  test('a new seller sees the empty state, and its button opens the create form', async ({ page, request }) => {
    const { owner } = await createSeller(request, 'hub-empty');
    await open(page, owner, '/seller');
    await expect(page.getByTestId('empty-state')).toBeVisible();
    await expect(page.getByRole('heading', { name: 'No demand tests yet' })).toBeVisible();
    await expect(page.getByText('Create your first test and see whether shoppers would buy your idea.')).toBeVisible();
    await expect(page.getByTestId('seller-validation')).toHaveCount(0);
    await page.getByRole('link', { name: 'Create demand test' }).click();
    await expect(page).toHaveURL(/\/seller\/validations\/new$/);
  });

  test('a zero-response test shows no invented percentages', async ({ page, request }) => {
    const { owner } = await createSeller(request, 'hub-zero');
    const v = await createValidation(request, owner);
    await open(page, owner, '/seller');
    const row = page.getByTestId('seller-validation').filter({ hasText: v.title });
    await expect(row.getByTestId('response-total')).toHaveText('No responses yet');
    await expect(row.getByTestId('interest-split')).toHaveCount(0);
    await expect(row.getByTestId('signal-label')).toHaveText('Too early to tell');
  });

  test.describe('when the API fails', () => {
    test.use({ allowErrors: true });
    test('shows an error with a working retry', async ({ page, request }) => {
      const { owner } = await createSeller(request, 'hub-fail');
      let fail = true;
      await page.route(/\/api\/seller\/validations$/, (route) => (fail ? route.fulfill({ status: 500, json: { message: 'boom' } }) : route.continue()));
      await open(page, owner, '/seller');
      await expect(page.getByRole('alert')).toBeVisible();
      fail = false;
      await page.getByRole('button', { name: 'Try again' }).click();
      await expect(page.getByTestId('empty-state')).toBeVisible();
    });
  });
});

// ---- creating a demand test ----------------------------------------------------------------------------------------------

test.describe('creating a demand test', () => {
  test('the form renders with the API categories and the right starting points', async ({ page, request }) => {
    const { owner } = await createSeller(request, 'new-render');
    const cats = await categories(request);
    await open(page, owner, '/seller/validations/new');
    await expect(page.getByRole('heading', { level: 1, name: 'Create a demand test' })).toBeVisible();
    await expect(page.getByText("Show shoppers what you're thinking of making and learn what they want before you commit to production.")).toBeVisible();

    const options = await field(page, 'Category').locator('option').allTextContents();
    expect(options.slice(1), 'categories come from the API').toEqual(cats.map((c) => c.name));
    await expect(page.getByLabel(/^Feature \d$/)).toHaveCount(3);
    await expect(page.getByLabel('Image link 1', { exact: true })).toBeVisible();
    await expect(page.locator('#f-expectedLaunch')).toHaveAttribute('type', 'month');
    await expect(page.getByRole('link', { name: 'Seller hub' }).first()).toBeVisible();
    await expect(page.getByRole('button', { name: 'Create demand test' })).toBeEnabled();
  });

  test('the live preview follows the form and is a picture, not a link', async ({ page, request }) => {
    const { owner, store } = await createSeller(request, 'new-preview');
    await open(page, owner, '/seller/validations/new');
    const preview = page.getByTestId('preview');
    const card = preview.getByTestId('validation-card-preview');

    await expect(preview.getByRole('heading', { name: 'How shoppers will see it' })).toBeVisible();
    await expect(card).toContainText('Your product name'); // placeholders before anything is typed
    await expect(card).toContainText('Coming soon');
    await expect(card).toContainText(`by ${store.name}`);
    await expect(card.getByTestId('price-range')).toHaveText('$ —');

    await field(page, 'Product title').fill('Smart Travel Backpack');
    await field(page, 'Tagline').fill('A smarter carry-on built for modern travelers');
    await expect(card).toContainText('Smart Travel Backpack');
    await expect(card).toContainText('A smarter carry-on built for modern travelers');

    await field(page, 'Minimum price').fill('79');
    await field(page, 'Maximum price').fill('99');
    await expect(card.getByTestId('price-range')).toHaveText('$79–99');

    await page.locator('#f-expectedLaunch').fill('2027-05');
    await expect(preview.getByTestId('preview-launch')).toHaveText('May 2027');

    await field(page, 'Category').selectOption({ label: 'Sports & Fitness' });
    await expect(preview.getByTestId('preview-facts')).toContainText('Sports & Fitness');

    await field(page, 'Feature 1').fill('USB-C charging');
    await field(page, 'Feature 2').fill('Waterproof');
    await expect(preview.getByTestId('preview-features').getByRole('listitem')).toHaveText(['USB-C charging', 'Waterproof']);

    await expect(card.getByRole('link')).toHaveCount(0); // not clickable: the test doesn't exist yet
    await expect(card.getByRole('button')).toHaveCount(0);
    await expect(preview.getByText(/add to cart|buy now/i)).toHaveCount(0);
  });

  test('features: 3 to 6, with add and remove', async ({ page, request }) => {
    const { owner } = await createSeller(request, 'new-features');
    const posts: Request[] = [];
    page.on('request', (r) => isPost(r) && posts.push(r));
    await open(page, owner, '/seller/validations/new');
    await fillValid(page, { features: ['Only one', 'And two'] });

    await page.getByRole('button', { name: 'Create demand test' }).click();
    await expect(page.getByTestId('f-features-error')).toHaveText('Add at least 3 features (you have 2).');
    await expect(page.getByTestId('form-summary')).toContainText('One thing needs your attention');
    expect(posts, 'nothing is sent while a feature is missing').toHaveLength(0);

    // At the minimum (the form starts with three rows), a feature can't be removed; at the maximum, none can be added.
    await expect(page.getByLabel(/^Feature \d$/)).toHaveCount(3);
    await expect(page.getByRole('button', { name: /^Remove feature/ }).first()).toBeDisabled();
    for (const n of [4, 5, 6]) {
      await page.getByRole('button', { name: 'Add feature' }).click();
      await expect(page.getByLabel(`Feature ${n}`, { exact: true })).toBeVisible();
    }
    await expect(page.getByRole('button', { name: 'Add feature' })).toBeDisabled();
    await expect(page.getByLabel(/^Feature \d$/)).toHaveCount(6);
    await page.getByRole('button', { name: 'Remove feature 6' }).click();
    await expect(page.getByLabel(/^Feature \d$/)).toHaveCount(5);
    await expect(page.getByRole('button', { name: 'Add feature' })).toBeEnabled();

    // Duplicates are refused too.
    for (const [i, name] of ['Waterproof', 'waterproof', 'Light', 'Strong', 'Slim'].entries()) await field(page, `Feature ${i + 1}`).fill(name);
    await page.getByRole('button', { name: 'Create demand test' }).click();
    await expect(page.getByTestId('f-features-error')).toHaveText('Features must be different from each other.');
    expect(posts).toHaveLength(0);
  });

  test('a maximum price below the minimum is rejected, and so are missing or odd amounts', async ({ page, request }) => {
    const { owner } = await createSeller(request, 'new-price');
    const posts: Request[] = [];
    page.on('request', (r) => isPost(r) && posts.push(r));
    await open(page, owner, '/seller/validations/new');
    await fillValid(page, { min: '100', max: '50' });
    await page.getByRole('button', { name: 'Create demand test' }).click();
    await expect(page.getByTestId('f-priceMax-error')).toHaveText('Maximum price must be at least the minimum price.');
    await expect(page.locator('#f-priceMax')).toHaveAttribute('aria-invalid', 'true');
    await expect(page.locator('#f-priceMax')).toBeFocused();
    expect(posts).toHaveLength(0);

    await field(page, 'Minimum price').fill('12.345');
    await expect(page.getByTestId('f-priceMin-error')).toContainText('amount like');
    await field(page, 'Minimum price').fill('');
    await expect(page.getByTestId('f-priceMin-error')).toHaveText('Enter a minimum price.');
    await field(page, 'Minimum price').fill('50');
    await expect(page.getByTestId('f-priceMax-error')).toHaveCount(0); // equal prices are allowed
    await field(page, 'Minimum price').fill('49.99');
    await expect(page.getByTestId('f-priceMin-error')).toHaveCount(0);
  });

  test('required fields, the launch window and image links are checked before sending', async ({ page, request }) => {
    const { owner } = await createSeller(request, 'new-required');
    const posts: Request[] = [];
    page.on('request', (r) => isPost(r) && posts.push(r));
    await open(page, owner, '/seller/validations/new');
    await page.getByRole('button', { name: 'Create demand test' }).click();
    for (const id of ['f-title', 'f-tagline', 'f-description', 'f-categoryId', 'f-features', 'f-priceMin', 'f-priceMax']) await expect(page.getByTestId(`${id}-error`)).toBeVisible();
    await expect(page.locator('#f-title')).toBeFocused(); // straight to the first problem
    expect(posts).toHaveLength(0);

    await fillValid(page);
    await page.locator('#f-expectedLaunch').fill('2020-01');
    await expect(page.getByTestId('f-expectedLaunch-error')).toContainText('past');
    await page.locator('#f-expectedLaunch').fill('2099-01');
    await expect(page.getByTestId('f-expectedLaunch-error')).toContainText('36 months');
    await field(page, 'Image link 1').fill('not a url');
    await page.getByRole('button', { name: 'Create demand test' }).click();
    await expect(page.getByTestId('f-images-error')).toContainText('valid image link');
    expect(posts).toHaveLength(0);

    // At most five image links.
    for (let i = 0; i < 4; i++) await page.getByRole('button', { name: 'Add image link' }).click();
    await expect(page.getByRole('button', { name: 'Add image link' })).toBeDisabled();
  });

  test('creating a test: it goes live, the seller lands on its results, and it appears in the hub and in Coming soon', async ({ page, request }) => {
    const { owner, store } = await createSeller(request, 'new-create');
    const title = `E2E Smart Backpack ${unique()}`;
    const posts: Request[] = [];
    page.on('request', (r) => isPost(r) && posts.push(r));
    await open(page, owner, '/seller/validations/new');
    await fillValid(page, { title, features: ['USB-C charging', 'Waterproof', 'Anti-theft design', 'Laptop protection'] });
    await page.locator('#f-expectedLaunch').fill('2027-05');
    await page.getByRole('button', { name: 'Create demand test' }).click();

    await expect(page).toHaveURL(/\/seller\/validations\/\d+$/);
    const id = Number(page.url().split('/').pop());
    await expect(page.getByTestId('created-banner')).toContainText('Your demand test is live.');
    await expect(page.getByTestId('results-title')).toHaveText(title);
    await expect(page.getByTestId('status-badge')).toHaveText('Open');
    await expect(page.getByTestId('results-responses')).toHaveText('No shoppers have responded yet');

    // What was sent: the proposal only, never a seller id (the server takes it from the sign-in).
    expect(posts).toHaveLength(1);
    const sent = asJson(posts[0]);
    expect(Object.keys(sent).sort()).toEqual(['categoryId', 'description', 'expectedLaunch', 'features', 'images', 'priceMax', 'priceMin', 'tagline', 'title']);
    expect(sent).toMatchObject({ title, priceMin: 79, priceMax: 99, expectedLaunch: '2027-05', features: ['USB-C charging', 'Waterproof', 'Anti-theft design', 'Laptop protection'] });

    // It is really there: open to the public, owned by this seller.
    const pub = await (await request.get(`${API}/validations/${id}`)).json();
    expect(pub).toMatchObject({ title, status: 'open', responseCount: 0, seller: { id: store.id } });
    expect((await apiSellerList(request, owner)).map((v) => v.id)).toContain(id);

    await page.getByRole('link', { name: 'Seller hub' }).first().click();
    await expect(page.getByTestId('seller-validation').filter({ hasText: title })).toBeVisible();
    await page.getByRole('link', { name: 'Coming soon' }).first().click();
    await expect(page.getByTestId('validation-card').filter({ hasText: title })).toBeVisible(); // (other tests may be adding theirs at the same time)
  });

  test('a double-click creates one test', async ({ page, request }) => {
    const { owner } = await createSeller(request, 'new-double');
    const posts: Request[] = [];
    page.on('request', (r) => isPost(r) && posts.push(r));
    await open(page, owner, '/seller/validations/new');
    await fillValid(page);
    await page.getByRole('button', { name: 'Create demand test' }).dblclick();
    await expect(page).toHaveURL(/\/seller\/validations\/\d+$/);
    expect(posts).toHaveLength(1);
    expect(await apiSellerList(request, owner)).toHaveLength(1);
  });

  test.describe('when the server pushes back', () => {
    test.use({ allowErrors: true });

    test("the API's validation messages appear next to their fields", async ({ page, request }) => {
      const { owner } = await createSeller(request, 'new-server-400');
      await page.route(/\/api\/seller\/validations$/, (route) =>
        route.request().method() === 'POST' ? route.fulfill({ status: 400, json: { message: ['title must be longer than or equal to 3 characters', 'priceMax must be greater than or equal to priceMin.', 'Something unexpected went wrong.'] } }) : route.continue(),
      );
      await open(page, owner, '/seller/validations/new');
      await fillValid(page);
      await page.getByRole('button', { name: 'Create demand test' }).click();
      await expect(page.getByTestId('f-title-error')).toContainText('Title must be longer');
      await expect(page.getByTestId('f-priceMax-error')).toContainText('Maximum price must be greater than or equal to Minimum price');
      await expect(page.getByTestId('form-summary')).toContainText('Something unexpected went wrong.');
      await expect(page).toHaveURL(/\/seller\/validations\/new$/);
      await expect(page.locator('#f-title')).toBeFocused();
      // Fixing a field clears its server message.
      await field(page, 'Product title').fill('A better title');
      await expect(page.getByTestId('f-title-error')).toHaveCount(0);
    });

    test("a real refusal from the API (a category that doesn't exist) is shown, not swallowed", async ({ page, request }) => {
      const { owner } = await createSeller(request, 'new-server-real');
      await open(page, owner, '/seller/validations/new');
      await fillValid(page);
      // Swap the chosen category for one the server doesn't know, as if it had been deleted meanwhile.
      await page.route(/\/api\/seller\/validations$/, async (route) => {
        if (route.request().method() !== 'POST') return route.continue();
        await route.continue({ postData: JSON.stringify({ ...asJson(route.request()), categoryId: 987654 }), headers: { ...route.request().headers(), 'content-type': 'application/json' } });
      });
      await page.getByRole('button', { name: 'Create demand test' }).click();
      await expect(page.getByTestId('f-categoryId-error')).toContainText('does not exist');
      await expect(page).toHaveURL(/\/seller\/validations\/new$/);
    });

    test('a failed request keeps everything typed, says nothing was created, and succeeds on retry', async ({ page, request }) => {
      const { owner } = await createSeller(request, 'new-offline');
      let fail = true;
      await page.route(/\/api\/seller\/validations$/, (route) => (route.request().method() === 'POST' && fail ? route.abort('failed') : route.continue()));
      await open(page, owner, '/seller/validations/new');
      const title = `E2E Retry ${unique()}`;
      await fillValid(page, { title });
      await page.getByRole('button', { name: 'Create demand test' }).click();
      await expect(page.getByTestId('form-summary')).toContainText('NOT created');
      await expect(field(page, 'Product title')).toHaveValue(title);
      expect(await apiSellerList(request, owner)).toHaveLength(0);
      fail = false;
      await page.getByRole('button', { name: 'Create demand test' }).click();
      await expect(page).toHaveURL(/\/seller\/validations\/\d+$/);
      expect(await apiSellerList(request, owner)).toHaveLength(1);
    });

    test('an expired session goes to sign-in', async ({ page, request }) => {
      const { owner } = await createSeller(request, 'new-401');
      await page.route(/\/api\/seller\/validations$/, (route) => (route.request().method() === 'POST' ? route.fulfill({ status: 401, json: { message: 'Unauthorized' } }) : route.continue()));
      await open(page, owner, '/seller/validations/new');
      await fillValid(page);
      await page.getByRole('button', { name: 'Create demand test' }).click();
      await expect(page).toHaveURL(/\/login$/);
    });
  });
});

// ---- results -------------------------------------------------------------------------------------------------------------

const rowsOf = (page: Page, id: string) => page.getByTestId(id);

test.describe('demand test results', () => {
  test('the flagship: every number on screen is the API number', async ({ page, request }) => {
    const seller = await seedLogin(request, 'seller');
    const flagship = (await apiSellerList(request, seller)).find((v) => v.title === 'Smart Travel Backpack')!;
    const api = await apiSellerResults(request, seller, flagship.id);
    await open(page, seller, resultsUrl(flagship.id));

    await expect(page.getByTestId('results-title')).toHaveText('Smart Travel Backpack');
    await expect(page.getByTestId('status-badge')).toHaveText('Open');
    await expect(page.getByTestId('results-responses')).toHaveText(`${api.totalResponses.toLocaleString('en-US')} shoppers responded`);
    await expect(page.getByTestId('created-banner')).toHaveCount(0); // that is only for a test just created

    // The main signal: label, score, the three shares, the explanation and the disclaimer.
    await expect(page.getByTestId('signal-label')).toHaveText(api.signal.label);
    await expect(page.getByTestId('demand-score')).toHaveText(`${api.signal.score} / 100`);
    await expect(page.getByTestId('interest-summary')).toHaveText(`${api.interest.interested.percent}% Interested · ${api.interest.maybe.percent}% Maybe · ${api.interest.notInterested.percent}% Not interested`);
    await expect(page.getByTestId('signal-early-note')).toHaveCount(0);
    await expect(page.getByText('Interested shoppers count fully; Maybe responses count half.')).toBeVisible();
    await expect(page.getByTestId('disclaimer')).toHaveText('Demand signals represent shopper intent and do not guarantee purchases.');

    // Interest distribution.
    await expect(rowsOf(page, 'interest-interested').getByTestId('bar-value')).toHaveText(`${api.interest.interested.percent}%`);
    await expect(rowsOf(page, 'interest-maybe').getByTestId('bar-value')).toHaveText(`${api.interest.maybe.percent}%`);
    await expect(rowsOf(page, 'interest-not').getByTestId('bar-value')).toHaveText(`${api.interest.notInterested.percent}%`);

    // Preferred price: all five buckets, most popular first, with the sweet spot marked.
    const priceRows = page.getByTestId('price-row');
    await expect(priceRows).toHaveCount(5);
    const expectedPrices = [...api.priceBuckets].sort((a, b) => b.count - a.count);
    for (const [i, b] of expectedPrices.entries()) {
      await expect(priceRows.nth(i)).toContainText(b.label);
      await expect(priceRows.nth(i).getByTestId('bar-value')).toHaveText(`${b.percent}%`);
    }
    const sweet = api.insights.preferredPrice!;
    await expect(page.getByTestId('sweet-spot')).toHaveText(`Sweet spot: ${sweet.label}`);
    await expect(priceRows.first()).toContainText('Sweet spot');
    await expect(priceRows.first()).toContainText(sweet.label);

    // Features, in the API's order, with the top one called out.
    const featureRows = page.getByTestId('feature-row');
    await expect(featureRows).toHaveCount(api.features.length);
    for (const [i, f] of api.features.entries()) {
      await expect(featureRows.nth(i)).toContainText(f.name);
      await expect(featureRows.nth(i).getByTestId('bar-value')).toHaveText(`${f.percent}%`);
    }
    await expect(page.getByTestId('top-feature')).toHaveText(`Top requested feature: ${api.insights.topFeature!.name}`);

    // Insight cards are sentences built from those values (nothing flagship-specific is hardcoded).
    await expect(page.getByTestId('insight-price')).toContainText(`Shoppers show the strongest price preference around ${sweet.label}.`);
    await expect(page.getByTestId('insight-feature')).toContainText(`${api.insights.topFeature!.name} is the most requested feature.`);
    await expect(page.getByTestId('insight-demand')).toContainText(`${api.signal.openPercent}% of respondents are either Interested or Maybe.`);
    await expect(page.getByTestId('insight-pressure')).toHaveCount(api.insights.pricePressure.flagged ? 1 : 0);
    expect(api.insights.pricePressure.flagged, 'the flagship has no price pressure').toBe(false);
  });

  test('the seeded flagship matches its documented values', async ({ page, request }) => {
    const seller = await seedLogin(request, 'seller');
    const flagship = (await apiSellerList(request, seller)).find((v) => v.title === 'Smart Travel Backpack')!;
    await open(page, seller, resultsUrl(flagship.id));
    await expect(page.getByTestId('demand-score')).toHaveText('77.5 / 100');
    await expect(page.getByTestId('signal-label')).toHaveText('Strong demand signal');
    await expect(page.getByTestId('sweet-spot')).toHaveText('Sweet spot: $86–$92');
    await expect(page.getByTestId('top-feature')).toHaveText('Top requested feature: USB-C charging');
    await expect(page.getByTestId('insight-demand')).toContainText('88% of respondents');
  });

  test('price pressure appears only when the API flags it', async ({ page, request }) => {
    const maker = await seedLogin(request, 'maker');
    const mug = (await apiSellerList(request, maker)).find((v) => v.title === 'Self-Stirring Insulated Mug')!;
    const api = await apiSellerResults(request, maker, mug.id);
    expect(api.insights.pricePressure.flagged).toBe(true);
    await open(page, maker, resultsUrl(mug.id));
    const card = page.getByTestId('insight-pressure');
    await expect(card).toBeVisible();
    await expect(card).toContainText('Price pressure');
    await expect(card).toContainText(`${api.insights.pricePressure.percent}%`);
    await expect(card).toContainText('A significant share of shoppers prefer a price below your proposed range. Consider whether the product can be offered at a lower price.');
  });

  test('a small test says "Too early to tell" and keeps its conclusions honest', async ({ page, request }) => {
    const maker = await seedLogin(request, 'maker');
    const desk = (await apiSellerList(request, maker)).find((v) => v.title === 'Modular Desk Organizer System')!;
    const api = await apiSellerResults(request, maker, desk.id);
    await open(page, maker, resultsUrl(desk.id));
    await expect(page.getByTestId('signal-label')).toHaveText('Too early to tell');
    await expect(page.getByTestId('signal-early-note')).toContainText(`${api.signal.minResponses} shoppers`);
    await expect(page.getByTestId('demand-score')).toHaveText(`${api.signal.score} / 100`); // the API's score, shown but not oversold
    for (const id of ['insight-price', 'insight-feature', 'insight-demand']) await expect(page.getByTestId(id)).toContainText('Not enough responses to draw a strong conclusion yet.');
    await expect(page.getByTestId('disclaimer')).toBeVisible();
  });

  test('a test nobody has answered shows honest empty states, not zeros dressed up as results', async ({ page, request }) => {
    const { owner } = await createSeller(request, 'res-empty');
    const v = await createValidation(request, owner);
    await open(page, owner, resultsUrl(v.id));
    await expect(page.getByTestId('results-responses')).toHaveText('No shoppers have responded yet');
    await expect(page.getByTestId('signal-label')).toHaveText('Too early to tell');
    await expect(page.getByTestId('price-empty')).toHaveText('Not enough price responses yet.');
    await expect(page.getByTestId('features-empty')).toHaveText('Not enough feature responses yet.');
    await expect(page.getByTestId('price-row')).toHaveCount(0);
    await expect(page.getByTestId('insight-demand')).toContainText('Not enough responses to draw a strong conclusion yet.');
  });

  test('a test with answers but no price or feature picks says so', async ({ page, request }) => {
    const { owner } = await createSeller(request, 'res-bare');
    const v = await createValidation(request, owner);
    for (let i = 0; i < 2; i++) await apiRespond(request, await createShopper(request, `res-bare-voter-${i}`), v.id, { interest: i ? 'maybe' : 'interested' });
    await open(page, owner, resultsUrl(v.id));
    await expect(page.getByTestId('results-responses')).toHaveText('2 shoppers responded');
    await expect(page.getByTestId('price-empty')).toBeVisible();
    await expect(page.getByTestId('features-empty')).toBeVisible();
  });

  test.describe('who can see results', () => {
    test.use({ allowErrors: true }); // the API refuses others with 404

    test("another seller can't open them, and the page doesn't leak any numbers", async ({ page, request }) => {
      const seller = await seedLogin(request, 'seller');
      const flagship = (await apiSellerList(request, seller)).find((v) => v.title === 'Smart Travel Backpack')!;
      const { owner: other } = await createSeller(request, 'res-other');
      const direct = await request.get(`${API}/seller/validations/${flagship.id}/results`, { headers: { authorization: `Bearer ${other.token}` } });
      expect(direct.status()).toBe(404);

      await open(page, other, resultsUrl(flagship.id));
      await expect(page.getByRole('heading', { name: "We couldn't find that demand test" })).toBeVisible();
      await expect(page.locator('body')).not.toContainText(flagship.responseCount.toLocaleString('en-US'));
      await expect(page.locator('body')).not.toContainText('77.5');
      await expect(page.getByTestId('demand-score')).toHaveCount(0);
      await page.getByRole('link', { name: 'Back to Seller hub' }).click();
      await expect(page).toHaveURL(/\/seller$/);
    });

    test('a shopper without a store is sent to open one', async ({ page, request }) => {
      const seller = await seedLogin(request, 'seller');
      const flagship = (await apiSellerList(request, seller)).find((v) => v.title === 'Smart Travel Backpack')!;
      const shopper = await createShopper(request, 'res-shopper');
      await open(page, shopper, resultsUrl(flagship.id));
      await expect(page).toHaveURL(/\/sell$/);
      await expect(page.locator('body')).not.toContainText(flagship.responseCount.toLocaleString('en-US'));
    });

    test('signed out: sign in, and return to the results', async ({ page, request }) => {
      const { owner } = await createSeller(request, 'res-signin');
      const v = await createValidation(request, owner);
      await page.goto(resultsUrl(v.id));
      await expect(page).toHaveURL(/\/login$/);
      await uiSignIn(page, owner);
      await expect(page).toHaveURL(new RegExp(`${resultsUrl(v.id)}$`));
      await expect(page.getByTestId('results-title')).toHaveText(v.title);
    });

    test('a 403 explains access is denied; a 401 goes to sign-in; a bad id is not found without asking the API', async ({ page, request }) => {
      const { owner } = await createSeller(request, 'res-errors');
      const v = await createValidation(request, owner);

      await page.route(/\/api\/seller\/validations\/\d+\/results$/, (route) => route.fulfill({ status: 403, json: { message: 'Forbidden' } }));
      await open(page, owner, resultsUrl(v.id));
      await expect(page.getByRole('heading', { name: "You don't have access to this" })).toBeVisible();

      await page.unroute(/\/api\/seller\/validations\/\d+\/results$/);
      await page.route(/\/api\/seller\/validations\/\d+\/results$/, (route) => route.fulfill({ status: 401, json: { message: 'Unauthorized' } }));
      await page.reload();
      await expect(page).toHaveURL(/\/login$/);

      await page.unroute(/\/api\/seller\/validations\/\d+\/results$/);
      const asked: string[] = [];
      page.on('request', (r) => /\/results$/.test(r.url()) && asked.push(r.url()));
      await signInAs(page, owner);
      await page.goto('/seller/validations/abc');
      await expect(page.getByRole('heading', { name: "We couldn't find that demand test" })).toBeVisible();
      expect(asked).toEqual([]);
    });

    test('a failed load offers a retry', async ({ page, request }) => {
      const { owner } = await createSeller(request, 'res-retry');
      const v = await createValidation(request, owner);
      let fail = true;
      await page.route(/\/api\/seller\/validations\/\d+\/results$/, (route) => (fail ? route.fulfill({ status: 500, json: { message: 'boom' } }) : route.continue()));
      await open(page, owner, resultsUrl(v.id));
      await expect(page.getByRole('alert')).toBeVisible();
      fail = false;
      await page.getByRole('button', { name: 'Try again' }).click();
      await expect(page.getByTestId('results-title')).toHaveText(v.title);
    });
  });

  test('"Copy link" copies the public URL and says so for a moment', async ({ page, request, baseURL }) => {
    await page.context().grantPermissions(['clipboard-read', 'clipboard-write']);
    const { owner } = await createSeller(request, 'res-copy');
    const v = await createValidation(request, owner);
    await open(page, owner, resultsUrl(v.id));
    await expect(page.getByTestId('copy-status')).toHaveText('');
    await page.getByRole('button', { name: 'Copy link' }).click();
    await expect(page.getByTestId('copy-status')).toHaveText('Link copied');
    expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(`${baseURL}/coming-soon/${v.id}`);
    await expect(page.getByTestId('copy-status')).toHaveText('', { timeout: 6000 }); // the confirmation fades
  });

  test('"View public page" leads to the shopper-facing test, and the breadcrumb leads back to the hub', async ({ page, request }) => {
    const { owner } = await createSeller(request, 'res-links');
    const v = await createValidation(request, owner);
    await open(page, owner, resultsUrl(v.id));
    await page.getByRole('link', { name: 'View public page' }).click();
    await expect(page).toHaveURL(new RegExp(`/coming-soon/${v.id}$`));
    await expect(page.getByTestId('owner-state')).toBeVisible(); // the seller sees their own test as its owner
    await page.goBack();
    await page.getByRole('navigation', { name: 'Breadcrumb' }).getByRole('link', { name: 'Seller hub' }).click();
    await expect(page).toHaveURL(/\/seller$/);
  });

  test('closing and reopening: the button, the badge and the public voting state all follow', async ({ page, request, baseURL }) => {
    const { owner } = await createSeller(request, 'res-toggle');
    const v = await createValidation(request, owner);
    const voter = await createShopper(request, 'res-toggle-voter');
    const vote = () => request.put(`${API}/validations/${v.id}/response`, { headers: { authorization: `Bearer ${voter.token}` }, data: { interest: 'interested' } });
    const publicStatus = async () => (await (await request.get(`${API}/validations/${v.id}`)).json()).status;

    await open(page, owner, resultsUrl(v.id));
    await expect(page.getByTestId('status-badge')).toHaveText('Open');
    await expect(page.getByRole('button', { name: 'Reopen test' })).toHaveCount(0);

    await page.getByRole('button', { name: 'Close test' }).click();
    await expect(page.getByRole('button', { name: 'Reopen test' })).toBeVisible();
    await expect(page.getByTestId('status-badge')).toHaveText('Closed');
    await expect(page.getByTestId('status-note')).toContainText('Closed');
    expect(await publicStatus()).toBe('closed');
    expect((await vote()).status(), 'shoppers can no longer answer').toBe(409);
    await page.reload(); // it stays closed
    await expect(page.getByTestId('status-badge')).toHaveText('Closed');
    expect((await apiSellerList(request, owner)).find((x) => x.id === v.id)!.status).toBe('closed');

    // A shopper opening the public page now sees it is closed.
    const shopperPage = await page.context().browser()!.newContext({ baseURL: baseURL! });
    const sp = await shopperPage.newPage();
    await sp.addInitScript((t) => localStorage.setItem('bazaar.token', t), voter.token);
    await sp.goto(`/coming-soon/${v.id}`);
    await expect(sp.getByTestId('closed-state')).toBeVisible();
    await shopperPage.close();

    await page.getByRole('button', { name: 'Reopen test' }).click();
    await expect(page.getByRole('button', { name: 'Close test' })).toBeVisible();
    await expect(page.getByTestId('status-badge')).toHaveText('Open');
    expect(await publicStatus()).toBe('open');
    expect((await vote()).status(), 'answers are accepted again').toBe(200);
    expect((await apiSellerList(request, owner))[0].responseCount).toBe(1);
  });

  test.describe('when closing fails', () => {
    test.use({ allowErrors: true });
    test('the page says so and keeps showing the test as open', async ({ page, request }) => {
      const { owner } = await createSeller(request, 'res-toggle-fail');
      const v = await createValidation(request, owner);
      await page.route(new RegExp(`/api/seller/validations/${v.id}$`), (route) => (route.request().method() === 'PATCH' ? route.fulfill({ status: 500, json: { message: 'boom' } }) : route.continue()));
      await open(page, owner, resultsUrl(v.id));
      await page.getByRole('button', { name: 'Close test' }).click();
      await expect(page.getByRole('alert')).toContainText("couldn't close the test");
      await expect(page.getByTestId('status-badge')).toHaveText('Open');
      await expect(page.getByRole('button', { name: 'Close test' })).toBeEnabled();
      expect(await (await request.get(`${API}/validations/${v.id}`)).json()).toMatchObject({ status: 'open' });
    });
  });

  test('the seeded closed test offers "Reopen test" (and is not changed by looking at it)', async ({ page, request }) => {
    const maker = await seedLogin(request, 'maker');
    const closed = (await apiSellerList(request, maker)).find((v) => v.title === 'Smart Plant Pot')!;
    await open(page, maker, resultsUrl(closed.id));
    await expect(page.getByTestId('status-badge')).toHaveText('Closed');
    await expect(page.getByRole('button', { name: 'Reopen test' })).toBeVisible();
    await expect(page.getByTestId('signal-label')).toHaveText('Weak demand signal');
  });
});

// ---- every viewport ------------------------------------------------------------------------------------------------------

test.describe('layout', () => {
  test('sell, hub, create form and results fit the screen with no overflow', async ({ page, request }) => {
    await page.goto('/sell');
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    await expectNoHorizontalOverflow(page);

    const seller = await seedLogin(request, 'seller');
    const flagship = (await apiSellerList(request, seller)).find((v) => v.title === 'Smart Travel Backpack')!;
    await signInAs(page, seller);

    await page.goto('/seller');
    await expect(page.getByTestId('seller-validation').first()).toBeVisible();
    await expectNoHorizontalOverflow(page);

    await page.goto('/seller/validations/new');
    await expect(page.getByTestId('preview')).toBeVisible();
    await fillValid(page, { features: ['USB-C charging', 'Waterproof', 'Anti-theft design', 'Laptop protection', 'Expandable storage', 'A very long feature name that has to wrap properly'] });
    await expectNoHorizontalOverflow(page);
    await page.getByRole('button', { name: 'Add image link' }).click();
    await page.getByRole('button', { name: 'Create demand test' }).scrollIntoViewIfNeeded();
    await expectNoHorizontalOverflow(page);

    await page.goto(resultsUrl(flagship.id));
    await expect(page.getByTestId('demand-score')).toBeVisible();
    await expectNoHorizontalOverflow(page);
    expect(await page.evaluate(() => [...document.images].filter((i) => i.complete && i.naturalWidth === 0).length)).toBe(0);
  });

  test('controls are comfortably tappable', async ({ page, request }) => {
    const { owner } = await createSeller(request, 'layout-taps');
    const v = await createValidation(request, owner);
    await signInAs(page, owner);
    for (const [url, scope] of [
      ['/seller', 'main'],
      ['/seller/validations/new', 'main'],
      [resultsUrl(v.id), 'main'],
    ] as const) {
      await page.goto(url);
      await expect(page.locator(scope).getByRole('heading', { level: 1 })).toBeVisible();
      for (const control of await page.locator(scope).getByRole('button').all()) {
        if (!(await control.isVisible()) || !(await control.isEnabled())) continue;
        const size = await control.boundingBox();
        expect(size!.height, `${(await control.textContent())?.trim() || (await control.getAttribute('aria-label'))} on ${url} is at least 44px tall`).toBeGreaterThanOrEqual(43.5);
      }
    }
  });

  test('on a phone the results read signal, interest, price, features, then insights', async ({ page, request }) => {
    test.skip(page.viewportSize()!.width >= 768, 'single-column order only applies on phones');
    const seller = await seedLogin(request, 'seller');
    const flagship = (await apiSellerList(request, seller)).find((v) => v.title === 'Smart Travel Backpack')!;
    await open(page, seller, resultsUrl(flagship.id));
    await expect(page.locator('#signal')).toBeVisible();
    const y = async (sel: string) => (await page.locator(sel).boundingBox())!.y;
    const ys = [await y('#signal'), await y('#interest'), await y('#price'), await y('#features'), await y('#insights')];
    expect(ys, 'top-to-bottom order').toEqual([...ys].sort((a, b) => a - b));
  });
});
