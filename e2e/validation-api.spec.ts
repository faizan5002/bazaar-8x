import type { APIRequestContext, APIResponse } from '@playwright/test';
import { expect, test } from './fixtures';
import { API, createShopper, type Shopper } from './helpers';

/**
 * The demand-validation API, tested directly: seller accounts, creating and listing validations, answering them,
 * seller-only results, the analytics maths, and what must never leak. Viewport-independent, so it runs once.
 */
test.beforeEach(({}, testInfo) => test.skip(testInfo.project.name !== 'desktop', 'API-level tests run once'));
test.use({ allowErrors: true }); // many of these assert on 4xx responses

const bearer = (s: Shopper | null) => (s ? { authorization: `Bearer ${s.token}` } : {});
const unique = () => `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
const monthsFromNow = (n: number) => {
  const d = new Date();
  d.setMonth(d.getMonth() + n);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
};
const text = async (res: APIResponse) => [(await res.json()).message].flat().join(' ');

async function categoryId(request: APIRequestContext, slug = 'fashion') {
  const all: { id: number; slug: string }[] = await (await request.get(`${API}/categories`)).json();
  return all.find((c) => c.slug === slug)!.id;
}

const validBody = (categoryId: number, over: Record<string, unknown> = {}) => ({
  title: `Test Idea ${unique()}`,
  tagline: 'A test of whether anyone wants this',
  description: 'A product idea created by the automated tests to exercise the demand validation API.',
  categoryId,
  images: ['https://images.unsplash.com/photo-1553062407-98eeb64c6a62?w=800'],
  features: ['Feature one', 'Feature two', 'Feature three'],
  priceMin: 79,
  priceMax: 99,
  expectedLaunch: monthsFromNow(2),
  ...over,
});

/** A shopper who has opened a store. */
async function seller(request: APIRequestContext, label = 'store') {
  const owner = await createShopper(request, label);
  const res = await request.post(`${API}/sellers`, { headers: bearer(owner), data: { name: `E2E ${label} ${unique()}`, description: 'A store created by the tests' } });
  expect(res.status(), await res.text()).toBe(201);
  return { owner, store: await res.json() };
}

async function createValidation(request: APIRequestContext, owner: Shopper, over: Record<string, unknown> = {}) {
  const res = await request.post(`${API}/seller/validations`, { headers: bearer(owner), data: validBody(await categoryId(request), over) });
  expect(res.status(), await res.text()).toBe(201);
  return res.json();
}

const respond = (request: APIRequestContext, who: Shopper | null, id: number, data: unknown) => request.put(`${API}/validations/${id}/response`, { headers: bearer(who), data: data as object });

// ---- seller accounts & /auth/me ------------------------------------------------------------------------------------

test.describe('seller accounts', () => {
  test('a user opens one store; /auth/me and login report it (public fields only); a second store is refused', async ({ request }) => {
    const user = await createShopper(request, 'become-seller');
    const me = () => request.get(`${API}/auth/me`, { headers: bearer(user) }).then((r) => r.json());
    expect(await me(), 'a shopper has no seller').toMatchObject({ email: user.email, seller: null });

    const created = await request.post(`${API}/sellers`, { headers: bearer(user), data: { name: 'Brightside Bags', description: 'Bags, brightly.' } });
    expect(created.status()).toBe(201);
    const store = await created.json();
    expect(store).toMatchObject({ name: 'Brightside Bags', description: 'Bags, brightly.', rating: 0 });
    expect(store.slug).toMatch(/^brightside-bags/);
    expect(Object.keys(store).sort(), 'no owner or user fields on the response').toEqual(['createdAt', 'description', 'id', 'name', 'rating', 'slug']);

    expect((await me()).seller).toEqual({ id: store.id, name: store.name, slug: store.slug });
    const login = await (await request.post(`${API}/auth/login`, { data: { email: user.email, password: user.password } })).json();
    expect(login.user.seller).toEqual({ id: store.id, name: store.name, slug: store.slug });
    expect(Object.keys(login.user).sort()).toEqual(['email', 'id', 'name', 'seller']);

    const again = await request.post(`${API}/sellers`, { headers: bearer(user), data: { name: 'Another Store' } });
    expect(again.status()).toBe(409);
    expect(await text(again)).toContain('already have a seller account');
  });

  test('registering reports seller:null; the seeded demo sellers log in as sellers', async ({ request }) => {
    const reg = await request.post(`${API}/auth/register`, { data: { name: 'Reg Tester', email: `reg-${unique()}@e2e.bazaar.test`, password: 'RegTest12345!' } });
    expect((await reg.json()).user.seller).toBeNull();

    const login = await (await request.post(`${API}/auth/login`, { data: { email: 'seller@seed.bazaar.test', password: 'DemoPass123!' } })).json();
    expect(login.user.seller).toMatchObject({ name: 'Trailmate Travel Gear', slug: 'trailmate-travel-gear' });
  });

  test('needs sign-in, a valid name, and nothing else can be set', async ({ request }) => {
    expect((await request.post(`${API}/sellers`, { data: { name: 'No Token' } })).status()).toBe(401);
    const user = await createShopper(request, 'seller-validation');
    for (const [name, data] of [['too short', { name: 'A' }], ['missing', {}], ['too long', { name: 'x'.repeat(61) }], ['description too long', { name: 'Fine Name', description: 'x'.repeat(501) }], ['extra field', { name: 'Fine Name', ownerId: 1 }], ['rating smuggled in', { name: 'Fine Name', rating: 5 }]] as const) {
      expect((await request.post(`${API}/sellers`, { headers: bearer(user), data })).status(), name).toBe(400);
    }
    expect((await request.get(`${API}/auth/me`, { headers: bearer(user) }).then((r) => r.json())).seller, 'none of those created a store').toBeNull();
  });

  test("simultaneous requests can't give one user two stores", async ({ request }) => {
    const user = await createShopper(request, 'seller-race');
    const results = await Promise.all(Array.from({ length: 4 }, (_, i) => request.post(`${API}/sellers`, { headers: bearer(user), data: { name: `Race Store ${i}` } })));
    expect(results.map((r) => r.status()).sort()).toEqual([201, 409, 409, 409]);
  });

  test('stores with the same name get distinct addresses', async ({ request }) => {
    const [a, b] = [await createShopper(request, 'twin-a'), await createShopper(request, 'twin-b')];
    const name = `Twin Store ${unique()}`;
    const first = await (await request.post(`${API}/sellers`, { headers: bearer(a), data: { name } })).json();
    const second = await (await request.post(`${API}/sellers`, { headers: bearer(b), data: { name } })).json();
    expect(first.slug).not.toBe(second.slug);
  });
});

// ---- creating validations ------------------------------------------------------------------------------------------

test.describe('creating a validation', () => {
  test('a seller creates one: it is open, empty, owned by their own store, with generated price buckets', async ({ request }) => {
    const { owner, store } = await seller(request, 'create');
    const created = await createValidation(request, owner, { title: 'Collapsible Camp Kettle', features: ['Packs flat', 'Boils in 3 minutes', 'Dishwasher safe', 'Fits a stove'] });
    expect(created).toMatchObject({ title: 'Collapsible Camp Kettle', status: 'open', responseCount: 0, priceMin: 79, priceMax: 99 });
    expect(created.seller).toEqual({ id: store.id, name: store.name, slug: store.slug });
    expect(created.priceBuckets.map((b: { label: string }) => b.label)).toEqual(['Under $79', '$79–$86', '$86–$92', '$92–$99', 'Over $99']);
    expect(created.features).toHaveLength(4);
    expect(created.image).toContain('unsplash.com');

    const mine = (await (await request.get(`${API}/seller/validations`, { headers: bearer(owner) })).json()).items;
    expect(mine).toHaveLength(1);
    expect(mine[0]).toMatchObject({ id: created.id, title: 'Collapsible Camp Kettle', status: 'open', responseCount: 0, interestedPercent: 0, signal: { level: 'early', label: 'Too early to tell' } });
  });

  test('only a signed-in seller can create; the seller always comes from the account, never the request', async ({ request }) => {
    const cat = await categoryId(request);
    expect((await request.post(`${API}/seller/validations`, { data: validBody(cat) })).status()).toBe(401);

    const shopper = await createShopper(request, 'not-a-seller');
    const res = await request.post(`${API}/seller/validations`, { headers: bearer(shopper), data: validBody(cat) });
    expect(res.status()).toBe(403);
    expect(await text(res)).toContain('seller account');

    const { owner } = await seller(request, 'spoof');
    const other = await seller(request, 'victim');
    for (const extra of [{ sellerId: other.store.id }, { seller: other.store.id }, { status: 'closed' }, { id: 5 }, { responseCount: 9999 }]) {
      const spoofed = await request.post(`${API}/seller/validations`, { headers: bearer(owner), data: validBody(cat, extra) });
      expect(spoofed.status(), JSON.stringify(extra)).toBe(400);
    }
    expect((await (await request.get(`${API}/seller/validations`, { headers: bearer(other.owner) })).json()).items, "nothing was created in the other seller's name").toHaveLength(0);
  });

  test('input validation: every rule in the brief', async ({ request }) => {
    const { owner } = await seller(request, 'rules');
    const cat = await categoryId(request);
    const post = (over: Record<string, unknown>, drop: string[] = []) => {
      const data: Record<string, unknown> = validBody(cat, over);
      for (const key of drop) delete data[key];
      return request.post(`${API}/seller/validations`, { headers: bearer(owner), data });
    };
    const bad: [string, Record<string, unknown>, string[]][] = [
      ['title missing', {}, ['title']],
      ['title blank', { title: '   ' }, []],
      ['description missing', {}, ['description']],
      ['description too short', { description: 'short' }, []],
      ['tagline missing', {}, ['tagline']],
      ['category missing', {}, ['categoryId']],
      ['category does not exist', { categoryId: 999999 }, []],
      ['category not a number', { categoryId: 'fashion' }, []],
      ['2 features', { features: ['One', 'Two'] }, []],
      ['7 features', { features: ['1 a', '2 b', '3 c', '4 d', '5 e', '6 f', '7 g'] }, []],
      ['duplicate features (case-insensitive)', { features: ['Waterproof', 'waterproof', 'Light'] }, []],
      ['blank feature', { features: ['Good', 'Also good', ' '] }, []],
      ['features not an array', { features: 'Waterproof' }, []],
      ['priceMin 0', { priceMin: 0 }, []],
      ['priceMin negative', { priceMin: -5 }, []],
      ['priceMax below priceMin', { priceMin: 99, priceMax: 79 }, []],
      ['price with 3 decimals', { priceMin: 9.999 }, []],
      ['price not a number', { priceMin: 'cheap' }, []],
      ['launch month wrong format', { expectedLaunch: 'December' }, []],
      ['launch month 13', { expectedLaunch: '2027-13' }, []],
      ['launch month full date', { expectedLaunch: '2027-01-15' }, []],
      ['launch month in the past', { expectedLaunch: '2020-01' }, []],
      ['launch month too far away', { expectedLaunch: monthsFromNow(48) }, []],
      ['image is not a URL', { images: ['not a url'] }, []],
      ['image is a javascript: URL', { images: ['javascript:alert(1)'] }, []],
      ['6 images', { images: Array.from({ length: 6 }, (_, i) => `https://example.com/${i}.jpg`) }, []],
    ];
    for (const [name, over, drop] of bad) expect((await post(over, drop)).status(), name).toBe(400);

    // …and the boundaries that ARE allowed.
    expect((await post({ features: ['One', 'Two', 'Three'], priceMin: 0.01, priceMax: 0.01, expectedLaunch: monthsFromNow(0), images: [] })).status(), 'minimum 3 features, equal prices, this month, no images').toBe(201);
    expect((await post({ features: ['1 a', '2 b', '3 c', '4 d', '5 e', '6 f'], expectedLaunch: monthsFromNow(36) })).status(), 'maximum 6 features, 36 months ahead').toBe(201);
    expect((await post({}, ['images'])).status(), 'images are optional').toBe(201);
    const messages = await text(await post({ priceMin: 99, priceMax: 79 }));
    expect(messages).toContain('priceMax must be greater than or equal to priceMin');
  });
});

// ---- the public marketplace API --------------------------------------------------------------------------------------

test.describe('browsing validations', () => {
  test('the list shows open validations only, with everything a card needs', async ({ request }) => {
    // Most responses first: the seeded flagship leads however many throwaway tests other suites have created.
    const res = await request.get(`${API}/validations?sort=popular&limit=50`);
    const body = await res.json();
    expect(body).toMatchObject({ page: 1, limit: 50 });
    expect(body.items.length).toBeGreaterThanOrEqual(4);
    expect(body.items.every((v: { status: string }) => v.status === 'open')).toBe(true);
    expect(body.items.map((v: { title: string }) => v.title), 'the seeded closed one is hidden').not.toContain('Smart Plant Pot');

    const flagship = body.items.find((v: { title: string }) => v.title === 'Smart Travel Backpack');
    expect(flagship).toMatchObject({ tagline: 'A smarter carry-on built for modern travelers', priceMin: 79, priceMax: 99, expectedLaunch: '2026-12' });
    expect(flagship.responseCount, 'the 1,284 seeded shoppers, plus any real ones who have answered since').toBeGreaterThanOrEqual(1284);
    expect(Object.keys(flagship).sort()).toEqual(['category', 'createdAt', 'expectedLaunch', 'id', 'image', 'priceMax', 'priceMin', 'responseCount', 'seller', 'status', 'tagline', 'title']);
    expect(flagship.seller).toEqual({ id: expect.any(Number), name: 'Trailmate Travel Gear', slug: 'trailmate-travel-gear' });
    expect(flagship.category).toEqual({ id: expect.any(Number), name: 'Fashion', slug: 'fashion' });
    expect(flagship.image).toContain('https://');
  });

  test('sorting: popular = most responses first; newest = latest first', async ({ request }) => {
    const popular = (await (await request.get(`${API}/validations?sort=popular&limit=50`)).json()).items;
    const counts = popular.map((v: { responseCount: number }) => v.responseCount);
    expect(counts).toEqual([...counts].sort((a, b) => b - a));
    expect(popular[0].title).toBe('Smart Travel Backpack');

    const newest = (await (await request.get(`${API}/validations?sort=newest&limit=50`)).json()).items;
    const times = newest.map((v: { createdAt: string }) => v.createdAt);
    expect(times).toEqual([...times].sort().reverse());

    // A fresh validation appears first under "newest" and last under "popular" (no responses yet).
    const { owner } = await seller(request, 'sorting');
    const fresh = await createValidation(request, owner, { title: `Brand New ${unique()}` });
    expect((await (await request.get(`${API}/validations?sort=newest`)).json()).items[0].id).toBe(fresh.id);
    const firstPage = await (await request.get(`${API}/validations?sort=popular&limit=50`)).json();
    const lastPage = (await (await request.get(`${API}/validations?sort=popular&limit=50&page=${firstPage.totalPages}`)).json()).items;
    expect(lastPage.at(-1).responseCount).toBe(0);
  });

  test('category filter, pagination and bad parameters', async ({ request }) => {
    const fashion = await (await request.get(`${API}/validations?category=fashion&sort=popular&limit=50`)).json();
    expect(fashion.items.length).toBeGreaterThan(0);
    expect(fashion.items.every((v: { category: { slug: string } }) => v.category.slug === 'fashion')).toBe(true);
    expect(fashion.items.map((v: { title: string }) => v.title)).toContain('Smart Travel Backpack');
    expect((await (await request.get(`${API}/validations?category=no-such-category`)).json()).total, 'unknown category: empty, not an error').toBe(0);

    const all = await (await request.get(`${API}/validations?limit=50`)).json();
    const page1 = await (await request.get(`${API}/validations?limit=2&page=1&sort=popular`)).json();
    const page2 = await (await request.get(`${API}/validations?limit=2&page=2&sort=popular`)).json();
    expect(page1.total).toBe(all.total);
    expect(page1.totalPages).toBe(Math.ceil(all.total / 2));
    expect(page1.items).toHaveLength(2);
    expect(page2.items.map((v: { id: number }) => v.id), 'pages do not overlap').not.toEqual(expect.arrayContaining([page1.items[0].id]));

    for (const qs of ['sort=bogus', 'limit=0', 'limit=51', 'page=0', 'category=BAD CAT!', 'foo=bar']) {
      expect((await request.get(`${API}/validations?${qs}`)).status(), qs).toBe(400);
    }
  });

  test('detail: complete, with price buckets from the shared function; no voters; closed ones still readable', async ({ request }) => {
    const list = (await (await request.get(`${API}/validations?sort=popular&limit=50`)).json()).items;
    const id = list.find((v: { title: string }) => v.title === 'Smart Travel Backpack').id;
    const d = await (await request.get(`${API}/validations/${id}`)).json();
    expect(d).toMatchObject({ id, title: 'Smart Travel Backpack', status: 'open', expectedLaunch: '2026-12', priceMin: 79, priceMax: 99 });
    expect(d.responseCount).toBeGreaterThanOrEqual(1284);
    expect(d.features).toEqual(['USB-C charging', 'Waterproof', 'Anti-theft design', 'Laptop protection', 'Expandable storage']);
    expect(d.description.length).toBeGreaterThan(50);
    expect(d.images.length).toBeGreaterThanOrEqual(2);
    expect(d.priceBuckets.map((b: { label: string }) => b.label)).toEqual(['Under $79', '$79–$86', '$86–$92', '$92–$99', 'Over $99']);
    expect(d.seller).toEqual({ id: expect.any(Number), name: 'Trailmate Travel Gear', slug: 'trailmate-travel-gear' });
    const raw = JSON.stringify(d);
    for (const leak of ['userId', 'voter', '@seed.bazaar.test', 'passwordHash', 'ownerId', '"owner"']) expect(raw, `detail must not contain ${leak}`).not.toContain(leak);

    // A closed validation can still be opened by its link (old shares keep working) and says it is closed.
    const closedId = (await (await request.post(`${API}/auth/login`, { data: { email: 'maker@seed.bazaar.test', password: 'DemoPass123!' } })).json()).accessToken;
    const mine = (await (await request.get(`${API}/seller/validations`, { headers: { authorization: `Bearer ${closedId}` } })).json()).items;
    const plant = mine.find((v: { title: string }) => v.title === 'Smart Plant Pot');
    expect((await (await request.get(`${API}/validations/${plant.id}`)).json()).status).toBe('closed');
  });

  test('bad ids: 400 for non-numeric, 404 for missing', async ({ request }) => {
    expect((await request.get(`${API}/validations/abc`)).status()).toBe(400);
    expect((await request.get(`${API}/validations/999999`)).status()).toBe(404);
    expect((await request.get(`${API}/validations/0`)).status()).toBe(404);
  });
});

// ---- answering -------------------------------------------------------------------------------------------------------

test.describe('responding', () => {
  test('sign-in is required, for reading your answer and for giving one', async ({ request }) => {
    const { owner } = await seller(request, 'auth-needed');
    const v = await createValidation(request, owner);
    expect((await request.get(`${API}/validations/${v.id}/response`)).status()).toBe(401);
    expect((await respond(request, null, v.id, { interest: 'interested' })).status()).toBe(401);
    expect((await request.put(`${API}/validations/${v.id}/response`, { headers: { authorization: 'Bearer bogus' }, data: { interest: 'maybe' } })).status()).toBe(401);
    expect((await (await request.get(`${API}/validations/${v.id}`)).json()).responseCount, 'unauthenticated attempts counted for nothing').toBe(0);
  });

  test('first answer creates; answering again changes it (never a second row); the count only counts people', async ({ request }) => {
    const { owner } = await seller(request, 'one-vote');
    const v = await createValidation(request, owner);
    const shopper = await createShopper(request, 'voter');
    const mine = () => request.get(`${API}/validations/${v.id}/response`, { headers: bearer(shopper) }).then((r) => r.json());

    expect(await mine(), 'before answering').toEqual({ response: null });

    let res = await respond(request, shopper, v.id, { interest: 'interested', priceBucket: 2, topFeature: 'Feature two' });
    expect(res.status()).toBe(200);
    let body = await res.json();
    expect(body).toMatchObject({ created: true, responseCount: 1, response: { interest: 'interested', priceBucket: 2, topFeature: 'Feature two' } });
    expect(Object.keys(body.response).sort(), 'only the answer itself: no user or ids').toEqual(['createdAt', 'interest', 'priceBucket', 'topFeature', 'updatedAt']);
    expect((await mine()).response).toMatchObject({ interest: 'interested', priceBucket: 2, topFeature: 'Feature two' });

    res = await respond(request, shopper, v.id, { interest: 'maybe', priceBucket: 3, topFeature: 'Feature one' });
    body = await res.json();
    expect(body).toMatchObject({ created: false, responseCount: 1, response: { interest: 'maybe', priceBucket: 3, topFeature: 'Feature one' } });
    expect(new Date(body.response.updatedAt).getTime()).toBeGreaterThanOrEqual(new Date(body.response.createdAt).getTime());

    // Skipping the optional parts on a later answer clears them rather than keeping stale ones.
    body = await (await respond(request, shopper, v.id, { interest: 'interested' })).json();
    expect(body.response).toMatchObject({ interest: 'interested', priceBucket: null, topFeature: null });
    expect((await (await request.get(`${API}/validations/${v.id}`)).json()).responseCount).toBe(1);
  });

  test('simultaneous answers from one person still leave exactly one response', async ({ request }) => {
    const { owner } = await seller(request, 'race-vote');
    const v = await createValidation(request, owner);
    const shopper = await createShopper(request, 'double-clicker');
    const results = await Promise.all(['interested', 'maybe', 'not_interested', 'interested', 'maybe'].map((interest) => respond(request, shopper, v.id, { interest })));
    expect(results.every((r) => r.status() === 200), results.map((r) => r.status()).join()).toBe(true);
    expect((await (await request.get(`${API}/validations/${v.id}`)).json()).responseCount).toBe(1);
  });

  test('"not interested" stores no price or feature (they are cleared, whatever is sent)', async ({ request }) => {
    const { owner } = await seller(request, 'no-vote');
    const v = await createValidation(request, owner);
    const shopper = await createShopper(request, 'decliner');
    await respond(request, shopper, v.id, { interest: 'interested', priceBucket: 1, topFeature: 'Feature one' });
    const res = await respond(request, shopper, v.id, { interest: 'not_interested', priceBucket: 3, topFeature: 'Feature three' });
    expect(res.status()).toBe(200);
    expect((await res.json()).response).toMatchObject({ interest: 'not_interested', priceBucket: null, topFeature: null });
  });

  test('invalid answers are rejected with a clean 400 and change nothing', async ({ request }) => {
    const { owner } = await seller(request, 'bad-vote');
    const v = await createValidation(request, owner);
    const shopper = await createShopper(request, 'sloppy');
    await respond(request, shopper, v.id, { interest: 'interested', priceBucket: 1, topFeature: 'Feature one' });
    const bad: [string, unknown][] = [
      ['no interest', {}],
      ['unknown interest', { interest: 'definitely' }],
      ['interest in the wrong case', { interest: 'Interested' }],
      ['price bucket 5', { interest: 'interested', priceBucket: 5 }],
      ['price bucket -1', { interest: 'interested', priceBucket: -1 }],
      ['price bucket 1.5', { interest: 'interested', priceBucket: 1.5 }],
      ['price bucket as text', { interest: 'interested', priceBucket: 'cheap' }],
      ['feature that is not on the list', { interest: 'interested', topFeature: 'Free unicorn' }],
      ['feature in the wrong case', { interest: 'interested', topFeature: 'feature one' }],
      ['feature blank', { interest: 'maybe', topFeature: '' }],
      ['unknown field', { interest: 'interested', userId: 1 }],
      ['someone else smuggled in', { interest: 'interested', user: 1, validation: 2 }],
    ];
    for (const [name, data] of bad) expect((await respond(request, shopper, v.id, data)).status(), name).toBe(400);
    expect((await (await request.get(`${API}/validations/${v.id}/response`, { headers: bearer(shopper) })).json()).response, 'the earlier answer survived all of that').toMatchObject({ interest: 'interested', priceBucket: 1, topFeature: 'Feature one' });
  });

  test('missing validation → 404 (and a malformed id → 400)', async ({ request }) => {
    const shopper = await createShopper(request, 'lost');
    expect((await respond(request, shopper, 999999, { interest: 'interested' })).status()).toBe(404);
    expect((await request.get(`${API}/validations/999999/response`, { headers: bearer(shopper) })).status()).toBe(404);
    expect((await request.put(`${API}/validations/abc/response`, { headers: bearer(shopper), data: { interest: 'interested' } })).status()).toBe(400);
  });

  test("a seller can't answer their own validation (403), but can answer someone else's", async ({ request }) => {
    const a = await seller(request, 'self-vote-a');
    const b = await seller(request, 'self-vote-b');
    const mine = await createValidation(request, a.owner);
    const theirs = await createValidation(request, b.owner);

    const refused = await respond(request, a.owner, mine.id, { interest: 'interested' });
    expect(refused.status()).toBe(403);
    expect(await text(refused)).toContain('your own validation');
    expect((await (await request.get(`${API}/validations/${mine.id}`)).json()).responseCount).toBe(0);

    expect((await respond(request, a.owner, theirs.id, { interest: 'interested' })).status(), "sellers are shoppers on other people's ideas").toBe(200);
  });

  test('a closed validation rejects answers (409) until it is reopened', async ({ request }) => {
    const { owner } = await seller(request, 'closing');
    const v = await createValidation(request, owner);
    const shopper = await createShopper(request, 'late');
    expect((await respond(request, shopper, v.id, { interest: 'interested' })).status()).toBe(200);

    const closed = await request.patch(`${API}/seller/validations/${v.id}`, { headers: bearer(owner), data: { status: 'closed' } });
    expect(closed.status()).toBe(200);
    expect((await closed.json()).status).toBe('closed');

    const late = await createShopper(request, 'too-late');
    const refused = await respond(request, late, v.id, { interest: 'interested' });
    expect(refused.status()).toBe(409);
    expect(await text(refused)).toContain('closed');
    expect((await respond(request, shopper, v.id, { interest: 'maybe' })).status(), 'even someone who already answered cannot change it').toBe(409);
    expect((await (await request.get(`${API}/validations/${v.id}`)).json()).responseCount).toBe(1);
    expect((await (await request.get(`${API}/validations?limit=50`)).json()).items.map((x: { id: number }) => x.id), 'hidden from the marketplace list').not.toContain(v.id);

    await request.patch(`${API}/seller/validations/${v.id}`, { headers: bearer(owner), data: { status: 'open' } });
    expect((await respond(request, late, v.id, { interest: 'interested' })).status(), 'reopened').toBe(200);
  });
});

// ---- seller-only results & status ------------------------------------------------------------------------------------

test.describe('seller access control', () => {
  test('results are owner-only: another seller 404, a shopper 403, nobody 401, the owner 200', async ({ request }) => {
    const owner = await seller(request, 'results-owner');
    const rival = await seller(request, 'results-rival');
    const shopper = await createShopper(request, 'results-shopper');
    const v = await createValidation(request, owner.owner);
    const url = `${API}/seller/validations/${v.id}/results`;

    expect((await request.get(url)).status()).toBe(401);
    expect((await request.get(url, { headers: bearer(shopper) })).status(), 'no seller account').toBe(403);
    expect((await request.get(url, { headers: bearer(rival.owner) })).status(), "someone else's validation looks like a missing one").toBe(404);
    const ok = await request.get(url, { headers: bearer(owner.owner) });
    expect(ok.status()).toBe(200);
    expect((await ok.json()).validation.id).toBe(v.id);
    expect((await request.get(`${API}/seller/validations/999999/results`, { headers: bearer(owner.owner) })).status()).toBe(404);
    expect((await request.get(`${API}/seller/validations/abc/results`, { headers: bearer(owner.owner) })).status()).toBe(400);
  });

  test("a seller's list holds only their own validations; only the owner can close or reopen", async ({ request }) => {
    const a = await seller(request, 'list-a');
    const b = await seller(request, 'list-b');
    const va = await createValidation(request, a.owner, { title: `Alpha ${unique()}` });
    const vb = await createValidation(request, b.owner, { title: `Beta ${unique()}` });

    const listA = (await (await request.get(`${API}/seller/validations`, { headers: bearer(a.owner) })).json()).items;
    expect(listA.map((x: { id: number }) => x.id)).toEqual([va.id]);
    expect((await (await request.get(`${API}/seller/validations`, { headers: bearer(b.owner) })).json()).items.map((x: { id: number }) => x.id)).toEqual([vb.id]);
    expect((await request.get(`${API}/seller/validations`)).status()).toBe(401);
    expect((await request.get(`${API}/seller/validations`, { headers: bearer(await createShopper(request, 'list-shopper')) })).status()).toBe(403);

    const patch = (who: Shopper | null, id: number, data: unknown) => request.patch(`${API}/seller/validations/${id}`, { headers: bearer(who), data: data as object });
    expect((await patch(b.owner, va.id, { status: 'closed' })).status(), "another seller can't close it").toBe(404);
    expect((await patch(null, va.id, { status: 'closed' })).status()).toBe(401);
    expect((await patch(await createShopper(request, 'patch-shopper'), va.id, { status: 'closed' })).status()).toBe(403);
    expect((await (await request.get(`${API}/validations/${va.id}`)).json()).status, 'still open after all those attempts').toBe('open');
    for (const data of [{ status: 'archived' }, {}, { status: 'closed', title: 'Renamed' }, { title: 'Renamed' }]) {
      expect((await patch(a.owner, va.id, data)).status(), JSON.stringify(data)).toBe(400); // only the status can change: no editing content
    }
    expect((await patch(a.owner, va.id, { status: 'closed' })).status()).toBe(200);
    expect((await patch(a.owner, va.id, { status: 'closed' })).status(), 'closing twice is harmless').toBe(200);
    expect((await (await patch(a.owner, va.id, { status: 'open' })).json()).status).toBe('open');
  });
});

// ---- analytics -------------------------------------------------------------------------------------------------------

test.describe('analytics', () => {
  test('the seeded flagship matches the brief: 1,284+ responses, 67% / 21% / 12%, strong signal', async ({ request }) => {
    const token = (await (await request.post(`${API}/auth/login`, { data: { email: 'seller@seed.bazaar.test', password: 'DemoPass123!' } })).json()).accessToken;
    const auth = { authorization: `Bearer ${token}` };
    const mine = (await (await request.get(`${API}/seller/validations`, { headers: auth })).json()).items;
    const flagship = mine.find((v: { title: string }) => v.title === 'Smart Travel Backpack');
    expect(flagship.responseCount).toBeGreaterThanOrEqual(1284); // 1,284 seeded; a real shopper answering adds to it, so only the floor is fixed
    expect(flagship).toMatchObject({ interestedPercent: 67, maybePercent: 21, notInterestedPercent: 12, signal: { level: 'strong', label: 'Strong demand signal', score: 77.5, reliable: true } });

    const r = await (await request.get(`${API}/seller/validations/${flagship.id}/results`, { headers: auth })).json();
    expect(r.totalResponses).toBeGreaterThanOrEqual(1284);
    expect(r.interest).toMatchObject({ interested: { percent: 67 }, maybe: { percent: 21 }, notInterested: { percent: 12 } });
    expect(r.interest.interested.count).toBeGreaterThanOrEqual(860);
    expect(r.interest.maybe.count).toBeGreaterThanOrEqual(270);
    expect(r.interest.notInterested.count).toBeGreaterThanOrEqual(154);
    expect(r.interest.interested.count + r.interest.maybe.count + r.interest.notInterested.count, 'the three add up to the total').toBe(r.totalResponses);
    expect(r.signal).toMatchObject({ score: 77.5, level: 'strong', label: 'Strong demand signal', total: r.totalResponses, minResponses: 30 });
    expect(r.validation).toMatchObject({ title: 'Smart Travel Backpack', status: 'open', priceMin: 79, priceMax: 99, category: { slug: 'fashion' } });

    // Price: all five buckets, zero-filled, the three answers consistent with each other.
    expect(r.priceBuckets.map((b: { label: string }) => b.label)).toEqual(['Under $79', '$79–$86', '$86–$92', '$92–$99', 'Over $99']);
    const priced = r.priceBuckets.reduce((n: number, b: { count: number }) => n + b.count, 0);
    expect(priced).toBe(r.priceAnswered);
    expect(r.priceAnswered).toBeGreaterThan(800); // most of the 1,130 interested/maybe answered
    expect(r.priceAnswered).toBeLessThanOrEqual(860 + 270); // "not interested" never carries a price
    expect(r.priceBuckets.reduce((n: number, b: { percent: number }) => n + b.percent, 0)).toBeCloseTo(100, 0);
    const sweetSpot = r.priceBuckets.reduce((best: { count: number }, b: { count: number }) => (b.count > best.count ? b : best));
    expect(r.insights.preferredPrice).toMatchObject({ index: sweetSpot.index, label: '$86–$92', count: sweetSpot.count });
    expect(r.insights.pricePressure).toMatchObject({ bucket: { label: 'Under $79' }, flagged: false });

    // Features: every seller-listed feature, most-chosen first, USB-C on top.
    expect(r.features.map((f: { name: string }) => f.name).sort()).toEqual(['Anti-theft design', 'Expandable storage', 'Laptop protection', 'USB-C charging', 'Waterproof']);
    const counts = r.features.map((f: { count: number }) => f.count);
    expect(counts).toEqual([...counts].sort((a: number, b: number) => b - a));
    expect(r.features.reduce((n: number, f: { count: number }) => n + f.count, 0)).toBe(r.featureAnswered);
    expect(r.insights.topFeature).toMatchObject({ name: 'USB-C charging' });
    expect(r.features[0].percent).toBeGreaterThan(r.features[1].percent);
  });

  test('the other seeded validations show each kind of signal', async ({ request }) => {
    const login = async (email: string) => (await (await request.post(`${API}/auth/login`, { data: { email, password: 'DemoPass123!' } })).json()).accessToken;
    const maker = { authorization: `Bearer ${await login('maker@seed.bazaar.test')}` };
    const trail = { authorization: `Bearer ${await login('seller@seed.bazaar.test')}` };
    const byTitle = async (auth: object, title: string) => {
      const items = (await (await request.get(`${API}/seller/validations`, { headers: auth as Record<string, string> })).json()).items;
      return items.find((v: { title: string }) => v.title === title);
    };

    expect(await byTitle(maker, 'Self-Stirring Insulated Mug')).toMatchObject({ responseCount: 212, signal: { level: 'strong' } });
    expect(await byTitle(trail, 'Pocket-Fold Travel Yoga Mat')).toMatchObject({ responseCount: 96, signal: { level: 'moderate' } });
    expect(await byTitle(maker, 'Modular Desk Organizer System')).toMatchObject({ responseCount: 18, signal: { level: 'early', label: 'Too early to tell', reliable: false } });
    expect(await byTitle(maker, 'Smart Plant Pot')).toMatchObject({ status: 'closed', responseCount: 61, signal: { level: 'weak', label: 'Weak demand signal' } });

    // The mug is the "price pressure" example: many expect to pay under the proposed minimum.
    const mug = await byTitle(maker, 'Self-Stirring Insulated Mug');
    const r = await (await request.get(`${API}/seller/validations/${mug.id}/results`, { headers: maker as Record<string, string> })).json();
    expect(r.insights.pricePressure).toMatchObject({ flagged: true, bucket: { label: 'Under $24' } });
    expect(r.insights.pricePressure.percent).toBeGreaterThanOrEqual(25);
  });

  test('a fresh validation: exact counts, percentages, sweet spot and top feature from known answers', async ({ request }) => {
    const { owner } = await seller(request, 'maths');
    const v = await createValidation(request, owner, { features: ['Alpha', 'Beta', 'Gamma'], priceMin: 40, priceMax: 70 }); // buckets: Under $40 | $40–$50 | $50–$60 | $60–$70 | Over $70
    const empty = await (await request.get(`${API}/seller/validations/${v.id}/results`, { headers: bearer(owner) })).json();
    expect(empty).toMatchObject({ totalResponses: 0, signal: { score: 0, level: 'early' }, priceAnswered: 0, featureAnswered: 0, insights: { preferredPrice: null, topFeature: null } });
    expect(empty.priceBuckets).toHaveLength(5);
    expect(empty.features.map((f: { name: string }) => f.name)).toEqual(['Alpha', 'Beta', 'Gamma']); // zero-filled, original order
    expect(empty.priceBuckets.map((b: { label: string }) => b.label)).toEqual(['Under $40', '$40–$50', '$50–$60', '$60–$70', 'Over $70']);

    // 32 shoppers: 20 interested, 8 maybe, 4 not (62.5 / 25 / 12.5 → score 75 → strong).
    const script: { interest: string; priceBucket?: number; topFeature?: string }[] = [
      ...Array.from({ length: 20 }, (_, i) => ({ interest: 'interested', priceBucket: i < 9 ? 2 : i < 14 ? 1 : i < 17 ? 3 : i < 19 ? 0 : undefined, topFeature: i < 11 ? 'Alpha' : i < 17 ? 'Beta' : i < 19 ? 'Gamma' : undefined })),
      ...Array.from({ length: 8 }, (_, i) => ({ interest: 'maybe', priceBucket: i < 4 ? 2 : i < 6 ? 1 : undefined, topFeature: i < 3 ? 'Alpha' : i < 5 ? 'Beta' : undefined })),
      ...Array.from({ length: 4 }, () => ({ interest: 'not_interested', priceBucket: 4, topFeature: 'Gamma' })), // must be ignored
    ];
    const voters = await Promise.all(script.map((_, i) => createShopper(request, `m${i}`)));
    const results = await Promise.all(script.map((answer, i) => respond(request, voters[i], v.id, answer)));
    expect(results.every((x) => x.status() === 200)).toBe(true);

    const r = await (await request.get(`${API}/seller/validations/${v.id}/results`, { headers: bearer(owner) })).json();
    expect(r.totalResponses).toBe(32);
    expect(r.interest).toEqual({ interested: { count: 20, percent: 62.5 }, maybe: { count: 8, percent: 25 }, notInterested: { count: 4, percent: 12.5 } });
    expect(r.signal).toMatchObject({ score: 75, level: 'strong', label: 'Strong demand signal', reliable: true });

    // Price: bucket 2 = 9 + 4 = 13, bucket 1 = 5 + 2 = 7, bucket 3 = 3, bucket 0 = 2, bucket 4 = 0 (the "not interested" 4s were dropped). Answered = 25.
    expect(r.priceBuckets.map((b: { count: number }) => b.count)).toEqual([2, 7, 13, 3, 0]);
    expect(r.priceAnswered).toBe(25);
    expect(r.priceBuckets.map((b: { percent: number }) => b.percent)).toEqual([8, 28, 52, 12, 0]);
    expect(r.priceBuckets[2].percentOfResponses).toBe(40.6); // 13 of 32
    expect(r.insights.preferredPrice).toMatchObject({ index: 2, label: '$50–$60', count: 13, percent: 52 });
    expect(r.insights.pricePressure).toMatchObject({ count: 2, percent: 8, flagged: false });
    expect(r.insights.priceHeadroom).toMatchObject({ count: 0, flagged: false });

    // Features: Alpha = 11 + 3 = 14, Beta = 6 + 2 = 8, Gamma = 2 (not-interested Gammas dropped). Answered = 24.
    expect(r.features.map((f: { name: string; count: number }) => [f.name, f.count])).toEqual([['Alpha', 14], ['Beta', 8], ['Gamma', 2]]);
    expect(r.featureAnswered).toBe(24);
    expect(r.features[0]).toMatchObject({ name: 'Alpha', percent: 58.3, percentOfResponses: 43.8 });
    expect(r.insights.topFeature).toMatchObject({ name: 'Alpha', count: 14 });

    // Changing an answer moves the numbers (and only once).
    await respond(request, voters[0], v.id, { interest: 'not_interested' });
    const after = await (await request.get(`${API}/seller/validations/${v.id}/results`, { headers: bearer(owner) })).json();
    expect(after.totalResponses).toBe(32);
    expect(after.interest.interested.count).toBe(19);
    expect(after.interest.notInterested.count).toBe(5);
    expect(after.priceBuckets[2].count, 'voter 0 had chosen bucket 2').toBe(12);
    expect(after.features[0].count, 'voter 0 had chosen Alpha').toBe(13);
  });

  test('price pressure and headroom flag only with enough answers', async ({ request }) => {
    const { owner } = await seller(request, 'pressure');
    const v = await createValidation(request, owner, { priceMin: 20, priceMax: 30 });
    // 12 answers, 6 of them "Under": 50% but over the minimum of 10 answers → flagged. Highest bucket 3 of 12 = 25% → flagged too.
    const buckets = [0, 0, 0, 0, 0, 0, 4, 4, 4, 2, 2, 1];
    const voters = await Promise.all(buckets.map((_, i) => createShopper(request, `p${i}`)));
    await Promise.all(buckets.map((priceBucket, i) => respond(request, voters[i], v.id, { interest: 'interested', priceBucket })));
    const r = await (await request.get(`${API}/seller/validations/${v.id}/results`, { headers: bearer(owner) })).json();
    expect(r.insights.pricePressure).toMatchObject({ count: 6, percent: 50, flagged: true });
    expect(r.insights.priceHeadroom).toMatchObject({ count: 3, percent: 25, flagged: true });
    expect(r.signal, 'only 12 responses: too early for a verdict').toMatchObject({ level: 'early', reliable: false });

    const few = await createValidation(request, owner, { priceMin: 20, priceMax: 30 });
    const three = await Promise.all([0, 1, 2].map((i) => createShopper(request, `few${i}`)));
    await Promise.all(three.map((s) => respond(request, s, few.id, { interest: 'interested', priceBucket: 0 })));
    const small = await (await request.get(`${API}/seller/validations/${few.id}/results`, { headers: bearer(owner) })).json();
    expect(small.insights.pricePressure, '100% under, but only 3 answers: not enough to raise a flag').toMatchObject({ percent: 100, flagged: false });
  });
});

// ---- privacy ---------------------------------------------------------------------------------------------------------

test.describe('privacy and leaks', () => {
  test('no response, listing or results payload reveals who voted or who owns a store', async ({ request }) => {
    const { owner } = await seller(request, 'privacy');
    const v = await createValidation(request, owner);
    const voter = await createShopper(request, 'private-voter');
    const put = await (await respond(request, voter, v.id, { interest: 'interested', priceBucket: 1, topFeature: 'Feature one' })).text();
    const payloads = [
      put,
      await (await request.get(`${API}/validations/${v.id}`)).text(),
      await (await request.get(`${API}/validations?limit=50`)).text(),
      await (await request.get(`${API}/seller/validations/${v.id}/results`, { headers: bearer(owner) })).text(),
      await (await request.get(`${API}/seller/validations`, { headers: bearer(owner) })).text(),
    ];
    for (const body of payloads) {
      for (const secret of [voter.email, voter.name, owner.email, 'passwordHash', 'ownerId', '"owner"', '"userId"', 'voter-0']) expect(body).not.toContain(secret);
    }
  });

  test('the public seller objects on products carry no owner either', async ({ request }) => {
    const product = (await (await request.get(`${API}/products?limit=1`)).json()).items[0];
    expect(Object.keys(product.seller).sort()).toEqual(['createdAt', 'description', 'id', 'name', 'rating', 'slug']);
  });
});
