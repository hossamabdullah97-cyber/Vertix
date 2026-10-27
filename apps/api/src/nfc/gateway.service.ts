import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'node:crypto';
import { normalizeUid, type ActionType, type NfcResolution } from '@vertex/shared';
import { PrismaService } from '../prisma/prisma.service';
import { resolveActionTarget } from './action-resolver';
import { WebhookService } from '../integrations/webhook.service';
import { LIVE_ORG } from '../common/live-org';

export interface ScanContext {
  visitorId?: string;
  ip?: string;
  userAgent?: string;
  referrer?: string;
  apiBaseUrl: string; // e.g. http://localhost:4000/api
}

/**
 * A second tap of the same chip by the same phone inside this window is the
 * same visit (a slow page, a double tap, a reload), not another scan.
 */
export const SCAN_DEDUP_MS = 30_000;

/**
 * NFC smart gateway — a 6-stage pipeline executed on every tag tap:
 *   1) Verification    — the tag exists and is enabled
 *   2) Profile resolve — load the published card linked to the tag
 *   3) Attribution     — identify / create the visitor
 *   4) Personalization — pick the action to perform
 *   5) Action engine   — resolve the destination URL
 *   6) Analytics       — record the scan (non-blocking on failure)
 */
@Injectable()
export class GatewayService {
  private readonly logger = new Logger(GatewayService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly webhooks: WebhookService,
  ) {}

  private get db() {
    return this.prisma.client;
  }

  async resolve(uid: string, ctx: ScanContext): Promise<NfcResolution> {
    const appUrl = this.config.get<string>(
      'APP_PUBLIC_URL',
      'http://localhost:3000',
    );

    // The URL on the chip carries the serial in whatever spelling the writer
    // used; the registry holds one (see normalizeUid).
    uid = normalizeUid(uid);
    const tapPage = (state: string) => `${appUrl}/tap/${encodeURIComponent(uid)}?s=${state}`;

    // --- Stage 1: Verification ---
    // A chip that is not ours, or that its owner turned off, gets a page
    // saying so rather than an error the visitor's browser shows as raw JSON.
    const tag = await this.db.nfcTag.findFirst({ where: { uid, ...LIVE_ORG } });
    if (!tag || tag.status === 'DISABLED') {
      const state = tag ? 'disabled' : 'unknown';
      return { tagUid: uid, cardSlug: '', action: null, redirectUrl: tapPage(state), visitorId: ctx.visitorId ?? '', state };
    }

    // --- Stage 2: Profile resolution ---
    const card = tag.cardId
      ? await this.db.card.findFirst({
          where: { id: tag.cardId, isPublished: true, ...LIVE_ORG },
          select: {
            id: true,
            slug: true,
            actions: {
              where: { isActive: true, deletedAt: null },
              orderBy: [{ order: 'asc' }, { createdAt: 'asc' }],
              select: { type: true, config: true },
            },
          },
        })
      : null;

    // Not linked to a card yet, or its card is unpublished: a page that says
    // so, with the way to link it for whoever holds it.
    if (!card) {
      const visitorId = await this.attribute(ctx, tag.orgId, null);
      await this.recordScan(tag, null, visitorId, ctx);
      return {
        tagUid: uid,
        cardSlug: '',
        action: null,
        redirectUrl: tapPage('unassigned'),
        visitorId,
        state: 'unassigned',
      };
    }

    // The chip rides along in the URL so a lead captured on the card page can
    // be credited to it. The tap and the form submit are separate requests, so
    // without this the link between the two is lost.
    const cardPageUrl = `${appUrl}/c/${card.slug}?t=${encodeURIComponent(uid)}`;
    const vcardUrl = `${ctx.apiBaseUrl}/c/${card.slug}/vcard`;

    // --- Stage 3: Attribution ---
    const visitorId = await this.attribute(ctx, tag.orgId, card.id);

    // --- Stage 4: Personalization ---
    // Use the action explicitly flagged primary; otherwise default to the card page.
    const primary = card.actions.find((a) => {
      const cfg = a.config as Record<string, unknown> | null;
      return cfg?.isPrimary === true;
    });

    // --- Stage 5: Action engine ---
    let action: { type: ActionType; target: string } | null = null;
    if (primary) {
      const target = resolveActionTarget(
        { type: primary.type as ActionType, config: primary.config },
        { vcardUrl, cardPageUrl },
      );
      if (target) action = { type: primary.type as ActionType, target };
    }
    const redirectUrl = action?.target ?? cardPageUrl;

    // --- Stage 6: Analytics ---
    const counted = await this.recordScan(tag, card.id, visitorId, ctx);

    // Notify subscribed integrations of the physical tap (best-effort), once
    // per visit like the count, and never for the workspace's own taps.
    if (counted) void this.webhooks
      .emit(tag.orgId, 'nfc.tapped', {
        tagUid: uid,
        cardId: card.id,
        cardSlug: card.slug,
        visitorId,
        redirectUrl,
        repeat: counted === 'repeat',
      })
      .catch(() => undefined);

    return { tagUid: uid, cardSlug: card.slug, action, redirectUrl, visitorId, state: 'ok' };
  }

  /** Stage 3 helper — resolve or create the visitor identity. */
  private async attribute(
    ctx: ScanContext,
    _orgId: string,
    _cardId: string | null,
  ): Promise<string> {
    const anonymousId = ctx.visitorId || randomUUID();
    try {
      await this.db.visitor.upsert({
        where: { anonymousId },
        update: { device: { userAgent: ctx.userAgent, ip: ctx.ip } },
        create: {
          anonymousId,
          device: { userAgent: ctx.userAgent, ip: ctx.ip },
        },
      });
    } catch (err) {
      this.logger.warn(`Visitor attribution failed: ${(err as Error).message}`);
    }
    return anonymousId;
  }

  /**
   * Stage 6 helper — record the scan event and bump tag counters. Never throws.
   *
   * Nothing is recorded when the tap is the workspace's own (a browser its
   * owner or a colleague was signed in on, see Visitor.userId), or when the
   * same phone tapped this chip moments ago. A tap by someone who had tapped
   * it before is recorded as a repeat: counts of taps say how many people a
   * chip reached, and the repeats are counted on their own.
   *
   * "The same phone" is the same visitor id (kept in a cookie by the web's
   * /t route), or, for a client that sends none, the same address and
   * browser: without the second, reloading the bare URL in a loop would
   * inflate a chip's count and the member's numbers with it.
   *
   * Returns 'new' or 'repeat' for a recorded tap, false otherwise.
   */
  private async recordScan(
    tag: { id: string; orgId: string },
    cardId: string | null,
    visitorId: string,
    ctx: ScanContext,
  ): Promise<'new' | 'repeat' | false> {
    try {
      const visitor = await this.db.visitor.findFirst({
        where: { anonymousId: visitorId },
        select: { id: true, userId: true },
      });
      if (visitor?.userId) {
        const insider = await this.db.membership.findFirst({
          where: { orgId: tag.orgId, userId: visitor.userId, deletedAt: null },
          select: { id: true },
        });
        if (insider) return false;
      }
      // Who tapped: the phone's own visitor id when it sent one. Address and
      // browser stand in only when it did not, since two people on the same
      // Wi-Fi with the same phone share both and would be taken for one.
      const same: Record<string, unknown>[] = [];
      if (ctx.visitorId && visitor) same.push({ visitorId: visitor.id });
      else if (ctx.ip) {
        const byIp = { device: { path: ['ip'], equals: ctx.ip } };
        same.push(
          ctx.userAgent
            ? { AND: [byIp, { device: { path: ['userAgent'], equals: ctx.userAgent } }] }
            : byIp,
        );
      } else if (visitor) same.push({ visitorId: visitor.id });
      if (same.length) {
        const recent = await this.db.event.findFirst({
          where: {
            tagId: tag.id,
            type: 'NFC_SCAN',
            createdAt: { gte: new Date(Date.now() - SCAN_DEDUP_MS) },
            OR: same,
          },
          select: { id: true },
        });
        if (recent) return false;
      }
      const repeat = same.length
        ? !!(await this.db.event.findFirst({ where: { tagId: tag.id, type: 'NFC_SCAN', OR: same }, select: { id: true } }))
        : false;
      await this.db.$transaction([
        this.db.event.create({
          data: {
            orgId: tag.orgId,
            cardId,
            // Which physical chip produced this scan. Per-chip and per-member
            // reporting both count these rows.
            tagId: tag.id,
            visitorId: visitor?.id ?? null,
            type: 'NFC_SCAN',
            referrer: ctx.referrer,
            device: { userAgent: ctx.userAgent, ip: ctx.ip },
            repeat,
          },
        }),
        this.db.nfcTag.update({
          where: { id: tag.id },
          data: { ...(repeat ? { repeatTaps: { increment: 1 } } : { activationCount: { increment: 1 } }), lastScanAt: new Date() },
        }),
      ]);
      return repeat ? 'repeat' : 'new';
    } catch (err) {
      // Analytics must never break the redirect.
      this.logger.warn(`Scan recording failed: ${(err as Error).message}`);
      return false;
    }
  }
}
