import { Module } from '@nestjs/common';
import { CredentialVault } from './credential-vault.service';
import { WebhookService } from './webhook.service';
import { WebhookDispatcher } from './webhook-dispatcher.service';
import { AutomationService } from './automation.service';
import { WebhooksController } from './webhooks.controller';
import { IntegrationsController } from './integrations.controller';
import { AutomationsController } from './automations.controller';
import { IntegrationsService } from './integrations.service';
import { IntegrationAnalyticsService } from './integration-analytics.service';
import { OAuthService } from './oauth.service';
import { OAuthAppsService } from './oauth-apps.service';
import { CrmSyncService } from './crm/crm-sync.service';
import { AuditService } from '../organizations/audit.service';

/**
 * The Enterprise Integration Hub. Exports WebhookService so other modules can
 * emit domain events (lead.created, nfc.tapped, …) without depending on the
 * delivery mechanics; those events also drive the automation engine.
 * NotificationsService (used by the automation engine) is available globally.
 */
@Module({
  controllers: [WebhooksController, IntegrationsController, AutomationsController],
  providers: [
    CredentialVault,
    WebhookService,
    WebhookDispatcher,
    AutomationService,
    IntegrationsService,
    IntegrationAnalyticsService,
    OAuthService,
    OAuthAppsService,
    CrmSyncService,
    AuditService,
  ],
  exports: [WebhookService, CredentialVault, OAuthService],
})
export class IntegrationsModule {}
