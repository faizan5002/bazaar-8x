import { Link, useParams } from 'react-router-dom';
import { variantText } from '../components/cart/CartItemRow';
import { Totals } from '../components/cart/Totals';
import { ButtonLink } from '../components/ui/Button';
import { Container } from '../components/ui/Container';
import { SafeImage } from '../components/ui/SafeImage';
import { SearchOffIcon } from '../components/ui/icons';
import { ErrorState } from '../components/ui/StateMessage';
import { useAsync } from '../hooks/useAsync';
import { ApiError, api } from '../lib/api';
import { formatDate, formatDateOnly, formatPrice } from '../lib/format';
import { sizedImage } from '../lib/images';

/** Reads the order from the API (not from navigation state), so refreshing or revisiting the link still works. */
export function OrderConfirmationPage() {
  const { orderNumber = '' } = useParams();
  const order = useAsync(() => api.orders.get(orderNumber), [orderNumber]);

  if (order.loading) {
    return (
      <Container className="py-6">
        <div aria-busy="true" aria-label="Loading your order" className="space-y-6 animate-pulse">
          <div className="h-40 rounded-card bg-white shadow-card" />
          <div className="h-72 rounded-card bg-white shadow-card" />
        </div>
      </Container>
    );
  }
  if (order.error || !order.data) {
    const missing = order.error instanceof ApiError && order.error.status === 404;
    return (
      <Container className="py-8">
        {missing ? (
          <div role="alert" className="flex flex-col items-center rounded-card bg-white px-4 py-14 text-center shadow-card">
            <SearchOffIcon width={44} height={44} className="text-slate-400" />
            <h1 className="mt-4 text-2xl font-bold text-slate-900">We couldn&apos;t find that order</h1>
            <p className="mt-2 max-w-md text-slate-600">Orders are only visible to the account that placed them. Check the link, or sign in with the right account.</p>
            <ButtonLink to="/" className="mt-6">
              Back to home
            </ButtonLink>
          </div>
        ) : (
          <ErrorState message="We couldn't load your order. It may still have been placed: try again in a moment." onRetry={order.reload} />
        )}
      </Container>
    );
  }

  const o = order.data;
  const a = o.shippingAddress;
  return (
    <Container className="space-y-6 py-4 lg:py-6">
      <section aria-labelledby="confirmation-title" className="rounded-card bg-white p-6 shadow-card sm:p-8">
        <div className="flex items-start gap-4">
          <span aria-hidden="true" className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-green-100 text-2xl text-success">
            ✓
          </span>
          <div>
            <h1 id="confirmation-title" className="text-2xl font-bold text-slate-900 sm:text-3xl" data-testid="confirmation-title">
              Thank you, your order has been placed
            </h1>
            <p className="mt-1 text-slate-600">We&apos;ve received your order. This is a demo store, so no payment was taken and nothing will ship.</p>
          </div>
        </div>
        <dl className="mt-6 grid gap-4 border-t border-line pt-5 sm:grid-cols-3">
          <div>
            <dt className="text-sm text-slate-600">Order number</dt>
            <dd className="mt-0.5 break-all text-lg font-bold text-slate-900" data-testid="order-number">
              {o.orderNumber}
            </dd>
          </div>
          <div>
            <dt className="text-sm text-slate-600">Estimated delivery</dt>
            <dd className="mt-0.5 text-lg font-bold text-slate-900" data-testid="order-eta">
              {formatDateOnly(o.estimatedDelivery)}
            </dd>
          </div>
          <div>
            <dt className="text-sm text-slate-600">Order total</dt>
            <dd className="mt-0.5 text-lg font-bold text-slate-900" data-testid="order-total">
              {formatPrice(o.total)}
            </dd>
          </div>
        </dl>
      </section>

      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <section aria-labelledby="items-title" className="rounded-card bg-white p-4 shadow-card sm:p-6">
          <h2 id="items-title" className="mb-4 text-lg font-bold text-slate-900">
            Items in this order
          </h2>
          <ul className="divide-y divide-line">
            {o.items.map((item) => (
              <li key={item.id} data-testid="order-item" className="flex gap-4 py-4 first:pt-0 last:pb-0">
                <div className="h-20 w-20 shrink-0 overflow-hidden rounded-md bg-slate-100">
                  <SafeImage src={sizedImage(item.imageUrl ?? undefined, 200)} alt="" width={80} height={80} className="h-full w-full object-cover" />
                </div>
                <div className="min-w-0 flex-1">
                  {item.productId ? (
                    <Link to={`/products/${item.productId}`} className="line-clamp-2 font-medium leading-snug text-slate-900 hover:text-link hover:underline">
                      {item.title}
                    </Link>
                  ) : (
                    <p className="line-clamp-2 font-medium leading-snug text-slate-900">{item.title}</p>
                  )}
                  <p className="mt-0.5 text-xs text-slate-500">Sold by {item.sellerName}</p>
                  {Object.keys(item.selectedVariants).length > 0 && <p className="text-xs text-slate-600">{variantText(item.selectedVariants)}</p>}
                  <p className="mt-1 text-sm text-slate-600">
                    {item.quantity} × {formatPrice(item.unitPrice)}
                  </p>
                </div>
                <p className="font-semibold text-slate-900">{formatPrice(item.lineTotal)}</p>
              </li>
            ))}
          </ul>
          <div className="mt-5 border-t border-line pt-5">
            <Totals itemCount={o.itemCount} subtotal={o.subtotal} shipping={o.shippingCost} tax={o.tax} total={o.total} />
          </div>
        </section>

        <aside aria-label="Delivery and payment" className="space-y-5 rounded-card bg-white p-5 text-sm shadow-card">
          <div>
            <h2 className="font-bold text-slate-900">Shipping to</h2>
            <address className="mt-1 not-italic leading-relaxed text-slate-700" data-testid="order-address">
              {a.fullName}
              <br />
              {a.line1}
              {a.line2 && (
                <>
                  <br />
                  {a.line2}
                </>
              )}
              <br />
              {a.city}, {a.state} {a.postalCode}
              <br />
              {a.country}
              <br />
              {a.phone}
            </address>
          </div>
          <div>
            <h2 className="font-bold text-slate-900">Delivery</h2>
            <p className="mt-1 text-slate-700">
              {o.deliveryOptionLabel}, arriving about {formatDateOnly(o.estimatedDelivery)}
            </p>
          </div>
          <div>
            <h2 className="font-bold text-slate-900">Payment method</h2>
            <p className="mt-1 text-slate-700">{o.paymentMethod}</p>
          </div>
          <div>
            <h2 className="font-bold text-slate-900">Status</h2>
            <p className="mt-1 capitalize text-slate-700" data-testid="order-status">
              {o.status}
            </p>
            <p className="text-xs text-slate-500">Placed {formatDate(o.createdAt)}</p>
          </div>
        </aside>
      </div>

      <div className="flex justify-center">
        <ButtonLink to="/search" className="px-8 py-3 text-base">
          Continue shopping
        </ButtonLink>
      </div>
    </Container>
  );
}
