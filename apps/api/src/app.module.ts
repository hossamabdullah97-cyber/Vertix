import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_FILTER, APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { ThrottlerModule } from '@nestjs/throttler';
import { UserThrottlerGuard } from './common/user-throttler.guard';
import { validateEnv } from './config/env.validation';
import { PrismaModule } from './prisma/prisma.module';
import { AuthModule } from './auth/auth.module';
import { AccountModule } from './account/account.module';
import { GoalsModule } from './goals/goals.module';
import { HealthModule } from './health/health.module';
import { OrganizationsModule } from './organizations/organizations.module';
import { CardsModule } from './cards/cards.module';
import { NfcModule } from './nfc/nfc.module';
import { AnalyticsModule } from './analytics/analytics.module';
import { BillingModule } from './billing/billing.module';
import { MailModule } from './mail/mail.module';
import { LeadsModule } from './leads/leads.module';
import { TasksModule } from './tasks/tasks.module';
import { MessagesModule } from './messages/messages.module';
import { ReportsModule } from './reports/reports.module';
import { UploadsModule } from './uploads/uploads.module';
import { AdminModule } from './admin/admin.module';
import { NotificationsModule } from './notifications/notifications.module';
import { IntegrationsModule } from './integrations/integrations.module';
import { AccessModule } from './access/access.module';
import { JwtAuthGuard } from './auth/guards/jwt-auth.guard';
import { TenantGuard } from './auth/guards/tenant.guard';
import { RolesGuard } from './auth/guards/roles.guard';
import { ScopesGuard } from './access/scopes.guard';
import { TenantInterceptor } from './auth/interceptors/tenant.interceptor';
import { AllExceptionsFilter } from './common/all-exceptions.filter';
import { TelemetryModule } from './telemetry/telemetry.module';
import { SupportModule } from './support/support.module';
import { DocsModule } from './docs/docs.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      cache: true,
      envFilePath: ['../../.env', '.env'],
      validate: validateEnv,
    }),
    // A dashboard SPA fires many requests per page; 100/min was too strict.
    // 600/min per IP protects against abuse while allowing normal navigation.
    ThrottlerModule.forRoot([{ name: 'default', ttl: 60_000, limit: 600 }]),
    PrismaModule,
    MailModule,
    AuthModule,
    AccountModule,
    GoalsModule,
    HealthModule,
    OrganizationsModule,
    CardsModule,
    NfcModule,
    AnalyticsModule,
    BillingModule,
    LeadsModule,
    TasksModule,
    MessagesModule,
    ReportsModule,
    UploadsModule,
    AdminModule,
    IntegrationsModule,
    AccessModule,
    NotificationsModule,
    TelemetryModule,
    SupportModule,
    DocsModule,
  ],
  providers: [
    // Captures unhandled errors, reports 5xx to Sentry, returns clean JSON.
    { provide: APP_FILTER, useClass: AllExceptionsFilter },
    // Order matters: Throttler -> JWT (auth) -> Tenant (isolation) -> Roles (permissions).
    // Limits count per signed-in person, else per address.
    { provide: APP_GUARD, useClass: UserThrottlerGuard },
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: TenantGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
    // Enforces @RequireScopes for machine callers; no-ops for human sessions.
    { provide: APP_GUARD, useClass: ScopesGuard },
    // Activates AsyncLocalStorage around each request to auto-inject orgId.
    { provide: APP_INTERCEPTOR, useClass: TenantInterceptor },
  ],
})
export class AppModule {}
