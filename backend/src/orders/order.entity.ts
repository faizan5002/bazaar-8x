import { Column, CreateDateColumn, Entity, Index, ManyToOne, OneToMany, PrimaryGeneratedColumn } from 'typeorm';
import { decimalTransformer } from '../common/decimal.transformer';
import { User } from '../users/user.entity';
import { OrderItem } from './order-item.entity';

export enum OrderStatus {
  Placed = 'placed',
  Processing = 'processing',
  Shipped = 'shipped',
  Delivered = 'delivered',
  Cancelled = 'cancelled',
}

export interface ShippingAddress {
  fullName: string;
  line1: string;
  line2?: string;
  city: string;
  state: string;
  postalCode: string;
  country: string;
  phone?: string;
}

const money = { type: 'numeric', precision: 10, scale: 2, transformer: decimalTransformer } as const;

@Entity('orders')
export class Order {
  @PrimaryGeneratedColumn()
  id: number;

  /** Customer-facing reference, e.g. "BZR-20261007-483920". */
  @Index({ unique: true })
  @Column()
  orderNumber: string;

  @Index()
  @ManyToOne(() => User, (user) => user.orders, { nullable: false })
  user: User;

  @Column({ type: 'enum', enum: OrderStatus, default: OrderStatus.Placed })
  status: OrderStatus;

  @OneToMany(() => OrderItem, (item) => item.order, { cascade: true, eager: true })
  items: OrderItem[];

  /** Snapshot of the address at purchase time. */
  @Column({ type: 'jsonb' })
  shippingAddress: ShippingAddress;

  @Column()
  deliveryOption: string;

  /** Mock payment: only the method label is stored, never card data. */
  @Column()
  paymentMethod: string;

  @Column(money)
  subtotal: number;

  @Column(money)
  shippingCost: number;

  @Column(money)
  tax: number;

  @Column(money)
  total: number;

  @Column({ type: 'date' })
  estimatedDelivery: string;

  // timestamptz: a plain `timestamp` has no zone, so the database's clock and Node's can disagree about when it happened.
  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;
}
