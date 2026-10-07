import { ButtonLink } from '../ui/Button';
import { Container } from '../ui/Container';
import { SafeImage } from '../ui/SafeImage';

// Lifestyle photography (Unsplash CDN). The hero copy is static; all product content below it comes from the API.
const HERO_IMAGE = 'https://images.unsplash.com/photo-1483985988355-763728e1935b?auto=format&fit=crop&w=1400&q=80';

export function Hero() {
  return (
    <section aria-labelledby="hero-title" className="relative isolate overflow-hidden bg-brand-900 text-white">
      {/* Photo fills the right ~60% on desktop and the whole banner on phones. */}
      <div className="absolute inset-y-0 right-0 -z-10 w-full md:w-[62%]">
        <SafeImage
          src={HERO_IMAGE}
          alt=""
          // Eager: this is the largest above-the-fold image.
          loading="eager"
          fetchPriority="high"
          className="h-full w-full object-cover object-[50%_22%]"
        />
        {/* Phones: even scrim so copy over the photo stays readable. Desktop: only the left edge fades into the navy panel. */}
        <div className="absolute inset-0 bg-brand-900/70 md:bg-transparent" />
        <div className="absolute inset-y-0 left-0 hidden w-2/3 bg-gradient-to-r from-brand-900 to-brand-900/0 md:block" />
      </div>

      <Container className="py-12 sm:py-16 lg:py-24">
        <div className="max-w-xl">
          <p className="text-sm font-semibold uppercase tracking-wider text-accent-400">New deals every day</p>
          <h1 id="hero-title" className="mt-3 text-3xl font-extrabold leading-tight sm:text-4xl lg:text-5xl">
            Big savings on everything you use every day
          </h1>
          <p className="mt-4 text-base text-slate-200 sm:text-lg">
            Shop electronics, home, fashion, books and more from verified sellers, with honest reviews and clear delivery dates.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <ButtonLink to="/search?deals=true" className="px-6 py-3 text-base">
              Shop today&apos;s deals
            </ButtonLink>
            <a
              href="#categories"
              className="inline-flex items-center justify-center rounded-md border border-white/60 bg-white/10 px-6 py-3 text-base font-semibold text-white transition-colors hover:bg-white/20"
            >
              Browse categories
            </a>
          </div>
        </div>
      </Container>
    </section>
  );
}
