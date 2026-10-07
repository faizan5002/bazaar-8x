import { Type } from 'class-transformer';
import { IsDefined, IsIn, IsOptional, IsString, Length, Matches, MaxLength, ValidateNested } from 'class-validator';
import { DELIVERY_OPTION_IDS, DeliveryOptionId } from '../../common/pricing';

export const PAYMENT_METHODS = ['card', 'cod'] as const;
export type PaymentMethodId = (typeof PAYMENT_METHODS)[number];

export class ShippingAddressDto {
  @IsString()
  @Length(2, 80)
  fullName: string;

  @IsString()
  @Length(3, 120)
  line1: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  line2?: string;

  @IsString()
  @Length(1, 80)
  city: string;

  @IsString()
  @Length(1, 80)
  state: string;

  @IsString()
  @Length(3, 12)
  postalCode: string;

  @IsString()
  @Length(2, 60)
  country: string;

  @IsString()
  @Matches(/^[0-9+()\-.\s]{7,20}$/, { message: 'phone must be 7–20 characters: digits, spaces and + ( ) - .' })
  phone: string;
}

export class CreateOrderDto {
  // @IsDefined matters: @ValidateNested alone silently accepts a missing address.
  @IsDefined()
  @ValidateNested()
  @Type(() => ShippingAddressDto)
  shippingAddress: ShippingAddressDto;

  @IsIn(DELIVERY_OPTION_IDS)
  deliveryOption: DeliveryOptionId;

  /** Mock payment: only the method is chosen. No card details are ever sent, collected or stored. */
  @IsIn(PAYMENT_METHODS)
  paymentMethod: PaymentMethodId;
}
