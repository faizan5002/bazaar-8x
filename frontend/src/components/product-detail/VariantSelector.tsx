import { useId } from 'react';
import type { ProductVariantGroup } from '../../types';

interface VariantSelectorProps {
  groups: ProductVariantGroup[];
  selected: Record<string, string>;
  onChange: (group: string, option: string) => void;
  /** Whole product can't be bought: options stay visible but can't be changed. */
  disabled?: boolean;
}

/**
 * One option row per variant dimension (Color, Size, Storage…), rendered from whatever the API returns.
 * Native radio inputs, so keyboard arrows and screen readers work for free; the visible pill is the styled label.
 * The API has no per-option price or stock, so nothing here claims any.
 */
export function VariantSelector({ groups, selected, onChange, disabled = false }: VariantSelectorProps) {
  const uid = useId();
  return (
    <div className="space-y-4" data-testid="variants">
      {groups.map((group, g) => {
        const labelId = `${uid}-${g}`;
        return (
          <div key={group.name} role="radiogroup" aria-labelledby={labelId}>
            <p id={labelId} className="mb-2 text-sm">
              <span className="font-bold text-slate-900">{group.name}:</span> <span className="text-slate-700">{selected[group.name]}</span>
            </p>
            <div className="flex flex-wrap gap-2">
              {group.options.map((option) => (
                <label key={option} className="relative">
                  <input
                    type="radio"
                    name={labelId}
                    value={option}
                    checked={selected[group.name] === option}
                    disabled={disabled}
                    onChange={() => onChange(group.name, option)}
                    className="peer absolute inset-0 h-full w-full cursor-pointer opacity-0 disabled:cursor-not-allowed"
                  />
                  <span className="flex min-h-10 items-center rounded-md border border-slate-300 bg-white px-3.5 text-sm text-slate-800 transition peer-hover:border-slate-500 peer-checked:border-accent-500 peer-checked:bg-amber-50 peer-checked:font-semibold peer-checked:ring-2 peer-checked:ring-accent-400 peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-accent-500 peer-disabled:opacity-50">
                    {option}
                  </span>
                </label>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}
