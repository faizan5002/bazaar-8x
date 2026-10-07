import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Gallery } from '../components/product-detail/Gallery';
import { Badge } from '../components/ui/Badge';
import { Container } from '../components/ui/Container';
import { UsersIcon } from '../components/ui/icons';
import { Panel } from '../components/ui/Panel';
import { ErrorState } from '../components/ui/StateMessage';
import { ValidationNotFound, ValidationSkeleton } from '../components/validation/ValidationStates';
import { VoteBox } from '../components/validation/VoteBox';
import { useAsync } from '../hooks/useAsync';
import { ApiError, api } from '../lib/api';
import { formatLaunchMonth, formatPriceRange, responseCountText } from '../lib/format';
import type { ValidationDetail } from '../types';

function Breadcrumb({ validation }: { validation: ValidationDetail }) {
  return (
    <nav aria-label="Breadcrumb" className="text-sm text-slate-600">
      <ol className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <li>
          <Link to="/" className="hover:text-link hover:underline">
            Home
          </Link>
        </li>
        <li aria-hidden="true">›</li>
        <li>
          <Link to="/coming-soon" className="hover:text-link hover:underline">
            Coming soon
          </Link>
        </li>
        <li aria-hidden="true" className="hidden sm:block">
          ›
        </li>
        <li aria-current="page" className="hidden max-w-full truncate text-slate-900 sm:block">
          {validation.title}
        </li>
      </ol>
    </nav>
  );
}

function ValidationView({ validation, reload }: { validation: ValidationDetail; reload: () => void }) {
  // The count the server last told us (it changes when this shopper answers for the first time).
  const [count, setCount] = useState(validation.responseCount);
  useEffect(() => setCount(validation.responseCount), [validation.responseCount]);
  const closed = validation.status === 'closed';

  return (
    <Container className="py-4 lg:py-6">
      <Breadcrumb validation={validation} />

      {/* Same grid as the product page. DOM order is the phone order: title, gallery, price + about + features, then the vote box.
          md: gallery left | info right, vote box full width below.   lg: gallery | info | vote box. */}
      <div className="mt-3 grid gap-x-8 gap-y-4 rounded-card border-t-4 border-accent-400 bg-white p-4 shadow-card sm:p-6 md:grid-cols-2 md:grid-rows-[auto_1fr_auto] lg:grid-cols-[minmax(0,5fr)_minmax(0,4fr)_minmax(0,3fr)]">
        <header className="min-w-0 space-y-2 md:col-start-2 md:row-start-1">
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone="soon">Coming soon</Badge>
            {closed && <Badge>Closed</Badge>}
          </div>
          <h1 className="text-2xl font-bold leading-snug text-slate-900 lg:text-[1.75rem]" data-testid="validation-title">
            {validation.title}
          </h1>
          <p className="text-lg leading-snug text-slate-700" data-testid="validation-tagline">
            {validation.tagline}
          </p>
        </header>

        <div className="min-w-0 md:col-start-1 md:row-span-2 md:row-start-1 lg:row-span-2">
          <Gallery images={validation.images} title={validation.title} />
        </div>

        <section aria-label="About this demand test" className="min-w-0 space-y-6 md:col-start-2 md:row-start-2">
          <div className="border-t border-line pt-4" data-testid="proposal">
            <p className="text-sm text-slate-600">Proposed price</p>
            <p className="text-3xl font-bold text-slate-900" data-testid="price-range">
              {formatPriceRange(validation.priceMin, validation.priceMax)}
            </p>
            <dl className="mt-3 space-y-1 text-sm">
              <div className="flex gap-2">
                <dt className="text-slate-600">Expected launch:</dt>
                <dd className="font-semibold text-slate-900" data-testid="launch-month">
                  {formatLaunchMonth(validation.expectedLaunch)}
                </dd>
              </div>
              <div className="flex gap-2">
                <dt className="text-slate-600">Proposed by:</dt>
                <dd className="font-semibold text-slate-900" data-testid="seller-name">
                  {validation.seller.name}
                </dd>
              </div>
              <div className="flex gap-2">
                <dt className="text-slate-600">Category:</dt>
                <dd>
                  <Link to={`/coming-soon?category=${validation.category.slug}`} className="text-link hover:underline" data-testid="category-link">
                    {validation.category.name}
                  </Link>
                </dd>
              </div>
            </dl>
            <p className="mt-3 flex items-center gap-2 text-slate-800" data-testid="response-count">
              <UsersIcon width={18} height={18} className="shrink-0 text-slate-500" />
              {responseCountText(count, 'perfect')}
            </p>
          </div>

          <div>
            <h2 className="mb-1.5 text-lg font-bold text-slate-900">About this product</h2>
            <p className="whitespace-pre-line leading-relaxed text-slate-800">{validation.description}</p>
          </div>

          <div>
            <h2 className="mb-2 text-lg font-bold text-slate-900">Proposed features</h2>
            <ul className="space-y-2" data-testid="features">
              {validation.features.map((f) => (
                <li key={f} className="flex gap-3 text-slate-800">
                  <span aria-hidden="true" className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-accent-600" />
                  {f}
                </li>
              ))}
            </ul>
          </div>
        </section>

        <aside aria-label="Your answer" className="md:col-span-2 md:row-start-3 lg:col-span-1 lg:col-start-3 lg:row-span-2 lg:row-start-1 lg:sticky lg:top-4 lg:self-start">
          <VoteBox validation={validation} onCountChange={setCount} onClosed={reload} />
        </aside>
      </div>

      <div className="mt-6">
        <Panel id="how-it-works" title="How demand tests work">
          <ol className="grid gap-3 md:grid-cols-3">
            {[
              'Sellers share an idea before making it, to find out whether shoppers would actually want it.',
              "You're never charged and never committed: answering just tells the seller what you'd consider buying.",
              'Sellers see the totals, never who answered. You can change your answer any time while the test is open.',
            ].map((text, i) => (
              <li key={text} className="flex gap-3 rounded-md border border-line p-3 text-slate-800">
                <span aria-hidden="true" className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-accent-400 text-sm font-bold text-slate-900">
                  {i + 1}
                </span>
                {text}
              </li>
            ))}
          </ol>
        </Panel>
      </div>
    </Container>
  );
}

/** /coming-soon/:id: a proposed product and the "would you consider buying this?" question. */
export function ValidationPage() {
  const { id: param = '' } = useParams();
  // Anything that isn't a positive integer can't be a demand test: don't send it to the API.
  const id = /^[1-9]\d*$/.test(param) ? Number(param) : null;
  const detail = useAsync(() => (id === null ? Promise.reject(new ApiError(404, 'Invalid id')) : api.validation(id)), [id]);

  useEffect(() => {
    document.title = detail.data ? `${detail.data.title}: coming soon — Bazaar` : 'Coming soon — Bazaar';
  }, [detail.data]);

  // Background refreshes (e.g. after a vote is refused because the test closed) keep the page on screen.
  if (detail.loading && !detail.data) return <ValidationSkeleton />;
  if (!detail.data) {
    if (detail.error instanceof ApiError && detail.error.status === 404) return <ValidationNotFound invalidLink={id === null} />;
    return (
      <Container className="py-8">
        <ErrorState message="We couldn't load this demand test. Check your connection and try again." onRetry={detail.reload} />
      </Container>
    );
  }
  return <ValidationView key={detail.data.id} validation={detail.data} reload={detail.reload} />;
}
