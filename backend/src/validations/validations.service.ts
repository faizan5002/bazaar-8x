import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { priceBuckets } from '../common/price-buckets';
import { Paginated } from '../products/products.service';
import { SellersService } from '../sellers/sellers.service';
import { User } from '../users/user.entity';
import { ListValidationsQueryDto, RespondDto } from './dto/validation.dto';
import { Interest, ValidationResponse } from './validation-response.entity';
import { ValidationCard, ValidationDetail, toCard, toDetail } from './validation-views';
import { Validation, ValidationStatus } from './validation.entity';

/** A shopper's own answer: no ids, nothing about anyone else. */
export interface MyResponse {
  interest: Interest;
  priceBucket: number | null;
  topFeature: string | null;
  createdAt: Date;
  updatedAt: Date;
}

const toMyResponse = (r: ValidationResponse): MyResponse => ({ interest: r.interest, priceBucket: r.priceBucket, topFeature: r.topFeature, createdAt: r.createdAt, updatedAt: r.updatedAt });

/** The marketplace-facing side of validations: browse them, read one, and answer. */
@Injectable()
export class ValidationsService {
  constructor(
    @InjectRepository(Validation) private readonly validations: Repository<Validation>,
    @InjectRepository(ValidationResponse) private readonly responses: Repository<ValidationResponse>,
    private readonly dataSource: DataSource,
    private readonly sellers: SellersService,
  ) {}

  /** Open validations only. `popular` = most responses first, `newest` = latest first. */
  async list(query: ListValidationsQueryDto): Promise<Paginated<ValidationCard>> {
    const page = query.page ?? 1;
    const limit = query.limit ?? 12;

    const qb = this.validations
      .createQueryBuilder('validation')
      .innerJoinAndSelect('validation.seller', 'seller')
      .innerJoinAndSelect('validation.category', 'category')
      .addSelect('(SELECT COUNT(*) FROM validation_responses r WHERE r."validationId" = validation.id)', 'response_count')
      .where('validation.status = :open', { open: ValidationStatus.Open });
    if (query.category) qb.andWhere('category.slug = :category', { category: query.category });

    const total = await qb.clone().getCount();

    if (query.sort === 'popular') qb.orderBy('response_count', 'DESC').addOrderBy('validation.createdAt', 'DESC');
    else qb.orderBy('validation.createdAt', 'DESC');
    qb.addOrderBy('validation.id', 'DESC');

    // Every join is many-to-one, so offset/limit is safe (see ProductsService).
    const { entities, raw } = await qb.offset((page - 1) * limit).limit(limit).getRawAndEntities();
    const counts = new Map<number, number>(raw.map((row: { validation_id: number; response_count: string }) => [Number(row.validation_id), Number(row.response_count)]));
    return { items: entities.map((v) => toCard(v, counts.get(v.id) ?? 0)), total, page, limit, totalPages: Math.max(1, Math.ceil(total / limit)) };
  }

  /** Public detail. A closed validation is still readable (so old links work); it just says it is closed. */
  async detail(id: number): Promise<ValidationDetail> {
    const validation = await this.load(id);
    return toDetail(validation, await this.responseCount(id));
  }

  /** The signed-in shopper's own answer, or `{ response: null }`. Never anyone else's. */
  async myResponse(userId: number, validationId: number): Promise<{ response: MyResponse | null }> {
    await this.load(validationId);
    const response = await this.responses.findOne({ where: { validation: { id: validationId }, user: { id: userId } } });
    return { response: response ? toMyResponse(response) : null };
  }

  /**
   * Save or change the shopper's answer (one per person, enforced by UNIQUE(validation, user)).
   * Checks, in order: exists (404) → not your own (403) → still open (409) → the optional parts are real options (400).
   */
  async respond(userId: number, validationId: number, dto: RespondDto) {
    const validation = await this.load(validationId);

    const mySeller = await this.sellers.findByOwner(userId);
    if (mySeller && mySeller.id === validation.seller.id) throw new ForbiddenException("You can't respond to your own validation.");
    if (validation.status !== ValidationStatus.Open) throw new ConflictException('This validation is closed and no longer accepts responses.');

    let priceBucket = dto.priceBucket ?? null;
    let topFeature = dto.topFeature ?? null;
    if (dto.interest === Interest.NotInterested) {
      // Price and feature only describe people open to buying: store nothing for a "no".
      priceBucket = null;
      topFeature = null;
    } else {
      if (priceBucket !== null && !priceBuckets(validation.priceMin, validation.priceMax).some((b) => b.index === priceBucket)) {
        throw new BadRequestException('priceBucket is not one of this validation\'s price options.');
      }
      if (topFeature !== null && !validation.features.includes(topFeature)) {
        throw new BadRequestException(`topFeature must be one of: ${validation.features.join(', ')}.`);
      }
    }

    return this.dataSource.transaction(async (em) => {
      const key = { validation: { id: validationId }, user: { id: userId } };
      const existed = await em.exists(ValidationResponse, { where: key });
      // One atomic statement: insert, or if this shopper already answered, replace their answer. No duplicate is possible.
      await em
        .createQueryBuilder()
        .insert()
        .into(ValidationResponse)
        .values({ validation: { id: validationId } as Validation, user: { id: userId } as User, interest: dto.interest, priceBucket, topFeature, updatedAt: () => 'NOW()' })
        .orUpdate(['interest', 'priceBucket', 'topFeature', 'updatedAt'], ['validationId', 'userId'])
        .execute();
      const saved = await em.findOneOrFail(ValidationResponse, { where: key });
      const responseCount = await em.count(ValidationResponse, { where: { validation: { id: validationId } } });
      return { response: toMyResponse(saved), responseCount, created: !existed };
    });
  }

  // ---- internals ------------------------------------------------------------------------------------------------

  private async load(id: number) {
    const validation = await this.validations.findOne({ where: { id }, relations: { seller: true, category: true } });
    if (!validation) throw new NotFoundException(`Validation ${id} not found`);
    return validation;
  }

  private responseCount(validationId: number) {
    return this.responses.count({ where: { validation: { id: validationId } } });
  }
}
