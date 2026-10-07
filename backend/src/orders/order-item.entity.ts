import { Column, Entity, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';
import { decimalTransformer } from '../common/decimal.transformer';
import { Product } from '../products/product.entity';
import { Order } from './order.entity';

/** Line item with a snapshot of product data so history survives later catalog edits. */
@Entity('order_items')
export class OrderItem {
  @PrimaryGeneratedColumn()
  id: number;

  @ManyToOne(() => Order, (order) => order.items, { nullable: false, onDelete: 'CASCADE' })
  order: Order;

  @ManyToOne(() => Product, { nullable: true, onDelete: 'SET NULL' })
  product: Product | null;

  @Column()
  title: string;

  @Column({ type: 'varchar', nullable: true })
  imageUrl: string | null;

  @Column()
  sellerName: string;

  @Column({ type: 'numeric', precision: 10, scale: 2, transformer: decimalTransformer })
  unitPrice: number;

  @Column()
  quantity: number;

  @Column({ type: 'jsonb', default: {} })
  selectedVariants: Record<string, string>;
}
