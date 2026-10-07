import type { ValidationQuery } from '../types';

/** Cards per page on /coming-soon. Divides evenly into the 1-, 2-, 3- and 4-column grids. */
export const VALIDATIONS_PAGE_SIZE = 12;

export type ValidationSort = 'newest' | 'popular';

export const VALIDATION_SORT_OPTIONS: { value: ValidationSort; label: string }[] = [
  { value: 'newest', label: 'Newest' },
  { value: 'popular', label: 'Most responses' },
];

export interface ComingSoonQuery {
  category?: string;
  sort: ValidationSort;
  page: number;
}

/** Lenient URL parsing, like the product listing: anything malformed is dropped rather than sent to the API. */
export function parseComingSoonQuery(params: URLSearchParams): ComingSoonQuery {
  const category = params.get('category')?.trim().toLowerCase() ?? '';
  const page = Number(params.get('page'));
  return {
    category: /^[a-z0-9-]{1,60}$/.test(category) ? category : undefined,
    sort: params.get('sort') === 'popular' ? 'popular' : 'newest',
    page: Number.isInteger(page) && page >= 1 ? page : 1,
  };
}

/** Canonical URL form: stable order, defaults (newest, page 1) omitted. */
export function toComingSoonParams(query: Partial<ComingSoonQuery>): URLSearchParams {
  const params = new URLSearchParams();
  if (query.category) params.set('category', query.category);
  if (query.sort === 'popular') params.set('sort', 'popular');
  if (query.page && query.page > 1) params.set('page', String(query.page));
  return params;
}

export const toValidationApiQuery = (query: ComingSoonQuery): ValidationQuery => ({ category: query.category, sort: query.sort, page: query.page, limit: VALIDATIONS_PAGE_SIZE });
