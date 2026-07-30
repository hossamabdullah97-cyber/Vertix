import {
  Controller,
  Get,
  Header,
  NotFoundException,
  Param,
  Query,
  Req,
} from '@nestjs/common';
import { CardsService } from './cards.service';
import { Public } from '../auth/decorators/public.decorator';
import { buildVCard } from './vcard';

/** Public card page — no authentication, shows published cards only. */
@Controller('c')
export class PublicCardsController {
  constructor(private readonly cards: CardsService) {}

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
  @Header('Content-Type', 'text/vcard; charset=utf-8')
  @Header('Content-Disposition', 'attachment; filename="contact.vcf"')
  async vcard(
    @Param('slug') slug: string,
    @Query('p') p?: string,
    @Query('code') code?: string,
    @Req() req?: any,
  ) {
    const card = await this.cards.getPublicBySlug(slug, { p, code, req });
    if (!card || 'locked' in card) throw new NotFoundException('Card not found');
    return buildVCard((card.vcardData as Record<string, unknown>) ?? {});
  }
}
