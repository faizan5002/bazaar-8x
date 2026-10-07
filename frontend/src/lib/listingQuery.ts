import type { ProductQuery, ProductSort } from '../types';
import { formatPrice } from './format';

/** Products per results page. Divides evenly into the 2-, 3- and 4-column grids. */
export const PAGE_SIZE = 12;

export const SORT_OPTIONS: { value: ProductSort; label: string }[] = [
  { value: 'relevance', label: 'Relevance' },
  { value: 'price_asc', label: 'Price: Low to High' },
  { value: 'price_desc', label: 'Price: High to Low' },
  { value: 'rating', label: 'Avg. customer rating' },
  { value: 'popular', label: 'Best sellers' },
  { value: 'newest', label: 'Newest arrivals' },
];

/** Everything the sidebar / drawer can change. */
export interface ListingFilters {
  category?: string;
  minPrice?: number;
  maxPrice?: number;
  minRating?: number;
  inStock?: boolean;
  deals?: boolean;
  featured?: boolean;
}

/** The full state of the listing page. It lives in the URL; this is just its typed form. */
export interface ListingQuery extends ListingFilters {
  q?: string;
  sort: ProductSort;
  page: number;
}

const SORTS = new Set<string>(SORT_OPTIONS.map((o) => o.value));

/** Used to wipe every filter at once: spread over a query to reset it. */
export const NO_FILTERS: Record<keyof ListingFilters, undefined> = {
  category: undefined,
  minPrice: undefined,
  maxPrice: undefined,
  minRating: undefined,
  inStock: undefined,
  deals: undefined,
  featured: undefined,
};

const number = (raw: string | null, max = Infinity) => {
  if (raw === null || raw.trim() === '') return undefined;
  const n = Number(raw);
  return Number.isFinite(n) && n >= 0 && n <= max ? n : undefined;
};
const flag = (raw: string | null) => (raw === 'true' ? true : undefined);

/**
 * Reads the URL leniently: anything malformed (?page=abc, ?sort=bogus, ?minPrice=-3) is dropped rather than
 * sent to the API, so a hand-edited or stale link degrades to a sensible page instead of a 400.
 */
export function parseListingQuery(params: URLSearchParams): ListingQuery {
  const page = Number(params.get('page'));
  const category = params.get('category')?.trim().toLowerCase() ?? '';
  const sort = params.get('sort') ?? '';
  return {
    q: params.get('q')?.trim().slice(0, 100) || undefined,
    category: /^[a-z0-9-]{1,60}$/.test(category) ? category : undefined,
    minPrice: number(params.get('minPrice')),
    maxPrice: number(params.get('maxPrice')),
    minRating: number(params.get('minRating'), 5),
    inStock: flag(params.get('inStock')),
    deals: flag(params.get('deals')),
    featured: flag(params.get('featured')),
    sort: SORTS.has(sort) ? (sort as ProductSort) : 'relevance',
    page: Number.isInteger(page) && page >= 1 ? page : 1,
  };
}

/** Serializes to a canonical URL: stable key order, defaults omitted (page 1, relevance). */
export function toSearchParams(query: Partial<ListingQuery>): URLSearchParams {
  const params = new URLSearchParams();
  const set = (key: string, value: string | number | boolean | undefined) => value !== undefined && params.set(key, String(value));
  set('q', query.q?.trim() || undefined);
  set('category', query.category);
  set('minPrice', query.minPrice);
  set('maxPrice', query.maxPrice);
  set('minRating', query.minRating);
  set('inStock', query.inStock ? true : undefined);
  set('deals', query.deals ? true : undefined);
  set('featured', query.featured ? true : undefined);
  set('sort', query.sort && query.sort !== 'relevance' ? query.sort : undefined);
  set('page', query.page && query.page > 1 ? query.page : undefined);
  return params;
}

export function toApiQuery(query: ListingQuery): ProductQuery {
  const { page, sort, ...rest } = query;
  return { ...rest, sort, page, limit: PAGE_SIZE };
}

export const pickFilters = (q: ListingQuery): ListingFilters => ({
  category: q.category,
  minPrice: q.minPrice,
  maxPrice: q.maxPrice,
  minRating: q.minRating,
  inStock: q.inStock,
  deals: q.deals,
  featured: q.featured,
});

export const activeFilterCount = (q: ListingFilters) =>
  [q.category, q.minPrice ?? q.maxPrice, q.minRating, q.inStock, q.deals, q.featured].filter((v) => v !== undefined).length;

/** Human label for a price bound pair: "Under $25", "$25 – $50", "$200 & above". */
export function priceRangeLabel(min?: number, max?: number) {
  if (min !== undefined && max !== undefined) return `${formatPrice(min)} – ${formatPrice(max)}`;
  if (max !== undefined) return `Under ${formatPrice(max)}`;
  if (min !== undefined) return `${formatPrice(min)} & above`;
  return '';
}

export interface FilterChip {
  key: string;
  label: string;
  /** Applying this patch removes the filter. */
  remove: Partial<ListingFilters>;
}

export function filterChips(filters: ListingFilters, categoryName?: string): FilterChip[] {
  const chips: FilterChip[] = [];
  if (filters.category) chips.push({ key: 'category', label: categoryName ?? filters.category, remove: { category: undefined } });
  if (filters.minPrice !== undefined || filters.maxPrice !== undefined) {
    chips.push({ key: 'price', label: priceRangeLabel(filters.minPrice, filters.maxPrice), remove: { minPrice: undefined, maxPrice: undefined } });
  }
  if (filters.minRating !== undefined) chips.push({ key: 'rating', label: `${filters.minRating}★ & up`, remove: { minRating: undefined } });
  if (filters.inStock) chips.push({ key: 'inStock', label: 'In stock', remove: { inStock: undefined } });
  if (filters.deals) chips.push({ key: 'deals', label: "Today's deals", remove: { deals: undefined } });
  if (filters.featured) chips.push({ key: 'featured', label: 'Featured', remove: { featured: undefined } });
  return chips;
}
