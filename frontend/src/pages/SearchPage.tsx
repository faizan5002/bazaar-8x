import { useEffect, useMemo, useRef, useState } from 'react';
import { Navigate, useSearchParams } from 'react-router-dom';
import { ActiveFilters } from '../components/listing/ActiveFilters';
import { FilterDrawer } from '../components/listing/FilterDrawer';
import { FilterPanel } from '../components/listing/FilterPanel';
import { Pagination } from '../components/listing/Pagination';
import { ResultsEmpty } from '../components/listing/ResultsEmpty';
import { SortSelect } from '../components/listing/SortSelect';
import { ProductCard, ProductCardSkeleton } from '../components/product/ProductCard';
import { Button } from '../components/ui/Button';
import { Container } from '../components/ui/Container';
import { FilterIcon } from '../components/ui/icons';
import { ErrorState } from '../components/ui/StateMessage';
import { useCategories } from '../context/CatalogContext';
import { useAsync } from '../hooks/useAsync';
import { api } from '../lib/api';
import {
  NO_FILTERS,
  PAGE_SIZE,
  SORT_OPTIONS,
  activeFilterCount,
  filterChips,
  parseListingQuery,
  pickFilters,
  toApiQuery,
  toSearchParams,
  type ListingFilters,
  type ListingQuery,
} from '../lib/listingQuery';

const GRID = 'grid grid-cols-2 gap-1 sm:grid-cols-3 xl:grid-cols-4';

/** The h1: say what the user is looking at. */
function heading(query: ListingQuery, categoryName?: string) {
  if (query.q) return `Results for “${query.q}”`;
  if (categoryName) return categoryName;
  const { deals, featured } = query;
  if (deals && !featured) return "Today's deals";
  if (featured && !deals) return 'Featured products';
  return 'All products';
}

/**
 * Search + category browsing. The URL is the single source of truth for q, category, filters, sort and page,
 * so refresh, back/forward and sharing all work; the page only reads it, fetches, and writes it back.
 */
export function SearchPage() {
  const [params, setParams] = useSearchParams();
  const query = useMemo(() => parseListingQuery(params), [params]);
  const canonical = toSearchParams(query).toString();
  const { data: categories } = useCategories();
  const categoryName = categories?.find((c) => c.slug === query.category)?.name;

  const result = useAsync(() => api.products(toApiQuery(query)), [canonical]);
  const { data, loading, error } = result;

  // Keep the address bar canonical: junk or oddly ordered params (?page=abc, ?sort=bogus) are rewritten in place,
  // without adding a history entry, so the URL always matches what is on screen and shares cleanly.
  useEffect(() => {
    if (params.toString() !== canonical) setParams(new URLSearchParams(canonical), { replace: true });
  }, [params, canonical, setParams]);

  /** Navigate to a new state of the page; any change except an explicit page resets to page 1. */
  const go = (patch: Partial<ListingQuery>) => setParams(toSearchParams({ ...query, page: 1, ...patch }));
  const hrefFor = (page: number) => `/search?${toSearchParams({ ...query, page })}`;
  const clearFilters = () => go({ ...NO_FILTERS });

  // ---- mobile/tablet drawer: edit a draft, commit on Apply
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [draft, setDraft] = useState<ListingFilters>({});
  const openDrawer = () => {
    setDraft(pickFilters(query));
    setDrawerOpen(true);
  };
  const applyDraft = () => {
    go({ ...NO_FILTERS, ...draft });
    setDrawerOpen(false);
  };

  // ---- housekeeping
  useEffect(() => {
    document.title = `${heading(query, categoryName)} — Bazaar`;
  }, [query, categoryName]);

  const resultsTop = useRef<HTMLDivElement>(null);
  const previousPage = useRef(query.page);
  useEffect(() => {
    if (previousPage.current !== query.page) resultsTop.current?.scrollIntoView({ block: 'start' });
    previousPage.current = query.page;
  }, [query.page]);

  // ---- derived view state
  const filters = pickFilters(query);
  const filterCount = activeFilterCount(filters);
  const chips = filterChips(filters, categoryName);
  const total = data?.total ?? 0;
  const first = (query.page - 1) * PAGE_SIZE + 1;
  const last = Math.min(query.page * PAGE_SIZE, total);

  // A stale or hand-edited ?page=99: land on the last real page instead of an empty screen.
  if (data && data.items.length === 0 && total > 0 && query.page > data.totalPages) {
    return <Navigate to={hrefFor(data.totalPages)} replace />;
  }

  let count = 'Searching…';
  if (!loading && !error && data) count = total === 0 ? 'No results' : total <= PAGE_SIZE ? `${total} ${total === 1 ? 'result' : 'results'}` : `${first}–${last} of ${total} results`;
  if (error) count = '';

  let body;
  if (loading) {
    body = (
      <ul className={GRID} aria-hidden="true">
        {Array.from({ length: PAGE_SIZE }, (_, i) => (
          <li key={i}>
            <ProductCardSkeleton />
          </li>
        ))}
      </ul>
    );
  } else if (error) {
    body = <ErrorState message={error.message} onRetry={result.reload} />;
  } else if (!data?.items.length) {
    body = <ResultsEmpty q={query.q} hasFilters={filterCount > 0} onClearFilters={clearFilters} onClearSearch={() => go({ q: undefined })} />;
  } else {
    body = (
      <>
        <ul className={GRID} aria-label="Search results">
          {data.items.map((p) => (
            <li key={p.id}>
              <ProductCard product={p} />
            </li>
          ))}
        </ul>
        <Pagination page={query.page} totalPages={data.totalPages} hrefFor={hrefFor} />
      </>
    );
  }

  return (
    <Container className="py-4 lg:py-6">
      <div className="flex items-start gap-6">
        {/* Desktop: filters apply immediately as you change them. */}
        <aside aria-label="Filters" className="hidden w-64 shrink-0 rounded-card bg-white p-5 shadow-card lg:block">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-lg font-bold">Filters</h2>
            {filterCount > 0 && (
              <button type="button" onClick={clearFilters} className="text-sm font-medium text-link hover:underline">
                Clear all
              </button>
            )}
          </div>
          <FilterPanel value={filters} onChange={(patch) => go(patch)} categories={categories ?? []} />
        </aside>

        <div ref={resultsTop} className="min-w-0 flex-1 scroll-mt-4">
          {/* data-results-for names the query these results belong to (absent while loading); tests and tooling wait on it. */}
          <section aria-busy={loading} data-results-for={loading ? undefined : canonical} className="rounded-card bg-white p-4 shadow-card sm:p-6">
            <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
              <div className="min-w-0">
                <h1 className="text-xl font-bold text-slate-900 sm:text-2xl">{heading(query, categoryName)}</h1>
                <p role="status" aria-live="polite" className="mt-1 min-h-5 text-sm text-slate-600">
                  {count}
                </p>
              </div>
              <div className="flex w-full items-center gap-3 sm:w-auto">
                <Button variant="ghost" onClick={openDrawer} className="h-10 shrink-0 px-3 lg:hidden" aria-haspopup="dialog">
                  <FilterIcon width={18} height={18} />
                  Filters
                  {filterCount > 0 && <span className="rounded-full bg-brand-900 px-1.5 text-xs leading-5 text-white">{filterCount}</span>}
                </Button>
                <SortSelect value={query.sort} onChange={(sort) => go({ sort })} options={SORT_OPTIONS} className="min-w-0 flex-1 sm:flex-none" />
              </div>
            </div>

            {chips.length > 0 && (
              <div className="mt-4">
                <ActiveFilters chips={chips} onRemove={(patch) => go(patch)} onClearAll={clearFilters} />
              </div>
            )}

            <div className="mt-4 border-t border-line pt-4">{body}</div>
          </section>
        </div>
      </div>

      <FilterDrawer open={drawerOpen} onClose={() => setDrawerOpen(false)} onApply={applyDraft} onClearAll={() => setDraft({})}>
        <FilterPanel value={draft} onChange={(patch) => setDraft((d) => ({ ...d, ...patch }))} categories={categories ?? []} />
      </FilterDrawer>
    </Container>
  );
}
