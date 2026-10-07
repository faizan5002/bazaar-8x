import { useEffect, useState, type ImgHTMLAttributes } from 'react';
import { ImageOffIcon } from './icons';

/**
 * <img> that degrades to a neutral placeholder if the URL fails, so one bad image never breaks a
 * card or a section. Size the element with `className` (the placeholder inherits it).
 */
export function SafeImage({ src, alt, className = '', ...rest }: ImgHTMLAttributes<HTMLImageElement>) {
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [src]);

  if (!src || failed) {
    return (
      <div role="img" aria-label={alt} className={`flex items-center justify-center bg-slate-100 text-slate-400 ${className}`}>
        <ImageOffIcon width={32} height={32} />
      </div>
    );
  }
  return <img src={src} alt={alt} loading="lazy" decoding="async" onError={() => setFailed(true)} className={className} {...rest} />;
}
