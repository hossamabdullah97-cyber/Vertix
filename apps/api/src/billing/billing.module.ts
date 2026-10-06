import { Module } from '@nestjs/common';
import { BillingService } from './billing.service';
import { LimitsService } from './limits.service';
import { BillingController } from './billing.controller';
import { InvoicesService } from './invoices.service';

@Module({
  controllers: [BillingController],
  providers: [BillingService, LimitsService, InvoicesService],
  exports: [LimitsService, BillingService],
})
export class BillingModule {}
