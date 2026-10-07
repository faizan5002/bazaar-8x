import type { ReactNode } from 'react';

/** Page gutter: 16px on phones, 24px from `sm`, centred up to 1280px. */
export function Container({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <div className={`mx-auto w-full max-w-7xl px-4 sm:px-6 ${className}`}>{children}</div>;
}
