import { Test, type TestingModule } from '@nestjs/testing';
import {
  type INestApplication,
  NotFoundException,
  ValidationPipe,
} from '@nestjs/common';
import { ThrottlerModule } from '@nestjs/throttler';
import request from 'supertest';
import { vi } from 'vitest';
import { AllExceptionsFilter } from '../../../common/filters/all-exceptions.filter.js';
import { PublicOrderEventsController } from './public-order-events.controller.js';
import { OrderEventsService } from '../application/order-events.service.js';
import { PublicOrderService } from '../application/public-order.service.js';

describe('PublicOrderEventsController rate limit', () => {
  let app: INestApplication;
  let recordInvite: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    recordInvite = vi.fn();
    const module: TestingModule = await Test.createTestingModule({
      // Higher than either route limit, so deleting `@Throttle` fails these
      // tests instead of inheriting the same number from the module.
      imports: [ThrottlerModule.forRoot([{ ttl: 60_000, limit: 100 }])],
      controllers: [PublicOrderEventsController],
      providers: [
        {
          provide: PublicOrderService,
          useValue: { getByToken: vi.fn().mockResolvedValue({ ok: true }) },
        },
        {
          provide: OrderEventsService,
          useValue: { recordInvite },
        },
      ],
    }).compile();
    app = module.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true }),
    );
    app.useGlobalFilters(new AllExceptionsFilter());
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
    const limited = await request(app.getHttpServer())
      .get('/public/orders/tok')
      .expect(429);
    expect(limited.headers['cache-control']).toBe('no-store');
    expect(limited.headers['referrer-policy']).toBe('no-referrer');
  });

  it('keeps the private-link headers on a 404', async () => {
    const orders = app.get(PublicOrderService);
    vi.mocked(orders.getByToken).mockRejectedValueOnce(
      new NotFoundException('Pedido no encontrado'),
    );

    const response = await request(app.getHttpServer())
      .get('/public/orders/missing')
      .expect(404);

    expect(response.headers['cache-control']).toBe('no-store');
    expect(response.headers['referrer-policy']).toBe('no-referrer');
  });

  it('records a JSON invite event and rejects a bad type or a form body', async () => {
    await request(app.getHttpServer())
      .post('/public/orders/tok/events')
      .send({ type: 'INVITE_CLICKED' })
      .expect(204);
    expect(recordInvite).toHaveBeenCalledWith('tok', 'INVITE_CLICKED');

    const invalid = await request(app.getHttpServer())
      .post('/public/orders/tok/events')
      .send({ type: 'NOPE' })
      .expect(400);
    expect(invalid.headers['cache-control']).toBe('no-store');
    expect(invalid.headers['referrer-policy']).toBe('no-referrer');

    await request(app.getHttpServer())
      .post('/public/orders/tok/events')
      .type('form')
      .send({ type: 'INVITE_SHOWN' })
      .expect(415);
    expect(recordInvite).toHaveBeenCalledTimes(1);
  });

  it('rejects the invite beacon after its own per-IP limit', async () => {
    for (let i = 0; i < 20; i++) {
      await request(app.getHttpServer())
        .post('/public/orders/tok/events')
        .send({ type: 'INVITE_CLICKED' })
        .expect(204);
    }
    const limited = await request(app.getHttpServer())
      .post('/public/orders/tok/events')
      .send({ type: 'INVITE_CLICKED' })
      .expect(429);
    expect(limited.headers['cache-control']).toBe('no-store');
    expect(limited.headers['referrer-policy']).toBe('no-referrer');
  });
});
