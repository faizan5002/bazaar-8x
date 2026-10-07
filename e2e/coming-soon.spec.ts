import type { Page, Request } from '@playwright/test';
import { expect, test } from './fixtures';
import {
  API,
  apiMyResponse,
  apiRespond,
  apiValidationList,
  closeValidation,
  createSeller,
  createShopper,
  createValidation,
  expectNoHorizontalOverflow,
  resultTotal,
  signInAs,
  validationCards,
  waitForResults,
} from './helpers';

/**
 * The customer side of demand validation: discovering "Coming soon" products, reading one, and answering
 * "Would you consider buying this?". Every test that answers or counts uses its own seller and its own validation,
 * so parallel workers never share state. `npm run seed` removes the throwaway @e2e.bazaar.test accounts afterwards.
 */

const detailUrl = (id: number) => `/coming-soon/${id}`;
const LISTING_API = /\/api\/validations(\?|$)/;
const isPut = (r: Request) => r.method() === 'PUT' && /\/api\/validations\/\d+\/response$/.test(r.url());

const voteBox = (page: Page) => page.getByTestId('vote-box');
const choice = (page: Page, name: 'Interested' | 'Maybe' | 'Not interested') => voteBox(page).getByRole('button', { name, exact: true });
const bucket = (page: Page, label: string) => voteBox(page).getByRole('button', { name: label, exact: true });

async function fresh(request: Parameters<typeof createSeller>[0]) {
  const { owner, store } = await createSeller(request, 'cs-owner');
  const validation = await createValidation(request, owner);
  return { owner, store, validation };
}

// ---- discovery -----------------------------------------------------------------------------------------------------------

test.describe('discovering coming-soon products', () => {
  test('homepage section: sits between the deals and the categories, shows open tests as non-purchasable cards', async ({ page, request }) => {
    await page.goto('/');
    const section = page.locator('#coming-soon');
    await expect(section.getByRole('heading', { name: 'Coming soon: help decide what gets made' })).toBeVisible();
    await expect(section.getByText('Tell sellers what you’d actually buy before they invest in making it.'.replace('’', "'"))).toBeVisible();

    const top = (await apiValidationList(request, '?sort=popular&limit=4')).items;
    await expect(validationCards(section)).toHaveCount(top.length);
    expect(top.length).toBeGreaterThan(0);

    const [deals, soon, categories] = await Promise.all([page.locator('#deals').boundingBox(), section.boundingBox(), page.locator('#categories').boundingBox()]);
    expect(soon!.y, 'after Today\'s deals').toBeGreaterThan(deals!.y);
    expect(soon!.y, 'before the category grid').toBeLessThan(categories!.y);

    const first = validationCards(section).first();
    await expect(first).toHaveAttribute('href', detailUrl(top[0].id));
    await expect(first).toContainText(top[0].title);
    await expect(first).toContainText('Coming soon');
    await expect(first.getByTestId('price-range')).toHaveText(new RegExp(`^\\$${top[0].priceMin}.\\$?${top[0].priceMax}`));
    await expect(first).toContainText(top[0].seller.name);
    for (const forbidden of [/add to cart/i, /buy now/i, /in stock/i, /delivery/i, /free shipping/i]) await expect(section.getByText(forbidden)).toHaveCount(0);
    await expect(section.getByRole('button')).toHaveCount(0);

    await first.click();
    await expect(page).toHaveURL(new RegExp(`${detailUrl(top[0].id)}$`));
    await expect(page.getByTestId('validation-title')).toHaveText(top[0].title);
  });

  test('homepage section: "See all" opens the listing', async ({ page }) => {
    await page.goto('/');
    await page.locator('#coming-soon').getByRole('link', { name: /see all/i }).click();
    await expect(page).toHaveURL(/\/coming-soon$/);
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Coming soon');
  });

  test.describe('when its API fails', () => {
    test.use({ allowErrors: true });

    test('the rest of the homepage still works and the section can retry', async ({ page }) => {
      let fail = true;
      await page.route(LISTING_API, (route) => (fail ? route.fulfill({ status: 500, json: { message: 'boom' } }) : route.continue()));
      await page.goto('/');
      const section = page.locator('#coming-soon');
      await expect(section.getByRole('alert')).toBeVisible();
      await expect(page.locator('#deals').getByTestId('product-card')).toHaveCount(10);
      await expect(page.locator('#categories').getByRole('link').first()).toBeVisible();

      fail = false;
      await section.getByRole('button', { name: 'Try again' }).click();
      await expect(section.getByRole('alert')).toHaveCount(0);
      await expect(validationCards(section).first()).toBeVisible();
    });

    test('an empty result is a quiet message, not an error', async ({ page }) => {
      await page.route(LISTING_API, (route) => route.fulfill({ json: { items: [], total: 0, page: 1, limit: 4, totalPages: 0 } }));
      await page.goto('/');
      const section = page.locator('#coming-soon');
      await expect(section.getByText('No products are being tested right now')).toBeVisible();
      await expect(section.getByRole('alert')).toHaveCount(0);
      await expect(page.locator('#deals').getByTestId('product-card')).toHaveCount(10);
    });
  });

  test.describe('with the photo host blocked', () => {
    test.use({ allowErrors: true }); // failing image requests are the point
    test('cards keep their layout and text instead of breaking', async ({ page }) => {
      await page.route(/images\.unsplash\.com/, (route) => route.abort());
      await page.goto('/');
      const card = validationCards(page.locator('#coming-soon')).first();
      await expect(card).toBeVisible();
      await expect(card.getByTestId('price-range')).toBeVisible();
      await expect(card.getByRole('heading')).toBeVisible();
      await expectNoHorizontalOverflow(page);
    });
  });

  test('the "Coming soon" link in the navigation leads to the listing and shows as current', async ({ page }) => {
    await page.goto('/');
    const nav = page.getByRole('navigation', { name: 'Categories' });
    const link = nav.getByRole('link', { name: 'Coming soon' });
    await expect(link).not.toHaveAttribute('aria-current', 'page');
    await link.click();
    await expect(page).toHaveURL(/\/coming-soon$/);
    await expect(page.getByRole('navigation', { name: 'Categories' }).getByRole('link', { name: 'Coming soon' })).toHaveAttribute('aria-current', 'page');
  });
});

test.describe('the coming-soon listing', () => {
  test('lists every open test with the API total, newest first, and nothing purchasable', async ({ page, request }) => {
    await page.goto('/coming-soon');
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Coming soon');
    await expect(page.getByText('Help sellers decide what to make next.')).toBeVisible();
    const api = await apiValidationList(request, '?limit=12');
    expect(await resultTotal(page)).toBeGreaterThanOrEqual(api.total - 5); // other workers may add tests while this runs
    await expect(validationCards(page).first()).toBeVisible();
    expect(await validationCards(page).count()).toBeGreaterThan(0);
    for (const forbidden of [/add to cart/i, /buy now/i]) await expect(page.getByText(forbidden)).toHaveCount(0);
  });

  test('category filter: chips set the URL, the results match the API, "All" clears it', async ({ page, request }) => {
    await page.goto('/coming-soon');
    await waitForResults(page);
    const cat = (await (await request.get(`${API}/categories`)).json()).find((c: { slug: string }) => c.slug === 'sports-fitness' || c.slug === 'fashion');
    await page.getByRole('group', { name: 'Filter by category' }).getByRole('button', { name: cat.name, exact: true }).click();
    await expect(page).toHaveURL(new RegExp(`category=${cat.slug}`));
    await waitForResults(page);
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(`Coming soon: ${cat.name}`);
    const expected = await apiValidationList(request, `?category=${cat.slug}&limit=12`);
    expect(await resultTotal(page)).toBe(expected.total);
    await expect(page.getByRole('button', { name: cat.name, exact: true })).toHaveAttribute('aria-pressed', 'true');
    for (const card of await validationCards(page).all()) await expect(card).toBeVisible();

    await page.reload();
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(`Coming soon: ${cat.name}`);
    expect(await resultTotal(page)).toBe(expected.total);

    await page.getByRole('button', { name: 'All', exact: true }).click();
    await expect(page).toHaveURL(/\/coming-soon$/);
  });

  test('sorting by most responses puts the best-answered first (matches the API); the choice is in the URL and survives back/forward', async ({ page, request }) => {
    await page.goto('/coming-soon');
    await waitForResults(page);
    await page.getByLabel('Sort by').selectOption({ label: 'Most responses' });
    await expect(page).toHaveURL(/sort=popular/);
    await waitForResults(page);
    const api = await apiValidationList(request, '?sort=popular&limit=12');
    const hrefs = await validationCards(page).evaluateAll((els) => els.map((e) => e.getAttribute('href')));
    expect(hrefs[0], 'the best-answered idea leads').toBe(detailUrl(api.items[0].id));
    expect(hrefs.slice(0, 3)).toEqual(api.items.slice(0, 3).map((v) => detailUrl(v.id)));

    await page.reload();
    await expect(page.getByLabel('Sort by')).toHaveValue('popular');

    await page.goBack();
    await expect(page).toHaveURL(/\/coming-soon$/);
    await waitForResults(page);
    await expect(page.getByLabel('Sort by')).toHaveValue('newest');
    await page.goForward();
    await expect(page.getByLabel('Sort by')).toHaveValue('popular');
  });

  test('a brand-new test leads the newest-first list', async ({ page, request }) => {
    const { validation } = await fresh(request);
    await page.goto('/coming-soon');
    await waitForResults(page);
    await expect(validationCards(page).first()).toHaveAttribute('href', detailUrl(validation.id));
  });

  test('an unfiltered-out category shows the empty state and a way back', async ({ page }) => {
    await page.goto('/coming-soon?category=no-such-category');
    await waitForResults(page);
    await expect(page.getByRole('heading', { name: 'No coming-soon products found' })).toBeVisible();
    await expect(page.getByText('Try another category.')).toBeVisible();
    await expect(validationCards(page)).toHaveCount(0);
    await page.getByRole('button', { name: 'Show all categories' }).click();
    await expect(page).toHaveURL(/\/coming-soon$/);
    await expect(validationCards(page).first()).toBeVisible();
  });

  test.describe('when the API fails', () => {
    test.use({ allowErrors: true });
    test('shows an error with a working retry', async ({ page }) => {
      let fail = true;
      await page.route(LISTING_API, (route) => (fail ? route.fulfill({ status: 500, json: { message: 'boom' } }) : route.continue()));
      await page.goto('/coming-soon');
      await expect(page.getByRole('alert')).toBeVisible();
      fail = false;
      await page.getByRole('button', { name: 'Try again' }).click();
      await expect(validationCards(page).first()).toBeVisible();
    });
  });
});

// ---- the detail page -----------------------------------------------------------------------------------------------------

test.describe('a coming-soon detail page', () => {
  test('shows the proposal from the API and offers nothing to buy', async ({ page, request }) => {
    const { store, validation } = await fresh(request);
    await page.goto(detailUrl(validation.id));

    await expect(page.getByTestId('validation-title')).toHaveText(validation.title);
    await expect(page.getByTestId('validation-tagline')).toHaveText(validation.tagline);
    await expect(page.getByTestId('price-range')).toHaveText('$40–60');
    await expect(page.getByTestId('launch-month')).toHaveText(/^[A-Z][a-z]+ \d{4}$/);
    await expect(page.getByTestId('seller-name')).toHaveText(store.name);
    await expect(page.getByTestId('category-link')).toHaveText('Fashion');
    await expect(page.getByTestId('category-link')).toHaveAttribute('href', '/coming-soon?category=fashion');
    await expect(page.getByTestId('response-count')).toHaveText('Be the first to respond');
    await expect(page.getByRole('heading', { name: 'About this product' })).toBeVisible();
    await expect(page.getByText('It has a second line of description.')).toBeVisible();
    await expect(page.getByTestId('features').getByRole('listitem')).toHaveText(['Light', 'Durable', 'Packable']);
    await expect(page.getByRole('navigation', { name: 'Breadcrumb' })).toContainText('Coming soon');
    await expect(page).toHaveTitle(new RegExp(validation.title));

    await expect(voteBox(page).getByText('Not available to buy yet')).toBeVisible();
    for (const name of [/add to cart/i, /buy now/i, /place order/i]) {
      await expect(page.getByRole('button', { name })).toHaveCount(0);
      await expect(page.getByRole('link', { name })).toHaveCount(0);
    }
    // Shoppers never see the crowd's answers: that would bias them.
    await expect(page.locator('body')).not.toContainText('%');
  });

  test('the response count is plural-aware and read from the API', async ({ page, request }) => {
    const { validation } = await fresh(request);
    const [a, b] = [await createShopper(request, 'cs-a'), await createShopper(request, 'cs-b')];
    await apiRespond(request, a, validation.id, { interest: 'interested' });
    await page.goto(detailUrl(validation.id));
    await expect(page.getByTestId('response-count')).toHaveText('1 shopper has responded');
    await apiRespond(request, b, validation.id, { interest: 'maybe' });
    await page.reload();
    await expect(page.getByTestId('response-count')).toHaveText('2 shoppers have responded');
  });

  test('the flagship seeded test shows its large audience formatted', async ({ page, request }) => {
    const flagship = (await apiValidationList(request, '?sort=popular&limit=1')).items[0];
    await page.goto(detailUrl(flagship.id));
    await expect(page.getByTestId('response-count')).toHaveText(`${flagship.responseCount.toLocaleString('en-US')} shoppers have responded`);
  });

  test.describe('an unknown id', () => {
    test.use({ allowErrors: true }); // the API's 404 is the point
    test('shows a friendly not-found page with ways out', async ({ page }) => {
      await page.goto(detailUrl(987654321));
      await expect(page.getByRole('heading', { name: "We couldn't find that demand test" })).toBeVisible();
      await page.getByRole('link', { name: 'Browse coming soon' }).click();
      await expect(page).toHaveURL(/\/coming-soon$/);
    });
  });

  test('a link that is not an id is rejected without asking the API', async ({ page }) => {
    const requests: string[] = [];
    page.on('request', (r) => requests.push(r.url()));
    await page.goto('/coming-soon/abc');
    await expect(page.getByRole('heading', { name: "We couldn't find that demand test" })).toBeVisible();
    await expect(page.getByText("That link doesn't look like a valid demand test link.")).toBeVisible();
    expect(requests.filter((u) => /\/api\/validations\//.test(u))).toEqual([]);
  });

  test.describe('when the API fails', () => {
    test.use({ allowErrors: true });
    test('shows an error with a working retry', async ({ page, request }) => {
      const { validation } = await fresh(request);
      let fail = true;
      await page.route(new RegExp(`/api/validations/${validation.id}$`), (route) => (fail ? route.fulfill({ status: 500, json: { message: 'boom' } }) : route.continue()));
      await page.goto(detailUrl(validation.id));
      await expect(page.getByRole('alert')).toBeVisible();
      fail = false;
      await page.getByRole('button', { name: 'Try again' }).click();
      await expect(page.getByTestId('validation-title')).toHaveText(validation.title);
    });
  });
});

// ---- signing in to answer ------------------------------------------------------------------------------------------------

test.describe('answering needs an account', () => {
  test('a signed-out shopper is sent to sign in and returned to the same test with their choice selected (not submitted)', async ({ page, request }) => {
    const { validation } = await fresh(request);
    const shopper = await createShopper(request, 'cs-signin');
    const puts: string[] = [];
    page.on('request', (r) => isPut(r) && puts.push(r.url()));

    await page.goto(detailUrl(validation.id));
    await expect(voteBox(page).getByText('Sign in to answer')).toBeVisible();
    await choice(page, 'Maybe').click();

    await expect(page).toHaveURL(/\/login$/);
    await expect(page.getByText('Please sign in to continue')).toBeVisible();
    await page.getByLabel('Email').fill(shopper.email);
    await page.getByLabel('Password').fill(shopper.password);
    await page.getByRole('button', { name: 'Sign in', exact: true }).click();

    await expect(page).toHaveURL(new RegExp(`${detailUrl(validation.id)}$`)); // the ?vote hint is consumed
    await expect(choice(page, 'Maybe')).toHaveAttribute('aria-pressed', 'true');
    await expect(choice(page, 'Interested')).toHaveAttribute('aria-pressed', 'false');
    await expect(page.getByRole('button', { name: 'Send my answer' })).toBeEnabled();
    expect(puts, 'nothing is submitted until the shopper confirms').toEqual([]);
    expect(await apiMyResponse(request, shopper, validation.id)).toBeNull();

    await page.getByRole('button', { name: 'Send my answer' }).click();
    await expect(page.getByTestId('saved-interest')).toHaveText('Maybe');
    expect((await apiMyResponse(request, shopper, validation.id))?.interest).toBe('maybe');
  });

  test('the "Sign in" link also returns to the test', async ({ page, request }) => {
    const { validation } = await fresh(request);
    const shopper = await createShopper(request, 'cs-signin-link');
    await page.goto(detailUrl(validation.id));
    await voteBox(page).getByRole('link', { name: 'Sign in' }).click();
    await page.getByLabel('Email').fill(shopper.email);
    await page.getByLabel('Password').fill(shopper.password);
    await page.getByRole('button', { name: 'Sign in', exact: true }).click();
    await expect(page).toHaveURL(new RegExp(`${detailUrl(validation.id)}$`));
    await expect(choice(page, 'Interested')).toHaveAttribute('aria-pressed', 'false');
  });
});

// ---- the voting journey --------------------------------------------------------------------------------------------------

test.describe('answering a demand test', () => {
  test('full journey: answer with a price and a feature, see it saved, reload, change it; the count only counts the shopper once', async ({ page, request }) => {
    const { validation } = await fresh(request);
    const shopper = await createShopper(request, 'cs-voter');
    await signInAs(page, shopper);
    expect(await apiMyResponse(request, shopper, validation.id)).toBeNull();

    await page.goto(detailUrl(validation.id));
    await expect(page.getByRole('heading', { name: 'Would you consider buying this?' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Send my answer' })).toBeDisabled();
    await expect(page.getByText('What price would feel reasonable?')).toHaveCount(0); // follow-ups appear once there is something to follow up on

    await choice(page, 'Interested').click();
    await expect(choice(page, 'Interested')).toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByText('What price would feel reasonable?')).toBeVisible();
    await expect(page.getByText('Which feature matters most to you?')).toBeVisible();
    await expect(voteBox(page).getByRole('group', { name: 'Would you consider buying this?' }).getByRole('button')).toHaveCount(3);
    await bucket(page, '$47–$53').click();
    await voteBox(page).getByRole('button', { name: 'Durable', exact: true }).click();
    await expect(bucket(page, '$47–$53')).toHaveAttribute('aria-pressed', 'true');
    await page.getByRole('button', { name: 'Send my answer' }).click();

    const saved = page.getByTestId('saved-answer');
    await expect(saved).toContainText('Thanks for your feedback');
    await expect(page.getByTestId('saved-interest')).toHaveText('Interested');
    await expect(page.getByTestId('saved-price')).toHaveText('$47–$53');
    await expect(page.getByTestId('saved-feature')).toHaveText('Durable');
    await expect(page.getByTestId('response-count')).toHaveText('1 shopper has responded');
    await expect(saved).toBeFocused();
    expect(await apiMyResponse(request, shopper, validation.id)).toMatchObject({ interest: 'interested', priceBucket: 2, topFeature: 'Durable' });
    for (const name of [/add to cart/i, /buy now/i]) await expect(page.getByRole('button', { name })).toHaveCount(0);

    // A fresh visit remembers the answer.
    await page.reload();
    await expect(page.getByTestId('saved-answer')).toContainText('Your answer');
    await expect(page.getByTestId('saved-interest')).toHaveText('Interested');
    await expect(page.getByTestId('response-count')).toHaveText('1 shopper has responded');

    // Change it: the form starts from the saved answer, and Cancel leaves it untouched.
    await page.getByRole('button', { name: 'Change answer' }).click();
    await expect(choice(page, 'Interested')).toHaveAttribute('aria-pressed', 'true');
    await expect(bucket(page, '$47–$53')).toHaveAttribute('aria-pressed', 'true');
    await page.getByRole('button', { name: 'Cancel' }).click();
    await expect(page.getByTestId('saved-interest')).toHaveText('Interested');

    await page.getByRole('button', { name: 'Change answer' }).click();
    await choice(page, 'Maybe').click();
    await page.getByRole('button', { name: 'Send my answer' }).click();
    await expect(page.getByTestId('saved-interest')).toHaveText('Maybe');
    await expect(page.getByTestId('response-count'), 'changing an answer is not a second response').toHaveText('1 shopper has responded');
    const after = await apiMyResponse(request, shopper, validation.id);
    expect(after).toMatchObject({ interest: 'maybe', priceBucket: 2, topFeature: 'Durable' });
    expect((await (await request.get(`${API}/validations/${validation.id}`)).json()).responseCount).toBe(1);
  });

  test('"Not interested" asks nothing else and stores no price or feature, even if some were picked first', async ({ page, request }) => {
    const { validation } = await fresh(request);
    const shopper = await createShopper(request, 'cs-no');
    await signInAs(page, shopper);
    await page.goto(detailUrl(validation.id));

    await choice(page, 'Interested').click();
    await bucket(page, 'Under $40').click();
    await voteBox(page).getByRole('button', { name: 'Light', exact: true }).click();
    await choice(page, 'Not interested').click();
    await expect(page.getByText('What price would feel reasonable?')).toHaveCount(0);
    await expect(page.getByText('Which feature matters most to you?')).toHaveCount(0);
    await page.getByRole('button', { name: 'Send my answer' }).click();

    await expect(page.getByTestId('saved-interest')).toHaveText('Not interested');
    await expect(page.getByTestId('saved-price')).toHaveCount(0);
    await expect(page.getByTestId('saved-feature')).toHaveCount(0);
    expect(await apiMyResponse(request, shopper, validation.id)).toMatchObject({ interest: 'not_interested', priceBucket: null, topFeature: null });
  });

  test('the price and feature questions are optional, and a chip can be un-picked', async ({ page, request }) => {
    const { validation } = await fresh(request);
    const shopper = await createShopper(request, 'cs-optional');
    await signInAs(page, shopper);
    await page.goto(detailUrl(validation.id));

    await choice(page, 'Maybe').click();
    await bucket(page, 'Over $60').click();
    await bucket(page, 'Over $60').click();
    await expect(bucket(page, 'Over $60')).toHaveAttribute('aria-pressed', 'false');
    await page.getByRole('button', { name: 'Send my answer' }).click();

    await expect(page.getByTestId('saved-interest')).toHaveText('Maybe');
    await expect(page.getByTestId('saved-price')).toHaveCount(0);
    expect(await apiMyResponse(request, shopper, validation.id)).toMatchObject({ interest: 'maybe', priceBucket: null, topFeature: null });
  });

  test('a double-click sends the answer once', async ({ page, request }) => {
    const { validation } = await fresh(request);
    const shopper = await createShopper(request, 'cs-double');
    await signInAs(page, shopper);
    const puts: string[] = [];
    page.on('request', (r) => isPut(r) && puts.push(r.url()));
    await page.goto(detailUrl(validation.id));
    await choice(page, 'Interested').click();
    await page.getByRole('button', { name: 'Send my answer' }).dblclick();
    await expect(page.getByTestId('saved-interest')).toHaveText('Interested');
    expect(puts).toHaveLength(1);
    await expect(page.getByTestId('response-count')).toHaveText('1 shopper has responded');
  });

  test('the answer controls work from the keyboard', async ({ page, request }) => {
    const { validation } = await fresh(request);
    const shopper = await createShopper(request, 'cs-keys');
    await signInAs(page, shopper);
    await page.goto(detailUrl(validation.id));
    await choice(page, 'Interested').focus();
    await page.keyboard.press('Enter');
    await expect(choice(page, 'Interested')).toHaveAttribute('aria-pressed', 'true');
    await choice(page, 'Maybe').focus();
    await page.keyboard.press('Space');
    await expect(choice(page, 'Maybe')).toHaveAttribute('aria-pressed', 'true');
    await expect(choice(page, 'Interested')).toHaveAttribute('aria-pressed', 'false');
    await page.getByRole('button', { name: 'Send my answer' }).focus();
    await page.keyboard.press('Enter');
    await expect(page.getByTestId('saved-interest')).toHaveText('Maybe');
  });

  test('an answer already on file from earlier shows straight away', async ({ page, request }) => {
    const { validation } = await fresh(request);
    const shopper = await createShopper(request, 'cs-return');
    await apiRespond(request, shopper, validation.id, { interest: 'interested', priceBucket: 1, topFeature: 'Packable' });
    await signInAs(page, shopper);
    await page.goto(detailUrl(validation.id));
    await expect(page.getByTestId('saved-answer')).toContainText('Your answer');
    await expect(page.getByTestId('saved-price')).toHaveText('$40–$47');
    await expect(page.getByTestId('saved-feature')).toHaveText('Packable');
    await expect(page.getByRole('button', { name: 'Send my answer' })).toHaveCount(0);
  });
});

// ---- who can't answer, and what goes wrong -------------------------------------------------------------------------------

test.describe('when answering is not possible', () => {
  test('the seller who proposed it sees an owner message and no answer controls', async ({ page, request }) => {
    const { owner, validation } = await fresh(request);
    await signInAs(page, owner);
    await page.goto(detailUrl(validation.id));
    await expect(page.getByTestId('owner-state')).toContainText('You created this demand test.');
    await expect(choice(page, 'Interested')).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Send my answer' })).toHaveCount(0);
    await expect(page.getByTestId('validation-title')).toHaveText(validation.title);
  });

  test("another seller can answer a test that isn't theirs", async ({ page, request }) => {
    const { validation } = await fresh(request);
    const { owner: other } = await createSeller(request, 'cs-other-seller');
    await signInAs(page, other);
    await page.goto(detailUrl(validation.id));
    await expect(choice(page, 'Interested')).toBeVisible();
    await expect(page.getByTestId('owner-state')).toHaveCount(0);
  });

  test('a closed test still shows its details but takes no answers', async ({ page, request }) => {
    const { owner, validation } = await fresh(request);
    await closeValidation(request, owner, validation.id);
    const shopper = await createShopper(request, 'cs-closed');
    await signInAs(page, shopper);
    await page.goto(detailUrl(validation.id));
    await expect(page.getByTestId('validation-title')).toHaveText(validation.title);
    await expect(page.getByTestId('price-range')).toHaveText('$40–60');
    await expect(page.getByText('Closed', { exact: true })).toBeVisible();
    await expect(page.getByTestId('closed-state')).toContainText('This demand test is closed');
    await expect(choice(page, 'Interested')).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Send my answer' })).toHaveCount(0);
    // ...and it has left the listing.
    expect((await apiValidationList(request, '?limit=50')).items.map((v) => v.id)).not.toContain(validation.id);
  });

  test.describe('when the server pushes back', () => {
    test.use({ allowErrors: true });

    test('the test closes while the shopper is answering: they are told, nothing is saved, the details stay', async ({ page, request }) => {
      const { owner, validation } = await fresh(request);
      const shopper = await createShopper(request, 'cs-race');
      await signInAs(page, shopper);
      await page.goto(detailUrl(validation.id));
      await choice(page, 'Interested').click();
      await closeValidation(request, owner, validation.id); // the seller closes it meanwhile
      await page.getByRole('button', { name: 'Send my answer' }).click();

      await expect(page.getByRole('alert').filter({ hasText: 'has closed and is no longer accepting responses' })).toBeVisible();
      await expect(page.getByTestId('closed-state')).toBeVisible();
      await expect(page.getByTestId('validation-title')).toHaveText(validation.title);
      await expect(page.getByText('Closed', { exact: true })).toBeVisible();
      expect(await apiMyResponse(request, shopper, validation.id)).toBeNull();
    });

    test('a 403 on submit (the shopper owns the store) turns into the owner message', async ({ page, request }) => {
      const { validation } = await fresh(request);
      const shopper = await createShopper(request, 'cs-403');
      await signInAs(page, shopper);
      await page.route(/\/api\/validations\/\d+\/response$/, (route) => (route.request().method() === 'PUT' ? route.fulfill({ status: 403, json: { message: 'Sellers cannot answer their own demand tests' } }) : route.continue()));
      await page.goto(detailUrl(validation.id));
      await choice(page, 'Interested').click();
      await page.getByRole('button', { name: 'Send my answer' }).click();
      await expect(page.getByTestId('owner-state')).toBeVisible();
    });

    test('an expired session on submit goes to sign-in and comes back to the test', async ({ page, request }) => {
      const { validation } = await fresh(request);
      const shopper = await createShopper(request, 'cs-401');
      await signInAs(page, shopper);
      await page.route(/\/api\/validations\/\d+\/response$/, (route) => (route.request().method() === 'PUT' ? route.fulfill({ status: 401, json: { message: 'Unauthorized' } }) : route.continue()));
      await page.goto(detailUrl(validation.id));
      await choice(page, 'Interested').click();
      await page.getByRole('button', { name: 'Send my answer' }).click();
      await expect(page).toHaveURL(/\/login$/);
      await page.unroute(/\/api\/validations\/\d+\/response$/);
      // Signing in again returns here.
      const fresh2 = await createShopper(request, 'cs-401-again');
      await page.getByLabel('Email').fill(fresh2.email);
      await page.getByLabel('Password').fill(fresh2.password);
      await page.getByRole('button', { name: 'Sign in', exact: true }).click();
      await expect(page).toHaveURL(new RegExp(`${detailUrl(validation.id)}$`));
      await expect(choice(page, 'Interested')).toBeVisible();
    });

    test('a failed save keeps the answer on screen and says it was NOT saved; trying again works', async ({ page, request }) => {
      const { validation } = await fresh(request);
      const shopper = await createShopper(request, 'cs-offline');
      await signInAs(page, shopper);
      let fail = true;
      await page.route(/\/api\/validations\/\d+\/response$/, (route) => (route.request().method() === 'PUT' && fail ? route.abort('failed') : route.continue()));
      await page.goto(detailUrl(validation.id));
      await choice(page, 'Interested').click();
      await bucket(page, '$53–$60').click();
      await page.getByRole('button', { name: 'Send my answer' }).click();

      await expect(page.getByRole('alert')).toContainText('NOT saved');
      await expect(choice(page, 'Interested')).toHaveAttribute('aria-pressed', 'true');
      await expect(bucket(page, '$53–$60')).toHaveAttribute('aria-pressed', 'true');
      expect(await apiMyResponse(request, shopper, validation.id)).toBeNull();

      fail = false;
      await page.getByRole('button', { name: 'Send my answer' }).click();
      await expect(page.getByTestId('saved-interest')).toHaveText('Interested');
      expect(await apiMyResponse(request, shopper, validation.id)).toMatchObject({ interest: 'interested', priceBucket: 3 });
    });

    test('a server validation error is shown to the shopper', async ({ page, request }) => {
      const { validation } = await fresh(request);
      const shopper = await createShopper(request, 'cs-400');
      await signInAs(page, shopper);
      await page.route(/\/api\/validations\/\d+\/response$/, (route) => (route.request().method() === 'PUT' ? route.fulfill({ status: 400, json: { message: ['priceBucket must be one of the offered prices'] } }) : route.continue()));
      await page.goto(detailUrl(validation.id));
      await choice(page, 'Interested').click();
      await page.getByRole('button', { name: 'Send my answer' }).click();
      await expect(page.getByRole('alert')).toContainText('priceBucket');
      await expect(choice(page, 'Interested')).toHaveAttribute('aria-pressed', 'true');
    });

    test("failing to load the shopper's earlier answer offers a retry instead of a blank form", async ({ page, request }) => {
      const { validation } = await fresh(request);
      const shopper = await createShopper(request, 'cs-getfail');
      await apiRespond(request, shopper, validation.id, { interest: 'maybe' });
      await signInAs(page, shopper);
      let fail = true;
      await page.route(/\/api\/validations\/\d+\/response$/, (route) => (route.request().method() === 'GET' && fail ? route.fulfill({ status: 500, json: { message: 'boom' } }) : route.continue()));
      await page.goto(detailUrl(validation.id));
      await expect(voteBox(page).getByRole('alert')).toBeVisible();
      await expect(choice(page, 'Interested')).toHaveCount(0); // never offer a blank form that could overwrite an answer we couldn't read
      fail = false;
      await voteBox(page).getByRole('button', { name: 'Try again' }).click();
      await expect(page.getByTestId('saved-interest')).toHaveText('Maybe');
    });
  });
});

// ---- every viewport ------------------------------------------------------------------------------------------------------

test.describe('layout', () => {
  test('home section, listing and detail (signed out) fit the screen with no overflow or broken images', async ({ page, request }) => {
    const { validation } = await fresh(request);
    await page.goto('/');
    await page.locator('#coming-soon').scrollIntoViewIfNeeded();
    await expect(validationCards(page.locator('#coming-soon')).first()).toBeVisible();
    await expectNoHorizontalOverflow(page);

    await page.goto('/coming-soon');
    await waitForResults(page);
    await expect(validationCards(page).first()).toBeVisible();
    await expectNoHorizontalOverflow(page);

    await page.goto(detailUrl(validation.id));
    await expect(voteBox(page)).toBeVisible();
    await expectNoHorizontalOverflow(page);
    expect(await page.evaluate(() => [...document.images].filter((i) => i.complete && i.naturalWidth === 0).length)).toBe(0);
  });

  test('the answer form, with both follow-ups open, fits and every control is comfortably tappable', async ({ page, request }) => {
    const { validation } = await fresh(request);
    const shopper = await createShopper(request, 'cs-layout');
    await signInAs(page, shopper);
    await page.goto(detailUrl(validation.id));
    await choice(page, 'Interested').click();
    await expect(page.getByText('Which feature matters most to you?')).toBeVisible();
    await expectNoHorizontalOverflow(page);

    const box = voteBox(page);
    for (const control of await box.getByRole('button').all()) {
      const size = await control.boundingBox();
      expect(size!.height, `${await control.textContent()} is at least 44px tall`).toBeGreaterThanOrEqual(43.5);
      expect(size!.width, 'and wide').toBeGreaterThanOrEqual(43.5);
    }
    const inBox = await box.boundingBox();
    const viewport = page.viewportSize()!;
    expect(inBox!.x).toBeGreaterThanOrEqual(0);
    expect(inBox!.x + inBox!.width).toBeLessThanOrEqual(viewport.width);

    await page.getByRole('button', { name: 'Send my answer' }).click();
    await expect(page.getByTestId('saved-answer')).toBeVisible();
    await expectNoHorizontalOverflow(page);
  });

  test('the phone reading order is title, price, description, features, then the answer box', async ({ page, request }) => {
    test.skip(page.viewportSize()!.width >= 768, 'single-column order only applies on phones');
    const { validation } = await fresh(request);
    await page.goto(detailUrl(validation.id));
    await expect(voteBox(page)).toBeVisible();
    const y = async (locator: ReturnType<Page['locator']>) => (await locator.boundingBox())!.y;
    const ys = [await y(page.getByTestId('validation-title')), await y(page.getByTestId('price-range')), await y(page.getByRole('heading', { name: 'About this product' })), await y(page.getByTestId('features')), await y(voteBox(page))];
    expect(ys, 'top-to-bottom order').toEqual([...ys].sort((a, b) => a - b));
  });
});
