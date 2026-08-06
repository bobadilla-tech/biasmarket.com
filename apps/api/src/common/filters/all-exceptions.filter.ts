import {
  type ArgumentsHost,
  BadRequestException,
  Catch,
  type ExceptionFilter,
  HttpException,
  HttpStatus,
} from "@nestjs/common";
import type { Response } from "express";
import { InvalidOrderTransitionError } from "../../modules/orders/domain/order-status.vo.js";

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost) {
    const response = host.switchToHttp().getResponse<Response>();

    if (exception instanceof HttpException) {
      response.status(exception.getStatus()).json(exception.getResponse());
      return;
    }

    if (exception instanceof InvalidOrderTransitionError) {
      const httpException = new BadRequestException(exception.message);
      response.status(httpException.getStatus()).json(
        httpException.getResponse(),
      );
      return;
    }

    console.error(exception);
    response.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
      statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
      message: "Internal server error",
    });
  }
}
