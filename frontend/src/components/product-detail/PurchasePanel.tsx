import { useId, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { useCart } from '../../context/CartContext';
import { ApiError } from '../../lib/api';
import { MAX_QUANTITY, stockStatus } from '../../lib/product';
import type { Product } from '../../types';
import { Button } from '../ui/Button';
import { Price } from '../ui/Price';
import { Rating } from '../ui/Rating';

interface PurchasePanelProps {
  product: Product;
  /** The shopper's current choice for each variant group. */
  selectedVariants: Record<string, string>;
}

type Feedback = { kind: 'success' | 'error' | 'signin'; text: string };

/**
 * The buy box: quantity, Add to Cart, Buy Now, and who is selling it. Both buttons call the real cart API
 * (through CartContext); there is no client-side cart. The server enforces stock and per-order limits and its
 * message is shown as-is when it refuses.
 */
export function PurchasePanel({ product, selectedVariants }: PurchasePanelProps) {
  const qtyId = useId();
  const navigate = useNavigate();
  const location = useLocation();
  const { user } = useAuth();
  const cart = useCart();
  const status = stockStatus(product.stock);
  const available = status.level !== 'out';
  const maxQty = Math.min(product.stock, MAX_QUANTITY);
  const [quantity, setQuantity] = useState(1);
  const [pending, setPending] = useState<'add' | 'buy' | null>(null);
  const [feedback, setFeedback] = useState<Feedback | null>(null);

  const submit = async (action: 'add' | 'buy') => {
    if (!user) {
      setFeedback({ kind: 'signin', text: action === 'add' ? 'Sign in to add items to your cart.' : 'Sign in to buy this item.' });
      return;
    }
    setPending(action);
    setFeedback(null);
    try {
      const next = await cart.add({ productId: product.id, quantity, selectedVariants });
      if (action === 'buy') {
        navigate('/checkout');
        return;
      }
      setFeedback({ kind: 'success', text: `Added ${quantity} × ${product.title}. Your cart now has ${next.itemCount} ${next.itemCount === 1 ? 'item' : 'items'}.` });
    } catch (err) {
      // An expired session reads as "signed out"; anything else is shown honestly and nothing is claimed to have been added.
      if (err instanceof ApiError && err.status === 401) setFeedback({ kind: 'signin', text: 'Your session has expired. Sign in again to continue.' });
      else setFeedback({ kind: 'error', text: err instanceof ApiError ? err.message : "We couldn't reach the store, so nothing was added. Please try again." });
    } finally {
      setPending(null);
    }
  };

  const { seller } = product;
  const back = location.pathname + location.search;
  return (
    <div data-testid="buy-box" className="rounded-card border border-line p-4 md:grid md:grid-cols-2 md:gap-8 lg:block lg:p-5">
      <div>
        <div className="hidden lg:block">
          <Price price={product.price} originalPrice={product.originalPrice} />
        </div>

        {available ? (
          <div className="space-y-3 lg:mt-3">
            <div className="flex items-center gap-3">
              <label htmlFor={qtyId} className="text-sm font-medium text-slate-800">
                Quantity
              </label>
              <select
                id={qtyId}
                value={quantity}
                onChange={(e) => {
                  setQuantity(Number(e.target.value));
                  setFeedback(null);
                }}
                className="h-10 rounded-md border border-slate-300 bg-slate-50 px-3 text-sm focus:border-accent-500 focus:outline-none focus:ring-2 focus:ring-accent-400/40"
              >
                {Array.from({ length: maxQty }, (_, i) => i + 1).map((n) => (
                  <option key={n} value={n}>
                    {n}
                  </option>
                ))}
              </select>
              {product.stock > MAX_QUANTITY ? null : <span className="text-xs text-warning">{product.stock} available</span>}
            </div>
            <Button fullWidth onClick={() => submit('add')} disabled={pending !== null} className="py-3 text-base">
              {pending === 'add' ? 'Adding…' : 'Add to Cart'}
            </Button>
            <Button fullWidth variant="secondary" onClick={() => submit('buy')} disabled={pending !== null} className="py-3 text-base">
              {pending === 'buy' ? 'Adding…' : 'Buy Now'}
            </Button>

            {feedback?.kind === 'success' && (
              <div role="status" className="rounded-md bg-green-50 p-3 text-sm text-slate-800 ring-1 ring-green-200">
                <p className="font-semibold text-success">✓ Added to cart</p>
                <p className="mt-0.5">{feedback.text}</p>
                <p className="mt-2 flex gap-4 font-medium">
                  <Link to="/cart" className="text-link hover:underline">
                    View cart
                  </Link>
                  <Link to="/checkout" className="text-link hover:underline">
                    Checkout
                  </Link>
                </p>
              </div>
            )}
            {feedback?.kind === 'error' && (
              <p role="alert" className="rounded-md bg-red-50 p-3 text-sm text-red-800 ring-1 ring-red-200">
                {feedback.text}
              </p>
            )}
            {feedback?.kind === 'signin' && (
              <p role="alert" className="rounded-md bg-amber-50 p-3 text-sm text-slate-800 ring-1 ring-amber-200">
                {feedback.text}{' '}
                <Link to="/login" state={{ from: back }} className="font-semibold text-link hover:underline">
                  Sign in
                </Link>{' '}
                or{' '}
                <Link to="/register" state={{ from: back }} className="font-semibold text-link hover:underline">
                  create an account
                </Link>
                . You&apos;ll come straight back here.
              </p>
            )}
          </div>
        ) : (
          <div className="space-y-3 lg:mt-3">
            <Button fullWidth disabled className="py-3 text-base">
              Currently unavailable
            </Button>
            <p className="text-sm text-slate-600">This item can&apos;t be purchased right now. Browse similar products below.</p>
          </div>
        )}
      </div>

      <section aria-label="Seller" className="mt-5 border-t border-line pt-4 text-sm md:mt-0 md:border-l md:border-t-0 md:pl-8 md:pt-0 lg:mt-5 lg:border-l-0 lg:border-t lg:pl-0 lg:pt-4">
        <p className="text-slate-600">Sold by</p>
        <p className="font-semibold text-slate-900" data-testid="seller-name">
          {seller.name}
        </p>
        <div className="mt-1 flex items-center gap-2 text-slate-600">
          <Rating value={seller.rating} size={14} />
          <span>{seller.rating.toFixed(1)} seller rating</span>
        </div>
        {seller.description && <p className="mt-2 text-slate-600">{seller.description}</p>}
      </section>
    </div>
  );
}
