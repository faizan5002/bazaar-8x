import { ConflictException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { randomBytes } from 'node:crypto';
import { QueryFailedError, Repository } from 'typeorm';
import { User } from '../users/user.entity';
import { CreateSellerDto } from './dto/create-seller.dto';
import { Seller } from './seller.entity';

/** What may be shown about a seller to anyone. Never includes the owner's account. */
export interface SellerSummary {
  id: number;
  name: string;
  slug: string;
}

const UNIQUE_VIOLATION = '23505';

export const slugify = (name: string) =>
  name
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 50) || 'seller';

@Injectable()
export class SellersService {
  constructor(@InjectRepository(Seller) private readonly sellers: Repository<Seller>) {}

  /** The seller this user owns, if any. This is how the API knows someone is a seller (never a client-sent id). */
  findByOwner(userId: number) {
    return this.sellers.findOne({ where: { owner: { id: userId } } });
  }

  toSummary({ id, name, slug }: Seller): SellerSummary {
    return { id, name, slug };
  }

  /** A user may own at most one seller. */
  async createForUser(userId: number, dto: CreateSellerDto) {
    const already = new ConflictException('You already have a seller account.');
    if (await this.findByOwner(userId)) throw already;

    const base = slugify(dto.name);
    for (let attempt = 0; attempt < 5; attempt++) {
      const slug = attempt === 0 ? base : `${base}-${randomBytes(2).toString('hex')}`;
      try {
        const saved = await this.sellers.save(this.sellers.create({ name: dto.name, slug, description: dto.description || null, rating: 0, owner: { id: userId } as User }));
        return { id: saved.id, name: saved.name, slug: saved.slug, description: saved.description, rating: saved.rating, createdAt: saved.createdAt };
      } catch (err) {
        if (!(err instanceof QueryFailedError) || (err.driverError as { code?: string }).code !== UNIQUE_VIOLATION) throw err;
        // Either a simultaneous request just made this user a seller, or the slug is taken: tell them apart.
        if (await this.findByOwner(userId)) throw already;
      }
    }
    throw new ConflictException('Could not pick a unique store address. Try a different store name.');
  }
}
