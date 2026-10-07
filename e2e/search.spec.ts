import { expect, test } from './fixtures';
import {
  API,
  cardIds,
  cardPrices,
  cardRatings,
  cards,
  changeFilters,
  expectNoHorizontalOverflow,
  fetchCatalog,
  pick,
  priceLabel,
  resultTotal,
  usesDrawer,
  waitForResults,
} from './helpers';

const searchBox = (page: import('@playwright/test').Page) => page.getByRole('searchbox', { name: 'Search products' });
const chips = (page: import('@playwright/test').Page) => page.getByRole('list', { name: 'Active filters' });
const pagination = (page: import('@playwright/test').Page) => page.getByRole('navigation', { name: 'Pagination' });
const h1 = (page: import('@playwright/test').Page) => page.getByRole('heading', { level: 1 });

test.describe('search', () => {
  test('homepage search shows keyword results', async ({ page, request }) => {
    const expected = (await (await request.get(`${API}/products?q=headphones&limit=60`)).json()).total;
    await page.goto('/');
    await searchBox(page).fill('headphones');
    await searchBox(page).press('Enter');

    await expect(page).toHaveURL(/\/search\?q=headphones$/);
    await expect(h1(page)).toHaveText('Results for “headphones”');
    expect(await resultTotal(page)).toBe(expected);
    await expect(cards(page).first()).toContainText('Sonaro Studio Pro'); // title match outranks description-only matches
    await expect(searchBox(page)).toHaveValue('headphones');
  });

  test('search button, multi-word query and clear search', async ({ page, request }) => {
    const expected = (await (await request.get(`${API}/products?q=sonaro%20headphones&limit=60`)).json()).total;
    expect(expected).toBeGreaterThan(0);
    await page.goto('/');
    await searchBox(page).fill('sonaro headphones');
    await page.getByRole('button', { name: 'Search', exact: true }).click();
    await expect(page).toHaveURL(/q=sonaro\+headphones/);
    expect(await resultTotal(page)).toBe(expected);

    await page.getByRole('button', { name: 'Clear search' }).click();
    await expect(page).toHaveURL(/\/search$/);
    await expect(searchBox(page)).toHaveValue('');
    await expect(h1(page)).toHaveText('All products');
    expect(await resultTotal(page)).toBe((await fetchCatalog(request)).length);
  });

  test('header search keeps the selected category', async ({ page }) => {
    await page.goto('/search?category=books');
    await waitForResults(page);
    if (!usesDrawer(page)) await expect(page.getByLabel('Search category')).toHaveValue('books');
    await searchBox(page).fill('dune');
    await searchBox(page).press('Enter');
    const url = new URL(page.url());
    expect(url.searchParams.get('q')).toBe('dune');
    expect(url.searchParams.get('category')).toBe('books');
    await expect(h1(page)).toHaveText('Results for “dune”');
    expect(await resultTotal(page)).toBe(1);
  });

  test('category browsing from the homepage', async ({ page, request }) => {
    const catalog = await fetchCatalog(request);
    const categories: { slug: string; name: string }[] = await (await request.get(`${API}/categories`)).json();
    const target = categories[2]; // Home & Kitchen
    await page.goto('/');
    await page.locator('#categories').getByRole('link', { name: new RegExp(`^${target.name.replace('&', '&')}`) }).click();

    await expect(page).toHaveURL(new RegExp(`category=${target.slug}$`));
    await expect(h1(page)).toHaveText(target.name);
    const expectedIds = catalog.filter((p) => p.category.slug === target.slug).map((p) => p.id);
    expect(await resultTotal(page)).toBe(expectedIds.length);
    for (const id of await cardIds(page)) expect(expectedIds).toContain(id);
    await expect(chips(page)).toContainText(target.name);
  });

  test('category navigation bar and Today’s deals link', async ({ page, request }) => {
    const catalog = await fetchCatalog(request);
    await page.goto('/');
    await page.getByRole('navigation', { name: 'Categories' }).getByRole('link', { name: 'Computers' }).click();
    await expect(page).toHaveURL(/category=computers$/);
    await expect(page.getByRole('navigation', { name: 'Categories' }).getByRole('link', { name: 'Computers' })).toHaveAttribute('aria-current', 'page');
    expect(await resultTotal(page)).toBe(catalog.filter((p) => p.category.slug === 'computers').length);

    await page.getByRole('navigation', { name: 'Categories' }).getByRole('link', { name: "Today's deals" }).click();
    await expect(page).toHaveURL(/deals=true$/);
    await expect(h1(page)).toHaveText("Today's deals");
    expect(await resultTotal(page)).toBe(catalog.filter((p) => p.isDeal).length);
  });
});

test.describe('filters', () => {
  test('price: preset and custom range', async ({ page, request }) => {
    const catalog = await fetchCatalog(request);
    await page.goto('/search');
    await changeFilters(page, (s) => pick(s.getByRole('radio', { name: priceLabel(25, 50) })));
    await expect(page).toHaveURL(/minPrice=25&maxPrice=50/);
    const inRange = catalog.filter((p) => p.price >= 25 && p.price <= 50);
    expect(await resultTotal(page)).toBe(inRange.length);
    for (const price of await cardPrices(page)) expect(price).toBeGreaterThanOrEqual(25), expect(price).toBeLessThanOrEqual(50);
    await expect(chips(page)).toContainText('$25.00 – $50.00');

    // Custom range typed backwards is corrected rather than returning nothing.
    await changeFilters(page, async (s) => {
      await s.getByLabel('Minimum price').fill('200');
      await s.getByLabel('Maximum price').fill('100');
      await s.getByRole('button', { name: 'Go' }).click();
    });
    await expect(page).toHaveURL(/minPrice=100&maxPrice=200/);
    expect(await resultTotal(page)).toBe(catalog.filter((p) => p.price >= 100 && p.price <= 200).length);

    // Switching back to "Any price" removes the filter.
    await changeFilters(page, (s) => pick(s.getByRole('radio', { name: 'Any price' })));
    await expect(page).not.toHaveURL(/minPrice/);
    expect(await resultTotal(page)).toBe(catalog.length);
  });

  test('rating', async ({ page, request }) => {
    const catalog = await fetchCatalog(request);
    await page.goto('/search');
    await changeFilters(page, (s) => pick(s.getByRole('radio', { name: '4.5 stars & up' })));
    await expect(page).toHaveURL(/minRating=4\.5/);
    expect(await resultTotal(page)).toBe(catalog.filter((p) => p.ratingAverage >= 4.5).length);
    for (const r of await cardRatings(page)) expect(r).toBeGreaterThanOrEqual(4.5);
    await expect(chips(page)).toContainText('4.5★ & up');
  });

  test('availability: in stock only', async ({ page, request }) => {
    const catalog = await fetchCatalog(request);
    expect(catalog.some((p) => p.stock === 0), 'seed data should include an out-of-stock product').toBeTruthy();

    await page.goto('/search?q=printpro');
    await expect(cards(page).first()).toContainText('Currently unavailable');

    await page.goto('/search');
    await changeFilters(page, (s) => pick(s.getByRole('checkbox', { name: 'In stock only' })));
    await expect(page).toHaveURL(/inStock=true/);
    expect(await resultTotal(page)).toBe(catalog.filter((p) => p.stock > 0).length);
    await expect(page.getByText('Currently unavailable')).toHaveCount(0);

    // The out-of-stock product disappears from a search that previously found it.
    await page.goto('/search?q=printpro&inStock=true');
    expect(await resultTotal(page)).toBe(0);
    await expect(page.getByRole('heading', { name: 'No products found' })).toBeVisible();
  });

  test('deals', async ({ page, request }) => {
    const catalog = await fetchCatalog(request);
    await page.goto('/search');
    await changeFilters(page, (s) => pick(s.getByRole('checkbox', { name: "Today's deals only" })));
    await expect(page).toHaveURL(/deals=true/);
    expect(await resultTotal(page)).toBe(catalog.filter((p) => p.isDeal).length);
    await expect(cards(page).filter({ hasText: '% off' })).toHaveCount(await cards(page).count());
    await expect(chips(page)).toContainText("Today's deals");
  });

  test('several filters together, removing a chip, and Clear all', async ({ page, request }) => {
    const catalog = await fetchCatalog(request);
    await page.goto('/search');
    await changeFilters(page, async (s) => {
      await pick(s.getByRole('radio', { name: 'Electronics', exact: true }));
      await pick(s.getByRole('checkbox', { name: "Today's deals only" }));
      await pick(s.getByRole('radio', { name: '4 stars & up' }));
    });
    const match = (p: (typeof catalog)[number]) => p.category.slug === 'electronics' && p.isDeal && p.ratingAverage >= 4;
    expect(await resultTotal(page)).toBe(catalog.filter(match).length);
    await expect(h1(page)).toHaveText('Electronics');
    await expect(chips(page).getByRole('button')).toHaveCount(4); // three filters + Clear all
    await expect(page).toHaveURL(/category=electronics/);

    // Remove one chip: only that filter goes away.
    await chips(page).getByRole('button', { name: "Remove filter Today's deals" }).click();
    await waitForResults(page);
    await expect(page).not.toHaveURL(/deals=true/);
    expect(await resultTotal(page)).toBe(catalog.filter((p) => p.category.slug === 'electronics' && p.ratingAverage >= 4).length);

    await chips(page).getByRole('button', { name: 'Clear all' }).click();
    await waitForResults(page);
    await expect(chips(page)).toHaveCount(0);
    await expect(page).toHaveURL(/\/search$/);
    expect(await resultTotal(page)).toBe(catalog.length);
  });

  test('"Clear all" keeps the search keyword', async ({ page }) => {
    await page.goto('/search?q=pro&minRating=4.5&inStock=true');
    await chips(page).getByRole('button', { name: 'Clear all' }).click();
    await expect(page).toHaveURL(/\/search\?q=pro$/);
  });
});

test.describe('sorting', () => {
  test('every sort option reorders results and updates the URL', async ({ page, request }) => {
    const catalog = await fetchCatalog(request);
    await page.goto('/search');
    const sort = page.getByLabel('Sort by');
    await expect(sort.locator('option')).toHaveText(['Relevance', 'Price: Low to High', 'Price: High to Low', 'Avg. customer rating', 'Best sellers', 'Newest arrivals']);

    await sort.selectOption({ label: 'Price: Low to High' });
    await expect(page).toHaveURL(/sort=price_asc/);
    await waitForResults(page);
    const asc = await cardPrices(page);
    expect(asc).toEqual([...asc].sort((a, b) => a - b));
    expect(asc[0]).toBe(Math.min(...catalog.map((p) => p.price)));

    await sort.selectOption({ label: 'Price: High to Low' });
    await expect(page).toHaveURL(/sort=price_desc/);
    await waitForResults(page);
    const desc = await cardPrices(page);
    expect(desc).toEqual([...desc].sort((a, b) => b - a));
    expect(desc[0]).toBe(Math.max(...catalog.map((p) => p.price)));

    await sort.selectOption({ label: 'Avg. customer rating' });
    await waitForResults(page);
    const ratings = await cardRatings(page);
    expect(ratings).toEqual([...ratings].sort((a, b) => b - a));
    expect(ratings[0]).toBe(Math.max(...catalog.map((p) => p.ratingAverage)));

    await sort.selectOption({ label: 'Best sellers' });
    await expect(page).toHaveURL(/sort=popular/);
    await waitForResults(page);
    const bestSeller = [...catalog].sort((a, b) => b.soldCount - a.soldCount || a.id - b.id)[0];
    expect((await cardIds(page))[0]).toBe(bestSeller.id);

    await sort.selectOption({ label: 'Newest arrivals' });
    await expect(page).toHaveURL(/sort=newest/);
    await waitForResults(page);
    const newest = [...catalog].sort((a, b) => b.createdAt.localeCompare(a.createdAt) || a.id - b.id)[0];
    expect((await cardIds(page))[0]).toBe(newest.id);

    await sort.selectOption({ label: 'Relevance' });
    await expect(page).not.toHaveURL(/sort=/);
  });

  test('changing sort returns to page 1', async ({ page }) => {
    await page.goto('/search?page=3');
    await waitForResults(page);
    await page.getByLabel('Sort by').selectOption({ label: 'Price: Low to High' });
    await expect(page).toHaveURL(/\/search\?sort=price_asc$/);
  });
});

test.describe('pagination', () => {
  test('walks every page without gaps or repeats', async ({ page, request }) => {
    const catalog = await fetchCatalog(request);
    const pages = Math.ceil(catalog.length / 12);
    await page.goto('/search');
    expect(await resultTotal(page)).toBe(catalog.length);
    await expect(page.getByRole('status')).toHaveText(`1–12 of ${catalog.length} results`);
    await expect(pagination(page).locator('[aria-current="page"]')).toHaveText('1');
    await expect(pagination(page).locator('[aria-disabled="true"]')).toHaveText(/Previous/); // first page: Previous disabled

    const seen: number[] = await cardIds(page);
    expect(seen).toHaveLength(12);

    await pagination(page).getByRole('link', { name: 'Go to page 2' }).click();
    await expect(page).toHaveURL(/page=2$/);
    await expect(page.getByRole('status')).toHaveText(`13–24 of ${catalog.length} results`);
    await expect(h1(page)).toBeInViewport(); // results are scrolled back into view
    seen.push(...(await cardIds(page)));

    await pagination(page).getByRole('link', { name: 'Previous' }).click();
    await expect(page).toHaveURL(/\/search$/);
    await waitForResults(page);

    // Next through to the end.
    for (let p = 2; p <= pages; p++) {
      await pagination(page).getByRole('link', { name: 'Next' }).click();
      await expect(page).toHaveURL(new RegExp(`page=${p}$`));
      await waitForResults(page);
      if (p > 2) seen.push(...(await cardIds(page)));
    }
    expect(seen).toHaveLength(catalog.length);
    expect(new Set(seen).size, 'no product repeated across pages').toBe(catalog.length);
    await expect(pagination(page).locator('[aria-disabled="true"]')).toHaveText(/Next/); // last page: Next disabled
    await expect(cards(page)).toHaveCount(catalog.length - 12 * (pages - 1));
  });

  test('a page number beyond the end lands on the last page; junk page values fall back to page 1', async ({ page, request }) => {
    const catalog = await fetchCatalog(request);
    const pages = Math.ceil(catalog.length / 12);
    await page.goto('/search?page=999');
    await expect(page).toHaveURL(new RegExp(`page=${pages}$`));
    await waitForResults(page);
    await expect(cards(page).first()).toBeVisible();

    await page.goto('/search?page=abc');
    await waitForResults(page);
    await expect(page.getByRole('status')).toHaveText(`1–12 of ${catalog.length} results`);
  });

  test('pagination links keep the active filters and sort', async ({ page }) => {
    await page.goto('/search?minRating=4&sort=price_asc');
    await waitForResults(page);
    await pagination(page).getByRole('link', { name: 'Go to page 2' }).click();
    const url = new URL(page.url());
    expect(url.searchParams.get('minRating')).toBe('4');
    expect(url.searchParams.get('sort')).toBe('price_asc');
    expect(url.searchParams.get('page')).toBe('2');
  });
});

test.describe('empty results', () => {
  test('no match for the keyword: offers clear search and back to browsing', async ({ page, request }) => {
    await page.goto('/search?q=zzzxqj');
    await expect(page.getByRole('heading', { name: 'No products found' })).toBeVisible();
    await expect(page.getByRole('status')).toHaveText('No results');
    await expect(pagination(page)).toHaveCount(0);

    // The header's × button has the same name; use the one in the empty-state panel.
    await page.getByRole('main').getByRole('button', { name: 'Clear search' }).click();
    await expect(page).toHaveURL(/\/search$/);
    expect(await resultTotal(page)).toBe((await fetchCatalog(request)).length);

    await page.goto('/search?q=zzzxqj');
    await page.getByRole('link', { name: 'Back to browsing' }).click();
    await expect(page).toHaveURL('/');
  });

  test('filters that exclude everything: Clear filters keeps the keyword', async ({ page }) => {
    await page.goto('/search?q=dune&maxPrice=5');
    await expect(page.getByRole('heading', { name: 'No products found' })).toBeVisible();
    await page.getByRole('button', { name: 'Clear filters' }).click();
    await expect(page).toHaveURL(/\/search\?q=dune$/);
    await expect(h1(page)).toHaveText('Results for “dune”');
    expect(await resultTotal(page)).toBeGreaterThan(0);
  });
});

test.describe('URL is the source of truth', () => {
  test('reload preserves search, filters and sort', async ({ page }) => {
    await page.goto('/search?q=pro&category=computers&minRating=4&sort=rating');
    const total = await resultTotal(page);
    expect(total).toBeGreaterThan(0);

    const assertState = async () => {
      await expect(h1(page)).toHaveText('Results for “pro”');
      await expect(page.getByLabel('Sort by')).toHaveValue('rating');
      await expect(chips(page)).toContainText('Computers');
      await expect(chips(page)).toContainText('4★ & up');
      await expect(searchBox(page)).toHaveValue('pro');
      expect(await resultTotal(page)).toBe(total);
    };
    await assertState();
    await page.reload();
    await assertState();
    if (!usesDrawer(page)) {
      const sidebar = page.getByRole('complementary', { name: 'Filters' });
      await expect(sidebar.getByRole('radio', { name: 'Computers', exact: true })).toBeChecked();
      await expect(sidebar.getByRole('radio', { name: '4 stars & up' })).toBeChecked();
    }
  });

  test('browser back and forward replay each state', async ({ page, request }) => {
    const catalog = await fetchCatalog(request);
    await page.goto('/search');
    await waitForResults(page);
    await page.getByLabel('Sort by').selectOption({ label: 'Price: High to Low' });
    await expect(page).toHaveURL(/sort=price_desc$/);
    await waitForResults(page);
    await pagination(page).getByRole('link', { name: 'Go to page 2' }).click();
    await expect(page).toHaveURL(/sort=price_desc&page=2$/);
    await waitForResults(page);
    const page2 = await cardIds(page);

    await page.goBack();
    await expect(page).toHaveURL(/sort=price_desc$/);
    await expect(page.getByLabel('Sort by')).toHaveValue('price_desc');
    await expect(page.getByRole('status')).toHaveText(`1–12 of ${catalog.length} results`);

    await page.goBack();
    await expect(page).toHaveURL(/\/search$/);
    await expect(page.getByLabel('Sort by')).toHaveValue('relevance');

    await page.goForward();
    await page.goForward();
    await expect(page).toHaveURL(/sort=price_desc&page=2$/);
    await waitForResults(page);
    expect(await cardIds(page)).toEqual(page2);
  });

  test('malformed URL parameters are ignored instead of breaking the page', async ({ page, request }) => {
    await page.goto('/search?sort=bogus&minPrice=-5&maxPrice=abc&page=0&minRating=9&category=NOT%20A%20SLUG&inStock=maybe');
    await waitForResults(page);
    await expect(h1(page)).toHaveText('All products');
    expect(await resultTotal(page)).toBe((await fetchCatalog(request)).length);
    await expect(chips(page)).toHaveCount(0);
  });

  test('an unknown but well-formed category is an honest empty result', async ({ page }) => {
    await page.goto('/search?category=does-not-exist');
    await expect(page.getByRole('heading', { name: 'No products found' })).toBeVisible();
  });
});

test.describe('filter UI by viewport', () => {
  test('wide screens: sidebar applies instantly, no drawer button', async ({ page }) => {
    test.skip(usesDrawer(page), 'sidebar layout only');
    await page.goto('/search');
    await expect(page.getByRole('complementary', { name: 'Filters' })).toBeVisible();
    await expect(page.getByRole('button', { name: /^Filters/ })).toBeHidden();
    await pick(page.getByRole('checkbox', { name: 'In stock only' }));
    await expect(page).toHaveURL(/inStock=true/); // no Apply step
  });

  test('narrow screens: drawer edits a draft that only applies on "Apply filters"', async ({ page }) => {
    test.skip(!usesDrawer(page), 'drawer layout only');
    await page.goto('/search');
    await waitForResults(page);
    await expect(page.getByRole('complementary', { name: 'Filters' })).toBeHidden();

    const open = () => page.getByRole('button', { name: /^Filters/ }).click();
    const drawer = page.getByRole('dialog', { name: 'Filters' });

    await open();
    await expect(drawer).toBeVisible();
    await expectNoHorizontalOverflow(page);
    await pick(drawer.getByRole('checkbox', { name: 'In stock only' }));
    await expect(page).not.toHaveURL(/inStock/); // nothing applied yet

    await drawer.getByRole('button', { name: 'Close filters' }).click();
    await expect(drawer).toBeHidden();
    await expect(page).not.toHaveURL(/inStock/);
    await open();
    await expect(drawer.getByRole('checkbox', { name: 'In stock only' })).not.toBeChecked(); // discarded

    await pick(drawer.getByRole('checkbox', { name: 'In stock only' }));
    await pick(drawer.getByRole('radio', { name: '4 stars & up' }));
    await drawer.getByRole('button', { name: 'Apply filters' }).click();
    await expect(drawer).toBeHidden();
    await expect(page).toHaveURL(/inStock=true/);
    await expect(page).toHaveURL(/minRating=4/);
    await expect(page.getByRole('button', { name: /^Filters/ })).toContainText('2'); // active-filter count badge
    await expect(chips(page)).toContainText('In stock');

    await open(); // reopening shows the applied state
    await expect(drawer.getByRole('checkbox', { name: 'In stock only' })).toBeChecked();
    await drawer.getByRole('button', { name: 'Clear all' }).click();
    await drawer.getByRole('button', { name: 'Apply filters' }).click();
    await expect(page).toHaveURL(/\/search$/);

    await open();
    await page.keyboard.press('Escape'); // keyboard dismissal
    await expect(drawer).toBeHidden();
  });
});

test.describe('responsive and visual integrity', () => {
  for (const url of ['/search', '/search?deals=true&minRating=4&sort=price_asc', '/search?q=zzzxqj', '/search?page=3', '/search?category=books']) {
    test(`no horizontal overflow or broken images: ${url}`, async ({ page }) => {
      await page.goto(url);
      await waitForResults(page);
      await page.evaluate(async () => {
        for (let y = 0; y < document.body.scrollHeight; y += 500) {
          window.scrollTo({ top: y, behavior: 'instant' });
          await new Promise((r) => setTimeout(r, 80));
        }
      });
      await page.waitForLoadState('networkidle');
      await expectNoHorizontalOverflow(page);
      const broken = await page.evaluate(() => [...document.images].filter((i) => i.complete && i.naturalWidth === 0).map((i) => i.src));
      expect(broken).toEqual([]);
    });
  }

  test('product cards stay readable: title, price, rating and seller all visible', async ({ page }) => {
    await page.goto('/search?deals=true');
    await waitForResults(page);
    const card = cards(page).first();
    await expect(card.getByRole('heading')).toBeVisible();
    await expect(card).toContainText(/\$\d/);
    await expect(card).toContainText('Sold by');
    await expect(card.locator('[aria-label$="out of 5 stars"]')).toBeVisible();
    const box = (await card.boundingBox())!;
    expect(box.width).toBeGreaterThan(140);
  });

  test('clicking a product opens its details page', async ({ page, request }) => {
    await page.goto('/search?q=headphones');
    await waitForResults(page);
    const first = cards(page).first();
    const href = await first.getAttribute('href');
    await first.click();
    await expect(page).toHaveURL(new RegExp(`${href}$`));
    const product = await (await request.get(`${API}${href}`)).json();
    await expect(h1(page)).toHaveText(product.title);
  });
});

test.describe('failure and loading states', () => {
  test.describe('with injected failures', () => {
    test.use({ allowErrors: true });

    test('API error shows a message and Try again recovers', async ({ page }) => {
      let fail = true;
      await page.route('**/api/products?**', (route) => (fail ? route.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ statusCode: 500, message: 'Internal server error' }) }) : route.continue()));
      await page.goto('/search?q=headphones');
      const alert = page.getByRole('alert');
      await expect(alert).toContainText("couldn't load");
      await expect(page.getByRole('status')).toHaveText('');
      await expectNoHorizontalOverflow(page);

      fail = false;
      await alert.getByRole('button', { name: 'Try again' }).click();
      await expect(cards(page).first()).toBeVisible();
      await expect(alert).toHaveCount(0);
    });

    test('every image failing still leaves a usable grid with placeholders', async ({ page }) => {
      await page.route('**/images.unsplash.com/**', (route) => route.abort());
      await page.route('**/covers.openlibrary.org/**', (route) => route.abort());
      await page.goto('/search');
      await waitForResults(page);
      await expect(cards(page)).toHaveCount(12);
      await expect(page.locator('[data-testid="product-card"] [role="img"]')).toHaveCount(12);
      // No <img> may be left showing the browser's broken-image icon.
      const broken = await page.evaluate(() => [...document.images].filter((i) => i.complete && i.naturalWidth === 0).length);
      expect(broken).toBe(0);
      await expectNoHorizontalOverflow(page);
    });
  });

  test('skeletons appear while results load', async ({ page }) => {
    await page.route('**/api/products?**', async (route) => {
      await new Promise((r) => setTimeout(r, 1200));
      await route.continue();
    });
    await page.goto('/search?q=pro');
    await expect(page.getByRole('status')).toHaveText('Searching…');
    await expect(page.locator('.animate-pulse').first()).toBeVisible();
    await expect(cards(page)).toHaveCount(0);
    await expectNoHorizontalOverflow(page);
    await expect(cards(page).first()).toBeVisible({ timeout: 15_000 });
    await expect(page.locator('.animate-pulse')).toHaveCount(0);
  });
});
