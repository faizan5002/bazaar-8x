import { Controller, Get, Param, ParseIntPipe, Query } from '@nestjs/common';
import { ProductQueryDto } from './dto/product-query.dto';
import { ProductsService } from './products.service';

@Controller('products')
export class ProductsController {
  constructor(private readonly products: ProductsService) {}

  @Get()
  search(@Query() query: ProductQueryDto) {
    return this.products.search(query);
  }

  @Get(':id')
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.products.findOne(id);
  }

  @Get(':id/related')
  findRelated(@Param('id', ParseIntPipe) id: number) {
    return this.products.findRelated(id);
  }
}
