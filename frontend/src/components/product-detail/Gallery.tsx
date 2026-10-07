import { useRef, useState, type KeyboardEvent, type TouchEvent } from 'react';
import { sizedImage } from '../../lib/images';
import { ChevronLeftIcon, ChevronRightIcon } from '../ui/icons';
import { SafeImage } from '../ui/SafeImage';

interface GalleryProps {
  images: string[];
  title: string;
  /** Portrait artwork (book covers) is letterboxed instead of cropped. */
  contain?: boolean;
}

const SWIPE_PX = 40;

/**
 * Large image with thumbnails (a column beside it from `lg`, a scrollable strip below on smaller screens),
 * previous/next arrows and touch swipe. Handles 0, 1 or many images, and any image failing to load.
 */
export function Gallery({ images, title, contain = false }: GalleryProps) {
  const [index, setIndex] = useState(0);
  const touchStart = useRef<number | null>(null);
  const count = images.length;
  const multiple = count > 1;
  const show = (i: number) => setIndex(((i % count) + count) % count);

  const onThumbKeys = (e: KeyboardEvent) => {
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') (e.preventDefault(), show(index + 1));
    if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') (e.preventDefault(), show(index - 1));
  };
  const onTouchEnd = (e: TouchEvent) => {
    if (touchStart.current === null || !multiple) return;
    const dx = e.changedTouches[0].clientX - touchStart.current;
    touchStart.current = null;
    if (Math.abs(dx) >= SWIPE_PX) show(index + (dx < 0 ? 1 : -1));
  };

  const arrow =
    'absolute top-1/2 z-10 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full bg-white/90 text-slate-800 shadow-card ring-1 ring-line hover:bg-white';

  return (
    <div className="flex flex-col-reverse gap-3 lg:flex-row" data-testid="gallery">
      {multiple && (
        <ul aria-label="Product images" onKeyDown={onThumbKeys} className="scrollbar-none -mx-1 flex gap-2 overflow-x-auto px-1 py-1 lg:mx-0 lg:flex-col lg:overflow-visible lg:p-0">
          {images.map((src, i) => (
            <li key={src} className="shrink-0">
              <button
                type="button"
                onClick={() => show(i)}
                aria-label={`Show image ${i + 1} of ${count}`}
                aria-current={i === index ? 'true' : undefined}
                className={`block h-16 w-16 overflow-hidden rounded-md bg-slate-100 ring-2 ring-offset-1 transition ${i === index ? 'ring-accent-500' : 'ring-transparent hover:ring-slate-300'}`}
              >
                <SafeImage src={sizedImage(src, 160)} alt="" width={64} height={64} className={`h-full w-full ${contain ? 'object-contain p-1' : 'object-cover'}`} />
              </button>
            </li>
          ))}
        </ul>
      )}

      <div
        className={`relative aspect-[3/2] w-full min-w-0 flex-1 overflow-hidden rounded-card bg-slate-100 md:aspect-square ${contain ? 'p-4 md:p-6' : ''}`}
        onTouchStart={(e) => (touchStart.current = e.touches[0].clientX)}
        onTouchEnd={onTouchEnd}
      >
        <SafeImage
          data-testid="main-image"
          src={sizedImage(images[index], 900)}
          alt={`${title}${multiple ? `, image ${index + 1} of ${count}` : ''}`}
          width={900}
          height={900}
          // The main image is the LCP element; thumbnails stay lazy.
          loading="eager"
          fetchPriority="high"
          className={`h-full w-full ${contain ? 'object-contain' : 'object-cover'}`}
        />
        {multiple && (
          <>
            <button type="button" onClick={() => show(index - 1)} aria-label="Previous image" className={`${arrow} left-2`}>
              <ChevronLeftIcon />
            </button>
            <button type="button" onClick={() => show(index + 1)} aria-label="Next image" className={`${arrow} right-2`}>
              <ChevronRightIcon />
            </button>
            <p aria-live="polite" className="absolute bottom-2 right-2 rounded bg-slate-900/70 px-2 py-0.5 text-xs font-medium text-white">
              {index + 1} / {count}
            </p>
          </>
        )}
      </div>
    </div>
  );
}
