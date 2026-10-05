import { BadRequestException, Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { LeadAlertSettingsInput } from '@vertex/shared';
import { PrismaService } from '../prisma/prisma.service';
import { MailService } from '../mail/mail.service';
import { AuthThrottleService, tooManyAttempts } from '../auth/auth-throttle.service';
import { alertEmail, alertWhatsApp, normalizePhone, type AlertLang, type LeadAlert } from './lead-alert';
import { WhatsAppClient } from './whatsapp.client';
import { workspaceLink } from '../common/workspace-link';

const DEFAULTS = { email: true, whatsapp: false, phone: null as string | null, lang: 'en' as AlertLang };

/** Test messages one person may send an hour: enough to fix a typo, not to spam a number. */
export const TEST_LIMIT = 5;
const TEST_WINDOW_MS = 60 * 60_000;

/**
 * Tells a card owner about a new lead by email and on WhatsApp, as they
 * chose. WhatsApp is off until the server has its Cloud API settings
 * (WHATSAPP_TOKEN, WHATSAPP_PHONE_NUMBER_ID and an approved template).
 */
@Injectable()
export class LeadAlertsService {
  private readonly logger = new Logger(LeadAlertsService.name);
  private readonly wa: WhatsAppClient | null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly mail: MailService,
    private readonly config: ConfigService,
    private readonly throttle: AuthThrottleService,
  ) {
    const token = config.get<string>('WHATSAPP_TOKEN');
    const phoneNumberId = config.get<string>('WHATSAPP_PHONE_NUMBER_ID');
    this.wa =
      token && phoneNumberId
        ? new WhatsAppClient({
            token,
            phoneNumberId,
            template: config.get<string>('WHATSAPP_LEAD_TEMPLATE') || 'new_lead',
            apiVersion: config.get<string>('WHATSAPP_API_VERSION') || 'v21.0',
          })
        : null;
  }

  private get db() {
    return this.prisma.client;
  }

  get whatsappReady(): boolean {
    return !!this.wa;
  }

  async settings(userId: string) {
    const row = await this.db.leadAlertSettings.findUnique({ where: { userId } });
    const user = await this.db.user.findUnique({ where: { id: userId }, select: { email: true } });
    return {
      email: row?.email ?? DEFAULTS.email,
      whatsapp: row?.whatsapp ?? DEFAULTS.whatsapp,
      phone: row?.phone ?? DEFAULTS.phone,
      lang: ((row?.lang as AlertLang) ?? DEFAULTS.lang) as AlertLang,
      /** The weekly report: null until chosen (then it follows the role: on for owners and admins). */
      weeklyReport: row?.weeklyReport ?? null,
      address: user?.email ?? null,
      whatsappReady: this.whatsappReady,
      /** Whether the person has chosen, rather than living with the defaults. */
      saved: !!row,
    };
  }

  async update(userId: string, input: LeadAlertSettingsInput) {
    const data: { email?: boolean; whatsapp?: boolean; phone?: string | null; lang?: string; weeklyReport?: boolean } = {};
    if (input.email !== undefined) data.email = input.email;
    if (input.weeklyReport !== undefined) data.weeklyReport = input.weeklyReport;
    if (input.lang !== undefined) data.lang = input.lang;
    if (input.phone !== undefined) {
      if (input.phone === null || input.phone === '') data.phone = null;
      else {
        const phone = normalizePhone(input.phone);
        if (!phone) throw new BadRequestException('Enter the number with its country code, like +20 100 123 4567');
        data.phone = phone;
      }
    }
    if (input.whatsapp !== undefined) {
      if (input.whatsapp) {
        if (!this.wa) throw new ServiceUnavailableException('WhatsApp alerts are not set up on this server');
        const phone = data.phone !== undefined ? data.phone : (await this.settings(userId)).phone;
        if (!phone) throw new BadRequestException('Add your WhatsApp number first');
      }
      data.whatsapp = input.whatsapp;
    }
    // Clearing the number turns WhatsApp off with it.
    if (data.phone === null) data.whatsapp = false;
    await this.db.leadAlertSettings.upsert({ where: { userId }, create: { userId, ...data }, update: data });
    return this.settings(userId);
  }

  /** Sends a sample alert to the saved number, so the owner knows it arrives. */
  /** A sample alert on one channel, so the owner sees what will reach them. */
  async sendTest(userId: string, channel: 'whatsapp' | 'email' = 'whatsapp', lang?: AlertLang) {
    // The language the page is in, when given, so the sample reads as the owner will read it.
    const s = { ...(await this.settings(userId)), ...(lang ? { lang } : {}) };
    if (channel === 'whatsapp') {
      if (!this.wa) throw new ServiceUnavailableException('WhatsApp alerts are not set up on this server');
      if (!s.phone) throw new BadRequestException('Add your WhatsApp number first');
    } else if (!s.address) {
      throw new BadRequestException('This account has no email address');
    }
    const key = `${channel === 'whatsapp' ? 'wa' : 'mail'}-test:${userId}`;
    const wait = await this.throttle.blockedFor(key, TEST_LIMIT, TEST_WINDOW_MS);
    if (wait > 0) throw tooManyAttempts(wait);
    await this.throttle.hit(key, TEST_WINDOW_MS);
    const sample: LeadAlert = {
      leadId: 'test',
      intent: 'MEETING',
      name: s.lang === 'ar' ? 'زائر تجريبي' : 'Test visitor',
      company: 'Vertex Connect',
      timezone: this.config.get<string>('DEFAULT_TIMEZONE') || 'UTC',
      meetingAt: new Date(Date.now() + 24 * 3600_000).toISOString(),
      cardName: 'Vertex Connect',
      link: this.leadLink('test'),
    };
    if (channel === 'email') {
      // There is no lead behind a sample, so its button opens the leads page.
      sample.link = this.leadLink('test').replace(/\?lead=test$/, '');
      const { subject, html } = alertEmail(sample, s.lang);
      if (!(await this.mail.send({ to: s.address!, subject, html }))) throw new BadRequestException('The email could not be sent. Try again in a moment.');
      return { ok: true as const };
    }
    try {
      await this.wa!.sendTemplate({ to: s.phone!, lang: s.lang, body: alertWhatsApp(sample, s.lang), buttonSuffix: 'test' });
    } catch (err) {
      this.logger.warn(`WhatsApp test failed for ${userId}: ${(err as Error).message}`);
      throw new BadRequestException('WhatsApp did not accept the message. Check the number and try again.');
    }
    return { ok: true as const };
  }

  leadLink(leadId: string, orgId?: string | null): string {
    const base = (this.config.get<string>('APP_PUBLIC_URL') || 'http://localhost:3000').replace(/\/$/, '');
    return base + workspaceLink(`/leads?lead=${encodeURIComponent(leadId)}`, orgId);
  }

  /** Tells the owner about a new lead on every channel they chose. Never throws. */
  async leadCaptured(ownerId: string, alert: Omit<LeadAlert, 'link'>): Promise<void> {
    try {
      const [row, owner] = await Promise.all([
        this.db.leadAlertSettings.findUnique({ where: { userId: ownerId } }),
        this.db.user.findUnique({ where: { id: ownerId }, select: { email: true, deletedAt: true } }),
      ]);
      if (!owner || owner.deletedAt) return;
      const s = { ...DEFAULTS, ...(row ?? {}) };
      // The language the owner chose; before they choose, the card's own.
      const chosen = row?.lang === 'ar' || row?.lang === 'en' ? row.lang : alert.lang;
      const lang: AlertLang = chosen === 'ar' ? 'ar' : 'en';
      const full: LeadAlert = { ...alert, link: this.leadLink(alert.leadId, alert.orgId) };
      const jobs: Promise<unknown>[] = [];
      if (s.email && owner.email) {
        const { subject, html } = alertEmail(full, lang);
        jobs.push(this.mail.send({ to: owner.email, subject, html }));
      }
      if (s.whatsapp && s.phone && this.wa) {
        jobs.push(
          this.wa
            .sendTemplate({ to: s.phone, lang, body: alertWhatsApp(full, lang), buttonSuffix: alert.leadId })
            .catch((err: Error) => this.logger.warn(`WhatsApp alert failed for ${ownerId}: ${err.message}`)),
        );
      }
      await Promise.allSettled(jobs);
    } catch (err) {
      this.logger.warn(`lead alert failed: ${(err as Error).message}`);
    }
  }
}
