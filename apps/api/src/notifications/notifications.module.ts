import { Global, Module } from '@nestjs/common';
import { NotificationsController } from './notifications.controller';
import { NotificationsService } from './notifications.service';
import { LeadAlertsService } from './lead-alerts.service';
import { PushService } from './push.service';
import { AuthThrottleService } from '../auth/auth-throttle.service';

/** Global so any module can inject NotificationsService (and lead alerts) to publish events. */
@Global()
@Module({
  controllers: [NotificationsController],
  providers: [NotificationsService, LeadAlertsService, PushService, AuthThrottleService],
  exports: [NotificationsService, LeadAlertsService, PushService],
})
export class NotificationsModule {}
