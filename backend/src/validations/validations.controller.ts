import { Body, Controller, Get, Param, ParseIntPipe, Patch, Post, Put, Query, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../auth/current-user.decorator';
import { AuthUser, JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CreateValidationDto, ListValidationsQueryDto, RespondDto, UpdateValidationStatusDto } from './dto/validation.dto';
import { SellerValidationsService } from './seller-validations.service';
import { ValidationsService } from './validations.service';

/** The marketplace side: anyone can browse and read; answering needs an account. */
@Controller('validations')
export class ValidationsController {
  constructor(private readonly validations: ValidationsService) {}

  @Get()
  list(@Query() query: ListValidationsQueryDto) {
    return this.validations.list(query);
  }

  @Get(':id')
  detail(@Param('id', ParseIntPipe) id: number) {
    return this.validations.detail(id);
  }

  @Get(':id/response')
  @UseGuards(JwtAuthGuard)
  myResponse(@CurrentUser() user: AuthUser, @Param('id', ParseIntPipe) id: number) {
    return this.validations.myResponse(user.id, id);
  }

  @Put(':id/response')
  @UseGuards(JwtAuthGuard)
  respond(@CurrentUser() user: AuthUser, @Param('id', ParseIntPipe) id: number, @Body() dto: RespondDto) {
    return this.validations.respond(user.id, id, dto);
  }
}

/** The seller side. Every route is for the signed-in user's own seller account. */
@Controller('seller/validations')
@UseGuards(JwtAuthGuard)
export class SellerValidationsController {
  constructor(private readonly seller: SellerValidationsService) {}

  @Get()
  list(@CurrentUser() user: AuthUser) {
    return this.seller.list(user.id);
  }

  @Post()
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateValidationDto) {
    return this.seller.create(user.id, dto);
  }

  @Get(':id/results')
  results(@CurrentUser() user: AuthUser, @Param('id', ParseIntPipe) id: number) {
    return this.seller.results(user.id, id);
  }

  @Patch(':id')
  setStatus(@CurrentUser() user: AuthUser, @Param('id', ParseIntPipe) id: number, @Body() dto: UpdateValidationStatusDto) {
    return this.seller.setStatus(user.id, id, dto.status);
  }
}
