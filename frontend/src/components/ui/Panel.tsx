import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';

interface PanelProps {
  id?: string;
  title: string;
  /** Optional "See all" link in the header. */
  action?: { to: string; label: string };
  /** Optional supporting line under the title. */
  description?: string;
  children: ReactNode;
}

/** White content block with a section heading: the standard container for a homepage section. */
export function Panel({ id, title, action, description, children }: PanelProps) {
  return (
    <section id={id} aria-labelledby={id ? `${id}-title` : undefined} className="scroll-mt-4 rounded-card bg-white p-4 shadow-card sm:p-6">
      <div className="mb-4">
        <div className="flex items-baseline justify-between gap-4">
          <h2 id={id ? `${id}-title` : undefined} className="text-xl font-bold text-slate-900 sm:text-2xl">
            {title}
          </h2>
          {action && (
            <Link to={action.to} className="shrink-0 text-sm font-medium text-link hover:text-accent-600 hover:underline">
              {action.label}
            </Link>
          )}
        </div>
        {description && <p className="mt-1 text-sm text-slate-600 sm:text-base">{description}</p>}
      </div>
      {children}
    </section>
  );
}
