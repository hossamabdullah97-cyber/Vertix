import { Module } from '@nestjs/common';
import { AnalyticsModule } from '../analytics/analytics.module';
import { AuthThrottleService } from '../auth/auth-throttle.service';
import { ReportsController } from './reports.controller';
import { WeeklyReportService } from './weekly-report.service';
import { OccasionReportService } from './occasion-report.service';

@Module({
  imports: [AnalyticsModule],
  controllers: [ReportsController],
  providers: [WeeklyReportService, OccasionReportService, AuthThrottleService],
})
export class ReportsModule {}
