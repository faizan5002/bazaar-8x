import { Link } from 'react-router-dom';
import { ChevronLeftIcon, ChevronRightIcon } from '../ui/icons';

interface PaginationProps {
  page: number;
  totalPages: number;
  /** URL for a given page, so every control is a real link (works with back/forward, middle-click, sharing). */
  hrefFor: (page: number) => string;
}

/** 1 … 4 [5] 6 … 12 — always the first and last page, plus the current page and its neighbours. */
function pageItems(page: number, total: number): (number | 'gap-start' | 'gap-end')[] {
  const wanted = new Set([1, total, page - 1, page, page + 1].filter((p) => p >= 1 && p <= total));
  const sorted = [...wanted].sort((a, b) => a - b);
  const out: (number | 'gap-start' | 'gap-end')[] = [];
  sorted.forEach((p, i) => {
    if (i > 0 && p - sorted[i - 1] > 1) out.push(i === 1 ? 'gap-start' : 'gap-end');
    out.push(p);
  });
  return out;
}

const cell = 'inline-flex h-10 min-w-10 items-center justify-center rounded-md px-3 text-sm font-medium';

export function Pagination({ page, totalPages, hrefFor }: PaginationProps) {
  if (totalPages <= 1) return null;
  const prev = page > 1;
  const next = page < totalPages;

  return (
    <nav aria-label="Pagination" className="mt-6 flex flex-wrap items-center justify-center gap-1.5 border-t border-line pt-6">
      {prev ? (
        <Link to={hrefFor(page - 1)} rel="prev" className={`${cell} border border-slate-300 bg-white text-slate-800 hover:bg-slate-50`}>
          <ChevronLeftIcon width={18} height={18} />
          <span className="ml-1 hidden sm:inline">Previous</span>
          <span className="sr-only sm:hidden">Previous</span>
        </Link>
      ) : (
        <span aria-disabled="true" className={`${cell} cursor-not-allowed border border-slate-200 text-slate-400`}>
          <ChevronLeftIcon width={18} height={18} />
          <span className="ml-1 hidden sm:inline">Previous</span>
          <span className="sr-only sm:hidden">Previous</span>
        </span>
      )}

      {pageItems(page, totalPages).map((item) =>
        typeof item === 'string' ? (
          <span key={item} aria-hidden="true" className="px-1 text-slate-500">
            …
          </span>
        ) : item === page ? (
          <span key={item} aria-current="page" aria-label={`Page ${item}, current page`} className={`${cell} bg-brand-900 text-white`}>
            {item}
          </span>
        ) : (
          <Link key={item} to={hrefFor(item)} aria-label={`Go to page ${item}`} className={`${cell} border border-slate-300 bg-white text-slate-800 hover:bg-slate-50`}>
            {item}
          </Link>
        ),
      )}

      {next ? (
        <Link to={hrefFor(page + 1)} rel="next" className={`${cell} border border-slate-300 bg-white text-slate-800 hover:bg-slate-50`}>
          <span className="mr-1 hidden sm:inline">Next</span>
          <span className="sr-only sm:hidden">Next</span>
          <ChevronRightIcon width={18} height={18} />
        </Link>
      ) : (
        <span aria-disabled="true" className={`${cell} cursor-not-allowed border border-slate-200 text-slate-400`}>
          <span className="mr-1 hidden sm:inline">Next</span>
          <span className="sr-only sm:hidden">Next</span>
          <ChevronRightIcon width={18} height={18} />
        </span>
      )}
    </nav>
  );
}
