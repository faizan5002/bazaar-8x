import type { FilterChip, ListingFilters } from '../../lib/listingQuery';
import { XIcon } from '../ui/icons';

interface ActiveFiltersProps {
  chips: FilterChip[];
  onRemove: (patch: Partial<ListingFilters>) => void;
  onClearAll: () => void;
}

/** Removable chips for every active filter, plus "Clear all". Renders nothing when no filter is active. */
export function ActiveFilters({ chips, onRemove, onClearAll }: ActiveFiltersProps) {
  if (!chips.length) return null;
  return (
    <ul aria-label="Active filters" className="flex flex-wrap items-center gap-2">
      {chips.map((chip) => (
        <li key={chip.key}>
          <button
            type="button"
            onClick={() => onRemove(chip.remove)}
            aria-label={`Remove filter ${chip.label}`}
            className="inline-flex items-center gap-1.5 rounded-full border border-slate-300 bg-slate-50 py-1 pl-3 pr-2 text-sm text-slate-800 hover:border-slate-400 hover:bg-white"
          >
            {chip.label}
            <XIcon width={14} height={14} className="text-slate-500" />
          </button>
        </li>
      ))}
      <li>
        <button type="button" onClick={onClearAll} className="px-1 text-sm font-medium text-link hover:underline">
          Clear all
        </button>
      </li>
    </ul>
  );
}
