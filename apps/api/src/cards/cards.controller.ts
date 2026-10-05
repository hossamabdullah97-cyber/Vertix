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
import {
  createCardSchema,
  moveCardSchema,
  updateCardSchema,
  type CreateCardInput,
  type MoveCardInput,
  type UpdateCardInput,
} from '@vertex/shared';
import type { TenantContext } from '@vertex/db';
import { CardsService } from './cards.service';
import { CardMoveService } from './card-move.service';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { RequireTenantGuard } from '../auth/guards/require-tenant.guard';
import { Tenant } from '../auth/decorators/tenant.decorator';
import { RequireScopes } from '../access/scopes.decorator';

@UseGuards(RequireTenantGuard)
@Controller('cards')
export class CardsController {
  constructor(
    private readonly cards: CardsService,
    private readonly moves: CardMoveService,
  ) {}

  /** Where this card may move, and what would go with it. People only: no key scope reaches it. */
  @Get(':id/move')
  moveTargets(@Tenant() tenant: TenantContext, @Param('id') id: string) {
    return this.moves.targets(tenant, id);
  }

  /** Moves the card, its leads and its history to another workspace (see CardMoveService). */
  @Post(':id/move')
  move(
    @Tenant() tenant: TenantContext,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(moveCardSchema)) body: MoveCardInput,
  ) {
    return this.moves.move(tenant, id, body.orgId);
  }

  @RequireScopes('cards:write')
  @Post()
  create(
    @Tenant() tenant: TenantContext,
    @Body(new ZodValidationPipe(createCardSchema)) body: CreateCardInput,
  ) {
    return this.cards.create(tenant, body);
  }

  @RequireScopes('cards:read')
  @Get()
  list(@Tenant() tenant: TenantContext) {
    return this.cards.list(tenant);
  }

  @Get(':id')
  findOne(@Tenant() tenant: TenantContext, @Param('id') id: string) {
    return this.cards.findOne(tenant, id);
  }

  @Patch(':id')
  update(
    @Tenant() tenant: TenantContext,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(updateCardSchema)) body: UpdateCardInput,
  ) {
    return this.cards.update(tenant, id, body);
  }

  @Delete(':id')
  remove(@Tenant() tenant: TenantContext, @Param('id') id: string) {
    return this.cards.remove(tenant, id);
  }

  @Post(':id/restore')
  restore(@Tenant() tenant: TenantContext, @Param('id') id: string) {
    return this.cards.restore(tenant, id);
  }
}
