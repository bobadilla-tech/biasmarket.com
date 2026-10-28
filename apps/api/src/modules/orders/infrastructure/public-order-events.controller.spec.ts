import { Test, type TestingModule } from '@nestjs/testing';
import {
  type INestApplication,
  NotFoundException,
  ValidationPipe,
} from '@nestjs/common';
import { ThrottlerModule } from '@nestjs/throttler';
import request from 'supertest';
import { vi } from 'vitest';
import { Readable } from 'node:stream';
import { AllExceptionsFilter } from '../../../common/filters/all-exceptions.filter.js';
import { PublicOrderEventsController } from './public-order-events.controller.js';
import { OrderEventsService } from '../application/order-events.service.js';
import { PublicOrderService } from '../application/public-order.service.js';
import { StorageService } from '../../../storage/storage.service.js';

describe('PublicOrderEventsController rate limit', () => {
  let app: INestApplication;
  let recordInvite: ReturnType<typeof vi.fn>;
  let storage: { getPaymentImageStream: ReturnType<typeof vi.fn> };

  beforeEach(async () => {
    recordInvite = vi.fn();
    storage = { getPaymentImageStream: vi.fn() };
    const module: TestingModule = await Test.createTestingModule({
      // Higher than either route limit, so deleting `@Throttle` fails these
      // tests instead of inheriting the same number from the module.
      imports: [ThrottlerModule.forRoot([{ ttl: 60_000, limit: 100 }])],
      controllers: [PublicOrderEventsController],
      providers: [
        {
          provide: PublicOrderService,
          useValue: {
            getByToken: vi.fn().mockResolvedValue({ ok: true }),
            getPackedPhotoUrlByToken: vi
              .fn()
              .mockResolvedValue(
                'https://cdn.biasmarket.com/private/photo.jpg',
              ),
          },
        },
        {
          provide: OrderEventsService,
          useValue: { recordInvite },
        },
        { provide: StorageService, useValue: storage },
      ],
    }).compile();
    app = module.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true }),
    );
    app.useGlobalFilters(new AllExceptionsFilter());
    // Production trusts one hop (main.ts). The socket is that hop, so the
    // rightmost X-Forwarded-For address is the client.
    app.getHttpAdapter().getInstance().set('trust proxy', 1);
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

  it('streams the package photo only through the token route with private headers', async () => {
    const body = Readable.from(['photo']);
    storage.getPaymentImageStream.mockResolvedValueOnce({
      body,
      contentType: 'image/jpeg',
    });

    const response = await request(app.getHttpServer())
      .get('/public/orders/valid-token/packed-photo')
      .expect(200);

    expect(response.headers['cache-control']).toBe('no-store');
    expect(response.headers['referrer-policy']).toBe('no-referrer');
    expect(response.headers['cross-origin-resource-policy']).toBe(
      'cross-origin',
    );
    expect(storage.getPaymentImageStream).toHaveBeenCalledWith(
      'https://cdn.biasmarket.com/private/photo.jpg',
    );
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

  it('gives each client IP its own bucket and ignores a spoofed prefix', async () => {
    const client = '198.51.100.10';
    const other = '198.51.100.20';
    const get = (forwardedFor: string) =>
      request(app.getHttpServer())
        .get('/public/orders/tok')
        .set('X-Forwarded-For', forwardedFor);

    for (let i = 0; i < 29; i++) {
      await get(client).expect(200);
    }
    // The leftmost address is whatever the visitor sent. The rightmost is the
    // one Caddy appends, and that is the bucket.
    await get(`203.0.113.9, ${client}`).expect(200);
    const limited = await get(`203.0.113.8, ${client}`).expect(429);
    expect(limited.headers['cache-control']).toBe('no-store');
    await get(other).expect(200);
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
