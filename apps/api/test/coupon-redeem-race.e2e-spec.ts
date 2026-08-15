import { Test, type TestingModule } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import { PrismaService } from '../src/prisma/prisma.service.js';
import request from 'supertest';
import { readdirSync, readFileSync } from 'node:fs';
import { AppModule } from './../src/app.module.js';
import { mailerDevDir, waitForNewMailerFile } from './schema-assert.js';

// Regression coverage for H2/M1 (docs/plans/2026-08-15-premium-coupon-system-audit.md):
// redeemCoupon's maxUses/duplicate check ran inside a $transaction, but under
// Postgres' default READ COMMITTED isolation that alone doesn't serialize two
// concurrent transactions — two different users could both count() before
// either committed its create, both see count < maxUses, and both succeed,
// letting a maxUses=1 coupon be redeemed twice. The fix row-locks the coupon
// (`SELECT ... FOR UPDATE`) before the count, so the second transaction
// blocks until the first commits and its re-read reflects reality.
describe('coupon redemption race (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let couponId: string | undefined;
  let userAId: string | undefined;
  let userBId: string | undefined;
  let cookieA: string;
  let cookieB: string;

  const runId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const couponCode = `RACE${runId.slice(-4).toUpperCase()}`;
  const password = 'correcthorsebatterystaple';

  async function signUpAndSignIn(email: string): Promise<{
    userId: string;
    cookie: string;
  }> {
    const existingMailerFiles = new Set(readdirSync(mailerDevDir));

    const signUpRes = await request(app.getHttpServer())
      .post('/api/auth/sign-up/email')
      .send({ email, password, name: 'E2E Coupon User' })
      .expect(200);
    const userId = signUpRes.body.user.id as string;

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

    return { userId, cookie: raw.split(';')[0]! };
  }

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();
    prisma = moduleFixture.get(PrismaService);

    const userA = await signUpAndSignIn(`coupon-race-a-${runId}@example.com`);
    userAId = userA.userId;
    cookieA = userA.cookie;
    const userB = await signUpAndSignIn(`coupon-race-b-${runId}@example.com`);
    userBId = userB.userId;
    cookieB = userB.cookie;

    // Seed the coupon directly — coupon creation itself isn't what's under
    // test here, only concurrent redemption of an existing maxUses=1 code.
    const coupon = await prisma.coupon.create({
      data: {
        code: couponCode,
        name: 'Race test coupon',
        maxUses: 1,
        durationDays: 30,
        isActive: true,
      },
    });
    couponId = coupon.id;
  });

  afterAll(async () => {
    if (couponId) {
      await prisma.couponRedemption.deleteMany({ where: { couponId } });
      await prisma.coupon.deleteMany({ where: { id: couponId } });
    }
    if (userAId) await prisma.user.deleteMany({ where: { id: userAId } });
    if (userBId) await prisma.user.deleteMany({ where: { id: userBId } });
    await app.close();
  });

  it('two different users redeeming the same maxUses=1 coupon concurrently: exactly one succeeds', async () => {
    const server = app.getHttpServer();

    const redeem = (cookie: string) =>
      request(server)
        .post('/coupons/redeem')
        .set('Cookie', cookie)
        .send({ code: couponCode });

    const [resA, resB] = await Promise.all([redeem(cookieA), redeem(cookieB)]);

    const statuses = [resA.status, resB.status].sort();
    expect(statuses).toEqual([201, 400]);

    const failed = resA.status === 400 ? resA : resB;
    expect(failed.body.message).toBe('Coupon has reached its maximum uses');

    // Exactly one redemption row must exist — the row lock prevents the
    // maxUses=1 coupon from being over-redeemed.
    const redemptions = await prisma.couponRedemption.findMany({
      where: { couponId },
    });
    expect(redemptions).toHaveLength(1);
  });
});
