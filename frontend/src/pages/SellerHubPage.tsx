import { useEffect } from 'react';
import { Container } from '../components/ui/Container';
import { ButtonLink } from '../components/ui/Button';
import { SellerValidationRow } from '../components/seller/SellerValidationRow';
import { SellerError, SellerPageSkeleton } from '../components/seller/SellerStates';
import { useAuth } from '../context/AuthContext';
import { useAsync } from '../hooks/useAsync';
import { api } from '../lib/api';

/** /seller: the seller hub, with the seller's own demand tests. */
export function SellerHubPage() {
  const { user } = useAuth();
  const list = useAsync(() => api.seller.validations(), [user?.id]);

  useEffect(() => {
    document.title = 'Seller hub — Bazaar';
  }, []);

  const items = list.data?.items ?? [];
  const open = items.filter((i) => i.status === 'open').length;

  return (
    <Container className="py-4 lg:py-6">
      <header className="flex flex-col gap-4 rounded-card bg-white p-4 shadow-card sm:flex-row sm:items-center sm:justify-between sm:p-6">
        <div className="flex min-w-0 items-center gap-3 sm:gap-4">
          <span aria-hidden="true" className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-brand-900 text-xl font-bold text-accent-400 sm:h-14 sm:w-14 sm:text-2xl">
            {user?.seller?.name.trim().charAt(0).toUpperCase()}
          </span>
          <div className="min-w-0">
            <h1 className="text-2xl font-bold text-slate-900 sm:text-3xl">Seller hub</h1>
            <p className="truncate text-base text-slate-700 sm:text-lg" data-testid="store-name">
              {user?.seller?.name}
            </p>
          </div>
        </div>
        <ButtonLink to="/seller/validations/new" className="min-h-11 sm:px-6">
          New demand test
        </ButtonLink>
      </header>

      <section aria-labelledby="demand-tests" className="mt-4 rounded-card bg-white p-4 shadow-card sm:p-6">
        <div className="mb-4 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
          <h2 id="demand-tests" className="text-xl font-bold text-slate-900 sm:text-2xl">
            Demand tests
          </h2>
          {list.data && items.length > 0 && (
            <p className="text-sm text-slate-600" data-testid="test-summary">
              {items.length} {items.length === 1 ? 'test' : 'tests'} · {open} open
            </p>
          )}
        </div>

        {list.loading ? (
          <SellerPageSkeleton label="Loading your demand tests" />
        ) : list.error ? (
          <SellerError error={list.error} onRetry={list.reload} />
        ) : items.length === 0 ? (
          <div data-testid="empty-state" className="flex flex-col items-center rounded-card border border-dashed border-slate-300 bg-slate-50 px-4 py-14 text-center">
            <div aria-hidden="true" className="flex h-16 w-16 items-center justify-center rounded-full bg-accent-400/20 text-3xl">
              💡
            </div>
            <h3 className="mt-4 text-xl font-bold text-slate-900">No demand tests yet</h3>
            <p className="mt-2 max-w-md text-slate-600">Create your first test and see whether shoppers would buy your idea.</p>
            <ButtonLink to="/seller/validations/new" className="mt-6 min-h-11 px-6">
              Create demand test
            </ButtonLink>
          </div>
        ) : (
          <ul className="space-y-3" aria-label="Your demand tests">
            {items.map((item) => (
              <li key={item.id}>
                <SellerValidationRow item={item} />
              </li>
            ))}
          </ul>
        )}
      </section>
    </Container>
  );
}
