import { useId } from 'react';

export interface SortOption<T extends string> {
  value: T;
  label: string;
}

/** Native select so it is accessible and works well on touch. Each page supplies its own options. */
export function SortSelect<T extends string>({ value, onChange, options, className = '' }: { value: T; onChange: (sort: T) => void; options: SortOption<T>[]; className?: string }) {
  const id = useId();
  return (
    <div className={`flex items-center gap-2 ${className}`}>
      <label htmlFor={id} className="shrink-0 text-sm font-medium text-slate-700">
        Sort by
      </label>
      <select
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value as T)}
        className="h-10 min-w-0 flex-1 rounded-md border border-slate-300 bg-white px-2 text-sm text-slate-900 focus:border-accent-500 focus:outline-none focus:ring-2 focus:ring-accent-400/40"
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </div>
  );
}
