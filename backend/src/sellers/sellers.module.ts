import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Seller } from './seller.entity';
import { SellersController } from './sellers.controller';
import { SellersService } from './sellers.service';

/**
 * A seller is a store shoppers can see on products and on validations; a user "is a seller" by owning one.
 * Managing products as a seller is not built (only demand validations, in the validations module).
 */
@Module({
  imports: [TypeOrmModule.forFeature([Seller])],
  controllers: [SellersController],
  providers: [SellersService],
  exports: [TypeOrmModule, SellersService],
})
export class SellersModule {}
