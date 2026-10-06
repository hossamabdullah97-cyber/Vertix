import { randomBytes } from 'node:crypto';
import { Injectable, Logger, NotFoundException, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { TenantContext } from '@vertex/db';
import type { HelpFeedbackInput, SupportRequestInput, SupportRequestView, SupportTopic } from '@vertex/shared';
import { PrismaService } from '../prisma/prisma.service';
import { MailService } from '../mail/mail.service';

const REF_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

/** "VX-7KQ2MD": short enough to say on the phone, no 0/O or 1/I to mix up. */
export function newRef(): string {
  const bytes = randomBytes(6);
  return 'VX-' + Array.from(bytes, (b) => REF_ALPHABET[b % REF_ALPHABET.length]).join('');
}

function escapeHtml(v: string): string {
  return v.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
}

const TOPIC_EN: Record<SupportTopic, string> = {
  account: 'Account and sign-in',
  billing: 'Plans and payments',
  cards: 'Cards',
  leads: 'Leads',
  chips: 'NFC chips',
  team: 'Team',
  integrations: 'Integrations',
  bug: 'Something is broken',
  other: 'Something else',
};

type Row = { id: string; ref: string; topic: string; subject: string; message: string; status: 'OPEN' | 'CLOSED'; createdAt: Date; closedAt: Date | null };
const view = (r: Row): SupportRequestView => ({
  id: r.id,
  ref: r.ref,
  topic: r.topic as SupportTopic,
  subject: r.subject,
  message: r.message,
  status: r.status,
  createdAt: r.createdAt.toISOString(),
  closedAt: r.closedAt?.toISOString() ?? null,
});

/**
 * Messages from the help page to the people who run the platform. Each is
 * kept (the admin console lists them), emailed to the support inbox with
 * the person as reply-to so answering is one click, and confirmed to the
 * person with its reference. Plus "was this article helpful?".
 */
@Injectable()
export class SupportService {
  private readonly log = new Logger(SupportService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    @Optional() private readonly mail?: MailService,
  ) {}

  private get db() {
    return this.prisma.client;
  }

  async create(userId: string, input: SupportRequestInput, ctx: { tenant?: TenantContext; userAgent?: string | null }): Promise<SupportRequestView> {
    const user = await this.db.user.findUnique({ where: { id: userId }, select: { email: true, name: true } });
    if (!user) throw new NotFoundException('User not found');
    const org = ctx.tenant ? await this.db.organization.findUnique({ where: { id: ctx.tenant.orgId }, select: { id: true, name: true } }) : null;

    let row: Row | null = null;
    for (let i = 0; !row; i++) {
      try {
        row = await this.db.supportRequest.create({
          data: {
            ref: newRef(),
            userId,
            email: user.email,
            name: user.name,
            orgId: org?.id ?? null,
            orgName: org?.name ?? null,
            topic: input.topic,
            subject: input.subject,
            message: input.message,
            page: input.page?.split('?')[0] || null,
            userAgent: ctx.userAgent?.slice(0, 300) ?? null,
          },
        });
      } catch (e) {
        if (i >= 3 || (e as { code?: string }).code !== 'P2002') throw e;
      }
    }

    await Promise.all([this.toInbox(row, user, org?.name ?? null, input, ctx.userAgent ?? null), this.confirm(row, user, input.lang ?? 'en')]);
    return view(row);
  }

  /** The person's own requests, newest first. */
  async mine(userId: string): Promise<SupportRequestView[]> {
    const rows = await this.db.supportRequest.findMany({ where: { userId }, orderBy: { createdAt: 'desc' }, take: 20 });
    return rows.map(view);
  }

  async feedback(userId: string, input: HelpFeedbackInput) {
    await this.db.helpFeedback.upsert({
      where: { article_userId: { article: input.article, userId } },
      create: { article: input.article, userId, helpful: input.helpful },
      update: { helpful: input.helpful },
    });
    return { ok: true };
  }

  // ── For the people who run the platform ──

  async list(status?: string) {
    const rows = await this.db.supportRequest.findMany({
      where: status === 'OPEN' || status === 'CLOSED' ? { status } : {},
      orderBy: { createdAt: 'desc' },
      take: 200,
    });
    return rows.map((r) => ({ ...view(r), email: r.email, name: r.name, orgName: r.orgName, page: r.page, userAgent: r.userAgent }));
  }

  async setClosed(id: string, closed: boolean) {
    const { count } = await this.db.supportRequest.updateMany({
      where: { id },
      data: closed ? { status: 'CLOSED', closedAt: new Date() } : { status: 'OPEN', closedAt: null },
    });
    if (!count) throw new NotFoundException('Request not found');
    return { ok: true };
  }

  /** Per article: how many found it helpful and how many didn't, least helpful first. */
  async feedbackSummary() {
    const groups = await this.db.helpFeedback.groupBy({ by: ['article', 'helpful'], _count: { _all: true } });
    const by = new Map<string, { article: string; helpful: number; notHelpful: number }>();
    for (const g of groups) {
      const e = by.get(g.article) ?? { article: g.article, helpful: 0, notHelpful: 0 };
      if (g.helpful) e.helpful += g._count._all;
      else e.notHelpful += g._count._all;
      by.set(g.article, e);
    }
    return [...by.values()].sort((a, b) => b.notHelpful - a.notHelpful || b.helpful + b.notHelpful - (a.helpful + a.notHelpful));
  }

  private async toInbox(r: Row, user: { email: string; name: string | null }, orgName: string | null, input: SupportRequestInput, ua: string | null) {
    const to = (this.config.get<string>('SUPPORT_INBOX_EMAIL') || this.config.get<string>('OPS_ALERT_EMAIL'))?.trim();
    if (!to || !this.mail) return;
    const appUrl = (this.config.get<string>('APP_PUBLIC_URL') || 'http://localhost:3000').replace(/\/$/, '');
    const who = user.name ? `${escapeHtml(user.name)} &lt;${escapeHtml(user.email)}&gt;` : escapeHtml(user.email);
    await this.mail
      .send({
        to,
        replyTo: user.email,
        subject: `[${r.ref}] ${TOPIC_EN[input.topic]}: ${input.subject}`.slice(0, 200),
        html:
          `<p><strong>${escapeHtml(input.subject)}</strong></p>` +
          `<p style="white-space:pre-wrap">${escapeHtml(input.message)}</p><hr>` +
          `<p style="color:#6b6b76;font-size:12px">From ${who}${orgName ? ` in ${escapeHtml(orgName)}` : ''} · ${TOPIC_EN[input.topic]}` +
          (r.ref ? ` · ${r.ref}` : '') +
          (input.page ? `<br>On ${escapeHtml(input.page.split('?')[0]!)}` : '') +
          (ua ? `<br>${escapeHtml(ua.slice(0, 300))}` : '') +
          `<br>Reply to this email to answer them. <a href="${appUrl}/admin?tab=support">Open in the admin console</a></p>`,
      })
      .catch((e) => this.log.warn(`support inbox email failed: ${(e as Error).message}`));
  }

  private async confirm(r: Row, user: { email: string; name: string | null }, lang: 'en' | 'ar') {
    if (!this.mail) return;
    const ar = lang === 'ar';
    const hello = user.name ? (ar ? `أهلًا ${escapeHtml(user.name)}،` : `Hi ${escapeHtml(user.name)},`) : ar ? 'أهلًا،' : 'Hi,';
    const body = ar
      ? `<p>${hello}</p><p>وصلتنا رسالتك «${escapeHtml(r.subject)}» ورقمها <b>${r.ref}</b>. سيردّ عليك أحد أفراد فريقنا على هذا البريد، عادةً خلال يوم عمل.</p><p style="color:#6b6b76;font-size:12px">لإضافة أي شيء، ردّ على هذه الرسالة.</p>`
      : `<p>${hello}</p><p>We got your message “${escapeHtml(r.subject)}”, reference <b>${r.ref}</b>. A person from our team will answer at this address, usually within one working day.</p><p style="color:#6b6b76;font-size:12px">To add anything, reply to this email.</p>`;
    const inbox = (this.config.get<string>('SUPPORT_INBOX_EMAIL') || '').trim();
    await this.mail
      .send({
        to: user.email,
        replyTo: inbox || undefined,
        subject: ar ? `وصلتنا رسالتك (${r.ref})` : `We got your message (${r.ref})`,
        html: `<div dir="${ar ? 'rtl' : 'ltr'}" style="font-family:system-ui,sans-serif;max-width:480px;margin:auto;color:#3f3f46;font-size:15px;line-height:1.6"><h2 style="color:#16161a">Vertex Connect</h2>${body}</div>`,
      })
      .catch((e) => this.log.warn(`support confirmation email failed: ${(e as Error).message}`));
  }
}
