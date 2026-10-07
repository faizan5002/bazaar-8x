import { Body, Controller, Delete, Get, Param, ParseIntPipe, Patch, Post, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../auth/current-user.decorator';
import { AuthUser, JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CartService } from './cart.service';
import { AddCartItemDto, UpdateCartItemDto } from './dto/cart.dto';

/** Every route returns the whole, fresh cart so the client never has to patch its own copy. */
@Controller('cart')
@UseGuards(JwtAuthGuard)
export class CartController {
  constructor(private readonly cart: CartService) {}

  @Get()
  get(@CurrentUser() user: AuthUser) {
    return this.cart.get(user.id);
  }

  @Post('items')
  add(@CurrentUser() user: AuthUser, @Body() dto: AddCartItemDto) {
    return this.cart.add(user.id, dto);
  }

  @Patch('items/:itemId')
  update(@CurrentUser() user: AuthUser, @Param('itemId', ParseIntPipe) itemId: number, @Body() dto: UpdateCartItemDto) {
    return this.cart.updateQuantity(user.id, itemId, dto.quantity);
  }

  @Delete('items/:itemId')
  remove(@CurrentUser() user: AuthUser, @Param('itemId', ParseIntPipe) itemId: number) {
    return this.cart.remove(user.id, itemId);
  }

  @Delete()
  clear(@CurrentUser() user: AuthUser) {
    return this.cart.clear(user.id);
  }
}
