import { Link, useLocation, useSearchParams } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { useCategories } from '../../context/CatalogContext';
import { Container } from '../ui/Container';
import { MenuIcon } from '../ui/icons';

const link = 'flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-md px-2.5 py-2 text-sm hover:bg-brand-700 sm:px-3';

/** Horizontal category bar built from GET /api/categories (scrolls sideways on narrow screens). */
export function CategoryNav() {
  const { data: categories, loading } = useCategories();
  const { user, loading: authLoading } = useAuth();
  const { pathname } = useLocation();
  const [params] = useSearchParams();
  const active = pathname === '/search' ? params.get('category') : null;
  const onComingSoon = pathname === '/coming-soon' || pathname.startsWith('/coming-soon/');
  // Sellers get their hub; everyone else gets the page that explains selling (and, when signed in, opens a store).
  const isSeller = !!user?.seller;
  const onSell = isSeller ? pathname === '/seller' || pathname.startsWith('/seller/') : pathname === '/sell';

  return (
    <nav aria-label="Categories" className="bg-brand-800 text-white">
      <Container className="scrollbar-none flex items-center gap-0.5 overflow-x-auto py-1">
        <Link to="/search" className={`${link} font-semibold`}>
          <MenuIcon width={18} height={18} />
          All
        </Link>
        <Link to="/search?deals=true" className={`${link} font-semibold text-accent-400`}>
          Today&apos;s deals
        </Link>
        <Link to="/coming-soon" aria-current={onComingSoon ? 'page' : undefined} className={`${link} font-semibold ${onComingSoon ? 'bg-brand-700' : ''}`}>
          Coming soon
        </Link>
        {!authLoading && (
          <Link to={isSeller ? '/seller' : '/sell'} aria-current={onSell ? 'page' : undefined} className={`${link} font-semibold ${onSell ? 'bg-brand-700' : ''}`}>
            {isSeller ? 'Seller hub' : 'Sell'}
          </Link>
        )}
        {loading &&
          Array.from({ length: 6 }, (_, i) => <span key={i} aria-hidden="true" className="mx-2 h-4 w-20 shrink-0 animate-pulse rounded bg-brand-700" />)}
        {categories?.map((c) => (
          <Link key={c.id} to={`/search?category=${c.slug}`} aria-current={active === c.slug ? 'page' : undefined} className={`${link} ${active === c.slug ? 'bg-brand-700 font-semibold' : ''}`}>
            {c.name}
          </Link>
        ))}
      </Container>
    </nav>
  );
}
