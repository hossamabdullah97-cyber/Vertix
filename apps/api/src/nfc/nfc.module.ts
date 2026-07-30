import { Module } from '@nestjs/common';
import { BillingModule } from '../billing/billing.module';
import { IntegrationsModule } from '../integrations/integrations.module';
import { TagsService } from './tags.service';
import { TagsController } from './tags.controller';
import { GatewayService } from './gateway.service';
import { GatewayController } from './gateway.controller';

@Module({
  imports: [BillingModule, IntegrationsModule],
  controllers: [TagsController, GatewayController],
  providers: [TagsService, GatewayService],
  exports: [TagsService],
})
export class NfcModule {}
