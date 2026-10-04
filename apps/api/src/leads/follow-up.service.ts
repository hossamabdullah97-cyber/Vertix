import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { LIVE_ORG } from '../common/live-org';

const HOUR = 3_600_000;
/** The first reminder, this long after a lead arrives with nobody reaching out. */
export const FIRST_REMINDER_AFTER = 24 * HOUR;
/** The second and last, this long after the first. */
export const SECOND_REMINDER_AFTER = 48 * HOUR;
/** Leads older than this are not chased: a reminder about a cold lead is noise. */
const OLDEST = 14 * 24 * HOUR;
/** Reminders go out between these hours, in DEFAULT_TIMEZONE. */
const DAY_STARTS = 9;
const DAY_ENDS = 21;
const SWEEP_MS = 15 * 60_000;

/** The hour of the day at `now` in `zone` (0–23). */
export function hourIn(zone: string, now: Date): number {
  const h = new Intl.DateTimeFormat('en-GB', { hour: '2-digit', hourCycle: 'h23', timeZone: zone }).format(now);
  return Number(h) % 24;
}

/**
 * Reminds whoever owns a lead when nobody has reached out to it: once a day
 * after it arrived, and once more two days later, then never again. A lead
 * counts as reached once someone calls, sends a WhatsApp message or an
 * email, or logs a meeting (LeadsService.contact / addActivity), or it is
 * moved to a won stage. The reminder is a notification, so it also reaches
 * the person's phone (PushService). Sent in the daytime only.
 */
@Injectable()
export class FollowUpService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(FollowUpService.name);
  private timer?: NodeJS.Timeout;

  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
    private readonly config: ConfigService,
  ) {}

  private get db() {
    return this.prisma.client;
  }

  onModuleInit() {
    if (process.env.NODE_ENV === 'test') return;
    this.timer = setInterval(() => void this.sweep().catch((e) => this.logger.warn(`follow-up sweep failed: ${(e as Error).message}`)), SWEEP_MS);
    this.timer.unref?.();
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }

  /** Sends the reminders that are due. Returns how many went out. */
  async sweep(now = new Date()): Promise<number> {
    const zone = this.config.get<string>('DEFAULT_TIMEZONE') || 'Africa/Cairo';
    const hour = hourIn(zone, now);
    if (hour < DAY_STARTS || hour >= DAY_ENDS) return 0;

    const due = await this.db.lead.findMany({
      where: {
        ...LIVE_ORG,
        firstContactedAt: null,
        createdAt: { gte: new Date(now.getTime() - OLDEST) },
        OR: [{ stageId: null }, { stage: { isWon: false } }],
        AND: [
          {
            OR: [
              { followUpReminders: 0, createdAt: { lte: new Date(now.getTime() - FIRST_REMINDER_AFTER) } },
              { followUpReminders: 1, followUpRemindedAt: { lte: new Date(now.getTime() - SECOND_REMINDER_AFTER) } },
            ],
          },
        ],
      },
      select: {
        id: true,
        orgId: true,
        name: true,
        company: true,
        createdAt: true,
        assignedTo: true,
        followUpReminders: true,
        card: { select: { ownerId: true } },
      },
      take: 500,
    });

    let sent = 0;
    for (const lead of due) {
      const userId = lead.assignedTo ?? lead.card?.ownerId;
      if (!userId) continue;
      // Claimed by count, so two servers sweeping at once remind only once.
      const claimed = await this.db.lead.updateMany({
        where: { id: lead.id, followUpReminders: lead.followUpReminders, firstContactedAt: null },
        data: { followUpReminders: lead.followUpReminders + 1, followUpRemindedAt: now },
      });
      if (!claimed.count) continue;
      const waitingHours = Math.round((now.getTime() - lead.createdAt.getTime()) / HOUR);
      await this.notifications.notify({
        userId,
        orgId: lead.orgId,
        type: 'lead.follow_up',
        category: 'CRM',
        priority: 'HIGH',
        title: `${lead.name || 'A lead'} is waiting for a reply`,
        body: lead.company || undefined,
        metadata: { leadId: lead.id, name: lead.name, company: lead.company, waitingHours, reminder: lead.followUpReminders + 1 },
      });
      sent++;
    }
    if (sent) this.logger.log(`Sent ${sent} follow-up reminder${sent === 1 ? '' : 's'}`);
    return sent;
  }
}
