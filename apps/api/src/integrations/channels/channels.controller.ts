import { BadRequestException, Body, Controller, Get, Param, Patch, Post, Put, UseGuards } from '@nestjs/common';
import { z } from 'zod';
import type { TenantContext } from '@vertex/db';
import { ZodValidationPipe } from '../../common/zod-validation.pipe';
import { RequireTenantGuard } from '../../auth/guards/require-tenant.guard';
import { Roles } from '../../auth/decorators/roles.decorator';
import { RequireScopes } from '../../access/scopes.decorator';
import { Tenant } from '../../auth/decorators/tenant.decorator';
import { ChannelsService, isChannelProvider, type ChannelProvider } from './channels.service';
import { Area } from '../../auth/decorators/area.decorator';

const lang = z.enum(['en', 'ar']);
const events = z.array(z.string().max(40)).max(20);

const chatsSchema = z.object({ botToken: z.string().min(1).max(200) });
const connectSchema = z.object({
  botToken: z.string().max(200).optional(),
  chatId: z.string().max(40).optional(),
  chatTitle: z.string().max(200).optional(),
  url: z.string().max(2000).optional(),
  lang: lang.default('en'),
  events: events.optional(),
});
const settingsSchema = z.object({ lang: lang.optional(), events: events.optional() });

function channel(provider: string): ChannelProvider {
  if (!isChannelProvider(provider)) throw new BadRequestException(`${provider} is not a chat or channel integration.`);
  return provider;
}

/**
 * Telegram and Teams (see ChannelsService). Disconnecting goes through the
 * shared POST /integrations/:provider/disconnect.
 */
@UseGuards(RequireTenantGuard)
@Area('integrations')
@Controller('integrations')
export class ChannelsController {
  constructor(private readonly channels: ChannelsService) {}

  /** Checks a bot token and lists the chats it can post to. */
  @RequireScopes('integration:write')
  @Roles('OWNER', 'ADMIN')
  @Post('telegram/chats')
  chats(@Body(new ZodValidationPipe(chatsSchema)) body: z.infer<typeof chatsSchema>) {
    return this.channels.telegramChats(body.botToken);
  }

  @RequireScopes('integration:read')
  @Roles('OWNER', 'ADMIN', 'MANAGER')
  @Get(':provider/channel')
  settings(@Param('provider') provider: string) {
    return this.channels.settings(channel(provider));
  }

  /** Connects (or reconnects) after a first message arrives there. */
  @RequireScopes('integration:write')
  @Roles('OWNER', 'ADMIN')
  @Put(':provider/channel')
  connect(@Tenant() tenant: TenantContext, @Param('provider') provider: string, @Body(new ZodValidationPipe(connectSchema)) body: z.infer<typeof connectSchema>) {
    return this.channels.connect(tenant, channel(provider), body);
  }

  @RequireScopes('integration:write')
  @Roles('OWNER', 'ADMIN')
  @Patch(':provider/channel')
  update(@Tenant() tenant: TenantContext, @Param('provider') provider: string, @Body(new ZodValidationPipe(settingsSchema)) body: z.infer<typeof settingsSchema>) {
    return this.channels.updateSettings(tenant, channel(provider), body);
  }

  @RequireScopes('integration:write')
  @Roles('OWNER', 'ADMIN')
  @Post(':provider/channel/test')
  test(@Param('provider') provider: string) {
    return this.channels.test(channel(provider));
  }
}
