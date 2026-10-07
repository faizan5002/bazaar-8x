import { useId } from 'react';
import { Link } from 'react-router-dom';
import { formatPrice } from '../../lib/format';
import { sizedImage } from '../../lib/images';
import type { CartLine } from '../../types';
import { SafeImage } from '../ui/SafeImage';

interface CartItemRowProps {
  line: CartLine;
  /** A change to this line is in flight: its controls are disabled so edits can't pile up. */
  busy: boolean;
  onQuantity: (quantity: number) => void;
  onRemove: () => void;
}

export const variantText = (v: Record<string, string>) =>
  Object.entries(v)
    .map(([name, option]) => `${name}: ${option}`)
    .join(' · ');

function Price({ line }: { line: CartLine }) {
  const discounted = line.originalPrice !== null && line.originalPrice > line.unitPrice;
  return (
    <div className="text-sm text-slate-600">
      <p>
        <span className="font-medium text-slate-900">{formatPrice(line.unitPrice)}</span> each
        {discounted && <span className="ml-2 text-xs line-through">{formatPrice(line.originalPrice!)}</span>}
      </p>
      <p className="mt-0.5 text-base">
        <span className="sr-only">Item subtotal </span>
        <span className="font-bold text-slate-900" data-testid="line-total">
          {formatPrice(line.lineTotal)}
        </span>
      </p>
    </div>
  );
}

/** One cart line: image, what it is, who sells it, quantity, remove, and the line subtotal. */
export function CartItemRow({ line, busy, onQuantity, onRemove }: CartItemRowProps) {
  const qtyId = useId();
  // Normally 1..maxQuantity; if stock dropped below what is in the cart, the current (too high) value stays selectable
  // so the control still shows the truth, alongside the warning that explains the problem.
  const options = Math.max(line.maxQuantity, line.quantity);
  const variants = variantText(line.selectedVariants);

  return (
    <li data-testid="cart-item" aria-busy={busy} className={`grid grid-cols-[5.5rem_minmax(0,1fr)] gap-x-4 gap-y-3 py-5 first:pt-0 last:pb-0 sm:grid-cols-[7rem_minmax(0,1fr)_auto] ${busy ? 'opacity-60' : ''}`}>
      <Link to={`/products/${line.productId}`} className="block aspect-square overflow-hidden rounded-md bg-slate-100" aria-label={`View ${line.title}`}>
        <SafeImage src={sizedImage(line.image ?? undefined, 240)} alt="" width={240} height={240} className="h-full w-full object-cover" />
      </Link>

      <div className="min-w-0">
        <Link to={`/products/${line.productId}`} className="line-clamp-2 font-medium leading-snug text-slate-900 hover:text-link hover:underline">
          {line.title}
        </Link>
        <p className="mt-1 text-xs text-slate-500">
          Sold by <span className="text-slate-700">{line.sellerName}</span>
        </p>
        {variants && <p className="mt-0.5 text-xs text-slate-600">{variants}</p>}
        {line.freeShipping && <p className="mt-0.5 text-xs font-medium text-success">Ships free</p>}
        {line.issue && (
          <p role="alert" className="mt-2 rounded bg-amber-50 px-2 py-1.5 text-sm font-medium text-warning ring-1 ring-amber-200">
            {line.issue.message}
          </p>
        )}

        <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2">
          <div className="flex items-center gap-2">
            <label htmlFor={qtyId} className="text-sm text-slate-700">
              Qty
            </label>
            <select
              id={qtyId}
              value={line.quantity}
              disabled={busy}
              onChange={(e) => onQuantity(Number(e.target.value))}
              aria-label={`Quantity for ${line.title}`}
              className="h-10 rounded-md border border-slate-300 bg-slate-50 px-3 text-sm focus:border-accent-500 focus:outline-none focus:ring-2 focus:ring-accent-400/40 disabled:cursor-not-allowed"
            >
              {Array.from({ length: options }, (_, i) => i + 1).map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
          </div>
          <button
            type="button"
            onClick={onRemove}
            disabled={busy}
            aria-label={`Remove ${line.title} from cart`}
            className="min-h-10 rounded px-1 text-sm font-medium text-link hover:underline disabled:cursor-not-allowed"
          >
            Remove
          </button>
        </div>

        <div className="mt-3 sm:hidden">
          <Price line={line} />
        </div>
      </div>

      <div className="hidden text-right sm:block">
        <Price line={line} />
      </div>
    </li>
  );
}
