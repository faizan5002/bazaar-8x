/**
 * Seed images are stored at full size. Ask the CDN for a size that fits where the image is shown
 * (the catalog is mostly Unsplash photos plus Open Library covers); unknown hosts pass through unchanged.
 */
export function sizedImage(url: string | undefined, width: number): string | undefined {
  if (!url) return undefined;
  if (url.includes('images.unsplash.com')) return url.replace(/([?&])w=\d+/, `$1w=${width}`);
  if (url.includes('covers.openlibrary.org')) return url.replace(/-[SML]\.jpg/, width <= 400 ? '-M.jpg' : '-L.jpg');
  return url;
}
