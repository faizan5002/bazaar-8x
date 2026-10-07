import { useState } from 'react';
import { Link } from 'react-router-dom';
import { CartItemRow } from '../components/cart/CartItemRow';
import { Totals } from '../components/cart/Totals';
import { Button, ButtonLink } from '../components/ui/Button';
import { Container } from '../components/ui/Container';
import { CartIcon } from '../components/ui/icons';
import { ErrorState } from '../components/ui/StateMessage';
import { useCart } from '../context/CartContext';
import { ApiError } from '../lib/api';

type Notice = { kind: 'info' | 'error'; text: string };

/** The signed-in user's cart (the route is behind RequireAuth). Everything shown is what the server returned. */
export function CartPage() {
  const { cart, loading, error, reload, setQuantity, remove } = useCart();
  const [notice, setNotice] = useState<Notice | null>(null);
  const [busyId, setBusyId] = useState<number | null>(null);

  const run = async (id: number, action: () => Promise<unknown>, success: string) => {
    setBusyId(id);
    setNotice(null);
    try {
      await action();
      setNotice({ kind: 'info', text: success });
    } catch (err) {
      // The cart is left exactly as it was (the server refused), and we say so.
      setNotice({ kind: 'error', text: err instanceof ApiError ? err.message : "We couldn't reach the store, so your cart wasn't changed. Please try again." });
    } finally {
      setBusyId(null);
    }
  };

  let body;
  if (loading) {
    body = (
      <div aria-busy="true" aria-label="Loading your cart" className="grid animate-pulse gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="h-72 rounded-card bg-white shadow-card" />
        <div className="h-56 rounded-card bg-white shadow-card" />
      </div>
    );
  } else if (error || !cart) {
    body = <ErrorState message="We couldn't load your cart. Check your connection and try again." onRetry={reload} />;
  } else if (cart.items.length === 0) {
    body = (
      <div className="flex flex-col items-center rounded-card bg-white px-4 py-16 text-center shadow-card">
        <CartIcon width={44} height={44} className="text-slate-400" />
        <h2 className="mt-4 text-2xl font-bold text-slate-900">Your cart is empty</h2>
        <p className="mt-2 max-w-md text-slate-600">Add something from the store and it will show up here, even if you leave and come back.</p>
        <ButtonLink to="/search" className="mt-6">
          Continue shopping
        </ButtonLink>
      </div>
    );
  } else {
    body = (
      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <section aria-label="Items in your cart" className="rounded-card bg-white p-4 shadow-card sm:p-6">
          <div className="mb-4 flex items-baseline justify-between border-b border-line pb-3">
            <h2 className="text-lg font-bold text-slate-900">Items</h2>
            <span className="hidden text-sm text-slate-600 sm:inline">Item subtotal</span>
          </div>
          <ul className="divide-y divide-line">
            {cart.items.map((line) => (
              <CartItemRow
                key={line.id}
                line={line}
                busy={busyId === line.id}
                onQuantity={(q) => run(line.id, () => setQuantity(line.id, q), `Updated the quantity of “${line.title}” to ${q}.`)}
                onRemove={() => run(line.id, () => remove(line.id), `Removed “${line.title}” from your cart.`)}
              />
            ))}
          </ul>
        </section>

        <aside aria-label="Order summary" className="rounded-card bg-white p-5 shadow-card lg:sticky lg:top-4">
          <h2 className="mb-4 text-lg font-bold text-slate-900">Order summary</h2>
          <Totals itemCount={cart.itemCount} subtotal={cart.subtotal} shipping={cart.shipping} tax={cart.tax} total={cart.total} estimated />
          <p className="mt-3 text-xs text-slate-500">Shipping and tax are estimates: mock values for this demo. You choose delivery speed at checkout.</p>

          {cart.canCheckout ? (
            <ButtonLink to="/checkout" className="mt-5 w-full py-3 text-base">
              Proceed to checkout
            </ButtonLink>
          ) : (
            <div className="mt-5">
              <Button fullWidth disabled className="py-3 text-base">
                Proceed to checkout
              </Button>
              <p className="mt-2 text-sm text-warning">Fix the items marked above to continue.</p>
            </div>
          )}
          <Link to="/search" className="mt-4 block text-center text-sm font-medium text-link hover:underline">
            Continue shopping
          </Link>
        </aside>
      </div>
    );
  }

  return (
    <Container className="py-4 lg:py-6">
      <h1 className="mb-4 text-2xl font-bold text-slate-900 sm:text-3xl">Shopping cart</h1>
      {/* Feedback for add/update/remove. Always in the DOM so screen readers announce changes. */}
      <div aria-live="polite" className="mb-4 empty:hidden">
        {notice && (
          <p role={notice.kind === 'error' ? 'alert' : 'status'} className={`rounded-md p-3 text-sm ring-1 ${notice.kind === 'error' ? 'bg-red-50 text-red-800 ring-red-200' : 'bg-green-50 text-slate-800 ring-green-200'}`}>
            {notice.text}
          </p>
        )}
      </div>
      {body}
    </Container>
  );
}
