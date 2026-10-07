import { Controller, Get, Param, ParseIntPipe, Query } from '@nestjs/common';
import { ReviewQueryDto } from './dto/review-query.dto';
import { ReviewsService } from './reviews.service';

@Controller('products/:productId/reviews')
export class ReviewsController {
  constructor(private readonly reviews: ReviewsService) {}

  @Get()
  list(@Param('productId', ParseIntPipe) productId: number, @Query() query: ReviewQueryDto) {
    return this.reviews.listForProduct(productId, query);
  }
}
