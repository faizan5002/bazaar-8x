import { CategoryGrid } from '../components/home/CategoryGrid';
import { ComingSoonSection } from '../components/home/ComingSoonSection';
import { Hero } from '../components/home/Hero';
import { ProductSection } from '../components/home/ProductSection';
import { Container } from '../components/ui/Container';
import { useHomeProducts } from '../hooks/useHomeProducts';

export function HomePage() {
  const { deals, popular, recommended } = useHomeProducts();

  return (
    <>
      <Hero />
      <Container className="space-y-6 py-6 lg:space-y-8 lg:py-8">
        <ProductSection
          id="deals"
          title="Today's deals"
          action={{ to: '/search?deals=true', label: 'See all deals' }}
          list={deals}
          layout="rail"
          skeletons={5}
          emptyMessage="No deals are running right now. Check back soon."
        />
        <ComingSoonSection />
        <CategoryGrid />
        <ProductSection
          id="popular"
          title="Popular products"
          action={{ to: '/search?minRating=4.5&sort=popular', label: 'See more' }}
          list={popular}
          layout="grid"
          emptyMessage="Popular products will show up here."
        />
        <ProductSection
          id="recommended"
          title="Recommended for you"
          action={{ to: '/search?featured=true&sort=rating', label: 'See more' }}
          list={recommended}
          layout="grid"
          emptyMessage="We don't have recommendations yet."
        />
      </Container>
    </>
  );
}
