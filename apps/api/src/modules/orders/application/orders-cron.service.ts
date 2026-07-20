import { Injectable } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { ExpireOrdersUseCase } from './expire-orders.usecase.js';

@Injectable()
export class OrdersCronService {
  constructor(private expireOrders: ExpireOrdersUseCase) {}

  @Cron('*/5 * * * *')
  async handleExpirations() {
    await this.expireOrders.execute();
  }
}
