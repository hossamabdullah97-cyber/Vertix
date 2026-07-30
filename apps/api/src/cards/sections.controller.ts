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
  createSectionSchema,
  updateSectionSchema,
  reorderSchema,
  type CreateSectionInput,
  type UpdateSectionInput,
  type ReorderInput,
} from '@vertex/shared';
import type { TenantContext } from '@vertex/db';
import { SectionsService } from './sections.service';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { RequireTenantGuard } from '../auth/guards/require-tenant.guard';
import { Tenant } from '../auth/decorators/tenant.decorator';

@UseGuards(RequireTenantGuard)
@Controller('cards/:cardId/sections')
export class CardSectionsController {
  constructor(private readonly sections: SectionsService) {}

  @Get()
  list(
    @Tenant() tenant: TenantContext,
    @Param('cardId') cardId: string,
    @Query('variantId') variantId?: string,
  ) {
    return this.sections.list(tenant, cardId, variantId);
  }

  @Post()
  create(
    @Tenant() tenant: TenantContext,
    @Param('cardId') cardId: string,
    @Body(new ZodValidationPipe(createSectionSchema)) body: CreateSectionInput,
    @Query('variantId') variantId?: string,
  ) {
    return this.sections.create(tenant, cardId, body, variantId);
  }

  // Must precede ':sectionId' so it is not captured as an id.
  @Patch('reorder')
  reorder(
    @Tenant() tenant: TenantContext,
    @Param('cardId') cardId: string,
    @Body(new ZodValidationPipe(reorderSchema)) body: ReorderInput,
  ) {
    return this.sections.reorder(tenant, cardId, body.ids);
  }

  @Patch(':sectionId')
  update(
    @Tenant() tenant: TenantContext,
    @Param('cardId') cardId: string,
    @Param('sectionId') sectionId: string,
    @Body(new ZodValidationPipe(updateSectionSchema)) body: UpdateSectionInput,
  ) {
    return this.sections.update(tenant, cardId, sectionId, body);
  }

  @Delete(':sectionId')
  remove(
    @Tenant() tenant: TenantContext,
    @Param('cardId') cardId: string,
    @Param('sectionId') sectionId: string,
  ) {
    return this.sections.remove(tenant, cardId, sectionId);
  }
}
