import { Module } from '@nestjs/common';
import { UploadsController } from './uploads.controller';
import { UploadedFilesController } from './uploaded-files.controller';
import { StorageService } from './storage.service';

@Module({
  controllers: [UploadsController, UploadedFilesController],
  providers: [StorageService],
  exports: [StorageService],
})
export class UploadsModule {}
