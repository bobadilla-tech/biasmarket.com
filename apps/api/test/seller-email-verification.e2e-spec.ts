import { createHmac, randomUUID } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';
import { Test, type TestingModule } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { PrismaService } from '../src/prisma/prisma.service.js';
import { AppModule } from './../src/app.module.js';
import { mailerDevDir, waitForNewMailerFile } from './schema-assert.js';

// Covers `autoSignInAfterVerification` (auth.config.ts): clicking the
// verification link both verifies the seller's email and signs them in, so
// onboarding is sign up → verify → in the app, with no second login. Also
// pins the failure modes the web verify-email page relies on: reused links
// redirect without a session, bad/expired links redirect with `?error=`.
describe('seller email verification auto sign-in (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let sellerUserId: string | undefined;
  let verifyPath: string;

  const runId = randomUUID();
  const sellerEmail = `sev-e2e-${runId}@example.com`;
  const password = 'correcthorsebatterystaple';
  const callbackURL = `${process.env.WEB_URL ?? 'http://localhost:3001'}/en/verify-email`;

  function sessionCookie(res: request.Response): string | undefined {
    const setCookie = res.headers['set-cookie'] as unknown as
      string[] | undefined;
    return setCookie
      ?.find((c) => c.includes('session_token=') && !c.includes('Max-Age=0'))
      ?.split(';')[0];
  }

  // Same shape better-auth's own createEmailVerificationToken signs (HS256
  // over the auth secret), just already past its `exp`.
  function expiredVerificationToken(email: string): string {
    const b64 = (value: object) =>
      Buffer.from(JSON.stringify(value)).toString('base64url');
    const now = Math.floor(Date.now() / 1000);
    const unsigned = `${b64({ alg: 'HS256' })}.${b64({
      email,
      iat: now - 7200,
      exp: now - 3600,
    })}`;
    const signature = createHmac('sha256', process.env.BETTER_AUTH_SECRET!)
      .update(unsigned)
      .digest('base64url');
    return `${unsigned}.${signature}`;
  }

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();
    prisma = moduleFixture.get(PrismaService);

    const existingMailerFiles = new Set(readdirSync(mailerDevDir));

    // Signup itself must not sign in — verification is still required.
    const signUpRes = await request(app.getHttpServer())
      .post('/api/auth/sign-up/email')
      .send({
        email: sellerEmail,
        password,
        name: 'Verification E2E Seller',
        callbackURL,
      })
      .expect(200);
    sellerUserId = signUpRes.body.user.id;
    expect(signUpRes.body.token).toBeNull();
    expect(sessionCookie(signUpRes)).toBeUndefined();

    // Use the exact link from the email, as the seller would click it.
    const html = readFileSync(
      await waitForNewMailerFile(existingMailerFiles, sellerEmail),
      'utf-8',
    );
    const href = html.match(/href="([^"]*verify-email\?token=[^"]+)"/)?.[1];
    if (!href) throw new Error('verification link not found in email');
    const url = new URL(href.replaceAll('&amp;', '&'));
    verifyPath = `${url.pathname}${url.search}`;
  });

  afterAll(async () => {
    if (sellerUserId) {
      await prisma.session.deleteMany({ where: { userId: sellerUserId } });
      await prisma.account.deleteMany({ where: { userId: sellerUserId } });
      await prisma.user.deleteMany({ where: { id: sellerUserId } });
    }
    await app.close();
  });

  it('verifies the email, signs the seller in, and redirects to web', async () => {
    const verifyRes = await request(app.getHttpServer())
      .get(verifyPath)
      .expect(302);
    expect(verifyRes.headers.location).toBe(callbackURL);

    const cookie = sessionCookie(verifyRes);
    expect(cookie).toBeDefined();

    const sessionRes = await request(app.getHttpServer())
      .get('/api/auth/get-session')
      .set('Cookie', cookie!)
      .expect(200);
    expect(sessionRes.body.user.email).toBe(sellerEmail);
    expect(sessionRes.body.user.emailVerified).toBe(true);

    // The session is a real seller session, not just a better-auth one.
    await request(app.getHttpServer())
      .get('/me/stores')
      .set('Cookie', cookie!)
      .expect(200);
  });

  it('does not sign in again when an already-used link is reopened', async () => {
    const reuseRes = await request(app.getHttpServer())
      .get(verifyPath)
      .expect(302);
    expect(reuseRes.headers.location).toBe(callbackURL);
    expect(sessionCookie(reuseRes)).toBeUndefined();
  });

  it('redirects an invalid link back to web with an error and no session', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/auth/verify-email')
      .query({ token: 'not-a-real-token', callbackURL })
      .expect(302);
    expect(res.headers.location).toBe(`${callbackURL}?error=INVALID_TOKEN`);
    expect(sessionCookie(res)).toBeUndefined();
  });

  it('redirects an expired link back to web with TOKEN_EXPIRED and no session', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/auth/verify-email')
      .query({ token: expiredVerificationToken(sellerEmail), callbackURL })
      .expect(302);
    expect(res.headers.location).toBe(`${callbackURL}?error=TOKEN_EXPIRED`);
    expect(sessionCookie(res)).toBeUndefined();
  });
});
