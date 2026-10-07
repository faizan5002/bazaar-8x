import { StarIcon } from './icons';

interface RatingProps {
  value: number;
  count?: number;
  size?: number;
}

/** Five-star display with partial fill, plus the optional review count. */
export function Rating({ value, count, size = 16 }: RatingProps) {
  return (
    <span className="inline-flex items-center gap-1.5" aria-label={`${value.toFixed(1)} out of 5 stars`}>
      <span className="relative inline-flex text-slate-300">
        {[0, 1, 2, 3, 4].map((i) => (
          <StarIcon key={i} width={size} height={size} />
        ))}
        <span
          className="absolute inset-0 inline-flex overflow-hidden text-accent-500"
          style={{ width: `${Math.max(0, Math.min(5, value)) * 20}%` }}
        >
          {[0, 1, 2, 3, 4].map((i) => (
            <StarIcon key={i} width={size} height={size} className="shrink-0" />
          ))}
        </span>
      </span>
      {count !== undefined && <span className="text-sm text-link">{count.toLocaleString()}</span>}
    </span>
  );
}
