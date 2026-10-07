import type { APIRequestContext, Page } from '@playwright/test';
import { expect, test } from './fixtures';
import { API, expectNoHorizontalOverflow, fetchCatalog, waitForResults, type ApiProduct, type ApiReview } from './helpers';

// ---- data: every expectation is derived from the live API, never hardcoded -------------------------------------------

interface Catalog {
  all: ApiProduct[];
  /** several photos, several variant groups, discounted, comfortably in stock */
  rich: ApiProduct;
  /** 1–10 units left */
  lowStock: ApiProduct;
  outOfStock: ApiProduct;
  /** exactly one photo */
  singleImage: ApiProduct;
}

async function catalog(request: APIRequestContext): Promise<Catalog> {
  const all = await fetchCatalog(request);
  const find = (what: string, pred: (p: ApiProduct) => boolean) => {
    const p = all.find(pred);
    if (!p) throw new Error(`Seed data has no product that is: ${what}`);
    return p;
  };
  return {
    all,
    rich: find('multi-image, multi-variant, discounted, in stock', (p) => p.images.length > 1 && p.variants.length > 1 && !!p.originalPrice && p.stock > 10),
    lowStock: find('low stock', (p) => p.stock > 0 && p.stock <= 10),
    outOfStock: find('out of stock', (p) => p.stock === 0),
    singleImage: find('single image', (p) => p.images.length === 1 && p.stock > 10),
  };
}

const money = (n: number) => `$${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const reviewsOf = async (request: APIRequestContext, id: number): Promise<ApiReview[]> => (await (await request.get(`${API}/products/${id}/reviews?limit=50`)).json()).items;
/** A stable identity for an image URL regardless of the size query string. */
const imageId = (url: string) => url.match(/photo-[\w-]+|isbn\/\d+/)![0];
const title = (page: Page) => page.getByTestId('product-title');
const buyBox = (page: Page) => page.getByTestId('buy-box');
const mainImage = (page: Page) => page.getByTestId('main-image');
const thumbs = (page: Page) => page.getByRole('list', { name: 'Product images' }).getByRole('button');
const delivery = (days: number) => new Date(Date.now() + days * 86_400_000).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });

// ---- reaching the page ------------------------------------------------------------------------------------------------

test.describe('opening a product', () => {
  test('from a homepage card', async ({ page, request }) => {
    await page.goto('/');
    const card = page.locator('#popular').getByTestId('product-card').first();
    const href = (await card.getAttribute('href'))!;
    await card.click();
    await expect(page).toHaveURL(new RegExp(`${href}$`));
    const product = await (await request.get(`${API}${href}`)).json();
    await expect(title(page)).toHaveText(product.title);
  });

  test('from search results', async ({ page, request }) => {
    await page.goto('/search?q=headphones');
    await waitForResults(page);
    const href = (await page.getByTestId('product-card').first().getAttribute('href'))!;
    await page.getByTestId('product-card').first().click();
    await expect(page).toHaveURL(new RegExp(`${href}$`));
    await expect(title(page)).toHaveText((await (await request.get(`${API}${href}`)).json()).title);
  });

  test('refresh keeps showing the same product', async ({ page, request }) => {
    const { rich } = await catalog(request);
    await page.goto(`/products/${rich.id}`);
    await expect(title(page)).toHaveText(rich.title);
    await page.reload();
    await expect(title(page)).toHaveText(rich.title);
    await expect(page).toHaveURL(new RegExp(`/products/${rich.id}$`));
  });

  test('breadcrumb, header search and the browser back button', async ({ page, request }) => {
    const { rich } = await catalog(request);
    await page.goto('/');
    await page.goto(`/products/${rich.id}`);
    const crumbs = page.getByRole('navigation', { name: 'Breadcrumb' });
    await expect(crumbs.getByRole('link', { name: 'Home' })).toBeVisible();
    await expect(crumbs.getByRole('link', { name: rich.category.name })).toHaveAttribute('href', `/search?category=${rich.category.slug}`);

    await crumbs.getByRole('link', { name: rich.category.name }).click();
    await expect(page).toHaveURL(new RegExp(`category=${rich.category.slug}$`));
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(rich.category.name);
    await page.goBack();
    await expect(page).toHaveURL(new RegExp(`/products/${rich.id}$`));
    await expect(title(page)).toHaveText(rich.title);

    // The marketplace header still works from here.
    await page.getByRole('searchbox', { name: 'Search products' }).fill('headphones');
    await page.getByRole('searchbox', { name: 'Search products' }).press('Enter');
    await expect(page).toHaveURL(/\/search\?q=headphones$/);
    await waitForResults(page);
  });
});

// ---- the product itself -----------------------------------------------------------------------------------------------

test.describe('product information', () => {
  test('title, brand, rating, price, discount and savings match the API', async ({ page, request }) => {
    const { rich: p } = await catalog(request);
    await page.goto(`/products/${p.id}`);
    await expect(title(page)).toHaveText(p.title);
    await expect(page.getByText(`Brand: ${p.brand}`)).toBeVisible();

    const rating = page.getByTestId('rating');
    await expect(rating).toContainText(p.ratingAverage.toFixed(1));
    await expect(rating).toContainText(`${p.reviewCount.toLocaleString('en-US')} ratings`);
    await expect(rating.locator('[aria-label$="out of 5 stars"]')).toHaveAttribute('aria-label', `${p.ratingAverage.toFixed(1)} out of 5 stars`);

    const price = page.getByTestId('price-block');
    const off = Math.round((1 - p.price / p.originalPrice!) * 100);
    await expect(price).toContainText(money(p.price));
    await expect(price).toContainText(money(p.originalPrice!));
    await expect(price).toContainText(`-${off}%`);
    await expect(page.getByTestId('savings')).toContainText(`You save ${money(p.originalPrice! - p.price)} (${off}%)`);
  });

  test('a product with no discount shows just its price', async ({ page, request }) => {
    const { all } = await catalog(request);
    const plain = all.find((p) => !p.originalPrice)!;
    await page.goto(`/products/${plain.id}`);
    await expect(page.getByTestId('price-block')).toContainText(money(plain.price));
    await expect(page.getByTestId('savings')).toHaveCount(0);
    await expect(page.getByTestId('price-block').getByText('%')).toHaveCount(0);
  });

  test('price, rating and delivery are visible without scrolling far', async ({ page, request }) => {
    const { rich } = await catalog(request);
    await page.goto(`/products/${rich.id}`);
    const vh = page.viewportSize()!.height;
    const priceBox = (await page.getByTestId('price-block').boundingBox())!;
    expect(priceBox.y + 60, 'the price figure starts within the first screen').toBeLessThan(vh);
    await expect(page.getByTestId('rating')).toBeInViewport();
    await expect(title(page)).toBeInViewport();
  });

  test('availability: in stock, low stock and out of stock', async ({ page, request }) => {
    const { rich, lowStock, outOfStock } = await catalog(request);

    await page.goto(`/products/${rich.id}`);
    await expect(page.getByTestId('availability')).toHaveText('In stock');
    await expect(page.getByRole('button', { name: 'Add to Cart' })).toBeEnabled();

    await page.goto(`/products/${lowStock.id}`);
    await expect(page.getByTestId('availability')).toHaveText(`Only ${lowStock.stock} left in stock`);
    await expect(page.getByRole('button', { name: 'Add to Cart' })).toBeEnabled();

    // Out of stock must not look purchasable.
    await page.goto(`/products/${outOfStock.id}`);
    await expect(page.getByTestId('availability')).toHaveText('Currently unavailable');
    await expect(buyBox(page).getByRole('button', { name: 'Currently unavailable' })).toBeDisabled();
    await expect(page.getByRole('button', { name: 'Add to Cart' })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Buy Now' })).toHaveCount(0);
    await expect(page.getByLabel('Quantity')).toHaveCount(0);
    await expect(page.getByTestId('delivery')).toHaveCount(0);
    await expect(page.getByTestId('availability-delivery')).toContainText("isn't available while this item is out of stock");
  });

  test('delivery information reflects the product and is not presented as real-time', async ({ page, request }) => {
    const { all } = await catalog(request);
    const free = all.find((p) => p.freeShipping && p.stock > 10)!;
    const paid = all.find((p) => !p.freeShipping && p.stock > 10)!;

    await page.goto(`/products/${free.id}`);
    const d = page.getByTestId('delivery');
    await expect(d).toContainText('FREE delivery');
    await expect(d).toContainText(delivery(free.deliveryDays));
    await expect(d).toContainText(`about ${free.deliveryDays} ${free.deliveryDays === 1 ? 'day' : 'days'}`);
    await expect(d).toContainText('real-time promise');
    await expect(d).not.toContainText('calculated at checkout');

    await page.goto(`/products/${paid.id}`);
    await expect(page.getByTestId('delivery')).not.toContainText('FREE delivery');
    await expect(page.getByTestId('delivery')).toContainText('Shipping cost is calculated at checkout');
  });

  test('seller is shown with real seller data only', async ({ page, request }) => {
    const { rich: p } = await catalog(request);
    await page.goto(`/products/${p.id}`);
    const seller = buyBox(page).getByRole('region', { name: 'Seller' });
    await expect(seller.getByTestId('seller-name')).toHaveText(p.seller.name);
    await expect(seller).toContainText(`${p.seller.rating.toFixed(1)} seller rating`);
    if (p.seller.description) await expect(seller).toContainText(p.seller.description);
    await expect(seller).not.toContainText(/guarantee|verified seller|top rated/i); // nothing the API doesn't back up
  });
});

// ---- gallery ----------------------------------------------------------------------------------------------------------

test.describe('image gallery', () => {
  test('thumbnails, selection, arrows and wrap-around', async ({ page, request }) => {
    const { rich: p } = await catalog(request);
    const ids = p.images.map(imageId);
    await page.goto(`/products/${p.id}`);

    await expect(thumbs(page)).toHaveCount(p.images.length);
    await expect(mainImage(page)).toHaveAttribute('src', new RegExp(ids[0]));
    await expect(thumbs(page).nth(0)).toHaveAttribute('aria-current', 'true');
    await expect(page.getByText(`1 / ${p.images.length}`)).toBeVisible();

    await thumbs(page).nth(1).click();
    await expect(mainImage(page)).toHaveAttribute('src', new RegExp(ids[1]));
    await expect(thumbs(page).nth(1)).toHaveAttribute('aria-current', 'true');
    await expect(thumbs(page).nth(0)).not.toHaveAttribute('aria-current', 'true');
    await expect(page.getByText(`2 / ${p.images.length}`)).toBeVisible();

    // Arrows move and wrap in both directions.
    await page.getByRole('button', { name: 'Next image' }).click();
    await expect(mainImage(page)).toHaveAttribute('src', new RegExp(ids[(2 % p.images.length)]));
    await page.getByRole('button', { name: 'Previous image' }).click();
    await page.getByRole('button', { name: 'Previous image' }).click();
    await expect(mainImage(page)).toHaveAttribute('src', new RegExp(ids[0]));
    await page.getByRole('button', { name: 'Previous image' }).click();
    await expect(mainImage(page)).toHaveAttribute('src', new RegExp(ids[p.images.length - 1]));
  });

  test('keyboard: arrow keys on the thumbnails change the image', async ({ page, request }) => {
    const { rich: p } = await catalog(request);
    await page.goto(`/products/${p.id}`);
    await thumbs(page).nth(0).focus();
    await page.keyboard.press('ArrowRight');
    await expect(mainImage(page)).toHaveAttribute('src', new RegExp(imageId(p.images[1])));
  });

  test('a single image has no thumbnails or arrows', async ({ page, request }) => {
    const { singleImage: p } = await catalog(request);
    await page.goto(`/products/${p.id}`);
    await expect(mainImage(page)).toHaveAttribute('src', new RegExp(imageId(p.images[0])));
    await expect(thumbs(page)).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Next image' })).toHaveCount(0);
  });

  test('a product with no images shows a placeholder, not a broken page', async ({ page, request }) => {
    const { rich: p } = await catalog(request);
    const body = await (await request.get(`${API}/products/${p.id}`)).json();
    await page.route(`**/api/products/${p.id}`, (route) => route.fulfill({ json: { ...body, images: [] } }));
    await page.goto(`/products/${p.id}`);
    await expect(title(page)).toHaveText(p.title);
    await expect(page.getByTestId('gallery').getByRole('img')).toBeVisible(); // the placeholder
    await expect(thumbs(page)).toHaveCount(0);
    await expectNoHorizontalOverflow(page);
  });

  test.describe('with every image failing', () => {
    test.use({ allowErrors: true });
    test('the gallery shows a placeholder and the rest of the page is intact', async ({ page, request }) => {
      const { rich: p } = await catalog(request);
      await page.route(/images\.unsplash\.com|covers\.openlibrary\.org/, (route) => route.abort());
      await page.goto(`/products/${p.id}`);
      await expect(title(page)).toHaveText(p.title);
      await expect(page.getByTestId('gallery').getByRole('img').first()).toBeVisible();
      await expect(page.getByRole('button', { name: 'Add to Cart' })).toBeVisible();
      await expect(page.locator('[data-testid="gallery"] img')).toHaveCount(0); // no <img> stuck in a broken state
      await expectNoHorizontalOverflow(page);
    });
  });
});

// ---- variants, quantity, purchase CTAs --------------------------------------------------------------------------------

test.describe('buying options', () => {
  test('variant groups come from the API and selection works', async ({ page, request }) => {
    const { rich: p } = await catalog(request);
    await page.goto(`/products/${p.id}`);
    const variants = page.getByTestId('variants');
    for (const group of p.variants) {
      const radios = variants.getByRole('radiogroup').filter({ hasText: `${group.name}:` });
      await expect(radios.getByRole('radio')).toHaveCount(group.options.length);
      await expect(radios.getByRole('radio', { name: group.options[0] })).toBeChecked(); // first option preselected
      await expect(radios).toContainText(`${group.name}: ${group.options[0]}`);

      const other = group.options[group.options.length - 1];
      await radios.getByRole('radio', { name: other, exact: true }).click();
      await expect(radios.getByRole('radio', { name: other, exact: true })).toBeChecked();
      await expect(radios.getByRole('radio', { name: group.options[0], exact: true })).not.toBeChecked();
      await expect(radios).toContainText(`${group.name}: ${other}`);
    }
  });

  test('variant selection resets when you move to another product', async ({ page, request }) => {
    const { rich: p, all } = await catalog(request);
    const group = p.variants[0];
    await page.goto(`/products/${p.id}`);
    await page.getByTestId('variants').getByRole('radio', { name: group.options[group.options.length - 1], exact: true }).click();
    const related = all.find((x) => x.id !== p.id && x.variants.length > 0)!;
    await page.goto(`/products/${related.id}`);
    await expect(page.getByTestId('variants').getByRole('radio').first()).toBeChecked();
  });

  test('products without variants show no selector', async ({ page, request }) => {
    const { all } = await catalog(request);
    const none = all.find((p) => p.variants.length === 0 && p.stock > 10)!;
    await page.goto(`/products/${none.id}`);
    await expect(page.getByTestId('variants')).toHaveCount(0);
  });

  test('quantity is capped by stock and the purchase buttons are present', async ({ page, request }) => {
    const { rich: p, lowStock } = await catalog(request);
    await page.goto(`/products/${p.id}`);
    const qty = buyBox(page).getByLabel('Quantity');
    await expect(qty.locator('option')).toHaveCount(Math.min(p.stock, 10));
    await qty.selectOption('3');
    await expect(qty).toHaveValue('3');
    await expect(buyBox(page).getByRole('button', { name: 'Add to Cart' })).toBeEnabled();
    await expect(buyBox(page).getByRole('button', { name: 'Buy Now' })).toBeEnabled();
    // What the buttons do (signed out → sign in; signed in → real cart) is covered end to end in buying.spec.ts.

    // Low stock: the picker never offers more than is available.
    await page.goto(`/products/${lowStock.id}`);
    await expect(buyBox(page).getByLabel('Quantity').locator('option')).toHaveCount(lowStock.stock);
    await expect(buyBox(page)).toContainText(`${lowStock.stock} available`);
  });
});

// ---- description, features, specifications ----------------------------------------------------------------------------

test.describe('product details content', () => {
  test('description, features and specifications render from the API', async ({ page, request }) => {
    const { rich: p } = await catalog(request);
    await page.goto(`/products/${p.id}`);

    await expect(page.getByRole('heading', { name: 'About this product' })).toBeVisible();
    await expect(page.locator('#about p')).toHaveText(p.description);

    await expect(page.getByRole('heading', { name: 'Key features' })).toBeVisible();
    const features = page.locator('#features li');
    await expect(features).toHaveCount(p.features.length);
    for (const f of p.features) await expect(page.locator('#features').getByText(f, { exact: true })).toBeVisible();

    await expect(page.getByRole('heading', { name: 'Specifications' })).toBeVisible();
    const rows = page.getByTestId('specs').getByRole('row');
    await expect(rows).toHaveCount(Object.keys(p.specifications).length);
    for (const [name, value] of Object.entries(p.specifications)) {
      const row = page.getByTestId('specs').getByRole('row').filter({ has: page.getByRole('rowheader', { name, exact: true }) });
      await expect(row.getByRole('cell')).toHaveText(value);
    }
    // A readable table, not serialized data.
    await expect(page.locator('main')).not.toContainText('{"');
  });
});

// ---- reviews ----------------------------------------------------------------------------------------------------------

test.describe('customer reviews', () => {
  test('summary and individual reviews match the API', async ({ page, request }) => {
    const { rich: p } = await catalog(request);
    const reviews = await reviewsOf(request, p.id);
    expect(reviews.length).toBeGreaterThan(0);
    await page.goto(`/products/${p.id}`);

    const summary = page.getByTestId('rating-summary');
    await expect(summary).toContainText(p.ratingAverage.toFixed(1));
    await expect(summary).toContainText(`${p.reviewCount.toLocaleString('en-US')} global ratings`);

    const items = page.getByTestId('review');
    await expect(items).toHaveCount(reviews.length);
    for (const [i, r] of reviews.entries()) {
      const item = items.nth(i);
      await expect(item).toContainText(r.authorName);
      await expect(item).toContainText(r.title);
      await expect(item).toContainText(r.body);
      await expect(item.locator('[aria-label$="out of 5 stars"]')).toHaveAttribute('aria-label', `${r.rating.toFixed(1)} out of 5 stars`);
      await expect(item).toContainText(`Reviewed on ${new Date(r.createdAt).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}`);
      if (r.verifiedPurchase) await expect(item).toContainText('Verified Purchase');
    }
    expect(reviews.map((r) => r.createdAt)).toEqual([...reviews.map((r) => r.createdAt)].sort().reverse()); // newest first
  });

  test('the ratings link jumps to the reviews', async ({ page, request }) => {
    const { rich: p } = await catalog(request);
    await page.goto(`/products/${p.id}`);
    await page.getByRole('link', { name: /ratings$/ }).click();
    await expect(page.locator('#reviews')).toBeInViewport();
  });

  test('no reviews: a clear empty state', async ({ page, request }) => {
    const { rich: p } = await catalog(request);
    await page.route(`**/api/products/${p.id}/reviews**`, (route) => route.fulfill({ json: { items: [], total: 0, page: 1, limit: 10, totalPages: 1 } }));
    await page.goto(`/products/${p.id}`);
    await expect(page.getByText('No customer reviews yet.')).toBeVisible();
    await expect(page.getByTestId('review')).toHaveCount(0);
    await expect(page.getByTestId('rating-summary')).toContainText(p.ratingAverage.toFixed(1));
  });

  test.describe('with injected failures', () => {
    test.use({ allowErrors: true });
    test('reviews failing shows a retry and leaves the page working', async ({ page, request }) => {
      const { rich: p } = await catalog(request);
      let fail = true;
      await page.route(`**/api/products/${p.id}/reviews**`, (route) => (fail ? route.fulfill({ status: 500, json: { message: 'boom' } }) : route.continue()));
      await page.goto(`/products/${p.id}`);
      const section = page.locator('#reviews');
      await expect(section.getByRole('alert')).toContainText("Reviews couldn't be loaded");
      await expect(title(page)).toHaveText(p.title);
      await expect(page.getByRole('button', { name: 'Add to Cart' })).toBeVisible();
      fail = false;
      await section.getByRole('button', { name: 'Try again' }).click();
      await expect(page.getByTestId('review').first()).toBeVisible();
    });
  });
});

// ---- related products -------------------------------------------------------------------------------------------------

test.describe('related products', () => {
  test('come from the API, exclude the product itself, and navigate', async ({ page, request }) => {
    const { rich: p } = await catalog(request);
    const related: ApiProduct[] = await (await request.get(`${API}/products/${p.id}/related`)).json();
    expect(related.length).toBeGreaterThan(0);
    expect(related.map((r) => r.id)).not.toContain(p.id);

    await page.goto(`/products/${p.id}`);
    const cards = page.locator('#related').getByTestId('product-card');
    await expect(cards.first()).toBeVisible();
    const hrefs = await cards.evaluateAll((els) => els.map((e) => e.getAttribute('href')));
    expect(hrefs.sort()).toEqual(related.map((r) => `/products/${r.id}`).sort());
    expect(hrefs).not.toContain(`/products/${p.id}`);

    // Same shared card: price, rating and seller are all there.
    await expect(cards.first()).toContainText('Sold by');
    await expect(cards.first().locator('[aria-label$="out of 5 stars"]')).toBeVisible();

    const target = related[0];
    await cards.first().click();
    await expect(page).toHaveURL(new RegExp(`/products/${target.id}$`));
    await expect(title(page)).toHaveText(target.title); // page content switched, not just the URL
  });

  test('empty related list: the section is simply absent', async ({ page, request }) => {
    const { rich: p } = await catalog(request);
    await page.route(`**/api/products/${p.id}/related`, (route) => route.fulfill({ json: [] }));
    await page.goto(`/products/${p.id}`);
    await expect(title(page)).toHaveText(p.title);
    await expect(page.locator('#reviews')).toBeVisible();
    await expect(page.locator('#related')).toHaveCount(0);
  });

  test.describe('with injected failures', () => {
    test.use({ allowErrors: true });
    test('a failing related request does not break the product page', async ({ page, request }) => {
      const { rich: p } = await catalog(request);
      await page.route(`**/api/products/${p.id}/related`, (route) => route.fulfill({ status: 500, json: { message: 'boom' } }));
      await page.goto(`/products/${p.id}`);
      await expect(title(page)).toHaveText(p.title);
      await expect(page.getByRole('button', { name: 'Add to Cart' })).toBeVisible();
      await expect(page.locator('#related')).toHaveCount(0);
      await expect(page.getByRole('alert')).toHaveCount(0);
    });
  });
});

// ---- bad ids, errors, loading ----------------------------------------------------------------------------------------

test.describe('invalid, missing and failing products', () => {
  test('a malformed id is rejected without calling the API', async ({ page }) => {
    const productCalls: string[] = [];
    page.on('request', (r) => /\/api\/products\/[^/?]+$/.test(r.url()) && productCalls.push(r.url()));
    await page.goto('/products/abc');
    await expect(page.getByRole('heading', { level: 1 })).toHaveText("We couldn't find that product");
    await expect(page.getByText("doesn't look like a valid product link")).toBeVisible();
    expect(productCalls).toEqual([]);
    await expectNoHorizontalOverflow(page);

    await page.getByRole('link', { name: 'Browse all products' }).click();
    await expect(page).toHaveURL(/\/search$/);
  });

  test('a negative or zero id is also invalid', async ({ page }) => {
    for (const id of ['0', '-5', '1.5']) {
      await page.goto(`/products/${id}`);
      await expect(page.getByRole('heading', { level: 1 })).toHaveText("We couldn't find that product");
    }
  });

  test.describe('expected 404s and 500s', () => {
    test.use({ allowErrors: true });

    test('a well-formed id that does not exist shows not-found', async ({ page }) => {
      await page.goto('/products/999999');
      await expect(page.getByRole('heading', { level: 1 })).toHaveText("We couldn't find that product");
      await expect(page.getByText('removed, or the link may be out of date')).toBeVisible();
      await expect(page.getByRole('link', { name: 'Back to home' })).toBeVisible();
      await expect(page.getByRole('searchbox', { name: 'Search products' })).toBeVisible(); // the marketplace header is still there
      await expectNoHorizontalOverflow(page);
    });

    test('an API failure shows an error with Try again, which recovers', async ({ page, request }) => {
      const { rich: p } = await catalog(request);
      let fail = true;
      await page.route(`**/api/products/${p.id}`, (route) => (fail ? route.fulfill({ status: 500, json: { message: 'boom' } }) : route.continue()));
      await page.goto(`/products/${p.id}`);
      await expect(page.getByRole('alert')).toContainText("couldn't load this product");
      fail = false;
      await page.getByRole('button', { name: 'Try again' }).click();
      await expect(title(page)).toHaveText(p.title);
    });
  });

  test('a loading skeleton shows while the product is fetched', async ({ page, request }) => {
    const { rich: p } = await catalog(request);
    await page.route(`**/api/products/${p.id}`, async (route) => {
      await new Promise((r) => setTimeout(r, 1200));
      await route.continue();
    });
    await page.goto(`/products/${p.id}`);
    await expect(page.getByLabel('Loading product')).toBeVisible();
    await expectNoHorizontalOverflow(page);
    await expect(title(page)).toHaveText(p.title, { timeout: 15_000 });
    await expect(page.getByLabel('Loading product')).toHaveCount(0);
  });
});

// ---- layout -----------------------------------------------------------------------------------------------------------

test.describe('responsive layout', () => {
  test('no horizontal overflow or broken images on any kind of product', async ({ page, request }) => {
    const { rich, lowStock, outOfStock, singleImage, all } = await catalog(request);
    const book = all.find((p) => p.category.slug === 'books')!;
    for (const p of [rich, lowStock, outOfStock, singleImage, book]) {
      await page.goto(`/products/${p.id}`);
      await expect(title(page)).toHaveText(p.title);
      await page.evaluate(async () => {
        for (let y = 0; y < document.body.scrollHeight; y += 500) {
          window.scrollTo({ top: y, behavior: 'instant' });
          await new Promise((r) => setTimeout(r, 60));
        }
      });
      await page.waitForLoadState('networkidle');
      await expectNoHorizontalOverflow(page);
      expect(await page.evaluate(() => [...document.images].filter((i) => i.complete && i.naturalWidth === 0).length)).toBe(0);
    }
  });

  test('layout adapts: three columns on desktop, buy box below the details on smaller screens', async ({ page, request }) => {
    const { rich: p } = await catalog(request);
    await page.goto(`/products/${p.id}`);
    const gallery = (await page.getByTestId('gallery').boundingBox())!;
    const info = (await title(page).boundingBox())!;
    const buy = (await buyBox(page).boundingBox())!;
    const width = page.viewportSize()!.width;

    if (width >= 1024) {
      expect(info.x).toBeGreaterThan(gallery.x + gallery.width - 5); // info right of the gallery
      expect(buy.x).toBeGreaterThan(info.x + info.width - 5); // buy box right of the info
    } else if (width >= 768) {
      expect(info.x).toBeGreaterThan(gallery.x + gallery.width - 5); // two columns
      expect(buy.y).toBeGreaterThan(info.y); // buy box underneath
    } else {
      expect(Math.abs(gallery.x - info.x), 'single column').toBeLessThan(24);
      expect(info.y, 'title sits above the gallery on phones').toBeLessThan(gallery.y);
      expect(buy.y).toBeGreaterThan(gallery.y);
    }
  });

  test('swiping the gallery on touch devices changes the image', async ({ browser, request }) => {
    const { rich: p } = await catalog(request);
    const context = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true });
    const page = await context.newPage();
    await page.route(/images\.unsplash\.com|covers\.openlibrary\.org/, (route) => route.fulfill({ status: 200, contentType: 'image/png', body: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64') }));
    await page.goto(`/products/${p.id}`);
    await expect(mainImage(page)).toHaveAttribute('src', new RegExp(imageId(p.images[0])));
    // Synthesize a leftward swipe on the main image.
    await page.getByTestId('gallery').locator('div.relative').first().evaluate((el) => {
      const touch = (type: string, x: number) => {
        const t = new Touch({ identifier: 1, target: el, clientX: x, clientY: 100 });
        el.dispatchEvent(new TouchEvent(type, { touches: type === 'touchend' ? [] : [t], changedTouches: [t], bubbles: true }));
      };
      touch('touchstart', 300);
      touch('touchend', 120);
    });
    await expect(mainImage(page)).toHaveAttribute('src', new RegExp(imageId(p.images[1])));
    await context.close();
  });
});
