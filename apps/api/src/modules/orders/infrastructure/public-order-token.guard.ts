import {
  type CanActivate,
  type ExecutionContext,
  Injectable,
  UnsupportedMediaTypeException,
} from '@nestjs/common';
import type { Request } from 'express';
import { OrderEventsService } from '../application/order-events.service.js';
import { PUBLIC_ORDER_KEY } from './public-order.decorator.js';

/**
 * Resolves `:token` before the multipart parser runs, so an unknown or
 * revoked token gets the same 404 as `GET /public/orders/:token` even with a
 * bad or huge body. Must be listed after `ThrottlerGuard`. The loaded order
 * is for pre-checks only: `BuyerPaymentProofService` recomputes inside its
 * lock. Never attach it to Sentry context.
 */
@Injectable()
export class PublicOrderTokenGuard implements CanActivate {
  constructor(private events: OrderEventsService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Request>();
    const order = await this.events.loadForProof(
      String(request.params.token ?? ''),
    );
    (request as unknown as Record<symbol, unknown>)[PUBLIC_ORDER_KEY] = order;

    // Only POST has a body. After the 404 so unknown tokens never see a
    // different answer; the image GET must not be rejected.
    if (request.method === 'POST') {
      const contentType = request.headers['content-type'];
      if (!contentType?.toLowerCase().startsWith('multipart/form-data')) {
        throw new UnsupportedMediaTypeException();
      }
    }
    return true;
  }
}
