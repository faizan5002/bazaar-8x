import { Type } from 'class-transformer';
import { IsInt, IsObject, IsOptional, Max, Min } from 'class-validator';
import { MAX_QUANTITY_PER_ITEM } from '../../common/pricing';

export class AddCartItemDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  productId: number;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(MAX_QUANTITY_PER_ITEM)
  quantity: number;

  /** Chosen option per variant group. Checked against the product's real variants by the service. */
  @IsOptional()
  @IsObject()
  selectedVariants?: Record<string, string>;
}

export class UpdateCartItemDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(MAX_QUANTITY_PER_ITEM)
  quantity: number;
}
