/** Unsplash CDN photo (hotlinking the images.unsplash.com CDN is permitted). All ids were verified to resolve. */
export const photo = (id: string, width = 1000) => `https://images.unsplash.com/photo-${id}?auto=format&fit=crop&w=${width}&q=80`;

/** Open Library cover by ISBN-13. `default=false` makes missing covers 404 instead of returning a blank image. */
export const bookCover = (isbn13: string) => `https://covers.openlibrary.org/b/isbn/${isbn13}-L.jpg?default=false`;
