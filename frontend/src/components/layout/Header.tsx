import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Link, useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { useCart } from '../../context/CartContext';
import { useCategories } from '../../context/CatalogContext';
import { Container } from '../ui/Container';
import { BoxIcon, CartIcon, PinIcon, SearchIcon, UserIcon, XIcon } from '../ui/icons';

const navItem = 'flex items-center gap-2 rounded-md px-2 py-1.5 hover:bg-brand-800';

function DeliverTo({ className = '' }: { className?: string }) {
  return (
    <div className={`items-center gap-1.5 text-sm leading-tight ${className}`}>
      <PinIcon width={20} height={20} className="text-slate-300" />
      <div>
        <div className="text-xs text-slate-300">Deliver to</div>
        <div className="font-semibold">United States</div>
      </div>
    </div>
  );
}

export function Header() {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const [params] = useSearchParams();
  const inputRef = useRef<HTMLInputElement>(null);
  const { user, logout } = useAuth();
  const { count } = useCart();
  const { data: categories } = useCategories();

  const [q, setQ] = useState(params.get('q') ?? '');
  const [category, setCategory] = useState(params.get('category') ?? '');
  // Keep the box in sync when the URL changes (back/forward, links to /search?...).
  useEffect(() => {
    setQ(params.get('q') ?? '');
    setCategory(params.get('category') ?? '');
  }, [params]);

  // Empties the box; on a results page it also drops the keyword from the URL (keeping category and filters).
  const clearSearch = () => {
    setQ('');
    inputRef.current?.focus();
    if (pathname === '/search' && params.get('q')) {
      const next = new URLSearchParams(params);
      next.delete('q');
      next.delete('page');
      navigate(`/search${next.size ? `?${next}` : ''}`);
    }
  };

  const onSearch = (e: FormEvent) => {
    e.preventDefault();
    const next = new URLSearchParams();
    if (q.trim()) next.set('q', q.trim());
    if (category) next.set('category', category);
    const qs = next.toString();
    navigate(qs ? `/search?${qs}` : '/search');
  };

  return (
    <header className="bg-brand-900 text-white">
      <Container className="flex flex-wrap items-center gap-x-3 gap-y-2 py-2.5 md:flex-nowrap md:gap-x-4">
        <Link to="/" className="shrink-0 text-2xl font-extrabold tracking-tight" aria-label="Bazaar home">
          Bazaar<span className="text-accent-400">.</span>
        </Link>

        <DeliverTo className="hidden shrink-0 xl:flex" />

        {/* On phones the search drops to its own full-width row below the logo and account links. */}
        <form
          onSubmit={onSearch}
          role="search"
          className="order-last flex h-11 w-full min-w-0 overflow-hidden rounded-md bg-white focus-within:ring-2 focus-within:ring-accent-400 md:order-none md:w-auto md:flex-1"
        >
          <select
            aria-label="Search category"
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            className="hidden w-36 shrink-0 truncate border-r border-slate-300 bg-slate-100 px-2 text-sm text-slate-700 focus-visible:outline-offset-[-2px] lg:block"
          >
            <option value="">All categories</option>
            {categories?.map((c) => (
              <option key={c.id} value={c.slug}>
                {c.name}
              </option>
            ))}
          </select>
          <input
            ref={inputRef}
            type="search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search products and brands"
            aria-label="Search products"
            className="min-w-0 flex-1 px-3 text-base text-slate-900 placeholder:text-slate-500 focus:outline-none [&::-webkit-search-cancel-button]:hidden"
          />
          {q && (
            <button type="button" onClick={clearSearch} aria-label="Clear search" className="flex w-10 shrink-0 items-center justify-center text-slate-500 hover:text-slate-900">
              <XIcon width={18} height={18} />
            </button>
          )}
          <button type="submit" aria-label="Search" className="flex w-12 shrink-0 items-center justify-center bg-accent-400 text-slate-900 hover:bg-accent-500">
            <SearchIcon />
          </button>
        </form>

        <nav aria-label="Account" className="ml-auto flex shrink-0 items-center gap-0.5 text-sm md:ml-0">
          {user ? (
            <div className={navItem}>
              <UserIcon />
              <div className="hidden leading-tight lg:block">
                <div className="text-xs text-slate-300">Hello, {user.name.split(' ')[0]}</div>
                <button onClick={logout} className="font-semibold hover:underline">
                  Sign out
                </button>
              </div>
              <button onClick={logout} className="text-xs font-semibold lg:hidden">
                Sign out
              </button>
            </div>
          ) : (
            <Link to="/login" className={navItem} aria-label="Sign in to your account">
              <UserIcon />
              <div className="hidden leading-tight lg:block">
                <div className="text-xs text-slate-300">Hello, sign in</div>
                <div className="font-semibold">Account</div>
              </div>
            </Link>
          )}
          <Link to="/orders" className={navItem} aria-label="Orders">
            <BoxIcon />
            <div className="hidden leading-tight lg:block">
              <div className="text-xs text-slate-300">Returns &amp;</div>
              <div className="font-semibold">Orders</div>
            </div>
          </Link>
          <Link to="/cart" className={navItem} aria-label={`Cart, ${count} ${count === 1 ? 'item' : 'items'}`}>
            <span className="relative">
              <CartIcon width={28} height={28} />
              <span className="absolute -right-2 -top-2 flex h-5 min-w-5 items-center justify-center rounded-full bg-accent-400 px-1 text-xs font-bold text-slate-900">
                {count > 99 ? '99+' : count}
              </span>
            </span>
            <span className="hidden font-semibold lg:inline">Cart</span>
          </Link>
        </nav>
      </Container>
      <DeliverTo className="flex bg-brand-800 px-4 py-2 sm:px-6 xl:hidden" />
    </header>
  );
}
