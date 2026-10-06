import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { BillingModule } from '../billing/billing.module';
import { IntegrationsModule } from '../integrations/integrations.module';
import { SsoAuthController } from './sso-auth.controller';
import { SsoSettingsController } from './sso-settings.controller';
import { SsoService } from './sso.service';

@Module({
  imports: [AuthModule, BillingModule, IntegrationsModule],
  controllers: [SsoAuthController, SsoSettingsController],
  providers: [SsoService],
})
export class SsoModule {}
