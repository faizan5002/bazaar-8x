import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Gallery } from '../components/product-detail/Gallery';
import { ProductDetailSkeleton, ProductNotFound } from '../components/product-detail/ProductStates';
import { PurchasePanel } from '../components/product-detail/PurchasePanel';
import { RelatedProducts } from '../components/product-detail/RelatedProducts';
import { ReviewsSection } from '../components/product-detail/ReviewsSection';
import { VariantSelector } from '../components/product-detail/VariantSelector';
import { Container } from '../components/ui/Container';
import { Panel } from '../components/ui/Panel';
import { Price } from '../components/ui/Price';
import { Rating } from '../components/ui/Rating';
import { ErrorState } from '../components/ui/StateMessage';
import { useAsync } from '../hooks/useAsync';
import { ApiError, api } from '../lib/api';
import { deliveryDate, discountPercent, formatPrice } from '../lib/format';
import { isBookCover, stockStatus } from '../lib/product';
import type { Product } from '../types';

const STOCK_TONE = { in: 'text-success', low: 'text-warning', out: 'text-deal' } as const;

function Breadcrumb({ product }: { product: Product }) {
  return (
    <nav aria-label="Breadcrumb" className="text-sm text-slate-600">
      <ol className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <li>
          <Link to="/" className="hover:text-link hover:underline">
            Home
          </Link>
        </li>
        <li aria-hidden="true">›</li>
        <li>
          <Link to={`/search?category=${product.category.slug}`} className="hover:text-link hover:underline">
            {product.category.name}
          </Link>
        </li>
        {/* The current title is already the h1 right below, so phones skip it to save a line. */}
        <li aria-hidden="true" className="hidden sm:block">
          ›
        </li>
        <li aria-current="page" className="hidden max-w-full truncate text-slate-900 sm:block">
          {product.title}
        </li>
      </ol>
    </nav>
  );
}

function Availability({ product }: { product: Product }) {
  const status = stockStatus(product.stock);
  return (
    <div className="space-y-1.5 text-sm" data-testid="availability-delivery">
      <p className={`text-lg font-semibold ${STOCK_TONE[status.level]}`} data-testid="availability">
        {status.label}
      </p>
      {status.level === 'out' ? (
        <p className="text-slate-600">Delivery information isn&apos;t available while this item is out of stock.</p>
      ) : (
        <div data-testid="delivery">
          <p className="text-slate-800">
            <span className="font-semibold">{product.freeShipping ? 'FREE delivery' : 'Delivery'}</span>{' '}
            <span className="font-bold">{deliveryDate(product.deliveryDays)}</span>
          </p>
          <p className="text-xs text-slate-500">
            Estimated arrival in about {product.deliveryDays} {product.deliveryDays === 1 ? 'day' : 'days'}, shown for planning rather than as a real-time promise.
            {!product.freeShipping && ' Shipping cost is calculated at checkout.'}
          </p>
        </div>
      )}
    </div>
  );
}

/** Keyed by product id by the page, so selections and quantity reset when you move to another product. */
function ProductDetail({ product }: { product: Product }) {
  const unavailable = stockStatus(product.stock).level === 'out';
  // Preselect the first option of every dimension; the user changes from there.
  const [selected, setSelected] = useState<Record<string, string>>(() => Object.fromEntries(product.variants.map((v) => [v.name, v.options[0]])));
  const off = discountPercent(product.price, product.originalPrice);
  const saving = product.originalPrice ? product.originalPrice - product.price : 0;

  return (
    <Container className="py-4 lg:py-6">
      <Breadcrumb product={product} />

      {/* One grid, placed explicitly per breakpoint. DOM order is the phone order: heading, gallery, details, buy box.
          md: gallery left | heading + details right, buy box full width below.
          lg: gallery | heading + details | buy box. */}
      <div className="mt-3 grid gap-x-8 gap-y-4 rounded-card bg-white p-4 shadow-card sm:p-6 md:grid-cols-2 lg:grid-cols-[minmax(0,5fr)_minmax(0,4fr)_minmax(0,3fr)]">
        <header className="min-w-0 space-y-3 md:col-start-2 md:row-start-1">
          <div>
            <Link to={`/search?q=${encodeURIComponent(product.brand)}`} className="text-sm text-link hover:underline">
              {isBookCover(product) ? 'By' : 'Brand:'} {product.brand}
            </Link>
            <h1 className="mt-1 text-2xl font-bold leading-snug text-slate-900 lg:text-[1.75rem]" data-testid="product-title">
              {product.title}
            </h1>
          </div>
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1" data-testid="rating">
            <span className="font-semibold text-slate-900">{product.ratingAverage.toFixed(1)}</span>
            <Rating value={product.ratingAverage} size={18} />
            <a href="#reviews" className="text-sm text-link hover:underline">
              {product.reviewCount.toLocaleString('en-US')} ratings
            </a>
          </div>
        </header>

        <div className="min-w-0 md:col-start-1 md:row-span-2 md:row-start-1 lg:row-span-2">
          <Gallery images={product.images} title={product.title} contain={isBookCover(product)} />
        </div>

        <section aria-label="Price, availability and options" className="min-w-0 space-y-4 md:col-start-2 md:row-start-2">
          <div className="border-t border-line pt-4" data-testid="price-block">
            <Price price={product.price} originalPrice={product.originalPrice} size="lg" />
            {off > 0 && (
              <p className="mt-1 text-sm text-slate-600" data-testid="savings">
                You save <span className="font-semibold text-deal">{formatPrice(saving)}</span> ({off}%) off the list price.
              </p>
            )}
          </div>

          <Availability product={product} />

          {product.variants.length > 0 && <VariantSelector groups={product.variants} selected={selected} onChange={(name, option) => setSelected((s) => ({ ...s, [name]: option }))} disabled={unavailable} />}
        </section>

        <aside aria-label="Purchase options" className="md:col-span-2 md:row-start-3 lg:col-span-1 lg:col-start-3 lg:row-span-2 lg:row-start-1 lg:sticky lg:top-4 lg:self-start">
          <PurchasePanel product={product} selectedVariants={selected} />
        </aside>
      </div>

      <div className="mt-6 space-y-6">
        <Panel id="about" title="About this product">
          <p className="max-w-4xl whitespace-pre-line leading-relaxed text-slate-800">{product.description}</p>
        </Panel>

        {product.features.length > 0 && (
          <Panel id="features" title="Key features">
            <ul className="grid max-w-4xl gap-x-8 gap-y-2.5">
              {product.features.map((f) => (
                <li key={f} className="flex gap-3 text-slate-800">
                  <span aria-hidden="true" className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-accent-600" />
                  {f}
                </li>
              ))}
            </ul>
          </Panel>
        )}

        {Object.keys(product.specifications).length > 0 && (
          <Panel id="specifications" title="Specifications">
            <table className="w-full max-w-4xl border-collapse text-left text-sm" data-testid="specs">
              <tbody>
                {Object.entries(product.specifications).map(([name, value]) => (
                  <tr key={name} className="border-b border-line last:border-b-0 even:bg-slate-50">
                    <th scope="row" className="w-2/5 px-3 py-2.5 align-top font-semibold text-slate-700 sm:w-1/3">
                      {name}
                    </th>
                    <td className="px-3 py-2.5 text-slate-900">{value}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Panel>
        )}

        <ReviewsSection product={product} />
        <RelatedProducts productId={product.id} />
      </div>
    </Container>
  );
}

/** /products/:id — fetches the product and picks between loading, not found, error and the page itself. */
export function ProductPage() {
  const { id: param = '' } = useParams();
  // Anything that isn't a positive integer can't be a product: don't send it to the API.
  const id = /^[1-9]\d*$/.test(param) ? Number(param) : null;
  const product = useAsync(() => (id === null ? Promise.reject(new ApiError(404, 'Invalid product id')) : api.product(id)), [id]);

  useEffect(() => {
    document.title = product.data ? `${product.data.title} — Bazaar` : 'Product — Bazaar';
  }, [product.data]);

  if (product.loading) return <ProductDetailSkeleton />;
  if (product.error) {
    if (product.error instanceof ApiError && product.error.status === 404) return <ProductNotFound invalidLink={id === null} />;
    return (
      <Container className="py-8">
        <ErrorState message="We couldn't load this product. Check your connection and try again." onRetry={product.reload} />
      </Container>
    );
  }
  if (!product.data) return null;
  return <ProductDetail key={product.data.id} product={product.data} />;
}
