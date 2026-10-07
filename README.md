# Bazaar — Amazon-inspired marketplace (MVP)

React + TypeScript frontend, NestJS + TypeORM + PostgreSQL backend, REST API.

```
backend/   NestJS API  (modules: users, auth, sellers, categories, products, reviews, cart, orders)
frontend/  React app   (Vite, React Router, Tailwind CSS v4)
```

## Run locally

1. Create the database: `CREATE DATABASE marketplace;`
2. `cp backend/.env.example backend/.env` and set `DB_USERNAME` / `DB_PASSWORD` (`.env` is gitignored; never commit it).
3. Install, seed and start:

```bash
cd backend  && npm install
npm run seed                 # creates tables if needed and loads the demo catalog (safe to re-run)
npm run start:dev            # API on http://localhost:3001/api

cd ../frontend && npm install && npm run dev   # http://localhost:5173 (proxies /api to :3001)
```

The API runs on port **3001** (3000 is commonly taken by other local apps). Change `PORT` in `backend/.env` and the
proxy target in `frontend/vite.config.ts` together if you need a different port.

Health check: `GET /api/health`. In non-production the schema is created from the entities (`synchronize`);
switch to migrations before deploying.

## Seed data

`npm run seed` (from `backend/`, or `npm run seed` from the repo root) loads a realistic dev catalog:
8 categories, 6 sellers, 59 products (variants, specs, multiple images, deals, a few average-rated and one
out-of-stock item), 118 sample reviews and 11 accounts.

- **Repeatable:** records are matched by natural key (slug / email) and updated in place, so re-running never
  duplicates anything. Everything runs in one transaction.
- **Separate from the app:** the seeder is its own Nest module (`src/database/seed`) that `AppModule` never
  imports, and it refuses to run with `NODE_ENV=production`.
- **Seed accounts** all use the `@seed.bazaar.test` domain and the dev-only password `DemoPass123!`.
  `demo@seed.bazaar.test` is a ready-made shopper; the other ten are review authors. Seed reviews are recognised by
  those emails and rebuilt each run; reviews from real accounts are never touched.
- **Ratings:** `ratingAverage` / `reviewCount` on a product are marketplace-wide aggregates for display; the
  two sample reviews per product are a subset of them.
- **Images:** Unsplash CDN photos and Open Library book covers (all URLs verified to resolve when the seed was written).
  Product names and brands are fictional, except for the books.

Edit the data in `backend/src/database/seed/data/` (one file per category under `products/`).

## API (so far)

| Endpoint | Notes |
| --- | --- |
| `GET /api/health` | API + database status |
| `POST /api/auth/register`, `POST /api/auth/login`, `GET /api/auth/me` | JWT bearer auth |
| `GET /api/categories` | Ordered category list |
| `GET /api/products` | Query: `q`, `category`, `minPrice`, `maxPrice`, `minRating`, `inStock`, `deals`, `featured`, `sort` (`relevance` \| `price_asc` \| `price_desc` \| `rating` \| `newest` \| `popular`), `page`, `limit` (max 60). Multi-word `q` requires every word to match; title matches rank first. |
| `GET /api/products/:id`, `GET /api/products/:id/related` | Detail and same-category suggestions |
| `GET /api/cart` | The signed-in user's cart: lines, totals, delivery options, `canCheckout`. Created on first read. |
| `POST /api/cart/items` | `{ productId, quantity 1–10, selectedVariants? }`. One row per product: adding it again raises the quantity. 409 for out-of-stock or over-limit, with the reason. |
| `PATCH /api/cart/items/:itemId`, `DELETE /api/cart/items/:itemId` | Change quantity / remove. Only your own lines (someone else's id is a 404). |
| `POST /api/orders` | `{ shippingAddress, deliveryOption: standard or express, paymentMethod: card or cod }`: places an order from the cart (see below). |
| `GET /api/orders/:orderNumber` | Your own order only (404 otherwise). |
| `GET /api/validations` | Open demand validations ("coming soon" ideas). Query: `category` (slug), `sort` = `newest` or `popular` (most responses), `page`, `limit`. |
| `GET /api/validations/:id` | One validation: description, features, price range, the five generated price buckets, response count, seller. Never any voter. |
| `GET /api/validations/:id/response`, `PUT /api/validations/:id/response` | Sign in required. Read / save the shopper's own answer: `{ interest: interested\|maybe\|not_interested, priceBucket?: 0-4, topFeature? }`. One answer per shopper (answering again changes it). 403 for the store's own owner, 409 if closed. |
| `POST /api/sellers` | Open a seller account (`{ name, description? }`), at most one per user. |
| `GET /api/seller/validations`, `POST /api/seller/validations` | Your validations with headline numbers / create one. The seller always comes from your account, never from the request. |
| `GET /api/seller/validations/:id/results` | Owner-only analytics: responses, interest split, signal, price and feature distributions, insight values. |
| `PATCH /api/seller/validations/:id` | `{ status: open\|closed }`: stop or resume collecting answers. Content can't be edited. |
| `GET /api/products/:id/reviews` | Written reviews, newest first. Query: `page`, `limit` (max 50). Public fields only (no account ids / emails); 404 for an unknown product. |

## Search & listing

`/search` is driven entirely by the URL, so refresh, back/forward and shared links all reproduce the same view:

`/search?q=…&category=…&minPrice=…&maxPrice=…&minRating=…&inStock=true&deals=true&sort=…&page=…`

- **Filters** (the ones the API supports): category, price (presets or a custom range), minimum rating, in stock, deals.
  Wide screens (≥ 1024px) get a sidebar that applies instantly; narrower screens get a drawer that applies on "Apply filters".
  Active filters show as removable chips with "Clear all" (the search keyword is kept).
- **Sort:** Relevance, Price low→high / high→low, Avg. customer rating, Best sellers, Newest arrivals (the API's `sort` values).
- **Pagination:** server-side, 12 per page, using the API's `page` / `limit` / `totalPages`. A page past the end redirects to the last page.
- **Search:** submit-only (no request per keystroke). Multi-word queries require every word to match. The category chosen in the header is kept.
- Malformed parameters (`?sort=bogus`, `?page=abc`) are ignored and the address bar is rewritten to its canonical form.

## Product page

`/products/:id` shows everything a shopper needs to decide, from `GET /api/products/:id` plus separate requests for reviews
and related products (a failure in either never breaks the page):

- **Gallery:** thumbnails, previous/next, keyboard arrows and touch swipe; handles one image, many images, none, or a broken URL.
- **Top of the page:** title, rating and ratings count, price with original price, discount and "you save", availability
  (in stock / only N left / currently unavailable), and an estimated delivery date that says plainly it is an estimate.
- **Variants:** one option row per dimension in the API (color, size, roast…). The API has no per-option price or stock, so none is shown or invented.
- **Buy box:** quantity (capped by stock) and Add to Cart / Buy Now, plus the seller's name, rating and description from the API.
  Cart and checkout are the next step, so the buttons only say so: there is intentionally no fake cart state. An unavailable product
  gets a disabled "Currently unavailable" button and no quantity picker.
- **Below:** About this product, Key features, Specifications table, Customer reviews, Related products.
- **Reviews:** the headline average and count are the product's own aggregate; the list is the written reviews that exist.
  There is no star-by-star breakdown, because the API can't supply one for the full rating count.
- **States:** loading skeleton; not found (malformed ids never reach the API); API error with retry; no reviews; no related products.

## Demand validation

Sellers can test an idea before making it: they propose a product that isn't for sale yet, shoppers answer *"Would you
consider buying this?"*, and the seller reads a demand signal. It is a signal of intent, **not** a sales forecast.

- **Model:** `Validation` (the idea: title, tagline, description, images, 3–6 features, price range, launch month, open/closed) and
  `ValidationResponse` (interested / maybe / not interested, optional price bucket, optional most-important feature).
  `UNIQUE(validation, user)` gives one answer per shopper; answering again updates it. A user is a seller by owning a `Seller`
  (`sellers.ownerId`, unique): there is no role flag. `/api/auth/me` and the login responses include `seller` (id, name, slug) or `null`.
- **Price buckets** (`backend/src/common/price-buckets.ts`): always five, derived from the proposed range, and the single source for
  the detail API, answer validation and analytics. `$79–99` gives *Under $79 · $79–$86 · $86–$92 · $92–$99 · Over $99*. Inner
  boundaries are rounded to whole dollars for ranges $6 or wider, to cents otherwise. The outer two show price pressure and headroom.
- **Signal** (`backend/src/common/demand-signal.ts`): score = interested% + maybe% × 0.5. 60+ strong, 40–59.99 moderate, below 40
  weak, and under 30 responses "Too early to tell". All thresholds are constants.
- **Rules:** answers need sign-in; a seller can't answer their own validation (403); a closed validation takes no answers (409);
  `not_interested` stores no price or feature (they're cleared); `topFeature` must be one of the validation's features. Results
  are owner-only: another seller's validation looks like a missing one (404), a shopper with no store gets 403.
  No API ever returns who voted. The database also enforces the unique answer, the 0–4 bucket range and the price range.
- **Analytics** are plain SQL `GROUP BY` queries. Price and feature percentages are of the people who answered that question
  (`percent`) and of everyone who responded (`percentOfResponses`).

### Demo data and logins

`npm run seed` also creates (all synthetic, and idempotent: re-running changes nothing):

| | |
| --- | --- |
| Seller login | `seller@seed.bazaar.test` / `DemoPass123!` owns **Trailmate Travel Gear** |
| Seller login | `maker@seed.bazaar.test` / `DemoPass123!` owns **Kindred Home Studio** |
| Shopper login | `demo@seed.bazaar.test` / `DemoPass123!` |

Five validations: **Smart Travel Backpack** (the flagship: 1,284 responses, 67% interested / 21% maybe / 12% not, strong signal, $86–$92
sweet spot, USB-C charging on top), Pocket-Fold Travel Yoga Mat (moderate), Self-Stirring Insulated Mug (strong, with price pressure),
Modular Desk Organizer System (18 responses: too early to tell) and Smart Plant Pot (closed, weak). The 1,284 "shoppers" are synthetic
accounts `voter-0001@seed.bazaar.test` … generated deterministically; they are not real customer behaviour.

## Coming soon (the shopper side of demand validation)

Shoppers meet demand tests as "Coming soon" products and tell sellers whether they would buy them. No new auth: it is the same account and JWT.

| Route | What it is |
| --- | --- |
| Homepage, after Today's deals | "Coming soon: help decide what gets made": the four best-answered open tests as `ValidationCard`s. It loads on its own, so if its API fails the rest of the page is unaffected (it shows a retry). |
| `/coming-soon` | Every open test. Category chips and sort (Newest / Most responses) live in the URL (`?category=&sort=&page=`); empty, error and loading states. |
| `/coming-soon/:id` | The proposal (photos, price range, launch month, seller, description, features), a "Not available to buy yet" banner, and the answer box. Public to read. |

- A `ValidationCard` is deliberately not a `ProductCard`: no cart, stock or delivery, just the idea, the proposed price and how many shoppers have answered.
- **Answer box** (`VoteBox`): *Interested / Maybe / Not interested*, then (for the first two) an optional price and an optional "most important feature".
  Signed out, choosing sends you to sign in and back to the same test with that choice selected (still not submitted). It also shows the
  shopper's earlier answer with "Change answer", an owner message for the seller who proposed it, a closed message, and clear errors
  (a failed save says the answer was *not* saved and keeps the form). Percentages are never shown to shoppers, so the crowd can't sway them.
- The seller side is described in *Seller hub* below.

## Seller hub (the seller side of demand validation)

Sellers test an idea before making it: open a store, propose a product, share the link, read the results. Same account and JWT as shoppers; the
seller comes from `/auth/me`, never from anything the client sends.

| Route | What it is |
| --- | --- |
| `/sell` | "Test demand before you build." Signed out: sign-in / create-account buttons that return here. Signed in without a store: a two-field form (`POST /sellers`). Store owners are redirected to the hub. |
| `/seller` | The hub: store name, **New demand test**, and your tests (`GET /seller/validations`) with image, status, response count, the three interest shares and the signal label. Empty state for a new store. |
| `/seller/validations/new` | The create form with a **live preview** (the real `ValidationCard`, as a block that goes nowhere). Title, tagline, description, category (from the API), up to 5 image URLs, 3–6 features, a price range, a launch month. Checked in the browser with the API's own rules and again by the API; its messages are shown next to the fields. |
| `/seller/validations/:id` | Results (`GET /seller/validations/:id/results`): the demand signal and score, interest bars, preferred price (sweet spot), most requested features, plain-language insight cards, a price-pressure warning when the API flags it, copy-public-link, and **Close / Reopen test** (`PATCH`). Only the owning seller can load it (others get a not-found page). |

- The header's navigation shows **Sell** (or **Seller hub** once you own a store).
- **Every number is the API's.** The frontend never computes a percentage, score, sweet spot or signal; it only draws them (plain CSS bars, no chart library).
  Two small additions on the API support that: each row of `GET /seller/validations` carries the cover `image`, and the signal carries `openPercent`
  (Interested + Maybe, from the exact counts) for the "88% are Interested or Maybe" insight. Price pressure was already computed server-side (`insights.pricePressure.flagged`).
- Below 30 responses the page says **Too early to tell**, shows the score as an early read, and the insight cards say "Not enough responses to draw a strong conclusion yet."
- Demand signals represent shopper intent, not a sales forecast, and the page says so next to the score.
- Not built (out of scope): product listings and inventory, seller orders and payments, subscriptions, exports, notifications, editing a test after creating it.

## Buying flow

Product → Add to Cart → Cart → Checkout → Order confirmation, for signed-in users (JWT). Signed-out visitors who try to buy are
sent to sign in and come straight back; there are no guest carts.

- **Server cart:** the cart lives in PostgreSQL and every response returns the whole cart. The frontend holds a copy of that
  response (`CartContext`), never a cart of its own, so the header badge, product page and cart page always agree and the
  cart survives refreshes. Stock and the 10-per-order limit are enforced by the server, which explains any refusal.
- **Pricing (mock, one module: `backend/src/common/pricing.ts`):** subtotal = Σ price × qty; tax = flat 8%; standard shipping is
  free when every item ships free (otherwise $4.99); express is a flat $14.99. The cart and the placed order use the same
  code, so what you see is what the order records. Shipping/tax are labelled as estimates in the UI.
- **Placing an order** is one database transaction: lock the cart, take stock with a guarded `UPDATE … WHERE stock >= qty`
  (two buyers can't both get the last unit), snapshot title/image/seller/price into the order lines, clear the cart.
  If anything fails, nothing happens: the cart and stock are untouched and the shopper sees the real reason.
- **Payment is a mock:** you only choose "Credit/Debit Card (mock)" or "Cash on Delivery". No card details are collected,
  sent or stored. The order status is `placed`; order history and tracking are not built.
- **Checkout form:** validated in the browser (inline errors, focus on the first problem) and again by the API. The address is
  kept in `sessionStorage` for the tab so a refresh doesn't lose it, and cleared on sign-out.

## End-to-end tests

Playwright drives a real browser through the main buyer journeys (home → search → filter → sort → paginate → product page),
the empty/error/loading states, URL back/forward behaviour, the mobile filter drawer, image fallbacks and layout overflow.
The suites are `home`, `search`, `product`, `buying` (the cart → checkout → confirmation journey, plus failure and stock-limit
cases), `coming-soon` (discovering, reading and answering demand tests) and `seller` (opening a store, the hub, creating a test with its preview, results, close/reopen), both at every viewport and `cart-api`, `validation-api` and `validation-logic` (API rules and pure logic, run once). Every browser test also fails on any console error/warning or failed/4xx/5xx
request, unless it injects that failure on purpose. Tests that buy things create their own throwaway accounts
(`…@e2e.bazaar.test`, some with stores) and consume real stock; `npm run seed` cleans all of it up. The same tests run at four sizes:
1440, 1024, 820 and 390px wide. Expectations are computed from the live API, not hardcoded.

```bash
npm install                  # once, at the repo root (installs Playwright)
npm run seed                 # the tests need the seeded catalog (re-run it if stock is used up)
npm run test:e2e             # starts the API and the built frontend if they are not already running
npm run test:e2e -- --project=mobile         # one viewport
npm run test:e2e -- e2e/search.spec.ts -g pagination   # one file / test
npm run test:e2e:report      # open the HTML report after a run
```

Product photos come from Unsplash / Open Library; tests stub those two hosts with a tiny local image so they never depend on a
third party (set `E2E_REAL_IMAGES=1` to use the real hosts).

It uses the Microsoft Edge that ships with Windows. For another browser set `E2E_BROWSER=chrome`, or
`E2E_BROWSER=chromium` after `npx playwright install chromium`. Failures keep a screenshot and trace in `test-results/`.

## Frontend structure

```
src/components/ui/        design-system pieces: Button, Badge, Panel, Price, Rating, SafeImage, state messages
src/components/product/   ProductCard (the one shared card), ProductRail
src/components/home/      Hero, ProductSection (owns loading / error / empty), ComingSoonSection, CategoryGrid
src/components/validation/  ValidationCard, VoteBox (the answer box), not-found / skeleton states
src/components/seller/      seller hub rows, ValidationPreview, results sections (bars, signal, insights), CopyLinkButton, seller error states
src/components/listing/   FilterPanel, FilterDrawer, ActiveFilters, SortSelect, Pagination, ResultsEmpty
src/components/product-detail/  Gallery, VariantSelector, PurchasePanel, ReviewsSection, RelatedProducts
e2e/                      Playwright specs (home, search, product) + fixtures and helpers
src/components/layout/    Header, CategoryNav, Footer, Layout
src/context/              Auth, Catalog (categories), Cart (count only for now)
src/hooks/                useAsync, useHomeProducts
src/lib/listingQuery.ts   URL <-> listing state (parse, serialize, filter chips)
```

Design tokens (colors, radius, shadow, spacing rules) live at the top of `src/index.css`.

## Homepage data

Everything on the homepage comes from the API; there is no hardcoded product content.

| Section | Request |
| --- | --- |
| Header search, category bar, category cards | `GET /api/categories` |
| Today's deals | `GET /api/products?deals=true&inStock=true&sort=popular&limit=10` |
| Popular products | `GET /api/products?minRating=4.5&inStock=true&sort=popular&limit=30` |
| Recommended for you | `GET /api/products?featured=true&…&sort=rating` topped up with `…&sort=rating` |

Popular and Recommended skip products already shown above them. Recommendations are a deterministic query,
not a recommendation engine.

## Status

Foundation, seed data, the discovery API, the homepage, search/listing, the product page and the basic buying flow are done.
Order history is a placeholder. Demand validation has its backend and API, and the shopper-facing screens (the Coming soon section, listing, detail page and answer box). The seller hub (store sign-up, dashboard, create form with live preview, results and close/reopen) is built too; seller product listings and payments are not.
