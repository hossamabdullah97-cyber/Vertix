import { Module } from '@nestjs/common';
import { BillingModule } from '../billing/billing.module';
import { CardsService } from './cards.service';
import { SectionsService } from './sections.service';
import { ActionsService } from './actions.service';
import { CardVariantsService } from './card-variants.service';
import { PaymentLinksService } from './payment-links.service';
import { CardsController } from './cards.controller';
import { CardSectionsController } from './sections.controller';
import { CardActionsController } from './actions.controller';
import { CardVariantsController } from './card-variants.controller';
import { PaymentLinksController } from './payment-links.controller';
import { PublicCardsController } from './public-cards.controller';

@Module({
  imports: [BillingModule],
  controllers: [
    CardsController,
    CardSectionsController,
    CardActionsController,
    CardVariantsController,
    PaymentLinksController,
    PublicCardsController,
  ],
  providers: [CardsService, SectionsService, ActionsService, CardVariantsService, PaymentLinksService],
  exports: [CardsService],
})
export class CardsModule {}
