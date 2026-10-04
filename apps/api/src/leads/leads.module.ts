import { Module } from '@nestjs/common';
import { LeadsService } from './leads.service';
import { LeadsController } from './leads.controller';
import { IntegrationsModule } from '../integrations/integrations.module';
import { AuthThrottleService } from '../auth/auth-throttle.service';
import { FollowUpService } from './follow-up.service';
import { LeadMergeService } from './lead-merge.service';

@Module({
  imports: [IntegrationsModule],
  controllers: [LeadsController],
  providers: [LeadsService, AuthThrottleService, FollowUpService, LeadMergeService],
})
export class LeadsModule {}
