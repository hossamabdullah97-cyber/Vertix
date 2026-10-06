import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { AdminEngagementController, EngagementController } from './engagement.controller';
import { EngagementService } from './engagement.service';

@Module({
  imports: [AuthModule],
  controllers: [EngagementController, AdminEngagementController],
  providers: [EngagementService],
})
export class EngagementModule {}
