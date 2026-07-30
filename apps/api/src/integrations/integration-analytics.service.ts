import { Injectable } from '@nestjs/common';
import { Prisma, type TenantContext } from '@vertex/db';
import { PrismaService } from '../prisma/prisma.service';
import { deliveryHealth, successRate, type HealthStatus } from './delivery-health';

const WINDOW_DAYS = 7;

export interface EndpointHealth {
  endpointId: string;
  url: string;
  status: HealthStatus;
  total: number;
  succeeded: number;
  failed: number;
  successRate: number;
  lastDeliveryAt: string | null;
  lastStatus: string | null;
}

/**
 * Integration analytics (sections 17 & 28), computed entirely from persisted
 * delivery, key and connection rows — no fabricated numbers. All queries are
 * tenant-isolated (orgId auto-injected; raw SQL passes it explicitly).
 */
@Injectable()
export class IntegrationAnalyticsService {
  constructor(private readonly prisma: PrismaService) {}

  private get db() {
    return this.prisma.client;
  }

  private windowStart(): Date {
    return new Date(Date.now() - WINDOW_DAYS * 86_400_000);
  }

  /** Workspace-wide integration health & throughput over the rolling window. */
  async overview(tenant: TenantContext) {
    const since = this.windowStart();
    const now = new Date();

    const [byStatus, byEvent, endpoints, activeKeys, connected] = await Promise.all([
      this.db.webhookDelivery.groupBy({
        by: ['status'],
        where: { createdAt: { gte: since } },
        _count: { _all: true },
      }),
      this.db.webhookDelivery.groupBy({
        by: ['event'],
        where: { createdAt: { gte: since } },
        _count: { _all: true },
      }),
      this.db.webhookEndpoint.count(),
      this.db.apiKey.count({
        where: { revokedAt: null, OR: [{ expiresAt: null }, { expiresAt: { gt: now } }] },
      }),
      this.db.integrationConnection.count({ where: { status: 'CONNECTED' } }),
    ]);

    const statusCount = (s: string) =>
      byStatus.find((r) => r.status === s)?._count._all ?? 0;
    const success = statusCount('SUCCESS');
    const failed = statusCount('FAILED');
    const pending = statusCount('PENDING');
    const total = success + failed + pending;

    // Deliveries per day for the window (raw SQL → explicit orgId).
    const perDay = await this.db.$queryRaw<
      Array<{ day: Date; total: number; success: number }>
    >(Prisma.sql`
      SELECT date_trunc('day', "createdAt") AS day,
             count(*)::int AS total,
             count(*) FILTER (WHERE status = 'SUCCESS')::int AS success
      FROM webhook_deliveries
      WHERE "orgId" = ${tenant.orgId} AND "createdAt" >= ${since}
      GROUP BY day
      ORDER BY day ASC
    `);

    return {
      windowDays: WINDOW_DAYS,
      deliveries: {
        total,
        success,
        failed,
        pending,
        successRate: successRate(success + failed, success),
        failureRate: successRate(success + failed, failed),
      },
      byEvent: byEvent
        .map((e) => ({ event: e.event, count: e._count._all }))
        .sort((a, b) => b.count - a.count),
      perDay: perDay.map((r) => ({
        day: r.day.toISOString().slice(0, 10),
        total: r.total,
        success: r.success,
      })),
      counts: {
        webhookEndpoints: endpoints,
        activeApiKeys: activeKeys,
        connectedIntegrations: connected,
      },
    };
  }

  /** Per-endpoint health (section 17). */
  async endpointHealth(_tenant: TenantContext): Promise<EndpointHealth[]> {
    const since = this.windowStart();
    const endpoints = await this.db.webhookEndpoint.findMany({
      select: { id: true, url: true },
    });
    if (endpoints.length === 0) return [];

    const [totals, successes] = await Promise.all([
      this.db.webhookDelivery.groupBy({
        by: ['endpointId'],
        where: { createdAt: { gte: since } },
        _count: { _all: true },
      }),
      this.db.webhookDelivery.groupBy({
        by: ['endpointId'],
        where: { createdAt: { gte: since }, status: 'SUCCESS' },
        _count: { _all: true },
      }),
    ]);
    const totalBy = new Map(totals.map((t) => [t.endpointId, t._count._all]));
    const succBy = new Map(successes.map((s) => [s.endpointId, s._count._all]));

    return Promise.all(
      endpoints.map(async (e) => {
        const total = totalBy.get(e.id) ?? 0;
        const succeeded = succBy.get(e.id) ?? 0;
        const latest = await this.db.webhookDelivery.findFirst({
          where: { endpointId: e.id },
          orderBy: { createdAt: 'desc' },
          select: { status: true, createdAt: true },
        });
        return {
          endpointId: e.id,
          url: e.url,
          status: deliveryHealth({
            total,
            succeeded,
            latestFailed: latest?.status === 'FAILED',
          }),
          total,
          succeeded,
          failed: total - succeeded,
          successRate: successRate(total, succeeded),
          lastDeliveryAt: latest?.createdAt.toISOString() ?? null,
          lastStatus: latest?.status ?? null,
        };
      }),
    );
  }
}
