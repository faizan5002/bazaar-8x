import { Column, CreateDateColumn, Entity, Index, ManyToOne, OneToMany, PrimaryGeneratedColumn } from 'typeorm';
import { Category } from '../categories/category.entity';
import { decimalTransformer } from '../common/decimal.transformer';
import { Review } from '../reviews/review.entity';
import { Seller } from '../sellers/seller.entity';

/** A selectable option group on a product, e.g. { name: 'Color', options: ['Black', 'Silver'] }. */
export interface ProductVariantGroup {
  name: string;
  options: string[];
}

@Entity('products')
export class Product {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  title: string;

  @Column({ unique: true })
  slug: string;

  @Column()
  brand: string;

  @Column({ type: 'text' })
  description: string;

  /** Ordered image URLs; the first is the primary image. */
  @Column({ type: 'jsonb', default: [] })
  images: string[];

  /** Bullet-point highlights shown near the buy box. */
  @Column({ type: 'jsonb', default: [] })
  features: string[];

  @Column({ type: 'jsonb', default: {} })
  specifications: Record<string, string>;

  @Column({ type: 'jsonb', default: [] })
  variants: ProductVariantGroup[];

  @Column({ type: 'numeric', precision: 10, scale: 2, transformer: decimalTransformer })
  price: number;

  /** Pre-discount price; when set and greater than price, the UI shows a discount. */
  @Column({ type: 'numeric', precision: 10, scale: 2, nullable: true, transformer: decimalTransformer })
  originalPrice: number | null;

  @Column({ default: 0 })
  stock: number;

  @Column({ type: 'numeric', precision: 2, scale: 1, default: 0, transformer: decimalTransformer })
  ratingAverage: number;

  @Column({ default: 0 })
  reviewCount: number;

  /** Typical handling + transit time in days, used for the delivery estimate. */
  @Column({ default: 3 })
  deliveryDays: number;

  @Column({ default: false })
  freeShipping: boolean;

  @Column({ default: false })
  isDeal: boolean;

  @Column({ default: false })
  isFeatured: boolean;

  /** Popularity signal for "best sellers" / sort-by-popularity. */
  @Column({ default: 0 })
  soldCount: number;

  @Index()
  @ManyToOne(() => Category, (category) => category.products, { nullable: false })
  category: Category;

  @Index()
  @ManyToOne(() => Seller, (seller) => seller.products, { nullable: false })
  seller: Seller;

  @OneToMany(() => Review, (review) => review.product)
  reviews: Review[];

  @CreateDateColumn()
  createdAt: Date;
}
