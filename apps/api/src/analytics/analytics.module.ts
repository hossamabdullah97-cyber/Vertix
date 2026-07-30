import { Module } from '@nestjs/common';
import { AnalyticsService } from './analytics.service';
import { AnalyticsController } from './analytics.controller';
import { TrackingController } from './tracking.controller';
import { IntegrationsModule } from '../integrations/integrations.module';

@Module({
  imports: [IntegrationsModule],
  controllers: [AnalyticsController, TrackingController],
  providers: [AnalyticsService],
})
export class AnalyticsModule {}
