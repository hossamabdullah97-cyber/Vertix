import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { tenantStore, type TenantContext } from '@vertex/db';

/**
 * Wraps handler execution inside the tenant context (AsyncLocalStorage).
 * As a result every Prisma query runs within the organization context and
 * orgId is auto-injected.
 */
@Injectable()
export class TenantInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const tenant = context.switchToHttp().getRequest().tenant as
      | TenantContext
      | undefined;

    if (!tenant) return next.handle();

    return new Observable((subscriber) => {
      tenantStore.run(tenant, () => {
        next.handle().subscribe({
          next: (v) => subscriber.next(v),
          error: (e) => subscriber.error(e),
          complete: () => subscriber.complete(),
        });
      });
    });
  }
}
