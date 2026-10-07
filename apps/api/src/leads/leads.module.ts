import { Module } from '@nestjs/common';
import { LeadsService } from './leads.service';
import { LeadTimelineService } from './lead-timeline.service';
import { LeadFeedService } from './lead-feed.service';
import { LeadsController } from './leads.controller';
import { IntegrationsModule } from '../integrations/integrations.module';
import { AuthThrottleService } from '../auth/auth-throttle.service';
import { FollowUpService } from './follow-up.service';
import { LeadMergeService } from './lead-merge.service';
import { LeadImportService } from './lead-import.service';
import { LeadNotesService } from './lead-notes.service';
import { CustomFieldsService } from './custom-fields.service';
import { AuditService } from '../organizations/audit.service';

@Module({
  imports: [IntegrationsModule],
  controllers: [LeadsController],
  providers: [LeadsService, AuthThrottleService, FollowUpService, LeadMergeService, LeadImportService, LeadNotesService, LeadTimelineService, LeadFeedService, CustomFieldsService, AuditService],
})
export class LeadsModule {}
