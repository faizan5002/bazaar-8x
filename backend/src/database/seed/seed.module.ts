import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Category } from '../../categories/category.entity';
import { Product } from '../../products/product.entity';
import { Review } from '../../reviews/review.entity';
import { Seller } from '../../sellers/seller.entity';
import { User } from '../../users/user.entity';
// Cart and order entities are registered too so `synchronize` builds the complete schema before seeding.
import { CartItem } from '../../cart/cart-item.entity';
import { Cart } from '../../cart/cart.entity';
import { OrderItem } from '../../orders/order-item.entity';
import { Order } from '../../orders/order.entity';
import { ValidationResponse } from '../../validations/validation-response.entity';
import { Validation } from '../../validations/validation.entity';
import { typeOrmOptions } from '../database.config';
import { SeedService } from './seed.service';

/** Standalone module for the seed script. Deliberately not imported by AppModule, so the API never seeds on boot. */
@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    TypeOrmModule.forRootAsync({ inject: [ConfigService], useFactory: typeOrmOptions }),
    TypeOrmModule.forFeature([Seller, Category, Product, Review, User, Cart, CartItem, Order, OrderItem, Validation, ValidationResponse]),
  ],
  providers: [SeedService],
})
export class SeedModule {}
