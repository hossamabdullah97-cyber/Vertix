import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
  Optional,
} from '@nestjs/common';
import * as Sentry from '@sentry/node';
import type { Request, Response } from 'express';
import { ErrorsService } from '../telemetry/errors.service';

/**
 * Global exception filter: returns clean JSON and reports 5xx errors to Sentry
 * (a no-op when SENTRY_DSN is not configured) and to the admin console's
 * error list, grouped by route and cause.
 */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger('Exception');

  constructor(@Optional() private readonly errors?: ErrorsService) {}

  catch(exception: unknown, host: ArgumentsHost) {
    const res = host.switchToHttp().getResponse<Response>();
    const req = host.switchToHttp().getRequest<Request & { user?: { sub?: string } }>();
    const status =
      exception instanceof HttpException
        ? exception.getStatus()
        : HttpStatus.INTERNAL_SERVER_ERROR;

    if (status >= 500) {
      Sentry.captureException(exception);
      this.logger.error(
        exception instanceof Error ? exception.stack : String(exception),
      );
      // The route as declared (/api/leads/:id), so every lead's failure is one error.
      const route = req?.route?.path ? `${req.method} ${req.baseUrl ?? ''}${req.route.path}` : req ? `${req.method} ${req.path}` : null;
      const userId = req?.user?.sub && !req.user.sub.startsWith('apikey:') ? req.user.sub : null;
      void this.errors?.fromServer(exception, route, userId);
    }

    const payload =
      exception instanceof HttpException
        ? exception.getResponse()
        : { statusCode: status, message: 'Internal server error' };

    res
      .status(status)
      .json(
        typeof payload === 'string'
          ? { statusCode: status, message: payload }
          : payload,
      );
  }
}
