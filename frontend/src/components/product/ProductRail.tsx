import { useRef, type ReactNode } from 'react';
import { ChevronLeftIcon, ChevronRightIcon } from '../ui/icons';

/**
 * Horizontally scrolling row: swipe on touch, arrow buttons from `md`. Items size themselves to show
 * ~2 (phone), 4 (tablet) or 5 (desktop) at a time.
 */
export function ProductRail({ children, label }: { children: ReactNode[]; label: string }) {
  const track = useRef<HTMLUListElement>(null);
  const scroll = (dir: -1 | 1) => track.current?.scrollBy({ left: dir * track.current.clientWidth * 0.85, behavior: 'smooth' });

  const arrow = 'absolute top-1/3 z-10 hidden h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full bg-white text-slate-800 shadow-card-hover ring-1 ring-line hover:bg-slate-50 md:flex';

  return (
    <div className="relative">
      <button type="button" aria-label={`Scroll ${label} left`} onClick={() => scroll(-1)} className={`${arrow} -left-3`}>
        <ChevronLeftIcon />
      </button>
      {/* `relative` makes this list the containing block for absolutely positioned descendants (e.g. `sr-only` text),
          so the scroller clips them instead of letting them stretch the whole page sideways. */}
      <ul ref={track} aria-label={label} className="scrollbar-none relative -mx-2 flex snap-x snap-mandatory gap-1 overflow-x-auto scroll-smooth px-2">
        {children.map((child, i) => (
          <li key={i} className="w-[46%] shrink-0 snap-start sm:w-[31%] md:w-[24%] lg:w-[19.2%]">
            {child}
          </li>
        ))}
      </ul>
      <button type="button" aria-label={`Scroll ${label} right`} onClick={() => scroll(1)} className={`${arrow} -right-3`}>
        <ChevronRightIcon />
      </button>
    </div>
  );
}
