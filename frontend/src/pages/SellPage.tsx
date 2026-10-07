import { useEffect, useState, type FormEvent } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import { Button, ButtonLink } from '../components/ui/Button';
import { CheckCircleIcon, UsersIcon } from '../components/ui/icons';
import { Container } from '../components/ui/Container';
import { useAuth } from '../context/AuthContext';
import { ApiError, api } from '../lib/api';
import type { SellerSummary } from '../types';

const inputClass = 'mt-1 w-full rounded-md border border-slate-300 bg-white px-3 py-2.5 text-base text-slate-900 focus:border-accent-500 focus:outline-none focus:ring-2 focus:ring-accent-400/40';

const STEPS = [
  { title: 'Show your idea', text: 'Describe the product you are thinking of making, with a photo, the features and a price range.' },
  { title: 'Shoppers respond', text: 'Shoppers tell you whether they would consider buying it, at what price, and which feature matters most.' },
  { title: 'Decide with evidence', text: 'See the demand signal, the price sweet spot and the most wanted features before you spend on stock.' },
];

/** /sell: why test demand first, and (for a signed-in shopper) a short form to open a seller account. */
export function SellPage() {
  const { user, loading, setSeller } = useAuth();
  const navigate = useNavigate();
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [error, setError] = useState<string | null>(null);
  // Set when the API says this account already has a store (e.g. opened in another tab): the store the app didn't know about yet.
  const [existing, setExisting] = useState<SellerSummary | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    document.title = 'Sell on Bazaar — test demand before you build';
  }, []);

  // A store owner has nothing to sign up for: take them to their hub.
  if (user?.seller) return <Navigate to="/seller" replace />;

  const nameProblem = name.trim().length > 0 && name.trim().length < 2 ? 'Store name must be at least 2 characters.' : null;

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (submitting) return;
    if (name.trim().length < 2) {
      setError('Enter a store name (at least 2 characters).');
      return;
    }
    setSubmitting(true);
    setError(null);
    setExisting(null);
    try {
      const store = await api.createSeller({ name: name.trim(), ...(description.trim() ? { description: description.trim() } : {}) });
      setSeller({ id: store.id, name: store.name, slug: store.slug });
      navigate('/seller', { replace: true });
    } catch (err) {
      if (err instanceof ApiError && err.status === 409) {
        // Learn which store it is, so the link below lands in the hub instead of bouncing back here.
        api.auth.me().then((me) => me.seller && setExisting(me.seller)).catch(() => undefined);
      }
      setError(err instanceof ApiError ? err.message : "We couldn't reach the store, so your seller account was NOT created. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Container className="py-4 lg:py-6">
      <div className="overflow-hidden rounded-card bg-brand-900 text-white shadow-card">
        <div className="grid gap-8 p-6 sm:p-8 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)] lg:p-12">
          <div>
            <p className="text-sm font-semibold uppercase tracking-wide text-accent-400">Sell on Bazaar</p>
            <h1 className="mt-2 text-3xl font-extrabold leading-tight sm:text-4xl">Test demand before you build.</h1>
            <p className="mt-4 max-w-xl text-lg text-slate-200">
              Have a product idea? Show it to shoppers, collect demand signals, and learn what price and features they actually want before investing in inventory.
            </p>
            <ul className="mt-6 space-y-3 text-slate-200">
              {['No inventory needed to start', 'See real shopper interest, price and feature preferences', 'Close or reopen a test whenever you like'].map((t) => (
                <li key={t} className="flex items-start gap-2">
                  <CheckCircleIcon width={22} height={22} className="mt-0.5 shrink-0 text-accent-400" />
                  {t}
                </li>
              ))}
            </ul>
          </div>

          <div className="rounded-card bg-white p-5 text-slate-900 sm:p-6" id="open-account">
            {loading ? (
              <div aria-busy="true" aria-label="Loading" className="h-56 animate-pulse rounded-md bg-slate-100" />
            ) : !user ? (
              <div data-testid="signed-out-sell">
                <h2 className="text-xl font-bold">Open a seller account</h2>
                <p className="mt-2 text-slate-600">Sign in or create a shopper account first. Opening a store takes under a minute.</p>
                <div className="mt-5 flex flex-col gap-3 sm:flex-row lg:flex-col xl:flex-row">
                  <ButtonLink to="/login" state={{ from: '/sell' }} className="min-h-11 flex-1">
                    Sign in to continue
                  </ButtonLink>
                  <ButtonLink to="/register" state={{ from: '/sell' }} variant="ghost" className="min-h-11 flex-1">
                    Create an account
                  </ButtonLink>
                </div>
              </div>
            ) : (
              <form onSubmit={onSubmit} noValidate aria-label="Open a seller account">
                <h2 className="text-xl font-bold">Open a seller account</h2>
                <p className="mt-1 text-sm text-slate-600">Signed in as {user.email}.</p>
                {error && (
                  <div role="alert" className="mt-4 rounded-md bg-red-50 p-3 text-sm text-red-800 ring-1 ring-red-200">
                    {error}
                    {existing && (
                      <>
                        {' '}
                        <Link to="/seller" onClick={() => setSeller(existing)} className="font-semibold underline">
                          Go to Seller hub
                        </Link>
                      </>
                    )}
                  </div>
                )}
                <label className="mt-4 block text-sm font-medium">
                  Store name
                  <input
                    className={inputClass}
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    maxLength={60}
                    autoComplete="organization"
                    aria-invalid={!!nameProblem}
                    aria-describedby={nameProblem ? 'store-name-problem' : undefined}
                  />
                  {nameProblem && (
                    <span id="store-name-problem" className="mt-1 block text-sm text-red-700">
                      {nameProblem}
                    </span>
                  )}
                </label>
                <label className="mt-4 block text-sm font-medium">
                  Store description <span className="font-normal text-slate-500">(optional)</span>
                  <textarea className={`${inputClass} min-h-24`} value={description} onChange={(e) => setDescription(e.target.value)} maxLength={500} rows={3} />
                </label>
                <Button type="submit" fullWidth disabled={submitting} className="mt-5 min-h-11">
                  {submitting ? 'Opening your store…' : 'Open a seller account'}
                </Button>
                <p className="mt-3 text-xs text-slate-500">There&apos;s no fee and nothing to list yet: you&apos;ll start by testing an idea.</p>
              </form>
            )}
          </div>
        </div>
      </div>

      <section aria-labelledby="how-sell-works" className="mt-6 rounded-card bg-white p-4 shadow-card sm:p-6">
        <h2 id="how-sell-works" className="flex items-center gap-2 text-xl font-bold text-slate-900 sm:text-2xl">
          <UsersIcon width={24} height={24} className="text-accent-600" />
          How demand tests work
        </h2>
        <ol className="mt-4 grid gap-4 md:grid-cols-3">
          {STEPS.map((s, i) => (
            <li key={s.title} className="rounded-md border border-line p-4">
              <span className="flex h-8 w-8 items-center justify-center rounded-full bg-accent-400 font-bold text-slate-900" aria-hidden="true">
                {i + 1}
              </span>
              <h3 className="mt-3 font-bold text-slate-900">{s.title}</h3>
              <p className="mt-1 text-slate-700">{s.text}</p>
            </li>
          ))}
        </ol>
      </section>
    </Container>
  );
}
