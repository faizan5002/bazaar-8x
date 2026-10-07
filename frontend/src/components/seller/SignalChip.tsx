import type { SignalLevel } from '../../types';

const dot: Record<SignalLevel, string> = {
  strong: 'bg-green-600',
  moderate: 'bg-amber-500',
  weak: 'bg-red-600',
  early: 'bg-slate-400',
};
const text: Record<SignalLevel, string> = {
  strong: 'text-green-800',
  moderate: 'text-amber-800',
  weak: 'text-red-800',
  early: 'text-slate-700',
};

/** "● Strong demand signal": the colour is only a hint, the words always say it. The label comes from the API. */
export function SignalChip({ level, label, className = '' }: { level: SignalLevel; label: string; className?: string }) {
  return (
    <span className={`inline-flex items-center gap-2 font-semibold ${text[level]} ${className}`}>
      <span aria-hidden="true" className={`h-3 w-3 shrink-0 rounded-full ${dot[level]}`} />
      {label}
    </span>
  );
}

export function StatusBadge({ status }: { status: 'open' | 'closed' }) {
  return (
    <span
      data-testid="status-badge"
      className={`inline-flex items-center gap-1.5 rounded px-2 py-0.5 text-xs font-bold uppercase tracking-wide ${status === 'open' ? 'bg-green-100 text-green-800' : 'bg-slate-200 text-slate-700'}`}
    >
      <span aria-hidden="true" className={`h-2 w-2 rounded-full ${status === 'open' ? 'bg-green-600' : 'bg-slate-500'}`} />
      {status === 'open' ? 'Open' : 'Closed'}
    </span>
  );
}
