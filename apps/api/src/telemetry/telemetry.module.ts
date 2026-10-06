import { Global, Module } from '@nestjs/common';
import { ErrorsService } from './errors.service';
import { AdminErrorsController, TelemetryController } from './telemetry.controller';

/** Errors from browsers and the API, grouped for the admin console. Global: the exception filter records into it. */
@Global()
@Module({
  controllers: [TelemetryController, AdminErrorsController],
  providers: [ErrorsService],
  exports: [ErrorsService],
})
export class TelemetryModule {}
