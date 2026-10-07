import { ButtonLink } from '../ui/Button';
import { Container } from '../ui/Container';
import { SearchOffIcon } from '../ui/icons';

/** Unknown id, or a link that isn't a product id at all. */
export function ProductNotFound({ invalidLink = false }: { invalidLink?: boolean }) {
  return (
    <Container className="py-8 lg:py-12">
      <div role="alert" className="flex flex-col items-center rounded-card bg-white px-4 py-14 text-center shadow-card">
        <SearchOffIcon width={44} height={44} className="text-slate-400" />
        <h1 className="mt-4 text-2xl font-bold text-slate-900">We couldn&apos;t find that product</h1>
        <p className="mt-2 max-w-md text-slate-600">
          {invalidLink ? "That link doesn't look like a valid product link." : "It may have been removed, or the link may be out of date."}
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-3">
          <ButtonLink to="/search">Browse all products</ButtonLink>
          <ButtonLink to="/" variant="ghost">
            Back to home
          </ButtonLink>
        </div>
      </div>
    </Container>
  );
}

/** Same footprint as the loaded page so nothing jumps when the product arrives. */
export function ProductDetailSkeleton() {
  return (
    <Container className="py-4 lg:py-6">
      <div aria-busy="true" aria-label="Loading product" className="animate-pulse">
        <div className="h-4 w-1/3 rounded bg-slate-200" />
        <div className="mt-3 grid gap-x-8 gap-y-6 rounded-card bg-white p-4 shadow-card sm:p-6 md:grid-cols-2 lg:grid-cols-[minmax(0,5fr)_minmax(0,4fr)_minmax(0,3fr)]">
          <div className="aspect-square rounded-card bg-slate-200 md:row-span-2 lg:row-span-1" />
          <div className="space-y-4">
            <div className="h-7 w-11/12 rounded bg-slate-200" />
            <div className="h-7 w-2/3 rounded bg-slate-200" />
            <div className="h-4 w-1/3 rounded bg-slate-200" />
            <div className="h-10 w-1/2 rounded bg-slate-200" />
            <div className="h-4 w-2/3 rounded bg-slate-200" />
            <div className="h-4 w-1/2 rounded bg-slate-200" />
          </div>
          <div className="h-64 rounded-card bg-slate-200" />
        </div>
      </div>
    </Container>
  );
}
