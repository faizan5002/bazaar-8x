import { Link } from 'react-router-dom';
import { useAsync } from '../../hooks/useAsync';
import { api } from '../../lib/api';
import { ValidationCard, ValidationCardSkeleton } from '../validation/ValidationCard';
import { EmptyState, ErrorState } from '../ui/StateMessage';

const SHOWN = 4;
const GRID = 'grid grid-cols-2 gap-2 sm:gap-3 lg:grid-cols-4';

/**
 * Homepage "Coming soon" section: open demand tests, most-answered first. It fetches on its own, so if the API call
 * fails only this section shows an error: the rest of the homepage is unaffected.
 *
 * It is the one navy band between the white product panels (like the hero and the seller page), so shoppers can see this is
 * a different kind of thing: products that don't exist yet, where their answer decides whether they get made.
 */
export function ComingSoonSection() {
  const list = useAsync(() => api.validations({ sort: 'popular', limit: SHOWN }).then((page) => page.items), []);

  let body;
  if (list.loading) {
    body = (
      <div className={GRID} aria-busy="true" aria-label="Loading coming soon products">
        {Array.from({ length: SHOWN }, (_, i) => (
          <div key={i} className="rounded-card bg-white">
            <ValidationCardSkeleton />
          </div>
        ))}
      </div>
    );
  } else if (list.error) {
    body = (
      <div className="rounded-card bg-white p-2">
        <ErrorState message={list.error.message} onRetry={list.reload} />
      </div>
    );
  } else if (!list.data?.length) {
    body = (
      <div className="rounded-card bg-white p-2">
        <EmptyState>No products are being tested right now. Check back soon.</EmptyState>
      </div>
    );
  } else {
    body = (
      <ul className={GRID}>
        {list.data.map((v) => (
          <li key={v.id}>
            <ValidationCard validation={v} />
          </li>
        ))}
      </ul>
    );
  }

  const showAll = !list.error && !!list.data?.length;
  return (
    <section id="coming-soon" aria-labelledby="coming-soon-title" className="scroll-mt-4 overflow-hidden rounded-card bg-brand-900 p-4 text-white shadow-card sm:p-6">
      <div className="mb-4 flex items-end justify-between gap-4">
        <div>
          <p className="text-xs font-bold uppercase tracking-widest text-accent-400">New at Bazaar</p>
          <h2 id="coming-soon-title" className="mt-1 text-xl font-bold sm:text-2xl">
            Coming soon: help decide what gets made
          </h2>
          <p className="mt-1 text-sm text-slate-300 sm:text-base">Tell sellers what you&apos;d actually buy before they invest in making it.</p>
        </div>
        {showAll && (
          <Link to="/coming-soon" className="shrink-0 whitespace-nowrap text-sm font-semibold text-accent-400 hover:underline">
            See all
          </Link>
        )}
      </div>
      {body}
    </section>
  );
}
