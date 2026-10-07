import type { ReactNode } from 'react';

type Tone = 'deal' | 'neutral' | 'soon';

const tones: Record<Tone, string> = {
  deal: 'bg-deal text-white',
  neutral: 'bg-slate-800 text-white',
  soon: 'bg-accent-400 uppercase tracking-wide text-slate-900',
};

export function Badge({ tone = 'neutral', children }: { tone?: Tone; children: ReactNode }) {
  return <span className={`inline-flex items-center rounded px-2 py-0.5 text-xs font-semibold leading-5 ${tones[tone]}`}>{children}</span>;
}
