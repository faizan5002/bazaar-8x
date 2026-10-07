import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Paginated } from '../products/products.service';
import { Product } from '../products/product.entity';
import { ReviewQueryDto } from './dto/review-query.dto';
import { Review } from './review.entity';

/** What the storefront may see of a review. Deliberately excludes the author's account (id / email). */
export interface PublicReview {
  id: number;
  authorName: string;
  rating: number;
  title: string;
  body: string;
  verifiedPurchase: boolean;
  createdAt: Date;
}

@Injectable()
export class ReviewsService {
  constructor(
    @InjectRepository(Review) private readonly reviews: Repository<Review>,
    @InjectRepository(Product) private readonly products: Repository<Product>,
  ) {}

  async listForProduct(productId: number, query: ReviewQueryDto): Promise<Paginated<PublicReview>> {
    const page = query.page ?? 1;
    const limit = query.limit ?? 10;
    if (!(await this.products.exist({ where: { id: productId } }))) throw new NotFoundException(`Product ${productId} not found`);

    const [rows, total] = await this.reviews.findAndCount({
      where: { product: { id: productId } },
      order: { createdAt: 'DESC', id: 'DESC' },
      skip: (page - 1) * limit,
      take: limit,
    });

    return {
      items: rows.map(({ id, authorName, rating, title, body, verifiedPurchase, createdAt }) => ({ id, authorName, rating, title, body, verifiedPurchase, createdAt })),
      total,
      page,
      limit,
      totalPages: Math.max(1, Math.ceil(total / limit)),
    };
  }
}
