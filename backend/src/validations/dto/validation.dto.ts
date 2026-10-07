import { Transform, Type } from 'class-transformer';
import { ArrayMaxSize, ArrayMinSize, IsArray, IsEnum, IsIn, IsInt, IsNumber, IsOptional, IsString, IsUrl, Length, Matches, Max, MaxLength, Min } from 'class-validator';
import { Interest } from '../validation-response.entity';
import { ValidationStatus } from '../validation.entity';

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);
const trimEach = ({ value }: { value: unknown }) => (Array.isArray(value) ? value.map((v) => (typeof v === 'string' ? v.trim() : v)) : value);

export const MIN_FEATURES = 3;
export const MAX_FEATURES = 6;
export const MAX_IMAGES = 5;

/** Seller proposes a product to test. There is deliberately no sellerId: the seller is the signed-in user's own. */
export class CreateValidationDto {
  @Transform(trim)
  @IsString()
  @Length(3, 120)
  title: string;

  @Transform(trim)
  @IsString()
  @Length(3, 160)
  tagline: string;

  @Transform(trim)
  @IsString()
  @Length(10, 4000)
  description: string;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  categoryId: number;

  /** Image URLs only: there is no upload. */
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(MAX_IMAGES)
  @Transform(trimEach)
  @IsUrl({ protocols: ['http', 'https'], require_protocol: true }, { each: true, message: 'each image must be an http(s) URL' })
  @MaxLength(500, { each: true })
  images?: string[];

  @IsArray()
  @ArrayMinSize(MIN_FEATURES)
  @ArrayMaxSize(MAX_FEATURES)
  @Transform(trimEach)
  @IsString({ each: true })
  @Length(2, 60, { each: true })
  features: string[];

  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01)
  @Max(100_000)
  priceMin: number;

  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01)
  @Max(100_000)
  priceMax: number;

  /** "YYYY-MM". Whether the month is in a sensible window is checked by the service. */
  @Matches(/^\d{4}-(0[1-9]|1[0-2])$/, { message: 'expectedLaunch must be a month like "2026-12"' })
  expectedLaunch: string;
}

export class UpdateValidationStatusDto {
  @IsEnum(ValidationStatus)
  status: ValidationStatus;
}

export class ListValidationsQueryDto {
  /** Category slug, like the products API. */
  @IsOptional()
  @Matches(/^[a-z0-9-]{1,60}$/)
  category?: string;

  @IsOptional()
  @IsIn(['newest', 'popular'])
  sort?: 'newest' | 'popular' = 'newest';

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  limit?: number = 12;
}

/**
 * A shopper's answer. Rule for the optional parts: they only mean something for someone who might buy, so for
 * `not_interested` any priceBucket / topFeature sent is ignored and stored as null (the simplest consistent rule: the
 * client can't get it "wrong", and analytics on price and features only ever describe people open to buying).
 */
export class RespondDto {
  @IsEnum(Interest)
  interest: Interest;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(4)
  priceBucket?: number | null;

  @Transform(trim)
  @IsOptional()
  @IsString()
  @Length(1, 60)
  topFeature?: string | null;
}

