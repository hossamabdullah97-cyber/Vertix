import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import webpush from 'web-push';
import { PrismaService } from '../prisma/prisma.service';
import type { NotifyInput } from './notifications.service';
import { workspaceLink } from '../common/workspace-link';

export type PushLang = 'en' | 'ar';

/** What the service worker shows (apps/web/public/sw.js). */
export interface PushPayload {
  title: string;
  body: string;
  /** The page a tap opens. */
  url: string;
  /** Same tag replaces, so a burst of the same kind does not stack up. */
  tag: string;
}

/**
 * The text of a notification on the lock screen, in the device's language.
 * The app writes notifications in English and translates them as it shows
 * them (components/notifications/model.ts); a push is shown by the phone
 * itself, so its words are chosen here. Kinds not listed keep the English
 * title and body.
 */
export function pushPayload(n: Pick<NotifyInput, 'type' | 'title' | 'body' | 'metadata' | 'orgId'>, lang: PushLang, id?: string): PushPayload {
  const p = describe(n, lang, id);
  // A tap opens the workspace the notification came from, whichever is open.
  return { ...p, url: workspaceLink(p.url, n.orgId) };
}

function describe(n: Pick<NotifyInput, 'type' | 'title' | 'body' | 'metadata'>, lang: PushLang, id?: string): PushPayload {
  const m = (n.metadata ?? {}) as Record<string, unknown>;
  const ar = lang === 'ar';
  const who = n.body ?? '';
  const s = (v: unknown) => (typeof v === 'string' ? v : '');

  switch (n.type) {
    case 'lead.captured': {
      const intent = s(m.intent);
      const title =
        intent === 'MEETING'
          ? ar ? 'طلب اجتماع جديد' : 'New meeting request'
          : intent === 'QUOTE'
            ? ar ? 'طلب عرض سعر جديد' : 'New quote request'
            : ar ? 'عميل جديد' : 'New lead';
      const leadId = s(m.leadId);
      return {
        title,
        body: who || (ar ? 'ترك أحدهم بياناته على بطاقتك.' : 'Someone left their details on your card.'),
        url: leadId ? `/leads?lead=${encodeURIComponent(leadId)}` : '/leads',
        tag: leadId ? `lead-${leadId}` : 'lead',
      };
    }
    case 'lead.follow_up': {
      const leadId = s(m.leadId);
      const name = s(m.name);
      const days = Math.max(1, Math.round((typeof m.waitingHours === 'number' ? m.waitingHours : 24) / 24));
      const waiting = ar
        ? days === 1 ? 'بلا رد منذ يوم' : days === 2 ? 'بلا رد منذ يومين' : `بلا رد منذ ${days} أيام`
        : days === 1 ? 'No reply for a day' : `No reply for ${days} days`;
      return {
        title: ar ? (name ? `${name} ينتظر ردك` : 'عميل ينتظر ردك') : name ? `${name} is waiting for a reply` : 'A lead is waiting for a reply',
        body: [s(m.company), waiting].filter(Boolean).join(' · '),
        url: leadId ? `/leads?lead=${encodeURIComponent(leadId)}` : '/leads',
        tag: leadId ? `follow-${leadId}` : 'follow-up',
      };
    }
    case 'push.test':
      return {
        title: ar ? 'الإشعارات تعمل' : 'Notifications are on',
        body: ar ? 'ستصلك هنا العملاء الجدد وطلبات الاجتماعات فور وصولها.' : "New leads and meeting requests will reach you here the moment they arrive.",
        url: '/notifications',
        tag: 'push-test',
      };
    case 'member.invited': {
      const org = s(m.orgName);
      return {
        title: ar ? (org ? `دعوة للانضمام إلى ${org}` : 'دعوة للانضمام إلى مساحة عمل') : org ? `You're invited to join ${org}` : "You're invited to a workspace",
        body: who,
        url: '/invitations',
        tag: `invite-${s(m.orgId)}`,
      };
    }
    case 'automation.failed':
      return { title: ar ? 'تعذّر تشغيل أتمتة' : 'An automation failed', body: who, url: '/integrations?tab=automations', tag: n.type };
    case 'webhook.failed':
      return { title: ar ? 'تعذّر إرسال webhook' : 'A webhook could not be delivered', body: who, url: '/integrations?tab=webhooks', tag: n.type };
    default:
      return {
        title: n.title,
        body: who,
        url: n.type.startsWith('member.') ? '/team' : '/notifications',
        tag: id ? `n-${id}` : n.type,
      };
  }
}

interface Keys {
  publicKey: string;
  privateKey: string;
  subject: string;
}

/**
 * Notifications on a device's lock screen (Web Push), for the people who
 * turn them on per device. Every in-app notification is also pushed, under
 * the same per-category preferences, so there is one switchboard.
 *
 * Off until VAPID_PUBLIC_KEY and VAPID_PRIVATE_KEY are set (generate them
 * once with `npx web-push generate-vapid-keys`, and keep them: a new pair
 * silently ends every existing subscription).
 */
@Injectable()
export class PushService {
  private readonly logger = new Logger(PushService.name);
  private readonly keys: Keys | null;

  constructor(
    private readonly prisma: PrismaService,
    config: ConfigService,
  ) {
    const publicKey = config.get<string>('VAPID_PUBLIC_KEY')?.trim();
    const privateKey = config.get<string>('VAPID_PRIVATE_KEY')?.trim();
    const subject =
      config.get<string>('VAPID_SUBJECT')?.trim() ||
      (config.get<string>('APP_PUBLIC_URL')?.startsWith('https://') ? config.get<string>('APP_PUBLIC_URL')! : 'mailto:support@example.com');
    this.keys = publicKey && privateKey ? { publicKey, privateKey, subject } : null;
  }

  private get db() {
    return this.prisma.client;
  }

  /** The key a browser subscribes with, or null when push is off on this server. */
  get publicKey(): string | null {
    return this.keys?.publicKey ?? null;
  }

  /** Records this device for the user (moving it over if it belonged to someone else). */
  async subscribe(userId: string, sub: { endpoint: string; keys: { p256dh: string; auth: string }; lang: PushLang }, userAgent?: string) {
    await this.db.pushSubscription.upsert({
      where: { endpoint: sub.endpoint },
      create: { userId, endpoint: sub.endpoint, p256dh: sub.keys.p256dh, auth: sub.keys.auth, lang: sub.lang, userAgent: userAgent?.slice(0, 300) },
      update: { userId, p256dh: sub.keys.p256dh, auth: sub.keys.auth, lang: sub.lang, userAgent: userAgent?.slice(0, 300) },
    });
    return { ok: true as const };
  }

  /** Forgets this device (only the user's own: an endpoint is not a secret worth trusting alone). */
  async unsubscribe(userId: string, endpoint: string) {
    await this.db.pushSubscription.deleteMany({ where: { userId, endpoint } });
    return { ok: true as const };
  }

  /** How many devices the user receives pushes on. */
  async deviceCount(userId: string): Promise<number> {
    return this.db.pushSubscription.count({ where: { userId } });
  }

  /**
   * Sends a notification to every device of the user. Never throws: a push is
   * a courtesy on top of the in-app notification. A device the push service
   * no longer knows (unsubscribed, app removed) is forgotten.
   */
  async send(userId: string, n: Pick<NotifyInput, 'type' | 'title' | 'body' | 'metadata' | 'priority'>, id?: string): Promise<number> {
    if (!this.keys) return 0;
    let subs: { id: string; endpoint: string; p256dh: string; auth: string; lang: string }[];
    try {
      subs = await this.db.pushSubscription.findMany({
        where: { userId },
        select: { id: true, endpoint: true, p256dh: true, auth: true, lang: true },
      });
    } catch (err) {
      this.logger.warn(`push lookup failed: ${(err as Error).message}`);
      return 0;
    }
    let sent = 0;
    await Promise.all(
      subs.map(async (sub) => {
        const payload = pushPayload(n, sub.lang === 'ar' ? 'ar' : 'en', id);
        try {
          await webpush.sendNotification({ endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } }, JSON.stringify(payload), {
            vapidDetails: this.keys!,
            // A lead an hour late is still worth knowing about; a day late is not.
            TTL: 60 * 60 * 6,
            urgency: n.priority === 'HIGH' || n.priority === 'CRITICAL' ? 'high' : 'normal',
            topic: payload.tag.replace(/[^A-Za-z0-9_-]/g, '').slice(0, 32) || undefined,
          });
          sent++;
          await this.db.pushSubscription.update({ where: { id: sub.id }, data: { lastUsedAt: new Date() } }).catch(() => undefined);
        } catch (err) {
          const status = (err as { statusCode?: number }).statusCode;
          if (status === 404 || status === 410) {
            await this.db.pushSubscription.delete({ where: { id: sub.id } }).catch(() => undefined);
          } else {
            this.logger.warn(`push to ${new URL(sub.endpoint).host} failed: ${status ?? ''} ${(err as Error).message}`);
          }
        }
      }),
    );
    return sent;
  }
}
