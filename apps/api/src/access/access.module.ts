import { Module } from '@nestjs/common';
import { ApiCredentialsService } from './api-credentials.service';
import { ApiKeysService } from './api-keys.service';
import { PersonalTokensService } from './personal-tokens.service';
import { AuditService } from '../organizations/audit.service';
import { ApiKeysController } from './api-keys.controller';
import { PersonalTokensController } from './personal-tokens.controller';

/**
 * API keys and personal access tokens: the machine-credential layer. Exports
 * ApiCredentialsService so the global auth guard can authenticate key/token
 * bearers, and it is @Global so that guard (declared in AppModule) can inject it.
 */
@Module({
  controllers: [ApiKeysController, PersonalTokensController],
  providers: [ApiCredentialsService, ApiKeysService, PersonalTokensService, AuditService],
  exports: [ApiCredentialsService],
})
export class AccessModule {}
