import { useEffect, useRef, useState, type ComponentType, type FormEvent, type SVGProps } from 'react';
import { Link, useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { useAsync } from '../../hooks/useAsync';
import { ApiError, api } from '../../lib/api';
import type { Interest, MyResponse, ValidationDetail } from '../../types';
import { Button } from '../ui/Button';
import { CheckCircleIcon, HelpCircleIcon, XCircleIcon } from '../ui/icons';
import { ErrorState } from '../ui/StateMessage';

interface VoteBoxProps {
  validation: ValidationDetail;
  /** The server's updated response count, so the page can show it. */
  onCountChange: (count: number) => void;
  /** The server said the test is closed: refresh the validation. */
  onClosed: () => void;
}

interface Choice {
  value: Interest;
  label: string;
  Icon: ComponentType<SVGProps<SVGSVGElement>>;
  /** Selected-state colours. Colour is never the only cue: selected choices also get a thick border and a check mark. */
  selected: string;
}

const CHOICES: Choice[] = [
  { value: 'interested', label: 'Interested', Icon: CheckCircleIcon, selected: 'border-green-600 bg-green-50' },
  { value: 'maybe', label: 'Maybe', Icon: HelpCircleIcon, selected: 'border-amber-500 bg-amber-50' },
  { value: 'not_interested', label: 'Not interested', Icon: XCircleIcon, selected: 'border-slate-700 bg-slate-100' },
];
const LABELS: Record<Interest, string> = { interested: 'Interested', maybe: 'Maybe', not_interested: 'Not interested' };
const isInterest = (v: string | null): v is Interest => v === 'interested' || v === 'maybe' || v === 'not_interested';

interface Draft {
  interest: Interest | null;
  priceBucket: number | null;
  topFeature: string | null;
}
const EMPTY: Draft = { interest: null, priceBucket: null, topFeature: null };

const chipBase = 'inline-flex min-h-11 items-center gap-1.5 rounded-full border px-4 py-2 text-sm font-medium transition-colors';

/**
 * "Would you consider buying this?": the one interaction of the demand-validation feature.
 *
 * Which of these the shopper sees is decided from API data, in this order: loading → closed → owner (the signed-in
 * user's own seller account, from /auth/me) → signed out (choices that lead to sign-in) → their saved answer →
 * the form. The server remains the authority: a 403 turns into the owner state, a 409 into the closed state.
 * Browsing is public; only answering needs an account. No percentages are ever shown to shoppers (deliberately: so
 * the crowd can't bias them).
 */
export function VoteBox({ validation, onCountChange, onClosed }: VoteBoxProps) {
  const { user, loading: authLoading, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [params, setParams] = useSearchParams();

  const [ownerPerServer, setOwnerPerServer] = useState(false);
  const [closedPerServer, setClosedPerServer] = useState(false);
  const isOwner = ownerPerServer || (!!user?.seller && user.seller.id === validation.seller.id);
  const closed = validation.status === 'closed' || closedPerServer;
  const active = !!user && !isOwner && !closed;

  // The shopper's own existing answer, if any.
  const mine = useAsync(() => (active ? api.myValidationResponse(validation.id).then((r) => r.response) : Promise.resolve(null)), [validation.id, user?.id, active]);
  const [saved, setSaved] = useState<MyResponse | null | undefined>(undefined); // undefined = not known yet
  useEffect(() => {
    if (active && !mine.loading && !mine.error) setSaved(mine.data);
  }, [active, mine.loading, mine.error, mine.data]);

  const [draft, setDraft] = useState<Draft>(EMPTY);
  const [editing, setEditing] = useState(false);
  const [justSubmitted, setJustSubmitted] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const submittingRef = useRef(false); // blocks a second submit in the same tick, before React re-renders
  const [error, setError] = useState<string | null>(null);
  const savedRef = useRef<HTMLDivElement>(null);
  const questionRef = useRef<HTMLButtonElement>(null);

  // Coming back from sign-in with ?vote=… selects that choice (it is NOT submitted: the shopper still confirms).
  const voteParam = params.get('vote');
  useEffect(() => {
    if (!voteParam || !active || saved === undefined) return;
    if (saved === null && isInterest(voteParam)) setDraft((d) => ({ ...d, interest: voteParam }));
    const next = new URLSearchParams(params);
    next.delete('vote');
    setParams(next, { replace: true });
  }, [voteParam, active, saved, params, setParams]);

  useEffect(() => {
    if (justSubmitted) savedRef.current?.focus();
  }, [justSubmitted]);

  const choose = (interest: Interest) => {
    if (!user) {
      // Sign in, then come straight back to this test with the choice already selected.
      navigate('/login', { state: { from: `${location.pathname}?vote=${interest}` } });
      return;
    }
    setError(null);
    setDraft((d) => ({ ...d, interest }));
  };

  const startEditing = () => {
    setDraft(saved ? { interest: saved.interest, priceBucket: saved.priceBucket, topFeature: saved.topFeature } : EMPTY);
    setError(null);
    setJustSubmitted(false);
    setEditing(true);
    requestAnimationFrame(() => questionRef.current?.focus());
  };

  const submit = async (e?: FormEvent) => {
    e?.preventDefault();
    if (!draft.interest || submittingRef.current) return;
    submittingRef.current = true;
    setSubmitting(true);
    setError(null);
    const wantsDetails = draft.interest !== 'not_interested'; // the follow-ups only apply to people who might buy
    try {
      const result = await api.respondToValidation(validation.id, {
        interest: draft.interest,
        ...(wantsDetails && draft.priceBucket !== null ? { priceBucket: draft.priceBucket } : {}),
        ...(wantsDetails && draft.topFeature !== null ? { topFeature: draft.topFeature } : {}),
      });
      setSaved(result.response);
      onCountChange(result.responseCount);
      setEditing(false);
      setJustSubmitted(true);
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        logout(); // the session is no good: use the normal sign-in flow and return here
        navigate('/login', { state: { from: location.pathname } });
      } else if (err instanceof ApiError && err.status === 403) setOwnerPerServer(true);
      else if (err instanceof ApiError && err.status === 409) {
        setClosedPerServer(true);
        onClosed();
      } else if (err instanceof ApiError && err.status === 404) setError("We couldn't find that demand test.");
      else if (err instanceof ApiError) setError(err.message);
      else setError("We couldn't reach the store, so your answer was NOT saved. Please try again.");
    } finally {
      submittingRef.current = false;
      setSubmitting(false);
    }
  };

  // ---- pieces ---------------------------------------------------------------------------------------------------

  const banner = (
    <div className="mb-4 rounded-md bg-amber-50 px-3 py-2.5 ring-1 ring-amber-200">
      <p className="text-xs font-bold uppercase tracking-wide text-warning">Not available to buy yet</p>
      <p className="mt-0.5 text-sm text-slate-700">This product doesn&apos;t exist yet. The seller is finding out if it&apos;s worth making.</p>
    </div>
  );

  const choices = (
    <div role="group" aria-labelledby="vote-question" className="space-y-2.5">
      {CHOICES.map(({ value, label, Icon, selected }, i) => {
        const on = draft.interest === value;
        return (
          <button
            key={value}
            ref={i === 0 ? questionRef : undefined}
            type="button"
            aria-pressed={on}
            onClick={() => choose(value)}
            className={`flex min-h-14 w-full items-center gap-3 rounded-md border-2 px-4 py-2 text-left text-base font-semibold text-slate-900 transition-colors ${on ? selected : 'border-slate-300 bg-white hover:bg-slate-50'}`}
          >
            <Icon width={26} height={26} aria-hidden="true" className="shrink-0" />
            <span className="flex-1">{label}</span>
            {on && <span aria-hidden="true">✓</span>}
          </button>
        );
      })}
    </div>
  );

  const question = (
    <h2 id="vote-question" className="mb-3 text-lg font-bold text-slate-900">
      Would you consider buying this?
    </h2>
  );

  const shell = (children: React.ReactNode) => (
    <div data-testid="vote-box" className="rounded-card border border-line p-4 lg:p-5">
      {banner}
      {children}
    </div>
  );

  // ---- states ---------------------------------------------------------------------------------------------------

  if (authLoading) {
    return shell(<div aria-busy="true" aria-label="Loading" className="h-48 animate-pulse rounded-md bg-slate-100" />);
  }

  if (closed) {
    return shell(
      <div data-testid="closed-state">
        <h2 className="text-lg font-bold text-slate-900">This demand test is closed</h2>
        <p className="mt-1 text-slate-700">The seller is no longer collecting responses.</p>
        {closedPerServer && (
          <p role="alert" className="mt-3 rounded-md bg-amber-50 p-3 text-sm text-slate-800 ring-1 ring-amber-200">
            This demand test has closed and is no longer accepting responses.
          </p>
        )}
      </div>,
    );
  }

  if (isOwner) {
    return shell(
      <div data-testid="owner-state">
        <h2 className="text-lg font-bold text-slate-900">You created this demand test.</h2>
        <p className="mt-1 text-slate-700">Sellers can&apos;t answer their own demand tests. Shoppers can, and the response count above updates as they do.</p>
      </div>,
    );
  }

  if (!user) {
    return shell(
      <>
        {question}
        {choices}
        <p className="mt-3 text-sm text-slate-600">
          Sign in to answer. You&apos;ll come straight back here.{' '}
          <Link to="/login" state={{ from: location.pathname }} className="font-semibold text-link hover:underline">
            Sign in
          </Link>
        </p>
      </>,
    );
  }

  if (mine.error) {
    return shell(<ErrorState message="We couldn't load your answer. Check your connection and try again." onRetry={mine.reload} />);
  }
  if (saved === undefined) {
    return shell(<div aria-busy="true" aria-label="Loading your answer" className="h-48 animate-pulse rounded-md bg-slate-100" />);
  }

  if (saved && !editing) {
    const priceLabel = saved.priceBucket !== null ? validation.priceBuckets.find((b) => b.index === saved.priceBucket)?.label : undefined;
    return shell(
      <div ref={savedRef} tabIndex={-1} role={justSubmitted ? 'status' : undefined} data-testid="saved-answer" className="outline-none">
        <p className="flex items-center gap-2 text-lg font-bold text-success">
          <CheckCircleIcon width={24} height={24} aria-hidden="true" />
          {justSubmitted ? 'Thanks for your feedback' : 'Your answer'}
        </p>
        <p className="mt-2 text-slate-900">
          You said <strong data-testid="saved-interest">{LABELS[saved.interest]}</strong>.
        </p>
        {(priceLabel || saved.topFeature) && (
          <dl className="mt-3 space-y-2 rounded-md bg-slate-50 p-3 text-sm">
            {priceLabel && (
              <div>
                <dt className="text-slate-600">Price that feels reasonable</dt>
                <dd className="font-semibold text-slate-900" data-testid="saved-price">
                  {priceLabel}
                </dd>
              </div>
            )}
            {saved.topFeature && (
              <div>
                <dt className="text-slate-600">Most important feature</dt>
                <dd className="font-semibold text-slate-900" data-testid="saved-feature">
                  {saved.topFeature}
                </dd>
              </div>
            )}
          </dl>
        )}
        <p className="mt-3 text-sm text-slate-600">Your response helps the seller understand whether this product is worth bringing to market.</p>
        <Button variant="ghost" fullWidth onClick={startEditing} className="mt-4">
          Change answer
        </Button>
      </div>,
    );
  }

  // The form: a first answer, or changing an existing one.
  const showDetails = draft.interest === 'interested' || draft.interest === 'maybe';
  return shell(
    <form onSubmit={submit} noValidate aria-label="Your answer" aria-busy={submitting}>
      {question}
      {choices}

      {showDetails && (
        <div className="mt-5 space-y-5 border-t border-line pt-5">
          <fieldset>
            <legend className="mb-2 text-sm font-semibold text-slate-900">
              What price would feel reasonable? <span className="font-normal text-slate-500">(optional)</span>
            </legend>
            <div className="flex flex-wrap gap-2">
              {validation.priceBuckets.map((b) => {
                const on = draft.priceBucket === b.index;
                return (
                  <button
                    key={b.index}
                    type="button"
                    aria-pressed={on}
                    onClick={() => setDraft((d) => ({ ...d, priceBucket: on ? null : b.index }))}
                    className={`${chipBase} ${on ? 'border-brand-900 bg-brand-900 text-white' : 'border-slate-300 bg-white text-slate-800 hover:bg-slate-50'}`}
                  >
                    {on && <span aria-hidden="true">✓</span>}
                    {b.label}
                  </button>
                );
              })}
            </div>
          </fieldset>

          <fieldset>
            <legend className="mb-2 text-sm font-semibold text-slate-900">
              Which feature matters most to you? <span className="font-normal text-slate-500">(optional)</span>
            </legend>
            <div className="flex flex-wrap gap-2">
              {validation.features.map((f) => {
                const on = draft.topFeature === f;
                return (
                  <button
                    key={f}
                    type="button"
                    aria-pressed={on}
                    onClick={() => setDraft((d) => ({ ...d, topFeature: on ? null : f }))}
                    className={`${chipBase} ${on ? 'border-brand-900 bg-brand-900 text-white' : 'border-slate-300 bg-white text-slate-800 hover:bg-slate-50'}`}
                  >
                    {on && <span aria-hidden="true">✓</span>}
                    {f}
                  </button>
                );
              })}
            </div>
          </fieldset>
        </div>
      )}

      {error && (
        <p role="alert" className="mt-4 rounded-md bg-red-50 p-3 text-sm font-medium text-red-800 ring-1 ring-red-200">
          {error}
        </p>
      )}

      <Button type="submit" fullWidth disabled={!draft.interest || submitting} className="mt-5 py-3 text-base">
        {submitting ? 'Sending…' : 'Send my answer'}
      </Button>
      {editing && (
        <button type="button" onClick={() => setEditing(false)} disabled={submitting} className="mt-3 w-full text-center text-sm font-medium text-link hover:underline">
          Cancel
        </button>
      )}
    </form>,
  );
}
