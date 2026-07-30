import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import type { TenantContext } from '@vertex/db';
import { CardVariantsService, type VariantPatch } from './card-variants.service';
import { RequireTenantGuard } from '../auth/guards/require-tenant.guard';
import { Tenant } from '../auth/decorators/tenant.decorator';

/** Manage the profile variants of a card (owner/manager only). */
@UseGuards(RequireTenantGuard)
@Controller('cards')
export class CardVariantsController {
  constructor(private readonly variants: CardVariantsService) {}

  @Get(':cardId/variants')
  list(@Tenant() tenant: TenantContext, @Param('cardId') cardId: string) {
    return this.variants.list(tenant, cardId);
  }

  @Get(':cardId/variants/conflicts')
  getConflicts(@Tenant() tenant: TenantContext, @Param('cardId') cardId: string) {
    return this.variants.getConflicts(tenant, cardId);
  }

  @Post(':cardId/variants')
  create(
    @Tenant() tenant: TenantContext,
    @Param('cardId') cardId: string,
    @Body() body: { name: string; cloneDefault?: boolean },
  ) {
    return this.variants.create(tenant, cardId, body);
  }

  @Patch(':cardId/variants/:variantId')
  update(
    @Tenant() tenant: TenantContext,
    @Param('variantId') variantId: string,
    @Body() body: VariantPatch,
  ) {
    return this.variants.update(tenant, variantId, body);
  }

  @Delete(':cardId/variants/:variantId')
  remove(
    @Tenant() tenant: TenantContext,
    @Param('variantId') variantId: string,
  ) {
    return this.variants.remove(tenant, variantId);
  }
}
