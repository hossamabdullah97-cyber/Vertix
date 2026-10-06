import { Module } from '@nestjs/common';
import { AdminStatusController, StatusController } from './status.controller';
import { StatusService } from './status.service';

@Module({
  controllers: [StatusController, AdminStatusController],
  providers: [StatusService],
})
export class StatusModule {}
