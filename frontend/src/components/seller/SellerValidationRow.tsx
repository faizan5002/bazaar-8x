import { Link } from 'react-router-dom';
import { formatDate } from '../../lib/format';
import { sizedImage } from '../../lib/images';
import type { SellerValidationItem } from '../../types';
import { ButtonLink } from '../ui/Button';
import { SafeImage } from '../ui/SafeImage';
import { SignalChip, StatusBadge } from './SignalChip';

export const responsesText = (n: number) => (n === 0 ? 'No responses yet' : `${n.toLocaleString('en-US')} ${n === 1 ? 'response' : 'responses'}`);

/** One of the seller's demand tests: the headline numbers straight from GET /seller/validations. */
export function SellerValidationRow({ item }: { item: SellerValidationItem }) {
  const hasResponses = item.responseCount > 0;
  const href = `/seller/validations/${item.id}`;
  return (
    <article data-testid="seller-validation" className="grid grid-cols-[5.5rem_minmax(0,1fr)] gap-x-3 gap-y-3 rounded-card border border-line bg-white p-3 transition-shadow hover:shadow-card-hover sm:grid-cols-[9rem_minmax(0,1fr)_auto] sm:items-center sm:gap-x-5 sm:p-4">
      <Link to={href} tabIndex={-1} aria-hidden="true" className="block">
        <div className="aspect-[4/3] overflow-hidden rounded-md bg-slate-100">
          <SafeImage src={sizedImage(item.image ?? undefined, 320)} alt="" width={320} height={240} className="h-full w-full object-cover" />
        </div>
      </Link>

      <div className="min-w-0 space-y-1.5">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <StatusBadge status={item.status} />
          <span className="text-xs text-slate-500">Created {formatDate(item.createdAt)}</span>
        </div>
        <h3 className="text-base font-bold leading-snug text-slate-900 sm:text-lg">
          <Link to={href} className="hover:text-link hover:underline">
            {item.title}
          </Link>
        </h3>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
          <p className="font-semibold text-slate-900" data-testid="response-total">
            {responsesText(item.responseCount)}
          </p>
          <p data-testid="signal-label">
            <SignalChip level={item.signal.level} label={item.signal.label} />
          </p>
        </div>
        {hasResponses && (
          <div className="pt-0.5">
            {/* The same three shares as the sentence below, drawn as one bar (widths are the API's percentages). */}
            <div aria-hidden="true" className="flex h-2 w-full max-w-md overflow-hidden rounded-full bg-slate-100">
              <span className="bg-green-600" style={{ width: `${item.interestedPercent}%` }} />
              <span className="bg-amber-500" style={{ width: `${item.maybePercent}%` }} />
              <span className="bg-slate-400" style={{ width: `${item.notInterestedPercent}%` }} />
            </div>
            <p className="mt-1.5 text-xs text-slate-700 sm:text-sm" data-testid="interest-split">
              <span className="font-semibold">{item.interestedPercent}%</span> Interested · <span className="font-semibold">{item.maybePercent}%</span> Maybe ·{' '}
              <span className="font-semibold">{item.notInterestedPercent}%</span> Not interested
            </p>
          </div>
        )}
      </div>

      <ButtonLink to={href} variant="ghost" className="col-span-2 min-h-11 sm:col-span-1 sm:self-center">
        View results
        <span className="sr-only"> for {item.title}</span>
      </ButtonLink>
    </article>
  );
}
