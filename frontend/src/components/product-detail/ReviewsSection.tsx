import { useAsync } from '../../hooks/useAsync';
import { api } from '../../lib/api';
import { formatDate } from '../../lib/format';
import type { Product, Review } from '../../types';
import { Panel } from '../ui/Panel';
import { Rating } from '../ui/Rating';
import { EmptyState, ErrorState } from '../ui/StateMessage';

const REVIEWS_SHOWN = 10;

function ReviewItem({ review }: { review: Review }) {
  return (
    <article className="border-b border-line py-5 first:pt-0 last:border-b-0 last:pb-0" data-testid="review">
      <div className="flex items-center gap-2.5">
        <span aria-hidden="true" className="flex h-8 w-8 items-center justify-center rounded-full bg-slate-200 text-sm font-semibold text-slate-700">
          {review.authorName.charAt(0).toUpperCase()}
        </span>
        <span className="text-sm font-medium text-slate-900">{review.authorName}</span>
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1">
        <Rating value={review.rating} size={16} />
        <h3 className="font-bold text-slate-900">{review.title}</h3>
      </div>
      <p className="mt-1 text-xs text-slate-600">
        Reviewed on <time dateTime={review.createdAt}>{formatDate(review.createdAt)}</time>
        {review.verifiedPurchase && <span className="ml-2 font-semibold text-warning">Verified Purchase</span>}
      </p>
      <p className="mt-2 whitespace-pre-line text-slate-800">{review.body}</p>
    </article>
  );
}

/**
 * Overall rating + written reviews. The headline average and count are the product's own aggregate (from the product
 * record); the list below is whatever written reviews exist. There is no per-star breakdown because the API can't
 * supply one for the full rating count, and inventing it from a handful of reviews would be misleading.
 */
export function ReviewsSection({ product }: { product: Product }) {
  const reviews = useAsync(() => api.productReviews(product.id, { limit: REVIEWS_SHOWN }), [product.id]);

  let list;
  if (reviews.loading) {
    list = (
      <div className="animate-pulse space-y-6" aria-hidden="true">
        {[0, 1].map((i) => (
          <div key={i} className="space-y-2">
            <div className="h-4 w-1/4 rounded bg-slate-200" />
            <div className="h-4 w-1/2 rounded bg-slate-200" />
            <div className="h-3 w-full rounded bg-slate-200" />
            <div className="h-3 w-4/5 rounded bg-slate-200" />
          </div>
        ))}
      </div>
    );
  } else if (reviews.error) {
    list = <ErrorState message="Reviews couldn't be loaded." onRetry={reviews.reload} />;
  } else if (!reviews.data?.items.length) {
    list = <EmptyState>No customer reviews yet.</EmptyState>;
  } else {
    list = (
      <>
        <div>
          {reviews.data.items.map((r) => (
            <ReviewItem key={r.id} review={r} />
          ))}
        </div>
        {reviews.data.total > reviews.data.items.length && (
          <p className="mt-4 text-sm text-slate-600">
            Showing the {reviews.data.items.length} most recent of {reviews.data.total} reviews.
          </p>
        )}
      </>
    );
  }

  return (
    <Panel id="reviews" title="Customer reviews">
      <div className="grid gap-6 lg:grid-cols-[16rem_minmax(0,1fr)] lg:gap-10">
        <div data-testid="rating-summary">
          <p className="flex items-baseline gap-2">
            <span className="text-4xl font-bold text-slate-900">{product.ratingAverage.toFixed(1)}</span>
            <span className="text-slate-600">out of 5</span>
          </p>
          <div className="mt-1">
            <Rating value={product.ratingAverage} size={22} />
          </div>
          <p className="mt-1 text-sm text-slate-600">{product.reviewCount.toLocaleString('en-US')} global ratings</p>
          <p className="mt-4 text-sm text-slate-600">Below are written reviews from customers.</p>
        </div>
        <div>{list}</div>
      </div>
    </Panel>
  );
}
