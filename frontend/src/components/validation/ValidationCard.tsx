import { Link } from 'react-router-dom';
import { formatPriceRange, responseCountText } from '../../lib/format';
import { sizedImage } from '../../lib/images';
import type { ValidationCard as ValidationCardData } from '../../types';
import { Badge } from '../ui/Badge';
import { UsersIcon } from '../ui/icons';
import { SafeImage } from '../ui/SafeImage';

/**
 * A product idea that is being tested, NOT a product. It deliberately has no add-to-cart, no stock, no shipping and no
 * delivery date: only what the idea is, the proposed price, how many shoppers have weighed in, and who proposed it.
 * The whole card is one link to the demand test.
 */
export function ValidationCard({ validation: v, preview = false, priceLabel }: { validation: ValidationCardData; preview?: boolean; priceLabel?: string }) {
  const content = (
    <>
      <div className="relative aspect-[4/3] overflow-hidden rounded-md bg-slate-100">
        <SafeImage src={sizedImage(v.image ?? undefined, 640)} alt={v.title} width={640} height={480} className="h-full w-full object-cover" />
        <span className="absolute left-2 top-2">
          <Badge tone="soon">Coming soon</Badge>
        </span>
      </div>

      <div className="mt-3 flex flex-1 flex-col gap-1.5">
        <h3 className="line-clamp-2 text-sm font-semibold leading-snug text-slate-900 group-hover:text-link sm:text-base">{v.title}</h3>
        <p className="line-clamp-2 text-xs leading-snug text-slate-600 sm:text-sm">{v.tagline}</p>
        <p className="mt-1 flex flex-wrap items-baseline gap-x-1.5">
          <span className="text-xs text-slate-500">Proposed price</span>
          <span className="text-base font-semibold text-slate-900 sm:text-lg" data-testid="price-range">
            {priceLabel ?? formatPriceRange(v.priceMin, v.priceMax)}
          </span>
        </p>
        <p className="flex items-center gap-1.5 text-xs text-slate-700 sm:text-sm" data-testid="response-count">
          <UsersIcon width={16} height={16} className="shrink-0 text-slate-500" />
          {responseCountText(v.responseCount)}
        </p>
        <p className="mt-auto pt-1 text-xs text-slate-500">
          by <span className="text-slate-700">{v.seller.name}</span>
        </p>
      </div>
    </>
  );

  // `preview` draws the very same card as a plain block that goes nowhere (the seller's "how shoppers will see it").
  if (preview) {
    return (
      <div data-testid="validation-card-preview" className="flex h-full flex-col rounded-card bg-amber-50 p-2 shadow-card ring-1 ring-amber-200">
        {content}
      </div>
    );
  }
  return (
    <Link
      data-testid="validation-card"
      to={`/coming-soon/${v.id}`}
      className="group flex h-full flex-col rounded-card bg-amber-50 p-2 ring-1 ring-amber-200 transition hover:bg-white hover:shadow-card-hover hover:ring-accent-400"
    >
      {content}
    </Link>
  );
}

/** Same footprint as the card, shown while a list loads. */
export function ValidationCardSkeleton() {
  return (
    <div className="flex h-full animate-pulse flex-col p-2" aria-hidden="true">
      <div className="aspect-[4/3] rounded-md bg-slate-200" />
      <div className="mt-3 space-y-2">
        <div className="h-4 w-4/5 rounded bg-slate-200" />
        <div className="h-3.5 w-full rounded bg-slate-200" />
        <div className="h-5 w-1/3 rounded bg-slate-200" />
        <div className="h-3.5 w-1/2 rounded bg-slate-200" />
        <div className="h-3 w-2/5 rounded bg-slate-200" />
      </div>
    </div>
  );
}
