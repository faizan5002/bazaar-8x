import { Column, CreateDateColumn, Entity, JoinColumn, OneToMany, OneToOne, PrimaryGeneratedColumn } from 'typeorm';
import { decimalTransformer } from '../common/decimal.transformer';
import { Product } from '../products/product.entity';
import { User } from '../users/user.entity';
import { Validation } from '../validations/validation.entity';

@Entity('sellers')
export class Seller {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  name: string;

  @Column({ unique: true })
  slug: string;

  @Column({ type: 'text', nullable: true })
  description: string | null;

  @Column({ type: 'numeric', precision: 2, scale: 1, default: 0, transformer: decimalTransformer })
  rating: number;

  /**
   * The account that runs this seller (column `ownerId`, unique). A user is a seller exactly when they own a Seller:
   * there is no role flag. Null for the catalog's pre-existing sellers. It is a relation only (never loaded by default),
   * so the owner's id can't leak through the public `seller` objects on products and validations.
   */
  @OneToOne(() => User, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'ownerId' })
  owner: User | null;

  @OneToMany(() => Product, (product) => product.seller)
  products: Product[];

  @OneToMany(() => Validation, (validation) => validation.seller)
  validations: Validation[];

  @CreateDateColumn()
  createdAt: Date;
}
