import {
  Controller,
  Get,
  NotFoundException,
  Optional,
  Param,
  Query,
  Req,
  Res,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Response } from 'express';
import { CardsService } from './cards.service';
import { Public } from '../auth/decorators/public.decorator';
import { StorageService } from '../uploads/storage.service';
import { MAX_PHOTO_BYTES, buildVCard, inLanguage, vcardFileName, vcardPhoto } from './vcard';
import { WalletService } from './wallet/wallet.service';
import { availabilityOf, BOOKING_DAYS, openSlots } from './availability';
import { GoogleCalendarService } from '../integrations/calendar/google-calendar.service';
import { bookedMeetings } from './booked-meetings';
import { PrismaService } from '../prisma/prisma.service';
import { walletCardOf } from './wallet/wallet-card';
import { LIVE_ORG } from '../common/live-org';

/** Public card page — no authentication, shows published cards only. */
@Controller('c')
export class PublicCardsController {
  constructor(
    private readonly cards: CardsService,
    private readonly config: ConfigService,
    private readonly wallet: WalletService,
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
    @Optional() private readonly calendar?: GoogleCalendarService,
  ) {}

  private appUrl() {
    return this.config.get<string>('APP_PUBLIC_URL', 'http://localhost:3000').replace(/\/$/, '');
  }

  /** The resolved, unlocked card, or 404. */
  private async unlocked(slug: string, p?: string, code?: string, req?: any) {
    const card = await this.cards.getPublicBySlug(slug, { p, code, req });
    if (!card || 'locked' in card) throw new NotFoundException('Card not found');
    return card;
  }

  @Public()
  @Get(':slug')
  async view(
    @Param('slug') slug: string,
    @Query('p') p?: string,
    @Query('code') code?: string,
    @Req() req?: any,
  ) {
    const card = await this.cards.getPublicBySlug(slug, { p, code, req });
    if (!card) throw new NotFoundException('Card not found');
    // Which wallets the card may offer; a locked profile offers nothing yet.
    return 'locked' in card ? card : { ...card, wallet: this.wallet.available() };
  }

  /**
   * The times a visitor can ask to meet over the next two weeks, in the
   * owner's time zone. Meetings are a card-wide setting, not per profile.
   */
  @Public()
  @Get(':slug/availability')
  async availability(@Param('slug') slug: string) {
    const card = await this.prisma.client.card.findFirst({
      where: { slug, isPublished: true, deletedAt: null, ...LIVE_ORG },
      select: { id: true, orgId: true, ownerId: true, theme: true },
    });
    if (!card) throw new NotFoundException('Card not found');
    const now = new Date();
    const a = availabilityOf(card.theme, this.config.get<string>('DEFAULT_TIMEZONE'));
    // When the owner's own calendar says they are busy is not offered either.
    const busy =
      a.enabled && this.calendar ? await this.calendar.busy(card.orgId, card.ownerId, now, new Date(now.getTime() + (BOOKING_DAYS + 1) * 86_400_000)) : [];
    const days = a.enabled ? openSlots(a, now, await bookedMeetings(this.prisma.client, card.id, now), BOOKING_DAYS, busy) : [];
    return { enabled: a.enabled, timezone: a.timezone, length: a.length, days };
  }

  @Public()
  @Get(':slug/wallet/apple')
  async appleWallet(
    @Param('slug') slug: string,
    @Res() res: Response,
    @Query('p') p?: string,
    @Query('code') code?: string,
    @Req() req?: any,
  ) {
    const card = await this.unlocked(slug, p, code, req);
    const pass = walletCardOf(card, { appUrl: this.appUrl(), p });
    const stored = await this.storage.readImage(pass.avatar, MAX_PHOTO_BYTES);
    const photo = stored?.type === 'image/png' ? { type: 'PNG' as const, bytes: new Uint8Array(stored.bytes) } : null;
    const file = this.wallet.applePass(pass, photo);
    if (!file) throw new NotFoundException('Apple Wallet is not set up');
    res.setHeader('Content-Type', 'application/vnd.apple.pkpass');
    res.setHeader('Content-Disposition', `attachment; filename="${vcardFileName(pass.name).replace(/\.vcf$/, '.pkpass')}"`);
    res.send(Buffer.from(file));
  }

  @Public()
  @Get(':slug/wallet/google')
  async googleWallet(
    @Param('slug') slug: string,
    @Res() res: Response,
    @Query('p') p?: string,
    @Query('code') code?: string,
    @Req() req?: any,
  ) {
    const card = await this.unlocked(slug, p, code, req);
    const url = this.wallet.googleUrl(walletCardOf(card, { appUrl: this.appUrl(), p }), this.appUrl());
    if (!url) throw new NotFoundException('Google Wallet is not set up');
    res.redirect(302, url);
  }

  @Public()
  @Get(':slug/vcard')
  async vcard(
    @Param('slug') slug: string,
    @Res() res: Response,
    @Query('p') p?: string,
    @Query('code') code?: string,
    @Query('lang') lang?: string,
    @Req() req?: any,
  ) {
    const card = await this.unlocked(slug, p, code, req);

    // The contact is saved in the language the visitor was reading.
    const shown = inLanguage((card.vcardData as Record<string, unknown>) ?? {}, card.theme, lang);
    const data = shown.data;
    const bio = card.sections.find((s) => s.type === 'BIO')?.content as Record<string, unknown> | undefined;
    const about = shown.about ?? (typeof bio?.body === 'string' ? bio.body.trim() : '');
    const appUrl = this.appUrl();
    // A variant opened by its private key is the one the visitor saves.
    const cardUrl = `${appUrl}/c/${card.slug}${p ? `?p=${encodeURIComponent(p)}` : ''}`;

    const body = buildVCard(data, {
      cardUrl,
      about: about || undefined,
      actions: card.actions,
      photo: vcardPhoto(await this.storage.readImage(data.avatar, MAX_PHOTO_BYTES)),
    });
    const name = typeof data.fullName === 'string' ? data.fullName.trim() : '';
    res.setHeader('Content-Type', 'text/vcard; charset=utf-8');
    // An ASCII name for old clients, and the real one (Arabic too) for the rest.
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${vcardFileName(name)}"; filename*=UTF-8''${encodeURIComponent(`${name || 'contact'}.vcf`)}`,
    );
    res.send(body);
  }
}
