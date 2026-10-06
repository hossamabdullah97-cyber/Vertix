import { Module } from '@nestjs/common';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { AdminUsageController } from './usage.controller';
import { UsageService } from './usage.service';
import { UsageTracker } from './usage-tracker';

@Module({
  controllers: [AdminUsageController],
  providers: [UsageService, { provide: APP_INTERCEPTOR, useClass: UsageTracker }],
})
export class UsageModule {}
