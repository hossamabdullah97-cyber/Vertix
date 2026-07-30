import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
} from '@nestjs/common';
import { z } from 'zod';
import type { JwtPayload } from '@vertex/shared';
import { PersonalTokensService } from './personal-tokens.service';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { CurrentUser } from '../auth/decorators/current-user.decorator';

const createSchema = z.object({
  name: z.string().min(1).max(120),
  scopes: z.array(z.string()).min(1),
  expiresAt: z.string().datetime().nullable().optional(),
});

/**
 * Personal access tokens for the signed-in user. Not organization-scoped — a
 * user manages their own tokens across every workspace they belong to.
 */
@Controller('personal-tokens')
export class PersonalTokensController {
  constructor(private readonly tokens: PersonalTokensService) {}

  @Get()
  list(@CurrentUser() user: JwtPayload) {
    return this.tokens.list(user.sub);
  }

  @Post()
  create(
    @CurrentUser() user: JwtPayload,
    @Body(new ZodValidationPipe(createSchema)) body: z.infer<typeof createSchema>,
  ) {
    return this.tokens.create(user.sub, body);
  }

  @Post(':id/revoke')
  revoke(@CurrentUser() user: JwtPayload, @Param('id') id: string) {
    return this.tokens.revoke(user.sub, id);
  }

  @Delete(':id')
  remove(@CurrentUser() user: JwtPayload, @Param('id') id: string) {
    return this.tokens.remove(user.sub, id);
  }
}
