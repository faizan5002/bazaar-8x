import { useEffect, useMemo } from 'react';
import { Navigate, useSearchParams } from 'react-router-dom';
import { Pagination } from '../components/listing/Pagination';
import { SortSelect } from '../components/listing/SortSelect';
import { Button, ButtonLink } from '../components/ui/Button';
import { Container } from '../components/ui/Container';
import { SearchOffIcon } from '../components/ui/icons';
import { ErrorState } from '../components/ui/StateMessage';
import { ValidationCard, ValidationCardSkeleton } from '../components/validation/ValidationCard';
import { useCategories } from '../context/CatalogContext';
import { useAsync } from '../hooks/useAsync';
import { api } from '../lib/api';
import {
  VALIDATIONS_PAGE_SIZE,
  VALIDATION_SORT_OPTIONS,
  parseComingSoonQuery,
  toComingSoonParams,
  toValidationApiQuery,
  type ComingSoonQuery,
} from '../lib/validationQuery';

const GRID = 'grid grid-cols-2 gap-2 sm:gap-3 lg:grid-cols-3 xl:grid-cols-4';

/** Browse every open demand test. Category, sort and page live in the URL (same approach as the product listing). */
export function ComingSoonPage() {
  const [params, setParams] = useSearchParams();
  const query = useMemo(() => parseComingSoonQuery(params), [params]);
  const canonical = toComingSoonParams(query).toString();
  const { data: categories } = useCategories();

  const result = useAsync(() => api.validations(toValidationApiQuery(query)), [canonical]);
  const { data, loading, error } = result;

  const go = (patch: Partial<ComingSoonQuery>) => setParams(toComingSoonParams({ ...query, page: 1, ...patch }));
  const hrefFor = (page: number) => `/coming-soon?${toComingSoonParams({ ...query, page })}`;

  // Keep the address bar canonical (junk params rewritten in place, no extra history entry).
  useEffect(() => {
    if (params.toString() !== canonical) setParams(new URLSearchParams(canonical), { replace: true });
  }, [params, canonical, setParams]);

  useEffect(() => {
    document.title = 'Coming soon — Bazaar';
  }, []);

  const categoryName = categories?.find((c) => c.slug === query.category)?.name;
  const total = data?.total ?? 0;
  const first = (query.page - 1) * VALIDATIONS_PAGE_SIZE + 1;
  const last = Math.min(query.page * VALIDATIONS_PAGE_SIZE, total);

  // A stale ?page=99 lands on the last real page rather than an empty screen.
  if (data && data.items.length === 0 && total > 0 && query.page > data.totalPages) return <Navigate to={hrefFor(data.totalPages)} replace />;

  let count = 'Searching…';
  if (!loading && !error && data) count = total === 0 ? 'No results' : total <= VALIDATIONS_PAGE_SIZE ? `${total} ${total === 1 ? 'result' : 'results'}` : `${first}–${last} of ${total} results`;
  if (error) count = '';

  let body;
  if (loading) {
    body = (
      <ul className={GRID} aria-hidden="true">
        {Array.from({ length: 8 }, (_, i) => (
          <li key={i}>
            <ValidationCardSkeleton />
          </li>
        ))}
      </ul>
    );
  } else if (error) {
    body = <ErrorState message={error.message} onRetry={result.reload} />;
  } else if (!data?.items.length) {
    body = (
      <div className="flex flex-col items-center px-4 py-12 text-center">
        <SearchOffIcon width={40} height={40} className="text-slate-400" />
        <h2 className="mt-4 text-xl font-bold text-slate-900">No coming-soon products found</h2>
        <p className="mt-2 text-slate-600">{query.category ? 'Try another category.' : 'Nothing is being tested right now. Check back soon.'}</p>
        <div className="mt-6 flex flex-wrap justify-center gap-3">
          {query.category && <Button onClick={() => go({ category: undefined })}>Show all categories</Button>}
          <ButtonLink to="/" variant="ghost">
            Back to shopping
          </ButtonLink>
        </div>
      </div>
    );
  } else {
    body = (
      <>
        <ul className={GRID} aria-label="Coming soon products">
          {data.items.map((v) => (
            <li key={v.id}>
              <ValidationCard validation={v} />
            </li>
          ))}
        </ul>
        <Pagination page={query.page} totalPages={data.totalPages} hrefFor={hrefFor} />
      </>
    );
  }

  const chip = 'shrink-0 whitespace-nowrap rounded-full border px-3.5 py-1.5 text-sm font-medium transition-colors';
  return (
    <Container className="py-4 lg:py-6">
      <section aria-busy={loading} data-results-for={loading ? undefined : canonical} className="overflow-hidden rounded-card bg-white shadow-card">
        <div className="bg-brand-900 p-5 text-white sm:p-8">
          <p className="text-xs font-bold uppercase tracking-widest text-accent-400">New at Bazaar</p>
          <h1 className="mt-1 text-2xl font-bold sm:text-3xl">Coming soon{categoryName ? `: ${categoryName}` : ''}</h1>
          <p className="mt-1 text-lg text-slate-100">Help sellers decide what to make next.</p>
          <p className="mt-1 max-w-3xl text-sm text-slate-300 sm:text-base">Browse proposed products and tell sellers which ones you&apos;d consider buying. Nothing here is for sale yet, and you&apos;re never charged.</p>
        </div>

        <div className="p-4 sm:p-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          {/* Category filter: single choice, scrolls sideways on narrow screens. */}
          <div role="group" aria-label="Filter by category" className="scrollbar-none -mx-1 flex gap-2 overflow-x-auto px-1 py-1">
            <button type="button" aria-pressed={!query.category} onClick={() => go({ category: undefined })} className={`${chip} ${!query.category ? 'border-brand-900 bg-brand-900 text-white' : 'border-slate-300 bg-white text-slate-800 hover:bg-slate-50'}`}>
              All
            </button>
            {categories?.map((c) => (
              <button
                key={c.id}
                type="button"
                aria-pressed={query.category === c.slug}
                onClick={() => go({ category: c.slug })}
                className={`${chip} ${query.category === c.slug ? 'border-brand-900 bg-brand-900 text-white' : 'border-slate-300 bg-white text-slate-800 hover:bg-slate-50'}`}
              >
                {c.name}
              </button>
            ))}
          </div>
          <SortSelect value={query.sort} onChange={(sort) => go({ sort })} options={VALIDATION_SORT_OPTIONS} className="sm:w-60 sm:shrink-0" />
        </div>

        <p role="status" aria-live="polite" className="mt-3 min-h-5 text-sm text-slate-600">
          {count}
        </p>
        <div className="mt-2">{body}</div>
        </div>
      </section>
    </Container>
  );
}
