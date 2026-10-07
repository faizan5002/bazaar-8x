import { useEffect } from 'react';
import { Link, Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { ApiError } from '../../lib/api';
import { ButtonLink } from '../ui/Button';
import { SearchOffIcon } from '../ui/icons';
import { ErrorState } from '../ui/StateMessage';

/** Full-width notice used when a seller page can't be shown (not found / access denied). */
function Notice({ title, children }: { title: string; children: string }) {
  return (
    <div role="alert" className="flex flex-col items-center rounded-card bg-white px-4 py-14 text-center shadow-card">
      <SearchOffIcon width={44} height={44} className="text-slate-400" />
      <h1 className="mt-4 text-2xl font-bold text-slate-900">{title}</h1>
      <p className="mt-2 max-w-md text-slate-600">{children}</p>
      <div className="mt-6 flex flex-wrap justify-center gap-3">
        <ButtonLink to="/seller">Back to Seller hub</ButtonLink>
        <ButtonLink to="/" variant="ghost">
          Back to home
        </ButtonLink>
      </div>
    </div>
  );
}

/**
 * What to show when a seller API call fails, by status: 401 → the normal sign-in flow (and back here),
 * 403 → access denied, 404 → not found, anything else → a retry.
 */
export function SellerError({ error, onRetry }: { error: Error; onRetry: () => void }) {
  const { logout } = useAuth();
  const location = useLocation();
  const unauthorized = error instanceof ApiError && error.status === 401;
  useEffect(() => {
    if (unauthorized) logout();
  }, [unauthorized, logout]);

  if (unauthorized) return <Navigate to="/login" replace state={{ from: location.pathname + location.search }} />;
  if (error instanceof ApiError && error.status === 403) {
    return <Notice title="You don't have access to this">Only the seller who created a demand test can see its results. If you have a store, check you are signed in to the right account.</Notice>;
  }
  if (error instanceof ApiError && error.status === 404) {
    return <Notice title="We couldn't find that demand test">It may not exist, or it may belong to another seller.</Notice>;
  }
  return <ErrorState message="We couldn't load this page. Check your connection and try again." onRetry={onRetry} />;
}

/** Back links shown at the top of every seller page, so nobody gets stuck inside the hub. */
export function SellerBreadcrumb({ trail }: { trail: { label: string; to?: string }[] }) {
  return (
    <nav aria-label="Breadcrumb" className="text-sm text-slate-600">
      <ol className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <li>
          <Link to="/" className="hover:text-link hover:underline">
            Home
          </Link>
        </li>
        <li>
          <Link to="/seller" className="hover:text-link hover:underline">
            <span aria-hidden="true">› </span>Seller hub
          </Link>
        </li>
        {trail.map((t, i) => (
          <li key={t.label} aria-current={i === trail.length - 1 ? 'page' : undefined} className={i === trail.length - 1 ? 'max-w-full truncate text-slate-900' : undefined}>
            {t.to ? (
              <Link to={t.to} className="hover:text-link hover:underline">
                <span aria-hidden="true">› </span>
                {t.label}
              </Link>
            ) : (
              <>
                <span aria-hidden="true">› </span>
                {t.label}
              </>
            )}
          </li>
        ))}
      </ol>
    </nav>
  );
}

export function SellerPageSkeleton({ label }: { label: string }) {
  return (
    <div aria-busy="true" aria-label={label} className="animate-pulse space-y-4">
      <div className="h-4 w-1/3 rounded bg-slate-200" />
      <div className="h-40 rounded-card bg-slate-200" />
      <div className="h-24 rounded-card bg-slate-200" />
      <div className="h-24 rounded-card bg-slate-200" />
    </div>
  );
}
