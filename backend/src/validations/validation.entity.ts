import { Check, Column, CreateDateColumn, Entity, Index, ManyToOne, OneToMany, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';
import { Category } from '../categories/category.entity';
import { decimalTransformer } from '../common/decimal.transformer';
import { Seller } from '../sellers/seller.entity';
import { ValidationResponse } from './validation-response.entity';

export enum ValidationStatus {
  Open = 'open',
  Closed = 'closed',
}

/**
 * A product idea a seller wants to test before making it: "would you consider buying this?".
 * Not a product: it has no stock, no cart, and can't be purchased.
 */
@Entity('validations')
@Index(['status', 'createdAt'])
@Check('"priceMin" > 0 AND "priceMax" >= "priceMin"')
export class Validation {
  @PrimaryGeneratedColumn()
  id: number;

  @Index()
  @ManyToOne(() => Seller, (seller) => seller.validations, { nullable: false, onDelete: 'CASCADE' })
  seller: Seller;

  @Index()
  @ManyToOne(() => Category, { nullable: false })
  category: Category;

  @Column()
  title: string;

  @Column()
  tagline: string;

  @Column({ type: 'text' })
  description: string;

  /** Image URLs, first is primary (same convention as products). */
  @Column({ type: 'jsonb', default: [] })
  images: string[];

  /** 3–6 selling points. They double as the choices for "which feature matters most?". */
  @Column({ type: 'jsonb', default: [] })
  features: string[];

  /** Proposed price range. The five preferred-price buckets are derived from it (see common/price-buckets.ts). */
  @Column({ type: 'numeric', precision: 10, scale: 2, transformer: decimalTransformer })
  priceMin: number;

  @Column({ type: 'numeric', precision: 10, scale: 2, transformer: decimalTransformer })
  priceMax: number;

  /** Month the seller expects to launch, as "YYYY-MM". A string sorts correctly and carries no fake day or timezone. */
  @Column({ type: 'varchar', length: 7 })
  expectedLaunch: string;

  @Column({ type: 'enum', enum: ValidationStatus, default: ValidationStatus.Open })
  status: ValidationStatus;

  @OneToMany(() => ValidationResponse, (response) => response.validation)
  responses: ValidationResponse[];

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
