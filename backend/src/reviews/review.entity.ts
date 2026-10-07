import { Column, CreateDateColumn, Entity, Index, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';
import { Product } from '../products/product.entity';
import { User } from '../users/user.entity';

@Entity('reviews')
export class Review {
  @PrimaryGeneratedColumn()
  id: number;

  @Index()
  @ManyToOne(() => Product, (product) => product.reviews, { nullable: false, onDelete: 'CASCADE' })
  product: Product;

  /** Null for seeded reviews that are not tied to a real account. */
  @ManyToOne(() => User, (user) => user.reviews, { nullable: true, onDelete: 'SET NULL' })
  user: User | null;

  /** Display name shown with the review. */
  @Column()
  authorName: string;

  @Column({ type: 'smallint' })
  rating: number;

  @Column()
  title: string;

  @Column({ type: 'text' })
  body: string;

  @Column({ default: false })
  verifiedPurchase: boolean;

  @CreateDateColumn()
  createdAt: Date;
}
