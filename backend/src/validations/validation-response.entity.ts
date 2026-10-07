import { Check, Column, CreateDateColumn, Entity, ManyToOne, PrimaryGeneratedColumn, Unique, UpdateDateColumn } from 'typeorm';
import { User } from '../users/user.entity';
import { Validation } from './validation.entity';

export enum Interest {
  Interested = 'interested',
  Maybe = 'maybe',
  NotInterested = 'not_interested',
}

/**
 * One shopper's answer to one validation. UNIQUE(validation, user) means one answer per person: answering again
 * changes this row. The voter is stored (it is what makes the unique rule possible) but is never exposed by any API.
 */
@Entity('validation_responses')
@Unique(['validation', 'user'])
@Check('"priceBucket" IS NULL OR ("priceBucket" >= 0 AND "priceBucket" <= 4)')
export class ValidationResponse {
  @PrimaryGeneratedColumn()
  id: number;

  @ManyToOne(() => Validation, (validation) => validation.responses, { nullable: false, onDelete: 'CASCADE' })
  validation: Validation;

  @ManyToOne(() => User, { nullable: false, onDelete: 'CASCADE' })
  user: User;

  @Column({ type: 'enum', enum: Interest })
  interest: Interest;

  /** Index 0–4 into the validation's price buckets. Null if skipped (and always null for `not_interested`). */
  @Column({ type: 'smallint', nullable: true })
  priceBucket: number | null;

  /** One of the validation's `features`. Null if skipped (and always null for `not_interested`). */
  @Column({ type: 'varchar', length: 60, nullable: true })
  topFeature: string | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
