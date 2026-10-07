import type { ReactNode } from 'react';
import { formatLaunchMonth, formatPriceRange } from '../../lib/format';
import type { ValidationResults } from '../../types';
import { SignalChip } from './SignalChip';

const count = (n: number) => n.toLocaleString('en-US');
export const respondedText = (n: number) => (n === 0 ? 'No shoppers have responded yet' : `${count(n)} ${n === 1 ? 'shopper' : 'shoppers'} responded`);

// ---- building blocks ---------------------------------------------------------------------------------------------------

export function ResultPanel({ id, title, question, description, children, className = '' }: { id: string; title: string; question?: string; description?: string; children: ReactNode; className?: string }) {
  return (
    <section id={id} aria-labelledby={`${id}-title`} className={`rounded-card bg-white p-4 shadow-card sm:p-6 ${className}`}>
      <h2 id={`${id}-title`} className="text-lg font-bold text-slate-900 sm:text-xl">
        {title}
      </h2>
      {question && <p className="mt-0.5 text-base text-slate-700">{question}</p>}
      {description && <p className="mt-0.5 text-sm text-slate-500">{description}</p>}
      <div className="mt-4">{children}</div>
    </section>
  );
}

/** One plain-CSS bar. `percent` is the API's number; the bar is just that share of the track. */
function BarRow({ label, percent, note, highlight, tag, tone = 'brand', testId }: { label: string; percent: number; note?: string; highlight?: boolean; tag?: string; tone?: 'green' | 'amber' | 'slate' | 'brand'; testId: string }) {
  const fill = { green: 'bg-green-600', amber: 'bg-amber-500', slate: 'bg-slate-500', brand: 'bg-brand-700' }[tone];
  return (
    <li data-testid={testId} data-percent={percent} className={`grid grid-cols-[1fr_auto] items-center gap-x-3 gap-y-1 rounded-md px-2 py-2 sm:grid-cols-[minmax(0,10rem)_1fr_4.5rem] sm:gap-x-4 ${highlight ? 'bg-amber-50 ring-1 ring-amber-200' : ''}`}>
      <span className="min-w-0 text-sm font-medium text-slate-900 sm:text-base">
        {label}
        {tag && <span className="ml-2 inline-block rounded bg-accent-400 px-1.5 py-0.5 align-middle text-[0.7rem] font-bold uppercase tracking-wide text-slate-900">{tag}</span>}
        {note && <span className="ml-2 text-xs font-normal text-slate-500">{note}</span>}
      </span>
      <span className="text-right text-sm font-bold tabular-nums text-slate-900 sm:order-3 sm:text-base" data-testid="bar-value">
        {percent}%
      </span>
      <span aria-hidden="true" className="col-span-2 h-3 overflow-hidden rounded-full bg-slate-100 sm:col-span-1 sm:order-2">
        <span className={`block h-full rounded-full ${fill}`} style={{ width: `${percent}%`, minWidth: percent > 0 ? '4px' : 0 }} />
      </span>
    </li>
  );
}

// ---- the demand signal -------------------------------------------------------------------------------------------------

export function SignalPanel({ results }: { results: ValidationResults }) {
  const { signal, totalResponses, interest } = results;
  return (
    <section id="signal" aria-labelledby="signal-title" className="overflow-hidden rounded-card bg-brand-900 text-white shadow-card">
      <div className="grid gap-6 p-5 sm:p-8 md:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)] md:items-center">
        <div>
          <h2 id="signal-title" className="text-sm font-semibold uppercase tracking-wide text-slate-300">
            Demand signal
          </h2>
          <p className="mt-1 text-slate-300">How strong is the interest?</p>
          <p className="mt-3 text-lg text-slate-200" data-testid="signal-responses">
            {respondedText(totalResponses)}
          </p>
          <p className="mt-3 text-2xl font-extrabold sm:text-3xl" data-testid="signal-label">
            <SignalChip level={signal.level} label={signal.label} className="text-white!" />
          </p>
          {!signal.reliable && (
            <p className="mt-2 max-w-lg text-slate-300" data-testid="signal-early-note">
              {totalResponses === 0 ? 'Share the link to start collecting answers.' : `Only ${count(totalResponses)} ${totalResponses === 1 ? 'answer' : 'answers'} so far, so the score below is an early read. We give a verdict once ${signal.minResponses} shoppers have answered.`}
            </p>
          )}
          <p className="mt-4 text-slate-100" data-testid="interest-summary">
            <span className="font-bold">{interest.interested.percent}%</span> Interested · <span className="font-bold">{interest.maybe.percent}%</span> Maybe · <span className="font-bold">{interest.notInterested.percent}%</span> Not interested
          </p>
        </div>

        <div className="rounded-card bg-white/10 p-5 text-center md:p-6">
          <p className="text-sm font-semibold uppercase tracking-wide text-slate-300">Demand score</p>
          <p className={`mt-1 text-5xl font-extrabold tabular-nums sm:text-6xl ${signal.reliable ? '' : 'text-slate-300'}`} data-testid="demand-score">
            {signal.score}
            <span className="text-2xl font-bold text-slate-300 sm:text-3xl"> / 100</span>
          </p>
          <p className="mt-3 text-sm text-slate-200">Interested shoppers count fully; Maybe responses count half.</p>
        </div>
      </div>
      <p className="border-t border-white/15 bg-black/20 px-5 py-3 text-sm text-slate-200 sm:px-8" data-testid="disclaimer">
        Demand signals represent shopper intent and do not guarantee purchases.
      </p>
    </section>
  );
}

// ---- distributions -----------------------------------------------------------------------------------------------------

export function InterestPanel({ results, className }: { results: ValidationResults; className?: string }) {
  const { interest, totalResponses } = results;
  return (
    <ResultPanel id="interest" className={className} title="Shopper interest" question="How many shoppers want this?" description={totalResponses > 0 ? `Out of ${count(totalResponses)} ${totalResponses === 1 ? 'response' : 'responses'}.` : undefined}>
      {totalResponses === 0 ? (
        <p className="text-slate-600">No responses yet.</p>
      ) : (
        <ul className="space-y-1">
          <BarRow testId="interest-interested" label="Interested" percent={interest.interested.percent} note={count(interest.interested.count)} tone="green" />
          <BarRow testId="interest-maybe" label="Maybe" percent={interest.maybe.percent} note={count(interest.maybe.count)} tone="amber" />
          <BarRow testId="interest-not" label="Not interested" percent={interest.notInterested.percent} note={count(interest.notInterested.count)} tone="slate" />
        </ul>
      )}
    </ResultPanel>
  );
}

export function PricePanel({ results, className }: { results: ValidationResults; className?: string }) {
  const { priceBuckets, priceAnswered, insights, signal } = results;
  const best = insights.preferredPrice;
  // Most popular first, ties in price order (the API returns them in price order and sort is stable).
  const rows = [...priceBuckets].sort((a, b) => b.count - a.count);
  return (
    <ResultPanel id="price" className={className} title="Preferred price" question="What price appears most attractive?" description={priceAnswered > 0 ? `${count(priceAnswered)} ${priceAnswered === 1 ? 'shopper' : 'shoppers'} chose a price. Your proposed range is ${formatPriceRange(results.validation.priceMin, results.validation.priceMax)}.` : undefined}>
      {priceAnswered === 0 || !best ? (
        <p data-testid="price-empty" className="text-slate-600">
          Not enough price responses yet.
        </p>
      ) : (
        <>
          <p className="mb-2 font-semibold text-slate-900" data-testid="sweet-spot">
            {signal.reliable ? 'Sweet spot' : 'Leading so far'}: {best.label}
          </p>
          <ul className="space-y-1" data-testid="price-rows">
            {rows.map((b) => (
              <BarRow key={b.index} testId="price-row" label={b.label} percent={b.percent} highlight={b.index === best.index} tag={b.index === best.index ? (signal.reliable ? 'Sweet spot' : 'Leading') : undefined} />
            ))}
          </ul>
        </>
      )}
    </ResultPanel>
  );
}

export function FeaturesPanel({ results, className }: { results: ValidationResults; className?: string }) {
  const { features, featureAnswered, insights } = results;
  const top = insights.topFeature;
  return (
    <ResultPanel id="features" className={className} title="Most requested features" question="What do shoppers care about?" description={featureAnswered > 0 ? `${count(featureAnswered)} ${featureAnswered === 1 ? 'shopper' : 'shoppers'} picked the feature that matters most.` : undefined}>
      {featureAnswered === 0 || !top ? (
        <p data-testid="features-empty" className="text-slate-600">
          Not enough feature responses yet.
        </p>
      ) : (
        <>
          <p className="mb-2 font-semibold text-slate-900" data-testid="top-feature">
            Top requested feature: {top.name}
          </p>
          <ul className="space-y-1" data-testid="feature-rows">
            {features.map((f) => (
              <BarRow key={f.name} testId="feature-row" label={f.name} percent={f.percent} highlight={f.name === top.name} />
            ))}
          </ul>
        </>
      )}
    </ResultPanel>
  );
}

// ---- insight cards -----------------------------------------------------------------------------------------------------

function Insight({ testId, kicker, tone = 'plain', children }: { testId: string; kicker: string; tone?: 'plain' | 'warn'; children: ReactNode }) {
  return (
    <article data-testid={testId} className={`rounded-card p-4 ring-1 ${tone === 'warn' ? 'bg-amber-50 ring-amber-300' : 'bg-white ring-line'}`}>
      <h3 className={`text-xs font-bold uppercase tracking-wide ${tone === 'warn' ? 'text-warning' : 'text-slate-500'}`}>{kicker}</h3>
      <p className="mt-1.5 text-slate-900">{children}</p>
    </article>
  );
}

/** A plain-language nudge for each signal level the API reports (`early` / `weak` / `moderate` / `strong`). No numbers are computed here. */
function nextStep(signal: ValidationResults['signal']): string {
  switch (signal.level) {
    case 'strong':
      return 'Demand looks strong. If the idea still makes sense for you, this is the point to start planning a first production run, and keep the test open to build confidence.';
    case 'moderate':
      return 'Interest is mixed. Consider refining the features or the price range, and keep the test open to gather more answers.';
    case 'weak':
      return "Interest is low. Before investing, consider whether a different feature set or price would change the story, or whether this idea is worth pursuing.";
    default:
      return signal.total === 0
        ? 'Share the public link to start collecting answers. A verdict appears once enough shoppers have responded.'
        : `Keep the test open and share the link. A verdict appears once ${signal.minResponses} shoppers have responded.`;
  }
}

const NOT_ENOUGH = 'Not enough responses to draw a strong conclusion yet.';

/** Short plain-language readings of the numbers above. Every figure comes from the API; nothing here is flagship-specific. */
export function InsightCards({ results, className }: { results: ValidationResults; className?: string }) {
  const { signal, insights } = results;
  const { preferredPrice, topFeature, pricePressure } = insights;
  const sure = signal.reliable;
  return (
    <ResultPanel id="insights" className={className} title="What this means" question="What should you take away?">
      <div className="grid gap-3 md:grid-cols-3 lg:grid-cols-1">
        <Insight testId="insight-price" kicker="Sweet spot">
          {sure && preferredPrice ? (
            <>
              Shoppers show the strongest price preference around <strong>{preferredPrice.label}</strong>.
            </>
          ) : (
            NOT_ENOUGH
          )}
        </Insight>
        <Insight testId="insight-feature" kicker="What shoppers want">
          {sure && topFeature ? (
            <>
              <strong>{topFeature.name}</strong> is the most requested feature.
            </>
          ) : (
            NOT_ENOUGH
          )}
        </Insight>
        <Insight testId="insight-demand" kicker="Overall signal">
          {sure ? (
            <>
              <strong>{signal.openPercent}%</strong> of respondents are either Interested or Maybe.
            </>
          ) : (
            NOT_ENOUGH
          )}
        </Insight>
      </div>

      <div data-testid="next-step" className="mt-3 rounded-card bg-brand-900 p-4 text-white">
        <h3 className="text-xs font-bold uppercase tracking-wide text-accent-400">Suggested next step</h3>
        <p className="mt-1.5">{nextStep(signal)}</p>
      </div>

      {pricePressure.flagged && (
        <div className="mt-3">
          <Insight testId="insight-pressure" kicker="Price pressure" tone="warn">
            <strong>{pricePressure.percent}%</strong> of shoppers who answered prefer {pricePressure.bucket.label.toLowerCase()}. A significant share of shoppers prefer a price below your proposed range. Consider whether the product can be offered at a lower price.
          </Insight>
        </div>
      )}
    </ResultPanel>
  );
}

/** The few facts about the test itself, so the results page stands on its own. */
export function TestFacts({ results }: { results: ValidationResults }) {
  const v = results.validation;
  return (
    <dl className="flex flex-wrap gap-x-6 gap-y-1 text-sm text-slate-700" data-testid="test-facts">
      <div className="flex gap-1.5">
        <dt className="text-slate-500">Proposed price</dt>
        <dd className="font-semibold text-slate-900">{formatPriceRange(v.priceMin, v.priceMax)}</dd>
      </div>
      <div className="flex gap-1.5">
        <dt className="text-slate-500">Expected launch</dt>
        <dd className="font-semibold text-slate-900">{formatLaunchMonth(v.expectedLaunch)}</dd>
      </div>
      <div className="flex gap-1.5">
        <dt className="text-slate-500">Category</dt>
        <dd className="font-semibold text-slate-900">{v.category.name}</dd>
      </div>
    </dl>
  );
}
