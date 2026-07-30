import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  createActionSchema,
  updateActionSchema,
  reorderSchema,
  type CreateActionInput,
  type UpdateActionInput,
  type ReorderInput,
} from '@vertex/shared';
import type { TenantContext } from '@vertex/db';
import { ActionsService } from './actions.service';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { RequireTenantGuard } from '../auth/guards/require-tenant.guard';
import { Tenant } from '../auth/decorators/tenant.decorator';

@UseGuards(RequireTenantGuard)
@Controller('cards/:cardId/actions')
export class CardActionsController {
  constructor(private readonly actions: ActionsService) {}

  @Get()
  list(
    @Tenant() tenant: TenantContext,
    @Param('cardId') cardId: string,
    @Query('variantId') variantId?: string,
  ) {
    return this.actions.list(tenant, cardId, variantId);
  }

  @Post()
  create(
    @Tenant() tenant: TenantContext,
    @Param('cardId') cardId: string,
    @Body(new ZodValidationPipe(createActionSchema)) body: CreateActionInput,
    @Query('variantId') variantId?: string,
  ) {
    return this.actions.create(tenant, cardId, body, variantId);
  }

  @Patch('reorder')
  reorder(
    @Tenant() tenant: TenantContext,
    @Param('cardId') cardId: string,
    @Body(new ZodValidationPipe(reorderSchema)) body: ReorderInput,
  ) {
    return this.actions.reorder(tenant, cardId, body.ids);
  }

  @Patch(':actionId')
  update(
    @Tenant() tenant: TenantContext,
    @Param('cardId') cardId: string,
    @Param('actionId') actionId: string,
    @Body(new ZodValidationPipe(updateActionSchema)) body: UpdateActionInput,
  ) {
    return this.actions.update(tenant, cardId, actionId, body);
  }

  @Delete(':actionId')
  remove(
    @Tenant() tenant: TenantContext,
    @Param('cardId') cardId: string,
    @Param('actionId') actionId: string,
  ) {
    return this.actions.remove(tenant, cardId, actionId);
  }
}
