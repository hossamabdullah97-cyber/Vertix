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
  createPaymentLinkSchema,
  updatePaymentLinkSchema,
  reorderSchema,
  type CreatePaymentLinkInput,
  type UpdatePaymentLinkInput,
  type ReorderInput,
} from '@vertex/shared';
import type { TenantContext } from '@vertex/db';
import { PaymentLinksService } from './payment-links.service';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { RequireTenantGuard } from '../auth/guards/require-tenant.guard';
import { Tenant } from '../auth/decorators/tenant.decorator';

@UseGuards(RequireTenantGuard)
@Controller('cards/:cardId/payment-links')
export class PaymentLinksController {
  constructor(private readonly paymentLinks: PaymentLinksService) {}

  @Get()
  list(
    @Tenant() tenant: TenantContext,
    @Param('cardId') cardId: string,
    @Query('variantId') variantId?: string,
  ) {
    return this.paymentLinks.list(tenant, cardId, variantId);
  }

  @Post()
  create(
    @Tenant() tenant: TenantContext,
    @Param('cardId') cardId: string,
    @Body(new ZodValidationPipe(createPaymentLinkSchema)) body: CreatePaymentLinkInput,
    @Query('variantId') variantId?: string,
  ) {
    return this.paymentLinks.create(tenant, cardId, body, variantId);
  }

  @Patch('reorder')
  reorder(
    @Tenant() tenant: TenantContext,
    @Param('cardId') cardId: string,
    @Body(new ZodValidationPipe(reorderSchema)) body: ReorderInput,
  ) {
    return this.paymentLinks.reorder(tenant, cardId, body.ids);
  }

  @Patch(':linkId')
  update(
    @Tenant() tenant: TenantContext,
    @Param('cardId') cardId: string,
    @Param('linkId') linkId: string,
    @Body(new ZodValidationPipe(updatePaymentLinkSchema)) body: UpdatePaymentLinkInput,
  ) {
    return this.paymentLinks.update(tenant, cardId, linkId, body);
  }

  @Delete(':linkId')
  remove(
    @Tenant() tenant: TenantContext,
    @Param('cardId') cardId: string,
    @Param('linkId') linkId: string,
  ) {
    return this.paymentLinks.remove(tenant, cardId, linkId);
  }
}
