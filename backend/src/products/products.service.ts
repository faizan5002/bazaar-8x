import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ProductQueryDto, ProductSort } from './dto/product-query.dto';
import { Product } from './product.entity';

const SORT_ORDER: Record<Exclude<ProductSort, 'relevance'>, [string, 'ASC' | 'DESC']> = {
  price_asc: ['product.price', 'ASC'],
  price_desc: ['product.price', 'DESC'],
  rating: ['product.ratingAverage', 'DESC'],
  newest: ['product.createdAt', 'DESC'],
  popular: ['product.soldCount', 'DESC'],
};

const MAX_SEARCH_TERMS = 6;

/** Escape LIKE wildcards so user input like "100%" is matched literally. */
const escapeLike = (term: string) => term.replace(/[\\%_]/g, '\\$&');

export interface Paginated<T> {
  items: T[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

@Injectable()
export class ProductsService {
  constructor(@InjectRepository(Product) private readonly products: Repository<Product>) {}

  async search(query: ProductQueryDto): Promise<Paginated<Product>> {
    const page = query.page ?? 1;
    const limit = query.limit ?? 24;

    const qb = this.products
      .createQueryBuilder('product')
      .leftJoinAndSelect('product.category', 'category')
      .leftJoin('category.parent', 'parentCategory')
      .leftJoinAndSelect('product.seller', 'seller');

    // Every search term must match somewhere in title, brand or description (AND across terms).
    const terms = (query.q ?? '').trim().split(/\s+/).filter(Boolean).slice(0, MAX_SEARCH_TERMS);
    terms.forEach((term, i) => {
      qb.andWhere(`(product.title ILIKE :term${i} OR product.brand ILIKE :term${i} OR product.description ILIKE :term${i})`, {
        [`term${i}`]: `%${escapeLike(term)}%`,
      });
    });
    if (query.category) {
      qb.andWhere('(category.slug = :category OR parentCategory.slug = :category)', { category: query.category });
    }
    if (query.minPrice !== undefined) qb.andWhere('product.price >= :minPrice', { minPrice: query.minPrice });
    if (query.maxPrice !== undefined) qb.andWhere('product.price <= :maxPrice', { maxPrice: query.maxPrice });
    if (query.minRating !== undefined) qb.andWhere('product.ratingAverage >= :minRating', { minRating: query.minRating });
    if (query.inStock) qb.andWhere('product.stock > 0');
    if (query.deals) qb.andWhere('product.isDeal = true');
    if (query.featured) qb.andWhere('product.isFeatured = true');

    // Count before adding the ranking column / ordering.
    const total = await qb.clone().getCount();

    const sort = query.sort ?? 'relevance';
    if (sort === 'relevance') {
      if (terms.length) {
        // Title hits outrank brand hits outrank description-only hits; popularity breaks ties.
        const score = terms
          .map((_, i) => `(CASE WHEN product.title ILIKE :term${i} THEN 2 WHEN product.brand ILIKE :term${i} THEN 1 ELSE 0 END)`)
          .join(' + ');
        qb.addSelect(score, 'relevance_score').orderBy('relevance_score', 'DESC').addOrderBy('product.soldCount', 'DESC');
      } else {
        qb.orderBy('product.soldCount', 'DESC');
      }
    } else {
      const [column, direction] = SORT_ORDER[sort];
      qb.orderBy(column, direction);
    }
    // id keeps pagination stable when the sort key ties.
    qb.addOrderBy('product.id', 'ASC');

    // offset/limit (not skip/take) is safe here: every join is many-to-one, so rows map 1:1 to products.
    const items = await qb.offset((page - 1) * limit).limit(limit).getMany();

    return { items, total, page, limit, totalPages: Math.max(1, Math.ceil(total / limit)) };
  }

  async findOne(id: number): Promise<Product> {
    const product = await this.products.findOne({ where: { id }, relations: { category: true, seller: true } });
    if (!product) throw new NotFoundException(`Product ${id} not found`);
    return product;
  }

  async findRelated(id: number, limit = 8): Promise<Product[]> {
    const product = await this.findOne(id);
    return this.products
      .createQueryBuilder('product')
      .leftJoinAndSelect('product.category', 'category')
      .leftJoinAndSelect('product.seller', 'seller')
      .where('category.id = :categoryId AND product.id != :id', { categoryId: product.category.id, id })
      .orderBy('product.soldCount', 'DESC')
      .take(limit)
      .getMany();
  }
}
