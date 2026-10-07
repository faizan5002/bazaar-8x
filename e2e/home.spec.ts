import { expect, test } from './fixtures';
import { API, cards, expectNoHorizontalOverflow, fetchCatalog, resultTotal } from './helpers';

test.describe('homepage', () => {
  test('renders every section from the API, with no overflow or broken images', async ({ page, request }) => {
    const categories: { name: string }[] = await (await request.get(`${API}/categories`)).json();
    await page.goto('/');
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Big savings on everything you use every day');
    await expect(page.locator('#deals').getByTestId('product-card')).toHaveCount(10);
    await expect(page.locator('#popular').getByTestId('product-card')).toHaveCount(8);
    await expect(page.locator('#recommended').getByTestId('product-card')).toHaveCount(8);
    await expect(page.locator('#categories').getByRole('link')).toHaveCount(categories.length);

    const ids = await page.getByTestId('product-card').evaluateAll((els) => els.map((e) => e.getAttribute('href')));
    expect(new Set(ids).size, 'no product repeated across homepage sections').toBe(ids.length);

    await page.evaluate(async () => {
      for (let y = 0; y < document.body.scrollHeight; y += 500) {
        window.scrollTo({ top: y, behavior: 'instant' });
        await new Promise((r) => setTimeout(r, 80));
      }
    });
    await page.waitForLoadState('networkidle');
    await expectNoHorizontalOverflow(page);
    expect(await page.evaluate(() => [...document.images].filter((i) => i.complete && i.naturalWidth === 0).length)).toBe(0);
  });

  test('deal cards show API data: price, original price, discount, rating count, seller', async ({ page, request }) => {
    const first = (await (await request.get(`${API}/products?deals=true&inStock=true&sort=popular&limit=10`)).json()).items[0];
    await page.goto('/');
    const card = page.locator('#deals').getByTestId('product-card').first();
    await expect(card).toContainText(first.title.slice(0, 30));
    await expect(card).toContainText(`$${first.price.toFixed(2)}`);
    await expect(card).toContainText(`$${first.originalPrice.toFixed(2)}`);
    await expect(card).toContainText('% off');
    await expect(card).toContainText(first.reviewCount.toLocaleString('en-US'));
    await expect(card).toContainText(first.seller.name);
  });

  test('hero CTA and "See all deals" lead to the deals listing', async ({ page, request }) => {
    const deals = (await fetchCatalog(request)).filter((p) => p.isDeal).length;
    await page.goto('/');
    await page.getByRole('link', { name: "Shop today's deals" }).click();
    await expect(page).toHaveURL(/\/search\?deals=true$/);
    expect(await resultTotal(page)).toBe(deals);

    await page.goto('/');
    await page.getByRole('link', { name: 'See all deals' }).click();
    await expect(page).toHaveURL(/deals=true$/);
  });

  test('"See more" links open a matching, filtered listing', async ({ page }) => {
    await page.goto('/');
    await page.locator('#popular').getByRole('link', { name: 'See more' }).click();
    await expect(page).toHaveURL(/minRating=4\.5&sort=popular$/);
    await expect(page.getByRole('list', { name: 'Active filters' })).toContainText('4.5★ & up');
    await expect(page.getByLabel('Sort by')).toHaveValue('popular');
    expect(await resultTotal(page)).toBeGreaterThan(0);
  });

  test('"Browse categories" scrolls to the category grid; category cards open listings', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('link', { name: 'Browse categories' }).click();
    await expect(page.locator('#categories')).toBeInViewport();
    await page.locator('#categories').getByRole('link').nth(1).click();
    await expect(page).toHaveURL(/\/search\?category=/);
    expect(await resultTotal(page)).toBeGreaterThan(0);
  });

  test('product card opens the product route; header links work', async ({ page }) => {
    await page.goto('/');
    const card = page.locator('#popular').getByTestId('product-card').first();
    const href = await card.getAttribute('href');
    await card.click();
    await expect(page).toHaveURL(new RegExp(`${href}$`));

    await page.getByRole('link', { name: 'Orders' }).click();
    await expect(page).toHaveURL(/\/orders$/);
    // Signed out: the badge reads 0 and the cart (an account feature) asks you to sign in first.
    await page.getByRole('link', { name: /^Cart, 0 items/ }).click();
    await expect(page).toHaveURL(/\/login$/);
    await page.goto('/');
    await page.getByRole('link', { name: 'Sign in to your account' }).click();
    await expect(page).toHaveURL(/\/login$/);
  });

  test.describe('with injected failures', () => {
    test.use({ allowErrors: true });

    test('one failing section shows a retry while the rest of the page still works', async ({ page }) => {
      let fail = true;
      await page.route('**/api/products?**', (route) => (fail && route.request().url().includes('deals=true') ? route.fulfill({ status: 500, contentType: 'application/json', body: '{"message":"boom"}' }) : route.continue()));
      await page.goto('/');
      await expect(page.locator('#deals').getByRole('alert')).toBeVisible();
      await expect(page.locator('#popular').getByTestId('product-card').first()).toBeVisible();
      fail = false;
      await page.locator('#deals').getByRole('button', { name: 'Try again' }).click();
      await expect(page.locator('#deals').getByTestId('product-card')).toHaveCount(10);
    });

    test('with every image failing the cards still render with placeholders', async ({ page }) => {
      await page.route('**/images.unsplash.com/**', (route) => route.abort());
      await page.route('**/covers.openlibrary.org/**', (route) => route.abort());
      await page.goto('/');
      await expect(cards(page).first()).toBeVisible();
      await page.locator('#popular').scrollIntoViewIfNeeded(); // lazy images only try (and fail) once near the viewport
      await expect(page.locator('#popular [data-testid="product-card"] [role="img"]')).toHaveCount(8);
      await expectNoHorizontalOverflow(page);
    });
  });
});
