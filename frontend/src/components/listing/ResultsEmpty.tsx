import { Link } from 'react-router-dom';
import { Button, ButtonLink } from '../ui/Button';
import { SearchOffIcon } from '../ui/icons';

interface ResultsEmptyProps {
  q?: string;
  hasFilters: boolean;
  onClearFilters: () => void;
  onClearSearch: () => void;
}

/** Shown when a search/filter combination matches nothing: say so plainly and offer ways forward. */
export function ResultsEmpty({ q, hasFilters, onClearFilters, onClearSearch }: ResultsEmptyProps) {
  return (
    <div className="flex flex-col items-center px-4 py-12 text-center">
      <SearchOffIcon width={40} height={40} className="text-slate-400" />
      <h2 className="mt-4 text-xl font-bold text-slate-900">No products found</h2>
      <p className="mt-2 max-w-md text-slate-600">
        {q ? <>We couldn&apos;t find anything for “{q}”{hasFilters ? ' with the filters you selected' : ''}.</> : 'Nothing matches the filters you selected.'}
      </p>
      <ul className="mt-3 list-disc space-y-1 pl-5 text-left text-sm text-slate-600">
        {q && <li>Check the spelling or try a more general keyword.</li>}
        {hasFilters && <li>Remove some filters to widen your results.</li>}
        <li>Browse our categories to find what you need.</li>
      </ul>
      <div className="mt-6 flex flex-wrap justify-center gap-3">
        {hasFilters && <Button onClick={onClearFilters}>Clear filters</Button>}
        {q && (
          <Button variant={hasFilters ? 'ghost' : 'primary'} onClick={onClearSearch}>
            Clear search
          </Button>
        )}
        <ButtonLink to="/" variant="ghost">
          Back to browsing
        </ButtonLink>
      </div>
      <Link to="/search" className="mt-4 text-sm font-medium text-link hover:underline">
        View all products
      </Link>
    </div>
  );
}
