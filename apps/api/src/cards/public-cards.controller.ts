import {
  Controller,
  Get,
  NotFoundException,
  Param,
  Query,
  Req,
  Res,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Response } from 'express';
import { CardsService } from './cards.service';
import { Public } from '../auth/decorators/public.decorator';
import { UPLOAD_DIR } from '../uploads/uploads.controller';
import { buildVCard, photoFromUpload, vcardFileName } from './vcard';

/** Public card page — no authentication, shows published cards only. */
@Controller('c')
export class PublicCardsController {
  constructor(
    private readonly cards: CardsService,
    private readonly config: ConfigService,
  ) {}

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
    return card;
  }

  @Public()
  @Get(':slug/vcard')
  async vcard(
    @Param('slug') slug: string,
    @Res() res: Response,
    @Query('p') p?: string,
    @Query('code') code?: string,
    @Req() req?: any,
  ) {
    const card = await this.cards.getPublicBySlug(slug, { p, code, req });
    if (!card || 'locked' in card) throw new NotFoundException('Card not found');

    const data = (card.vcardData as Record<string, unknown>) ?? {};
    const bio = card.sections.find((s) => s.type === 'BIO')?.content as Record<string, unknown> | undefined;
    const about = typeof bio?.body === 'string' ? bio.body.trim() : '';
    const appUrl = this.config.get<string>('APP_PUBLIC_URL', 'http://localhost:3000').replace(/\/$/, '');
    // A variant opened by its private key is the one the visitor saves.
    const cardUrl = `${appUrl}/c/${card.slug}${p ? `?p=${encodeURIComponent(p)}` : ''}`;

    const body = buildVCard(data, {
      cardUrl,
      about: about || undefined,
      actions: card.actions,
      photo: photoFromUpload(data.avatar, UPLOAD_DIR),
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
