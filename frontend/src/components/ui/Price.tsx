import { discountPercent, formatPrice } from '../../lib/format';

interface PriceProps {
  price: number;
  originalPrice?: number | null;
  size?: 'md' | 'lg';
  /** Show the red "-25%" next to the price. Cards show it as an image badge instead. */
  showDiscount?: boolean;
}

export function Price({ price, originalPrice = null, size = 'md', showDiscount = true }: PriceProps) {
  const off = discountPercent(price, originalPrice);
  return (
    <span className="inline-flex flex-wrap items-baseline gap-x-2">
      {showDiscount && off > 0 && <span className="font-medium text-deal">-{off}%</span>}
      <span className={`font-semibold text-slate-900 ${size === 'lg' ? 'text-3xl' : 'text-xl'}`}>{formatPrice(price)}</span>
      {off > 0 && originalPrice && (
        <span className="text-sm text-slate-500">
          <span className="sr-only">Original price </span>
          <span className="line-through">{formatPrice(originalPrice)}</span>
        </span>
      )}
    </span>
  );
}
