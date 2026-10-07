import { Column, Entity, ManyToOne, PrimaryGeneratedColumn, Unique } from 'typeorm';
import { Product } from '../products/product.entity';
import { Cart } from './cart.entity';

/** One row per product per cart: adding the same product again raises the quantity instead of adding a row. */
@Entity('cart_items')
@Unique(['cart', 'product'])
export class CartItem {
  @PrimaryGeneratedColumn()
  id: number;

  @ManyToOne(() => Cart, (cart) => cart.items, { nullable: false, onDelete: 'CASCADE' })
  cart: Cart;

  @ManyToOne(() => Product, { nullable: false, eager: true, onDelete: 'CASCADE' })
  product: Product;

  @Column({ default: 1 })
  quantity: number;

  /** Chosen option per variant group, e.g. { Color: 'Black', Storage: '256 GB' }. */
  @Column({ type: 'jsonb', default: {} })
  selectedVariants: Record<string, string>;
}
