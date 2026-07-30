import { Module } from '@nestjs/common';
import { BillingModule } from '../billing/billing.module';
import { IntegrationsModule } from '../integrations/integrations.module';
import { OrganizationsController } from './organizations.controller';
import { OrganizationsService } from './organizations.service';
import { MembersController } from './members.controller';
import { MembersService } from './members.service';
import { TeamsController } from './teams.controller';
import { TeamsService } from './teams.service';
import { AuditService } from './audit.service';
import { AssetsController } from './assets.controller';
import { AssetsService } from './assets.service';
import { DepartmentsController } from './departments.controller';
import { DepartmentsService } from './departments.service';
import { ApprovalsController } from './approvals.controller';
import { ApprovalsService } from './approvals.service';

@Module({
  imports: [BillingModule, IntegrationsModule],
  controllers: [
    OrganizationsController,
    MembersController,
    TeamsController,
    AssetsController,
    DepartmentsController,
    ApprovalsController,
  ],
  providers: [
    OrganizationsService,
    MembersService,
    TeamsService,
    AuditService,
    AssetsService,
    DepartmentsService,
    ApprovalsService,
  ],
})
export class OrganizationsModule {}
