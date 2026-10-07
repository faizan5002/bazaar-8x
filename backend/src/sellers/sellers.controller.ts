import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../auth/current-user.decorator';
import { AuthUser, JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CreateSellerDto } from './dto/create-seller.dto';
import { SellersService } from './sellers.service';

@Controller('sellers')
@UseGuards(JwtAuthGuard)
export class SellersController {
  constructor(private readonly sellers: SellersService) {}

  /** Open a seller account for the signed-in user (at most one each). */
  @Post()
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateSellerDto) {
    return this.sellers.createForUser(user.id, dto);
  }
}
