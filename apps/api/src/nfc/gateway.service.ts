import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'node:crypto';
import type { ActionType, NfcResolution } from '@vertex/shared';
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

    // --- Stage 1: Verification ---
    const tag = await this.db.nfcTag.findFirst({ where: { uid } });
    if (!tag || tag.status === 'DISABLED') {
      throw new NotFoundException('Unknown or disabled tag');
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

    // Unassigned tag or no published card → fall back to the public home.
    if (!card) {
      const visitorId = await this.attribute(ctx, tag.orgId, null);
      await this.recordScan(tag, null, visitorId, ctx);
      return {
        tagUid: uid,
        cardSlug: '',
        action: null,
        redirectUrl: appUrl,
        visitorId,
      };
    }

    const cardPageUrl = `${appUrl}/c/${card.slug}`;
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
    await this.recordScan(tag, card.id, visitorId, ctx);

    // Notify subscribed integrations of the physical tap (best-effort).
    void this.webhooks
      .emit(tag.orgId, 'nfc.tapped', {
        tagUid: uid,
        cardId: card.id,
        cardSlug: card.slug,
        visitorId,
        redirectUrl,
      })
      .catch(() => undefined);

    return { tagUid: uid, cardSlug: card.slug, action, redirectUrl, visitorId };
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

  /** Stage 6 helper — record the scan event and bump tag counters. Never throws. */
  private async recordScan(
    tag: { id: string; orgId: string },
    cardId: string | null,
    visitorId: string,
    ctx: ScanContext,
  ): Promise<void> {
    try {
      const visitor = await this.db.visitor.findFirst({
        where: { anonymousId: visitorId },
        select: { id: true },
      });
      await this.db.$transaction([
        this.db.event.create({
          data: {
            orgId: tag.orgId,
            cardId,
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
    } catch (err) {
      // Analytics must never break the redirect.
      this.logger.warn(`Scan recording failed: ${(err as Error).message}`);
    }
  }
}
