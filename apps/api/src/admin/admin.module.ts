import { Module } from '@nestjs/common';
import { AdminController } from './admin.controller';
import { AdminService } from './admin.service';
import { OrgPurgeService } from './org-purge.service';
import { BillingModule } from '../billing/billing.module';
import { UploadsModule } from '../uploads/uploads.module';

@Module({
  imports: [BillingModule, UploadsModule],
  controllers: [AdminController],
  providers: [AdminService, OrgPurgeService],
})
export class AdminModule {}
