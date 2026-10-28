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
import { OriginGuard } from '../../customer-auth/origin.guard.js';
import { verifyClaimTicket } from '../../customer-auth/claim-ticket.js';
import {
  ConflictException,
  UnprocessableEntityException,
} from '@nestjs/common';

describe('PublicOrderEventsController rate limit', () => {
  let app: INestApplication;
  let recordInvite: ReturnType<typeof vi.fn>;
  let confirmReceipt: ReturnType<typeof vi.fn>;
  let loadForClaim: ReturnType<typeof vi.fn>;
  let assertClaimable: ReturnType<typeof vi.fn>;
  let storage: { getPaymentImageStream: ReturnType<typeof vi.fn> };

  beforeEach(async () => {
    loadForClaim = vi.fn().mockResolvedValue({
      id: 'order-1',
      accessTokenHash: 'c'.repeat(64),
    });
    assertClaimable = vi.fn();
    process.env.CUSTOMER_ACCOUNT_TOKEN_SECRET = 'test-secret';
    process.env.GOOGLE_CLIENT_ID = 'client-id';
    process.env.GOOGLE_CLIENT_SECRET = 'client-secret';
    process.env.WEB_URL = 'http://localhost:3001';
    recordInvite = vi.fn();
    confirmReceipt = vi.fn().mockResolvedValue({
      receiptConfirmedAt: '2026-10-01T12:00:00.000Z',
    });
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
          useValue: {
            recordInvite,
            confirmReceipt,
            loadForClaim,
            assertClaimable,
          },
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
    expect(recordInvite).toHaveBeenCalledWith(
      'tok',
      'INVITE_CLICKED',
      undefined,
    );

    await request(app.getHttpServer())
      .post('/public/orders/tok/events')
      .send({ type: 'INVITE_SHOWN', moment: 'banner' })
      .expect(204);
    expect(recordInvite).toHaveBeenLastCalledWith(
      'tok',
      'INVITE_SHOWN',
      'banner',
    );
    // Only the closed set of moments; nothing free-form gets through.
    await request(app.getHttpServer())
      .post('/public/orders/tok/events')
      .send({ type: 'INVITE_SHOWN', moment: 'x@y.com' })
      .expect(400);
    await request(app.getHttpServer())
      .post('/public/orders/tok/events')
      .send({ type: 'INVITE_SHOWN', moment: 'banner', phone: '+51987654321' })
      .expect(400);

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
    expect(recordInvite).toHaveBeenCalledTimes(2);
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

  it('confirms receipt over JSON with private headers and rejects a form body', async () => {
    const ok = await request(app.getHttpServer())
      .post('/public/orders/tok/receipt')
      .send({})
      .expect(200);
    expect(ok.body).toEqual({ receiptConfirmedAt: '2026-10-01T12:00:00.000Z' });
    expect(ok.headers['cache-control']).toBe('no-store');
    expect(ok.headers['referrer-policy']).toBe('no-referrer');
    expect(confirmReceipt).toHaveBeenCalledWith('tok');

    await request(app.getHttpServer())
      .post('/public/orders/tok/receipt')
      .type('form')
      .send({ a: 'b' })
      .expect(415);
    expect(confirmReceipt).toHaveBeenCalledTimes(1);
  });

  it('rejects the receipt after its own per-IP limit', async () => {
    for (let i = 0; i < 20; i++) {
      await request(app.getHttpServer())
        .post('/public/orders/tok/receipt')
        .send({})
        .expect(200);
    }
    const limited = await request(app.getHttpServer())
      .post('/public/orders/tok/receipt')
      .send({})
      .expect(429);
    expect(limited.headers['cache-control']).toBe('no-store');
  });

  describe('claim ticket', () => {
    const ORIGIN = 'http://localhost:3001';
    const post = (token = 'tok') =>
      request(app.getHttpServer())
        .post(`/public/orders/${token}/claim-ticket`)
        .set('Origin', ORIGIN);

    it('is protected by the OriginGuard', () => {
      const guards: unknown[] = Reflect.getMetadata(
        '__guards__',
        PublicOrderEventsController.prototype.claimTicket,
      );
      expect(guards).toContain(OriginGuard);
    });

    it('rejects a missing or cross-origin request before touching the order', async () => {
      await request(app.getHttpServer())
        .post('/public/orders/tok/claim-ticket')
        .send({})
        .expect(403);
      await request(app.getHttpServer())
        .post('/public/orders/tok/claim-ticket')
        .set('Origin', 'https://evil.example')
        .send({})
        .expect(403);
      expect(loadForClaim).not.toHaveBeenCalled();
    });

    it('sets an httpOnly, path-scoped, signed cookie with an empty body and answers 204', async () => {
      const res = await post().send({}).expect(204);

      expect(res.headers['cache-control']).toBe('no-store');
      expect(res.headers['referrer-policy']).toBe('no-referrer');
      const cookie = (res.headers['set-cookie'] as unknown as string[])[0]!;
      expect(cookie).toMatch(/^bm_claim=/);
      expect(cookie).toContain('HttpOnly');
      expect(cookie).toContain('Path=/api/account/google');
      expect(cookie).toContain('SameSite=Lax');
      const value = decodeURIComponent(cookie.split(';')[0]!.split('=')[1]!);
      expect(verifyClaimTicket(value)).toMatchObject({
        orderId: 'order-1',
        linkFp: 'c'.repeat(16),
      });
      // The raw link hash and the token never appear in the cookie body.
      expect(value).not.toContain('c'.repeat(32));
      expect(JSON.stringify(res.body)).not.toContain('tok');
    });

    it('carries the moment into the ticket and rejects an unknown one or extra keys', async () => {
      const res = await post().send({ moment: 'entrega' }).expect(204);
      const cookie = (res.headers['set-cookie'] as unknown as string[])[0]!;
      const value = decodeURIComponent(cookie.split(';')[0]!.split('=')[1]!);
      expect(verifyClaimTicket(value)?.moment).toBe('entrega');

      await post().send({ moment: 'whatever' }).expect(400);
      await post().send({ orderId: 'other' }).expect(400);
    });

    it('rejects a form body', async () => {
      await post().type('form').send({ moment: 'banner' }).expect(415);
    });

    it('answers 404 for an unknown token even when Google is off (404 comes first)', async () => {
      loadForClaim.mockRejectedValue(
        new NotFoundException('Pedido no encontrado'),
      );
      delete process.env.GOOGLE_CLIENT_ID;
      await post().send({}).expect(404);
    });

    it('answers 503 when Google is not configured', async () => {
      delete process.env.GOOGLE_CLIENT_ID;
      await post().send({}).expect(503);
      expect(assertClaimable).not.toHaveBeenCalled();
    });

    it('answers 409 when already claimed and 422 when not claimable', async () => {
      assertClaimable.mockImplementationOnce(() => {
        throw new ConflictException('claimed');
      });
      await post().send({}).expect(409);
      assertClaimable.mockImplementationOnce(() => {
        throw new UnprocessableEntityException('not yet');
      });
      const res = await post().send({}).expect(422);
      expect(res.headers['set-cookie']).toBeUndefined();
    });

    it('is throttled at 10 per minute per IP', async () => {
      for (let i = 0; i < 10; i++) await post().send({}).expect(204);
      await post().send({}).expect(429);
    });
  });
});
