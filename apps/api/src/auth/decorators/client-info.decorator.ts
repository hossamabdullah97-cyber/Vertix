import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import type { ClientInfo } from '../sessions.service';

/** The address (see TRUST_PROXY) and browser a request came from, for the device list. */
export const Client = createParamDecorator((_data: unknown, ctx: ExecutionContext): ClientInfo => {
  const req = ctx.switchToHttp().getRequest();
  const ua = req.headers?.['user-agent'];
  return { ip: req.ip ?? null, userAgent: typeof ua === 'string' ? ua : null };
});
