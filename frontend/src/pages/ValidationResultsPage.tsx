import { useEffect, useState } from 'react';
import { Link, useLocation, useParams } from 'react-router-dom';
import { CopyLinkButton } from '../components/seller/CopyLinkButton';
import { FeaturesPanel, InsightCards, InterestPanel, PricePanel, SignalPanel, TestFacts, respondedText } from '../components/seller/ResultsSections';
import { StatusBadge } from '../components/seller/SignalChip';
import { SellerBreadcrumb, SellerError, SellerPageSkeleton } from '../components/seller/SellerStates';
import { Button, ButtonLink } from '../components/ui/Button';
import { Container } from '../components/ui/Container';
import { useAsync } from '../hooks/useAsync';
import { ApiError, api } from '../lib/api';
import type { ValidationResults } from '../types';

function ResultsView({ results }: { results: ValidationResults }) {
  const { validation: v } = results;
  const justCreated = !!(useLocation().state as { justCreated?: boolean } | null)?.justCreated;
  const [status, setStatus] = useState(v.status);
  const [changing, setChanging] = useState(false);
  const [statusError, setStatusError] = useState<string | null>(null);
  useEffect(() => setStatus(v.status), [v.status]);

  const publicPath = `/coming-soon/${v.id}`;
  const open = status === 'open';

  const toggle = async () => {
    if (changing) return;
    const next = open ? 'closed' : 'open';
    setChanging(true);
    setStatusError(null);
    try {
      const updated = await api.seller.setStatus(v.id, next);
      setStatus(updated.status);
    } catch (err) {
      setStatusError(err instanceof ApiError ? `We couldn't ${open ? 'close' : 'reopen'} the test: ${err.message}` : `We couldn't reach the store, so the test was NOT ${open ? 'closed' : 'reopened'}. Please try again.`);
    } finally {
      setChanging(false);
    }
  };

  return (
    <Container className="py-4 lg:py-6">
      <SellerBreadcrumb trail={[{ label: v.title }]} />

      {justCreated && open && (
        <div role="status" data-testid="created-banner" className="mt-3 rounded-card bg-green-50 p-4 ring-1 ring-green-300">
          <p className="font-bold text-green-900">Your demand test is live.</p>
          <p className="mt-0.5 text-green-900">
            Shoppers can now find it in{' '}
            <Link to="/coming-soon" className="font-semibold underline">
              Coming soon
            </Link>{' '}
            and answer. Results will appear below as they do.
          </p>
        </div>
      )}

      <header className="mt-3 rounded-card bg-white p-4 shadow-card sm:p-6">
        <div className="flex flex-wrap items-center gap-2">
          <StatusBadge status={status} />
          <span className="text-sm text-slate-500">{v.category.name}</span>
        </div>
        <h1 className="mt-2 text-2xl font-bold leading-snug text-slate-900 sm:text-3xl" data-testid="results-title">
          {v.title}
        </h1>
        <p className="mt-1 text-slate-700">{v.tagline}</p>
        <p className="mt-2 text-lg font-semibold text-slate-900" data-testid="results-responses">
          {respondedText(results.totalResponses)}
        </p>
        <div className="mt-3">
          <TestFacts results={results} />
        </div>

        <div className="mt-4 flex flex-col gap-3 border-t border-line pt-4 sm:flex-row sm:flex-wrap sm:items-start">
          <CopyLinkButton path={publicPath} />
          <ButtonLink to={publicPath} variant="ghost" className="min-h-11">
            View public page
          </ButtonLink>
          <Button type="button" variant={open ? 'ghost' : 'primary'} onClick={toggle} disabled={changing} className="min-h-11 sm:ml-auto">
            {changing ? (open ? 'Closing…' : 'Reopening…') : open ? 'Close test' : 'Reopen test'}
          </Button>
        </div>
        {statusError && (
          <p role="alert" className="mt-3 rounded-md bg-red-50 p-3 text-sm text-red-800 ring-1 ring-red-200">
            {statusError}
          </p>
        )}
        <p className="mt-3 text-sm text-slate-600" data-testid="status-note">
          {open ? 'Open: shoppers can answer this test.' : 'Closed: shoppers can still see the page but can no longer answer. Reopen the test to collect more responses.'}
        </p>
      </header>

      {/* Mobile order = reading order: signal, interest, price, features, insights. Desktop pairs price + features. */}
      <div className="mt-4 space-y-4">
        <SignalPanel results={results} />
        {/* DOM order is the phone reading order (interest, price, features, takeaways). From lg the same sequence flows into two balanced columns. */}
        <div className="space-y-4 lg:columns-2 lg:gap-4 lg:space-y-0">
          <InterestPanel results={results} className="lg:mb-4 lg:break-inside-avoid" />
          <PricePanel results={results} className="lg:mb-4 lg:break-inside-avoid" />
          <FeaturesPanel results={results} className="lg:mb-4 lg:break-inside-avoid" />
          <InsightCards results={results} className="lg:mb-4 lg:break-inside-avoid" />
        </div>
      </div>
    </Container>
  );
}

/** /seller/validations/:id: the results of one demand test. Only its owner can load this (the API decides). */
export function ValidationResultsPage() {
  const { id: param = '' } = useParams();
  const id = /^[1-9]\d*$/.test(param) ? Number(param) : null;
  const results = useAsync(() => (id === null ? Promise.reject(new ApiError(404, 'Invalid id')) : api.seller.results(id)), [id]);

  useEffect(() => {
    document.title = results.data ? `${results.data.validation.title}: results — Bazaar` : 'Demand test results — Bazaar';
  }, [results.data]);

  if (results.loading && !results.data) {
    return (
      <Container className="py-4 lg:py-6">
        <SellerPageSkeleton label="Loading results" />
      </Container>
    );
  }
  if (!results.data) {
    return (
      <Container className="py-8">
        <SellerError error={results.error ?? new Error('Failed')} onRetry={results.reload} />
      </Container>
    );
  }
  return <ResultsView key={results.data.validation.id} results={results.data} />;
}
