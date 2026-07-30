import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import type { JwtPayload } from '@vertex/shared';

/** Extracts the current user (JWT payload) from the request. */
export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): JwtPayload => {
    const request = ctx.switchToHttp().getRequest();
    return request.user as JwtPayload;
  },
);
