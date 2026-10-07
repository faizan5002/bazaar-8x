import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Category } from '../categories/category.entity';
import { demandSignal, DemandSignal } from '../common/demand-signal';
import { Seller } from '../sellers/seller.entity';
import { SellersService } from '../sellers/sellers.service';
import { CreateValidationDto } from './dto/validation.dto';
import { launchMonthProblem } from './launch-month';
import { ValidationResponse } from './validation-response.entity';
import { ValidationStatsService, ValidationResults } from './validation-stats.service';
import { ValidationDetail, toDetail } from './validation-views';
import { Validation, ValidationStatus } from './validation.entity';

/** One row of the seller's "My validations" list: the headline numbers, without opening each one. */
export interface SellerValidationItem {
  id: number;
  title: string;
  /** First image, or null. */
  image: string | null;
  status: ValidationStatus;
  responseCount: number;
  interestedPercent: number;
  maybePercent: number;
  notInterestedPercent: number;
  signal: Pick<DemandSignal, 'score' | 'level' | 'label' | 'reliable'>;
  createdAt: Date;
}

/**
 * Everything a seller does with their own validations. The seller is ALWAYS derived from the signed-in user
 * (Seller.owner), never from anything the client sends. Someone else's validation looks exactly like a missing one (404).
 */
@Injectable()
export class SellerValidationsService {
  constructor(
    @InjectRepository(Validation) private readonly validations: Repository<Validation>,
    @InjectRepository(Category) private readonly categories: Repository<Category>,
    @InjectRepository(ValidationResponse) private readonly responses: Repository<ValidationResponse>,
    private readonly sellers: SellersService,
    private readonly stats: ValidationStatsService,
  ) {}

  async list(userId: number): Promise<{ items: SellerValidationItem[] }> {
    const seller = await this.requireSeller(userId);
    const rows = await this.validations.find({ where: { seller: { id: seller.id } }, order: { createdAt: 'DESC', id: 'DESC' } });
    const counts = await this.stats.interestCounts(rows.map((v) => v.id));
    return {
      items: rows.map((v) => {
        const s = demandSignal(counts.get(v.id)!);
        return {
          id: v.id,
          title: v.title,
          image: v.images[0] ?? null,
          status: v.status,
          responseCount: s.total,
          interestedPercent: s.interestedPercent,
          maybePercent: s.maybePercent,
          notInterestedPercent: s.notInterestedPercent,
          signal: { score: s.score, level: s.level, label: s.label, reliable: s.reliable },
          createdAt: v.createdAt,
        };
      }),
    };
  }

  async create(userId: number, dto: CreateValidationDto): Promise<ValidationDetail> {
    const seller = await this.requireSeller(userId);

    if (dto.priceMax < dto.priceMin) throw new BadRequestException('priceMax must be greater than or equal to priceMin.');
    const launchProblem = launchMonthProblem(dto.expectedLaunch);
    if (launchProblem) throw new BadRequestException(launchProblem);
    const distinct = new Set(dto.features.map((f) => f.toLowerCase()));
    if (distinct.size !== dto.features.length) throw new BadRequestException('Features must be different from each other.');
    const category = await this.categories.findOne({ where: { id: dto.categoryId } });
    if (!category) throw new BadRequestException(`Category ${dto.categoryId} does not exist.`);

    const saved = await this.validations.save(
      this.validations.create({
        seller,
        category,
        title: dto.title,
        tagline: dto.tagline,
        description: dto.description,
        images: dto.images ?? [],
        features: dto.features,
        priceMin: dto.priceMin,
        priceMax: dto.priceMax,
        expectedLaunch: dto.expectedLaunch,
        status: ValidationStatus.Open,
      }),
    );
    return toDetail(saved, 0);
  }

  async results(userId: number, id: number): Promise<ValidationResults> {
    return this.stats.results(await this.owned(userId, id));
  }

  /** Close (stop accepting responses) or reopen. Editing a validation's content is intentionally not supported. */
  async setStatus(userId: number, id: number, status: ValidationStatus): Promise<ValidationDetail> {
    const validation = await this.owned(userId, id);
    if (validation.status !== status) {
      validation.status = status;
      await this.validations.save(validation);
    }
    return toDetail(validation, await this.responses.count({ where: { validation: { id } } }));
  }

  // ---- internals ------------------------------------------------------------------------------------------------

  /** 403 for someone with no seller account; otherwise their Seller. */
  private async requireSeller(userId: number): Promise<Seller> {
    const seller = await this.sellers.findByOwner(userId);
    if (!seller) throw new ForbiddenException('You need a seller account to do this.');
    return seller;
  }

  private async owned(userId: number, id: number): Promise<Validation> {
    const seller = await this.requireSeller(userId);
    const validation = await this.validations.findOne({ where: { id }, relations: { seller: true, category: true } });
    if (!validation || validation.seller.id !== seller.id) throw new NotFoundException('Validation not found.');
    return validation;
  }
}
