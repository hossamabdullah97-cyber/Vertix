import { Global, Module } from '@nestjs/common';
import { MailService } from './mail.service';
import { TokensService } from './tokens.service';

@Global()
@Module({
  providers: [MailService, TokensService],
  exports: [MailService, TokensService],
})
export class MailModule {}
