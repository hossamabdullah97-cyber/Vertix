import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'node:crypto';
import { normalizeUid, type ActionType, type NfcResolution } from '@vertex/shared';
import { PrismaService } from '../prisma/prisma.service';
import { resolveActionTarget } from './action-resolver';
import { WebhookService } from '../integrations/webhook.service';

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
    const tag = await this.db.nfcTag.findFirst({ where: { uid } });
    if (!tag || tag.status === 'DISABLED') {
      const state = tag ? 'disabled' : 'unknown';
      return { tagUid: uid, cardSlug: '', action: null, redirectUrl: tapPage(state), visitorId: ctx.visitorId ?? '', state };
    }

    // --- Stage 2: Profile resolution ---
    const card = tag.cardId
      ? await this.db.card.findFirst({
          where: { id: tag.cardId, isPublished: true },
          select: {
            id: true,
            slug: true,
            actions: {
              where: { isActive: true, deletedAt: null },
              orderBy: { order: 'asc' },
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
    // per visit like the count.
    if (counted) void this.webhooks
      .emit(tag.orgId, 'nfc.tapped', {
        tagUid: uid,
        cardId: card.id,
        cardSlug: card.slug,
        visitorId,
        redirectUrl,
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
   * Stage 6 helper — record the scan event and bump tag counters, unless the
   * same phone tapped this chip moments ago. Returns whether it counted.
   * Never throws.
   *
   * "The same phone" is the same visitor id (kept in a cookie by the web's
   * /t route), or, for a client that sends none, the same address and
   * browser: without the second, reloading the bare URL in a loop would
   * inflate a chip's count and the member's numbers with it.
   */
  private async recordScan(
    tag: { id: string; orgId: string },
    cardId: string | null,
    visitorId: string,
    ctx: ScanContext,
  ): Promise<boolean> {
    try {
      const visitor = await this.db.visitor.findFirst({
        where: { anonymousId: visitorId },
        select: { id: true },
      });
      const same: Record<string, unknown>[] = [];
      if (visitor) same.push({ visitorId: visitor.id });
      if (ctx.ip) {
        const byIp = { device: { path: ['ip'], equals: ctx.ip } };
        same.push(
          ctx.userAgent
            ? { AND: [byIp, { device: { path: ['userAgent'], equals: ctx.userAgent } }] }
            : byIp,
        );
      }
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
          },
        }),
        this.db.nfcTag.update({
          where: { id: tag.id },
          data: { activationCount: { increment: 1 }, lastScanAt: new Date() },
        }),
      ]);
      return true;
    } catch (err) {
      // Analytics must never break the redirect.
      this.logger.warn(`Scan recording failed: ${(err as Error).message}`);
      return false;
    }
  }
}
