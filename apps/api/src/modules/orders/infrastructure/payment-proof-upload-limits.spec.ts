import { Test, type TestingModule } from '@nestjs/testing';
import {
  type INestApplication,
  NotFoundException,
  ValidationPipe,
} from '@nestjs/common';
import { ThrottlerModule } from '@nestjs/throttler';
import request from 'supertest';
import { vi } from 'vitest';

vi.mock('@thallesp/nestjs-better-auth', async () => {
  const { createParamDecorator } = await import('@nestjs/common');
  return {
    AuthGuard: class AuthGuard {},
    Public: () => () => undefined,
    Session: createParamDecorator(() => ({ user: { id: 'user-1' } })),
  };
});

import { AuthGuard } from '@thallesp/nestjs-better-auth';
import { AllExceptionsFilter } from '../../../common/filters/all-exceptions.filter.js';
import { PrismaService } from '../../../prisma/prisma.service.js';
import { StorageService } from '../../../storage/storage.service.js';
import { NotificationsService } from '../../notifications/notifications.service.js';
import { CustomerSessionGuard } from '../../customer-auth/customer-session.guard.js';
import { OrderEventsService } from '../application/order-events.service.js';
import { AdvanceFulfillmentUseCase } from '../application/advance-fulfillment.usecase.js';
import { CancelOrderUseCase } from '../application/cancel-order.usecase.js';
import { ReviewPaymentUseCase } from '../application/review-payment.usecase.js';
import { VoidOrderPaymentUseCase } from '../application/void-order-payment.usecase.js';
import { CustomerOrderPaymentsController } from './customer-order-payments.controller.js';
import { OrderController } from './order.controller.js';
import { OrderRepository } from './order.repository.js';

const MB = 1024 * 1024;

// JPEG magic bytes are all the validation pipe looks at.
function jpeg(size: number): Buffer {
  const buf = Buffer.alloc(size, 0x61);
  buf[0] = 0xff;
  buf[1] = 0xd8;
  buf[2] = 0xff;
  return buf;
}

// Both handlers throw this once the interceptor, the pipe and the note check
// have passed, so a 404 with this message means "the request got through".
const REACHED_HANDLER = 'reached-handler';

type Route = {
  name: string;
  url: string;
  setup: () => Promise<TestingModule>;
};

const routes: Route[] = [
  {
    name: 'session buyer upload',
    url: '/stores/store-1/account/orders/order-1/payments',
    setup: () =>
      Test.createTestingModule({
        imports: [ThrottlerModule.forRoot([{ ttl: 60_000, limit: 1000 }])],
        controllers: [CustomerOrderPaymentsController],
        providers: [
          {
            provide: OrderRepository,
            useValue: {
              findOrderForBuyer: vi
                .fn()
                .mockRejectedValue(new NotFoundException(REACHED_HANDLER)),
            },
          },
          {
            provide: PrismaService,
            useValue: {
              store: {
                findUnique: vi.fn().mockResolvedValue({ id: 'store-1' }),
              },
            },
          },
          { provide: StorageService, useValue: {} },
          { provide: NotificationsService, useValue: {} },
          { provide: OrderEventsService, useValue: {} },
        ],
      })
        .overrideGuard(CustomerSessionGuard)
        .useValue({
          canActivate: (ctx: {
            switchToHttp: () => { getRequest: () => Record<string, unknown> };
          }) => {
            ctx.switchToHttp().getRequest().customerSession = {
              buyerAccountId: 'buyer-1',
            };
            return true;
          },
        })
        .compile(),
  },
  {
    name: 'seller addPayment',
    url: '/stores/store-1/orders/order-1/payments',
    setup: () =>
      Test.createTestingModule({
        imports: [ThrottlerModule.forRoot([{ ttl: 60_000, limit: 1000 }])],
        controllers: [OrderController],
        providers: [
          {
            provide: OrderRepository,
            useValue: {
              assertOwnership: vi.fn().mockResolvedValue(undefined),
              findRowByIdForStore: vi
                .fn()
                .mockRejectedValue(new NotFoundException(REACHED_HANDLER)),
            },
          },
          { provide: ReviewPaymentUseCase, useValue: {} },
          { provide: AdvanceFulfillmentUseCase, useValue: {} },
          { provide: CancelOrderUseCase, useValue: {} },
          { provide: VoidOrderPaymentUseCase, useValue: {} },
          { provide: PrismaService, useValue: {} },
          { provide: StorageService, useValue: {} },
          { provide: OrderEventsService, useValue: {} },
        ],
      })
        .overrideGuard(AuthGuard)
        .useValue({ canActivate: () => true })
        .compile(),
  },
];

describe.each(routes)('payment proof upload limits: $name', (route) => {
  let app: INestApplication;

  beforeEach(async () => {
    const module = await route.setup();
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

  const post = () => request(app.getHttpServer()).post(route.url);

  it('lets a normal request through to the handler', async () => {
    const res = await post()
      .field('amount', '10')
      .field('method', 'YAPE')
      .field('note', 'gracias')
      .attach('file', jpeg(1024), 'proof.jpg');
    expect(res.status).toBe(404);
    expect(res.body.message).toBe(REACHED_HANDLER);
  });

  it('accepts exactly 5 MB', async () => {
    const res = await post()
      .field('amount', '10')
      .field('method', 'YAPE')
      .attach('file', jpeg(5 * MB), 'proof.jpg');
    expect(res.status).toBe(404);
    expect(res.body.message).toBe(REACHED_HANDLER);
  });

  it('answers the validation pipe 400 for 5 MB + 1 byte, not a 413', async () => {
    const res = await post()
      .field('amount', '10')
      .field('method', 'YAPE')
      .attach('file', jpeg(5 * MB + 1), 'proof.jpg');
    expect(res.status).toBe(400);
    expect(res.body.message).toBe('Máximo 5MB');
  });

  it('cuts off a 6 MB file with a 413', async () => {
    const res = await post()
      .field('amount', '10')
      .field('method', 'YAPE')
      .attach('file', jpeg(6 * MB), 'proof.jpg');
    expect(res.status).toBe(413);
  });

  it('rejects more text fields than allowed with a 400', async () => {
    let req = post();
    for (let i = 0; i < 9; i++) req = req.field(`extra${i}`, 'x');
    const res = await req.attach('file', jpeg(1024), 'proof.jpg');
    expect(res.status).toBe(400);
  });

  it('rejects an oversized text field with a 400', async () => {
    const res = await post()
      .field('amount', '10')
      .field('method', 'YAPE')
      .field('note', 'x'.repeat(5000))
      .attach('file', jpeg(1024), 'proof.jpg');
    expect(res.status).toBe(400);
  });

  it('rejects a second file with a 400', async () => {
    const res = await post()
      .field('amount', '10')
      .field('method', 'YAPE')
      .attach('file', jpeg(1024), 'a.jpg')
      .attach('file', jpeg(1024), 'b.jpg');
    expect(res.status).toBe(400);
  });

  it('rejects an unexpected file field name with a 400', async () => {
    const res = await post()
      .field('amount', '10')
      .field('method', 'YAPE')
      .attach('other', jpeg(1024), 'proof.jpg');
    expect(res.status).toBe(400);
  });

  it('rejects a 501-character note with a clean message', async () => {
    const res = await post()
      .field('amount', '10')
      .field('method', 'YAPE')
      .field('note', 'x'.repeat(501))
      .attach('file', jpeg(1024), 'proof.jpg');
    expect(res.status).toBe(400);
    expect(res.body.message).toBe('La nota no puede superar 500 caracteres');
  });

  it('accepts a 500-character note of 4-byte characters', async () => {
    const res = await post()
      .field('amount', '10')
      .field('method', 'YAPE')
      .field('note', '\u{1F600}'.repeat(500))
      .attach('file', jpeg(1024), 'proof.jpg');
    expect(res.status).toBe(404);
    expect(res.body.message).toBe(REACHED_HANDLER);
  });

  it('answers 400, not 500, for a truncated multipart body', async () => {
    const boundary = '----limits';
    const body =
      `--${boundary}\r\n` +
      'Content-Disposition: form-data; name="amount"\r\n\r\n10';
    const res = await post()
      .set('Content-Type', `multipart/form-data; boundary=${boundary}`)
      .send(body);
    expect(res.status).toBe(400);
  });

  it('answers 400, not 500, for a malformed part header', async () => {
    const boundary = '----limits';
    const body =
      `--${boundary}\r\n` +
      'Content-Disposition form-data name=amount\r\n\r\n10\r\n' +
      `--${boundary}--\r\n`;
    const res = await post()
      .set('Content-Type', `multipart/form-data; boundary=${boundary}`)
      .send(body);
    expect(res.status).toBe(400);
  });

  it('answers 400 when the multipart boundary is missing', async () => {
    const res = await post()
      .set('Content-Type', 'multipart/form-data')
      .send('not multipart');
    expect(res.status).toBe(400);
  });
});
