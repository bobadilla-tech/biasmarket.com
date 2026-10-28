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
import {
  ClaimOrderError,
  CustomerAuthService,
} from './customer-auth.service.js';
import {
  CLAIM_TICKET_COOKIE,
  claimCookieOptions,
  verifyClaimTicket,
} from './claim-ticket.js';
import {
  CUSTOMER_SESSION_COOKIE,
  CUSTOMER_SESSION_TTL_MS,
} from './customer-session.constants.js';
import {
  buildBuyerGoogleAuthUrl,
  BUYER_GOOGLE_STATE_COOKIE,
  BUYER_GOOGLE_STATE_TTL_MS,
  createBuyerGoogleState,
  exchangeBuyerGoogleCode,
  isBuyerGoogleConfigured,
  normalizeBuyerGoogleLocale,
  verifyBuyerGoogleState,
} from './buyer-google-oauth.js';

type GoogleLoginError = 'unavailable' | 'ambiguous' | 'failed';

// Codes the web shows on `my-purchases?claim=<code>`; unknown ones fall back
// to a generic message there.
type ClaimError =
  'already_claimed' | 'not_claimable' | 'invalid' | 'failed' | 'unavailable';

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

  // Only ever built from a verified slug/locale pair — never from
  // caller-supplied URLs — so these can't become open redirects.
  private loginRedirect(
    res: Response,
    slug: string | null,
    locale: string,
    error: GoogleLoginError,
  ): void {
    const path = slug
      ? `store/${encodeURIComponent(slug)}/account/login`
      : 'my-purchases';
    res.redirect(`${webUrl()}/${locale}/${path}?google=${error}`);
  }

  private successRedirect(
    res: Response,
    slug: string | null,
    locale: string,
  ): void {
    const path = slug
      ? `store/${encodeURIComponent(slug)}/account`
      : 'my-purchases';
    res.redirect(`${webUrl()}/${locale}/${path}`);
  }

  private claimErrorRedirect(
    res: Response,
    locale: string,
    error: ClaimError,
  ): void {
    res.redirect(`${webUrl()}/${locale}/my-purchases?claim=${error}`);
  }

  private claimSuccessRedirect(
    res: Response,
    locale: string,
    orderId: string,
  ): void {
    res.redirect(
      `${webUrl()}/${locale}/my-purchases/orders/${encodeURIComponent(orderId)}?claimed=1`,
    );
  }

  private startFlow(
    res: Response,
    slug: string | null,
    localeParam: string | undefined,
    claim = false,
    cookieHeader?: string,
  ): void {
    const locale = normalizeBuyerGoogleLocale(localeParam);
    if (claim) {
      // Verify the ticket now so a missing or expired one fails here, not
      // after a round-trip to Google.
      if (!isBuyerGoogleConfigured()) {
        return this.claimErrorRedirect(res, locale, 'unavailable');
      }
      if (!verifyClaimTicket(parseCookie(cookieHeader, CLAIM_TICKET_COOKIE))) {
        return this.claimErrorRedirect(res, locale, 'invalid');
      }
    } else if (!isBuyerGoogleConfigured()) {
      return this.loginRedirect(res, slug, locale, 'unavailable');
    }

    const { state, nonce } = createBuyerGoogleState(
      slug,
      locale,
      Date.now(),
      claim,
    );
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
  @Get('stores/:slug/account/google')
  async startForStore(
    @Param('slug') slug: string,
    @Query('locale') localeParam: string | undefined,
    @Res() res: Response,
  ): Promise<void> {
    try {
      await this.customerAuth.assertStoreExists(slug);
    } catch (err) {
      if (err instanceof NotFoundException) {
        return res.redirect(
          `${webUrl()}/${normalizeBuyerGoogleLocale(localeParam)}`,
        );
      }
      throw err;
    }
    this.startFlow(res, slug, localeParam);
  }

  // Global entry point (My purchases) — signs the buyer in without choosing a
  // store; the store link is created later, at their first order there.
  @Public()
  @UseGuards(ThrottlerGuard)
  @Throttle({ default: { ttl: 60_000, limit: 10 } })
  @Get('account/google')
  startGlobal(
    @Query('locale') localeParam: string | undefined,
    @Query('claim') claim: string | undefined,
    @Headers('cookie') cookieHeader: string | undefined,
    @Res() res: Response,
  ): void {
    this.startFlow(res, null, localeParam, claim === '1', cookieHeader);
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
    const ticketCookie = parseCookie(cookieHeader, CLAIM_TICKET_COOKIE);
    // Both single-use cookies go first, before any early return, with the
    // same path/secure options they were set with.
    res.clearCookie(BUYER_GOOGLE_STATE_COOKIE, {
      path: '/api/account/google',
    });
    res.clearCookie(CLAIM_TICKET_COOKIE, claimCookieOptions());
    // Without a verified state there is no trustworthy store/locale to send
    // the buyer back to, so fall back to the home page.
    if (!verified) return res.redirect(webUrl());

    if (verified.claim) {
      return this.claimCallback(res, verified.locale, code, ticketCookie);
    }

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
      this.successRedirect(res, slug, locale);
    } catch (err) {
      if (err instanceof ConflictException) {
        return this.loginRedirect(res, slug, locale, 'ambiguous');
      }
      return this.loginRedirect(res, slug, locale, 'failed');
    }
  }

  private async claimCallback(
    res: Response,
    locale: string,
    code: string | undefined,
    ticketCookie: string | undefined,
  ): Promise<void> {
    // The claim needs the ticket AND the state flag; either alone is nothing.
    const ticket = verifyClaimTicket(ticketCookie);
    if (!ticket) return this.claimErrorRedirect(res, locale, 'invalid');
    if (!code) return this.claimErrorRedirect(res, locale, 'failed');

    try {
      const identity = await exchangeBuyerGoogleCode(code);
      if (!identity) return this.claimErrorRedirect(res, locale, 'failed');

      const { token, orderId } = await this.customerAuth.claimWithGoogle(
        identity,
        ticket,
      );
      // The Google identity wins over any buyer session already in this
      // browser: the cookie is replaced, not kept.
      res.cookie(CUSTOMER_SESSION_COOKIE, token, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        maxAge: CUSTOMER_SESSION_TTL_MS,
        path: '/',
      });
      this.claimSuccessRedirect(res, locale, orderId);
    } catch (err) {
      if (err instanceof ClaimOrderError) {
        return this.claimErrorRedirect(res, locale, err.code);
      }
      return this.claimErrorRedirect(res, locale, 'failed');
    }
  }
}
