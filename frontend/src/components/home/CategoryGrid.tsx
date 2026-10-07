import { Link } from 'react-router-dom';
import { useCategories } from '../../context/CatalogContext';
import { sizedImage } from '../../lib/images';
import { Panel } from '../ui/Panel';
import { SafeImage } from '../ui/SafeImage';
import { EmptyState, ErrorState } from '../ui/StateMessage';

const GRID = 'grid grid-cols-2 gap-3 sm:gap-4 md:grid-cols-4';

/** "Browse by category": one card per category returned by GET /api/categories. */
export function CategoryGrid() {
  const { data, loading, error, reload } = useCategories();

  let body;
  if (loading) {
    body = (
      <div className={GRID} aria-hidden="true">
        {Array.from({ length: 8 }, (_, i) => (
          <div key={i} className="animate-pulse">
            <div className="aspect-[4/3] rounded-md bg-slate-200" />
            <div className="mt-2 h-4 w-2/3 rounded bg-slate-200" />
          </div>
        ))}
      </div>
    );
  } else if (error) {
    body = <ErrorState message={error.message} onRetry={reload} />;
  } else if (!data?.length) {
    body = <EmptyState>No categories are available yet.</EmptyState>;
  } else {
    body = (
      <ul className={GRID}>
        {data.map((c) => (
          <li key={c.id}>
            <Link to={`/search?category=${c.slug}`} className="group block rounded-md focus-visible:outline-offset-4">
              <div className="aspect-[4/3] overflow-hidden rounded-md bg-slate-100">
                <SafeImage
                  src={sizedImage(c.imageUrl ?? undefined, 600)}
                  alt=""
                  width={600}
                  height={450}
                  className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
                />
              </div>
              <span className="mt-2 block text-sm font-semibold text-slate-900 group-hover:text-link sm:text-base">{c.name}</span>
              <span className="text-xs text-link group-hover:underline">Shop now</span>
            </Link>
          </li>
        ))}
      </ul>
    );
  }

  return (
    <Panel id="categories" title="Browse by category">
      {body}
    </Panel>
  );
}
