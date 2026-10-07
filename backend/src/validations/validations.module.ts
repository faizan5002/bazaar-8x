import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Category } from '../categories/category.entity';
import { SellersModule } from '../sellers/sellers.module';
import { SellerValidationsService } from './seller-validations.service';
import { ValidationResponse } from './validation-response.entity';
import { ValidationStatsService } from './validation-stats.service';
import { Validation } from './validation.entity';
import { SellerValidationsController, ValidationsController } from './validations.controller';
import { ValidationsService } from './validations.service';

/** Product demand validation: sellers test an idea, shoppers answer, sellers read the results. */
@Module({
  imports: [TypeOrmModule.forFeature([Validation, ValidationResponse, Category]), SellersModule],
  controllers: [ValidationsController, SellerValidationsController],
  providers: [ValidationsService, SellerValidationsService, ValidationStatsService],
  exports: [TypeOrmModule],
})
export class ValidationsModule {}
