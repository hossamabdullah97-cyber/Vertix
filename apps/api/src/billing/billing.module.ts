import { Module } from '@nestjs/common';
import { BillingService } from './billing.service';
import { LimitsService } from './limits.service';
import { BillingController } from './billing.controller';

@Module({
  controllers: [BillingController],
  providers: [BillingService, LimitsService],
  exports: [LimitsService],
})
export class BillingModule {}
