import type { ReactNode } from 'react';
import { Button } from './Button';
import { AlertIcon } from './icons';

/** Inline message for a section that failed to load, with a retry. */
export function ErrorState({ message, onRetry }: { message?: string; onRetry?: () => void }) {
  return (
    <div role="alert" className="flex flex-col items-center gap-2 rounded-md border border-red-200 bg-red-50 px-4 py-8 text-center">
      <AlertIcon className="text-deal" width={28} height={28} />
      <p className="font-semibold text-slate-900">We couldn&apos;t load this section</p>
      <p className="max-w-md text-sm text-slate-600">{message ?? 'Something went wrong while contacting the store. Please try again.'}</p>
      {onRetry && (
        <Button variant="ghost" onClick={onRetry} className="mt-1">
          Try again
        </Button>
      )}
    </div>
  );
}

export function EmptyState({ children }: { children: ReactNode }) {
  return <div className="rounded-md border border-dashed border-slate-300 px-4 py-10 text-center text-sm text-slate-600">{children}</div>;
}
