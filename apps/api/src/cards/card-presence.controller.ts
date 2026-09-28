import { Controller, Delete, Param, Put, UseGuards } from '@nestjs/common';
import type { TenantContext } from '@vertex/db';
import { CardPresenceService } from './card-presence.service';
import { RequireTenantGuard } from '../auth/guards/require-tenant.guard';
import { Tenant } from '../auth/decorators/tenant.decorator';

/**
 * People only: no API-key scope is declared, so keys cannot reach it. Anyone
 * in the workspace who can open a card in the Studio takes part.
 */
@UseGuards(RequireTenantGuard)
@Controller('cards/:id/presence')
export class CardPresenceController {
  constructor(private readonly presence: CardPresenceService) {}

  @Put()
  beat(@Tenant() tenant: TenantContext, @Param('id') id: string) {
    return this.presence.beat(tenant, id);
  }

  @Delete()
  leave(@Tenant() tenant: TenantContext, @Param('id') id: string) {
    return this.presence.leave(tenant, id);
  }
}
