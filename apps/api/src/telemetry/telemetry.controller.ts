import { Body, Controller, Get, HttpCode, Param, Post, Query, Req, UseGuards } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { JwtService } from '@nestjs/jwt';
import type { Request } from 'express';
import { clientErrorSchema, type ClientErrorInput } from '@vertex/shared';
import { Public } from '../auth/decorators/public.decorator';
import { PlatformScope } from '../auth/decorators/platform-scope.decorator';
import { SuperAdminGuard } from '../auth/guards/super-admin.guard';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { ErrorsService } from './errors.service';

const jwt = new JwtService({});

/** Who is signed in, if the request says so with a valid session; the report counts without one. */
function userOf(req: Request): string | null {
  const header = req.headers.authorization;
  const secret = process.env.JWT_SECRET;
  if (!header?.startsWith('Bearer ') || !secret) return null;
  try {
    return jwt.verify<{ sub?: string }>(header.slice(7), { secret }).sub ?? null;
  } catch {
    return null;
  }
}

@Controller('telemetry')
export class TelemetryController {
  constructor(private readonly errors: ErrorsService) {}

  /** An error a page met, from any visitor's browser (signed in or not). */
  @Public()
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  @HttpCode(204)
  @Post('errors')
  async report(@Body(new ZodValidationPipe(clientErrorSchema)) body: ClientErrorInput, @Req() req: Request): Promise<void> {
    const ua = req.headers['user-agent'];
    await this.errors.fromBrowser(body, { userAgent: typeof ua === 'string' ? ua : null, userId: userOf(req) });
  }
}

/** The errors, for the people who run the platform. */
@PlatformScope()
@Controller('admin/errors')
@UseGuards(SuperAdminGuard)
export class AdminErrorsController {
  constructor(private readonly errors: ErrorsService) {}

  @Get()
  list(@Query('source') source?: string, @Query('status') status?: string) {
    return this.errors.list({ source, status });
  }

  @Post(':id/resolve')
  resolve(@Param('id') id: string) {
    return this.errors.setResolved(id, true);
  }

  @Post(':id/reopen')
  reopen(@Param('id') id: string) {
    return this.errors.setResolved(id, false);
  }
}
