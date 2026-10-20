import {
  ConflictException,
  Controller,
  Get,
  Headers,
  NotFoundException,
  Param,
  Query,
  Res,
  UseGuards,
} from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';
import { Public } from '@thallesp/nestjs-better-auth';
import { Throttle, ThrottlerGuard } from '@nestjs/throttler';
import type { Response } from 'express';
import { CustomerAuthService } from './customer-auth.service.js';
import {
  CUSTOMER_SESSION_COOKIE,
  CUSTOMER_SESSION_TTL_MS,
} from './customer-session.constants.js';
import {
  BUYER_GOOGLE_STATE_COOKIE,
  BUYER_GOOGLE_STATE_TTL_MS,
  buildBuyerGoogleAuthUrl,
  createBuyerGoogleState,
  exchangeBuyerGoogleCode,
  isBuyerGoogleConfigured,
  normalizeBuyerGoogleLocale,
  verifyBuyerGoogleState,
} from './buyer-google-oauth.js';

type GoogleLoginError = 'unavailable' | 'no_account' | 'ambiguous' | 'failed';

function webUrl(): string {
  return process.env.WEB_URL ?? 'http://localhost:3001';
}

function parseCookie(header: string | undefined, name: string) {
  for (const part of (header ?? '').split(';')) {
    const separator = part.indexOf('=');
    if (separator !== -1 && part.slice(0, separator).trim() === name) {
      return part.slice(separator + 1).trim();
    }
  }
  return undefined;
}

// Browser-navigated redirects, not JSON endpoints — kept out of the OpenAPI
// spec (and so out of the generated client) on purpose.
@ApiExcludeController()
@Controller()
export class BuyerGoogleController {
  constructor(private customerAuth: CustomerAuthService) {}

  private loginRedirect(
    res: Response,
    slug: string,
    locale: string,
    error: GoogleLoginError,
  ): void {
    // Only ever built from a verified slug/locale pair — never from
    // caller-supplied URLs — so this can't become an open redirect.
    res.redirect(
      `${webUrl()}/${locale}/store/${encodeURIComponent(slug)}/account/login?google=${error}`,
    );
  }

  @Public()
  @UseGuards(ThrottlerGuard)
  @Throttle({ default: { ttl: 60_000, limit: 10 } })
  @Get('stores/:slug/account/google')
  async start(
    @Param('slug') slug: string,
    @Query('locale') localeParam: string | undefined,
    @Res() res: Response,
  ): Promise<void> {
    const locale = normalizeBuyerGoogleLocale(localeParam);
    if (!isBuyerGoogleConfigured()) {
      return this.loginRedirect(res, slug, locale, 'unavailable');
    }

    try {
      await this.customerAuth.assertStoreExists(slug);
    } catch (err) {
      if (err instanceof NotFoundException) {
        return res.redirect(`${webUrl()}/${locale}`);
      }
      throw err;
    }

    const { state, nonce } = createBuyerGoogleState(slug, locale);
    res.cookie(BUYER_GOOGLE_STATE_COOKIE, nonce, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: BUYER_GOOGLE_STATE_TTL_MS,
      path: '/api/account/google',
    });
    res.redirect(buildBuyerGoogleAuthUrl(state));
  }

  @Public()
  @UseGuards(ThrottlerGuard)
  @Throttle({ default: { ttl: 60_000, limit: 10 } })
  @Get('account/google/callback')
  async callback(
    @Query('code') code: string | undefined,
    @Query('state') state: string | undefined,
    @Headers('cookie') cookieHeader: string | undefined,
    @Res() res: Response,
  ): Promise<void> {
    const verified = verifyBuyerGoogleState(
      state,
      parseCookie(cookieHeader, BUYER_GOOGLE_STATE_COOKIE),
    );
    res.clearCookie(BUYER_GOOGLE_STATE_COOKIE, {
      path: '/api/account/google',
    });
    // Without a verified state there is no trustworthy store/locale to send
    // the buyer back to, so fall back to the home page.
    if (!verified) return res.redirect(webUrl());

    const { slug, locale } = verified;
    if (!code) return this.loginRedirect(res, slug, locale, 'failed');

    try {
      const identity = await exchangeBuyerGoogleCode(code);
      if (!identity) return this.loginRedirect(res, slug, locale, 'failed');

      const token = await this.customerAuth.loginWithGoogle(slug, identity);
      res.cookie(CUSTOMER_SESSION_COOKIE, token, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        maxAge: CUSTOMER_SESSION_TTL_MS,
        path: '/',
      });
      res.redirect(
        `${webUrl()}/${locale}/store/${encodeURIComponent(slug)}/account`,
      );
    } catch (err) {
      if (err instanceof NotFoundException) {
        return this.loginRedirect(res, slug, locale, 'no_account');
      }
      if (err instanceof ConflictException) {
        return this.loginRedirect(res, slug, locale, 'ambiguous');
      }
      return this.loginRedirect(res, slug, locale, 'failed');
    }
  }
}
