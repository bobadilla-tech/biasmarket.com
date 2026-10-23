import { Test, type TestingModule } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import { ThrottlerModule } from '@nestjs/throttler';
import request from 'supertest';
import { vi } from 'vitest';
import { PublicOrderEventsController } from './public-order-events.controller.js';
import { OrderEventsService } from '../application/order-events.service.js';
import { PublicOrderService } from '../application/public-order.service.js';

describe('PublicOrderEventsController rate limit', () => {
  let app: INestApplication;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      imports: [ThrottlerModule.forRoot([{ ttl: 60_000, limit: 30 }])],
      controllers: [PublicOrderEventsController],
      providers: [
        {
          provide: PublicOrderService,
          useValue: { getByToken: vi.fn().mockResolvedValue({ ok: true }) },
        },
        {
          provide: OrderEventsService,
          useValue: { recordInvite: vi.fn() },
        },
      ],
    }).compile();
    app = module.createNestApplication();
    await app.init();
  });

  afterEach(async () => {
    await app.close();
  });

  it('rejects the request after the per-IP limit', async () => {
    const first = await request(app.getHttpServer())
      .get('/public/orders/tok')
      .expect(200);
    expect(first.headers['cache-control']).toBe('no-store');
    expect(first.headers['referrer-policy']).toBe('no-referrer');
    for (let i = 0; i < 29; i++) {
      await request(app.getHttpServer()).get('/public/orders/tok').expect(200);
    }
    await request(app.getHttpServer()).get('/public/orders/tok').expect(429);
  });
});
