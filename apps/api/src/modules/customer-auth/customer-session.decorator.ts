import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import type { CustomerSessionRequest } from './customer-session.guard.js';

export const CustomerSession = createParamDecorator(
  (_: unknown, ctx: ExecutionContext) => ctx.switchToHttp().getRequest<CustomerSessionRequest>().customerSession,
);
