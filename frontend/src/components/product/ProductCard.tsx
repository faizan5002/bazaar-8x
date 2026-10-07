import { Link } from 'react-router-dom';
import { deliveryDate, discountPercent } from '../../lib/format';
import { sizedImage } from '../../lib/images';
import { isBookCover, stockStatus } from '../../lib/product';
import type { Product } from '../../types';
import { Badge } from '../ui/Badge';
import { Price } from '../ui/Price';
import { Rating } from '../ui/Rating';
import { SafeImage } from '../ui/SafeImage';

/**
 * The one product card used across the marketplace. The whole card is a single link to the product page,
 * so there are no nested interactive elements. Layout is flat; wrap cards in a panel or grid.
 */
export function ProductCard({ product }: { product: Product }) {
  const off = discountPercent(product.price, product.originalPrice);
  const stock = stockStatus(product.stock);
  const unavailable = stock.level === 'out';
  // Book covers are portrait art that must not be cropped; photos fill the square.
  const isCover = isBookCover(product);
  const imageUrl = product.images[0];

  return (
    <Link
      data-testid="product-card"
      to={`/products/${product.id}`}
      className="group flex h-full flex-col rounded-card p-2 ring-1 ring-transparent transition hover:bg-white hover:shadow-card-hover hover:ring-line focus-visible:ring-line"
    >
      <div className={`relative aspect-square overflow-hidden rounded-md ${isCover ? 'bg-slate-100 p-3' : 'bg-slate-100'}`}>
        <SafeImage
          src={sizedImage(imageUrl, 480)}
          alt={product.title}
          width={480}
          height={480}
          className={`h-full w-full ${isCover ? 'object-contain' : 'object-cover'} ${unavailable ? 'opacity-60' : ''}`}
        />
        {off > 0 && !unavailable && (
          <span className="absolute left-2 top-2">
            <Badge tone="deal">{off}% off</Badge>
          </span>
        )}
      </div>

      <div className="mt-3 flex flex-1 flex-col gap-1.5">
        <h3 className="line-clamp-2 text-sm font-medium leading-snug text-slate-900 group-hover:text-link">{product.title}</h3>
        <Rating value={product.ratingAverage} count={product.reviewCount} size={14} />
        <Price price={product.price} originalPrice={product.originalPrice} showDiscount={false} />
        {stock.level !== 'in' && <p className={`text-xs font-medium ${unavailable ? 'text-slate-600' : 'text-warning'}`}>{stock.label}</p>}
        {!unavailable && (
          <p className="text-xs text-slate-600">
            {product.freeShipping && <span className="font-semibold text-slate-800">FREE delivery </span>}
            {!product.freeShipping && 'Delivery '}
            <span className="font-semibold text-slate-800">{deliveryDate(product.deliveryDays)}</span>
          </p>
        )}
        <p className="mt-auto pt-1 text-xs text-slate-500">
          Sold by <span className="text-slate-700">{product.seller.name}</span>
        </p>
      </div>
    </Link>
  );
}

/** Same footprint as ProductCard, shown while a section loads so the page does not jump. */
export function ProductCardSkeleton() {
  return (
    <div className="flex h-full animate-pulse flex-col p-2" aria-hidden="true">
      <div className="aspect-square rounded-md bg-slate-200" />
      <div className="mt-3 space-y-2">
        <div className="h-3.5 w-full rounded bg-slate-200" />
        <div className="h-3.5 w-2/3 rounded bg-slate-200" />
        <div className="h-3 w-1/2 rounded bg-slate-200" />
        <div className="h-5 w-1/3 rounded bg-slate-200" />
        <div className="h-3 w-3/4 rounded bg-slate-200" />
      </div>
    </div>
  );
}
