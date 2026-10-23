import {
  type ArgumentsHost,
  BadRequestException,
  Catch,
  type ExceptionFilter,
  HttpException,
  InternalServerErrorException,
  Logger,
} from '@nestjs/common';
import type { Response } from 'express';
import { Temporal } from '@js-temporal/polyfill';
import { extractMessage, stringifyError } from '@biasmarket/utils/errors';
import { captureException } from '../error-tracking.js';
import { InvalidOrderTransitionError } from '../../modules/orders/domain/order-status.vo.js';

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  catch(exception: unknown, host: ArgumentsHost) {
    const context = host.switchToHttp();

    const response = context.getResponse<Response>();
    const request = context.getRequest<Request>();
    // `@Header()` on the public-order routes does not run when a guard or
    // the body parser rejects the request. These two still have to be set
    // on 400/404/429 for a token URL.
    const path = request.url?.split('?')[0] ?? '';
    if (/\/public\/orders\//i.test(path)) {
      response.setHeader('Cache-Control', 'no-store');
      response.setHeader('Referrer-Policy', 'no-referrer');
    }

    if (exception instanceof InvalidOrderTransitionError) {
      const httpException = new BadRequestException(exception.message);

      return this.handleHttpExpression(httpException, response, request);
    }

    if (exception instanceof HttpException) {
      return this.handleHttpExpression(exception, response, request);
    }

    // Report to the error tracker (if configured) in addition to stdout —
    // don't remove the existing logging, add to it.
    captureException(exception);

    this.logger.error(
      `Unhandled exception on ${request.method} ${scrubRequestUrl(request.url)}`,
      stringifyError(exception),
    );

    const internalError = new InternalServerErrorException();

    return this.handleHttpExpression(internalError, response, request);
  }
  private handleHttpExpression(
    httpException: HttpException,
    response: Response,
    request: Request,
  ) {
    const status = httpException.getStatus();
    const exceptionResponse = httpException.getResponse();

    const message = extractMessage(exceptionResponse);
    const now = Temporal.Now.instant();

    return response.status(status).json({
      statusCode: status,
      message,
      path: scrubRequestUrl(request.url),
      timestamp: now.toString(),
    });
  }
}

// Private-link tokens live in `/public/orders/:token` and in query strings
// (account confirm, password reset). Neither belongs in stdout or an error body.
export function scrubRequestUrl(url: string): string {
  const path = url.split('?')[0] ?? url;
  return path.replace(/\/public\/orders\/[^/]+/gi, '/public/orders/:token');
}
