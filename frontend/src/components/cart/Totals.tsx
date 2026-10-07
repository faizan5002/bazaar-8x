import { formatPrice, formatShipping } from '../../lib/format';

interface TotalsProps {
  itemCount: number;
  subtotal: number;
  shipping: number;
  tax: number;
  total: number;
  /** Cart page: shipping and tax are shown as estimates. Checkout: they reflect the chosen delivery option. */
  estimated?: boolean;
}

/** Subtotal → shipping → tax → total. Every number comes from the server's pricing; nothing here is computed. */
export function Totals({ itemCount, subtotal, shipping, tax, total, estimated = false }: TotalsProps) {
  const row = 'flex items-baseline justify-between gap-4';
  return (
    <dl className="space-y-2 text-sm text-slate-700" data-testid="totals">
      <div className={row}>
        <dt>
          Subtotal ({itemCount} {itemCount === 1 ? 'item' : 'items'})
        </dt>
        <dd data-testid="totals-subtotal" className="font-medium text-slate-900">
          {formatPrice(subtotal)}
        </dd>
      </div>
      <div className={row}>
        <dt>{estimated ? 'Estimated shipping' : 'Shipping'}</dt>
        <dd data-testid="totals-shipping" className={`font-medium ${shipping === 0 ? 'text-success' : 'text-slate-900'}`}>
          {formatShipping(shipping)}
        </dd>
      </div>
      <div className={row}>
        <dt>{estimated ? 'Estimated tax (8%)' : 'Tax (8%, estimate)'}</dt>
        <dd data-testid="totals-tax" className="font-medium text-slate-900">
          {formatPrice(tax)}
        </dd>
      </div>
      <div className={`${row} border-t border-line pt-3 text-base`}>
        <dt className="font-bold text-slate-900">Order total</dt>
        <dd data-testid="totals-total" className="text-xl font-bold text-slate-900">
          {formatPrice(total)}
        </dd>
      </div>
    </dl>
  );
}
