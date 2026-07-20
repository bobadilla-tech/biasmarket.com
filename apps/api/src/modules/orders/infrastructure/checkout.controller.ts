import { Body, Controller, Param, Post } from '@nestjs/common';
import { Public } from '@thallesp/nestjs-better-auth';
import { CreateOrderUseCase } from '../application/create-order.usecase.js';
import { CreateOrderDto } from '../dto/create-order.dto.js';

@Controller('stores/:slug/checkout')
export class CheckoutController {
  constructor(private createOrder: CreateOrderUseCase) {}

  @Public()
  @Post()
  create(@Param('slug') slug: string, @Body() dto: CreateOrderDto) {
    return this.createOrder.execute(slug, dto);
  }
}
