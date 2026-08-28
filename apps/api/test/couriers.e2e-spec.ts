import { Test, type TestingModule } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import { PrismaService } from '../src/prisma/prisma.service.js';
import request from 'supertest';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { AppModule } from './../src/app.module.js';
import {
  assertMatchesSchema,
  mailerDevDir,
  waitForNewMailerFile,
} from './schema-assert.js';

// Exercises the couriers module end to end — CRUD, bulk-save
// (insert/update/delete/idempotent), the `@@unique([storeId, name])`
// hardening (dup name -> 400, never a raw P2002 500), and the ownership
// guard. A stubbed-Prisma unit test can't cover `$transaction`, the unique
// constraint, or the real HTTP guard chain.
const openapiPath = join(__dirname, '..', 'openapi.json');
let openapiRaw: string;
try {
  openapiRaw = readFileSync(openapiPath, 'utf-8');
} catch {
  throw new Error(
    `${openapiPath} not found — run "pnpm --filter api generate:openapi" first.`,
  );
}
const openapi = JSON.parse(openapiRaw);
const courierSchema = openapi.components.schemas.CourierResponseDto;

describe('couriers (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let sessionCookie: string;
  let userId: string;
  let storeId: string;
  let storeSlug: string;

  const runId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const email = `couriers-e2e-${runId}@example.com`;
  // A syntactically valid id that doesn't belong to any store — stands in for
  // "a store you don't own" without a second signup (better-auth caps
  // sign-in/sign-up at 3 requests / 10s, and a second user in this same
  // beforeAll would trip it).
  const foreignStoreId = '00000000-0000-4000-8000-000000000000';

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();
    prisma = moduleFixture.get(PrismaService);

    const password = 'correcthorsebatterystaple';
    const existingMailerFiles = new Set(readdirSync(mailerDevDir));

    const signUpRes = await request(app.getHttpServer())
      .post('/api/auth/sign-up/email')
      .send({ email, password, name: 'E2E Seller' })
      .expect(200);
    userId = signUpRes.body.user.id;

    const mailerFile = await waitForNewMailerFile(existingMailerFiles, email);
    const html = readFileSync(mailerFile, 'utf-8');
    const tokenMatch = html.match(/verify-email\?token=([^&"]+)/);
    if (!tokenMatch) throw new Error('verification link not found in email');
    await request(app.getHttpServer())
      .get(`/api/auth/verify-email?token=${tokenMatch[1]}`)
      .expect((res) => {
        if (res.status >= 400) {
          throw new Error(`verify-email failed with status ${res.status}`);
        }
      });

    const signInRes = await request(app.getHttpServer())
      .post('/api/auth/sign-in/email')
      .send({ email, password })
      .expect(200);
    const setCookie = signInRes.headers['set-cookie'] as unknown as string[];
    const raw = setCookie?.find((c) => c.includes('session_token'));
    if (!raw) throw new Error('sign-in did not return a session cookie');
    sessionCookie = raw.split(';')[0]!;

    storeSlug = `couriers-e2e-${runId}`;
    const storeRes = await request(app.getHttpServer())
      .post('/stores')
      .set('Cookie', sessionCookie)
      .send({
        name: 'E2E Store',
        slug: storeSlug,
        whatsappNumber: '+51900000000',
      })
      .expect(201);
    storeId = storeRes.body.id;
  });

  afterAll(async () => {
    if (storeId) {
      await prisma.courierConfig.deleteMany({
        where: { courier: { storeId } },
      });
      await prisma.courier.deleteMany({ where: { storeId } });
      await prisma.paymentMethodConfig.deleteMany({ where: { storeId } });
      await prisma.deliveryMethodConfig.deleteMany({ where: { storeId } });
      await prisma.store.deleteMany({ where: { id: storeId } });
    }
    if (userId) await prisma.user.deleteMany({ where: { id: userId } });
    await app.close();
  });

  it('create -> findAll -> update -> remove round trip matches CourierResponseDto', async () => {
    const createRes = await request(app.getHttpServer())
      .post(`/stores/${storeId}/couriers`)
      .set('Cookie', sessionCookie)
      .send({
        name: 'Olva',
        modalities: [
          { modality: 'AGENCY', price: 5 },
          { modality: 'HOME', price: 8.5 },
        ],
      })
      .expect(201);
    assertMatchesSchema(createRes.body, courierSchema, openapi.components);
    expect(createRes.body.name).toBe('Olva');
    expect(createRes.body.modalities).toHaveLength(2);
    const courierId = createRes.body.id as string;

    const listRes = await request(app.getHttpServer())
      .get(`/stores/${storeId}/couriers`)
      .set('Cookie', sessionCookie)
      .expect(200);
    expect(listRes.body).toHaveLength(1);
    assertMatchesSchema(listRes.body[0], courierSchema, openapi.components);

    const updateRes = await request(app.getHttpServer())
      .patch(`/stores/${storeId}/couriers/${courierId}`)
      .set('Cookie', sessionCookie)
      .send({
        name: 'Olva Courier',
        modalities: [{ modality: 'HOME', price: 9 }],
      })
      .expect(200);
    expect(updateRes.body.name).toBe('Olva Courier');
    expect(updateRes.body.modalities).toHaveLength(1);
    expect(updateRes.body.modalities[0].modality).toBe('HOME');

    await request(app.getHttpServer())
      .delete(`/stores/${storeId}/couriers/${courierId}`)
      .set('Cookie', sessionCookie)
      .expect(200);

    const afterRes = await request(app.getHttpServer())
      .get(`/stores/${storeId}/couriers`)
      .set('Cookie', sessionCookie)
      .expect(200);
    expect(afterRes.body).toHaveLength(0);
  });

  it('rejects a duplicate courier name with 400 (create + bulk-save), never a 500', async () => {
    await request(app.getHttpServer())
      .post(`/stores/${storeId}/couriers`)
      .set('Cookie', sessionCookie)
      .send({ name: 'Shalom', modalities: [{ modality: 'AGENCY', price: 4 }] })
      .expect(201);

    // create with an existing name -> the @@unique constraint, translated.
    await request(app.getHttpServer())
      .post(`/stores/${storeId}/couriers`)
      .set('Cookie', sessionCookie)
      .send({ name: 'Shalom', modalities: [{ modality: 'HOME', price: 6 }] })
      .expect(400);

    // bulk-save with two payload entries sharing a name -> caught before the DB.
    await request(app.getHttpServer())
      .post(`/stores/${storeId}/couriers/bulk-save`)
      .set('Cookie', sessionCookie)
      .send({
        couriers: [
          { name: 'Dup', modalities: [{ modality: 'AGENCY', price: 1 }] },
          { name: 'Dup', modalities: [{ modality: 'HOME', price: 2 }] },
        ],
        deletedIds: [],
      })
      .expect(400);

    // bulk-save with a name that collides with an existing row not in
    // deletedIds -> the P2002 -> BadRequestException path.
    await request(app.getHttpServer())
      .post(`/stores/${storeId}/couriers/bulk-save`)
      .set('Cookie', sessionCookie)
      .send({
        couriers: [
          { name: 'Shalom', modalities: [{ modality: 'HOME', price: 6 }] },
        ],
        deletedIds: [],
      })
      .expect(400);

    // clean slate for the next test
    const rows = await request(app.getHttpServer())
      .get(`/stores/${storeId}/couriers`)
      .set('Cookie', sessionCookie);
    for (const c of rows.body as { id: string }[]) {
      await request(app.getHttpServer())
        .delete(`/stores/${storeId}/couriers/${c.id}`)
        .set('Cookie', sessionCookie);
    }
  });

  it('bulk-save inserts new, updates existing, deletes omitted, and is idempotent', async () => {
    const first = await request(app.getHttpServer())
      .post(`/stores/${storeId}/couriers/bulk-save`)
      .set('Cookie', sessionCookie)
      .send({
        couriers: [
          {
            name: 'Olva',
            sortOrder: 0,
            modalities: [
              { modality: 'AGENCY', price: 5 },
              { modality: 'HOME', price: 8 },
            ],
          },
          {
            name: 'Motorizado',
            sortOrder: 1,
            modalities: [{ modality: 'HOME', price: 12 }],
          },
        ],
        deletedIds: [],
      })
      .expect(201);
    expect(first.body).toHaveLength(2);
    const olva = first.body.find((c: { name: string }) => c.name === 'Olva');
    const moto = first.body.find(
      (c: { name: string }) => c.name === 'Motorizado',
    );

    // Update Olva's modalities + drop Motorizado in one call.
    const second = await request(app.getHttpServer())
      .post(`/stores/${storeId}/couriers/bulk-save`)
      .set('Cookie', sessionCookie)
      .send({
        couriers: [
          {
            id: olva.id,
            name: 'Olva',
            sortOrder: 0,
            modalities: [{ modality: 'AGENCY', price: 6 }],
          },
        ],
        deletedIds: [moto.id],
      })
      .expect(201);
    expect(second.body).toHaveLength(1);
    expect(second.body[0].modalities).toHaveLength(1);
    expect(second.body[0].modalities[0].price).toBe('6');

    const listRes = await request(app.getHttpServer())
      .get(`/stores/${storeId}/couriers`)
      .set('Cookie', sessionCookie)
      .expect(200);
    expect(listRes.body).toHaveLength(1);
    expect(listRes.body[0].name).toBe('Olva');

    // Re-sending the same payload is a no-op-equivalent (same resulting set).
    const third = await request(app.getHttpServer())
      .post(`/stores/${storeId}/couriers/bulk-save`)
      .set('Cookie', sessionCookie)
      .send({
        couriers: [
          {
            id: listRes.body[0].id,
            name: 'Olva',
            sortOrder: 0,
            modalities: [{ modality: 'AGENCY', price: 6 }],
          },
        ],
        deletedIds: [],
      })
      .expect(201);
    expect(third.body).toHaveLength(1);
    expect(third.body[0].modalities).toHaveLength(1);
  });

  it('requires a session and rejects a store the caller does not own', async () => {
    // No cookie -> AuthGuard 401/403.
    await request(app.getHttpServer())
      .get(`/stores/${storeId}/couriers`)
      .expect((res) => {
        if (res.status !== 401 && res.status !== 403) {
          throw new Error(`expected 401/403, got ${res.status}`);
        }
      });

    // Authenticated, but a store id that isn't this user's -> ownership guard.
    for (const send of [
      () =>
        request(app.getHttpServer())
          .get(`/stores/${foreignStoreId}/couriers`)
          .set('Cookie', sessionCookie),
      () =>
        request(app.getHttpServer())
          .post(`/stores/${foreignStoreId}/couriers`)
          .set('Cookie', sessionCookie)
          .send({
            name: 'X',
            modalities: [{ modality: 'AGENCY', price: 1 }],
          }),
      () =>
        request(app.getHttpServer())
          .post(`/stores/${foreignStoreId}/couriers/bulk-save`)
          .set('Cookie', sessionCookie)
          .send({ couriers: [], deletedIds: [] }),
    ]) {
      await send().expect((res) => {
        if (res.status !== 403 && res.status !== 404) {
          throw new Error(`expected 403/404, got ${res.status}`);
        }
      });
    }
  });
});
