import {
  BadRequestException,
  Controller,
  Post,
  Req,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { randomUUID } from 'node:crypto';
import type { Request } from 'express';
import { StorageService, sniffImage } from './storage.service';

export { UPLOAD_DIR } from './storage.service';

const ALLOWED = /^image\/(jpe?g|png|webp|gif|avif)$/;

/**
 * Authenticated by the global JwtAuthGuard, but deliberately not tenant-scoped:
 * an account photo belongs to the user, so someone in a personal workspace with
 * no organization must still be able to upload one.
 */
@Controller('uploads')
export class UploadsController {
  constructor(private readonly storage: StorageService) {}

  @Post()
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
      limits: { fileSize: 5 * 1024 * 1024 }, // 5 MB
      fileFilter: (_req, file, cb) => {
        if (ALLOWED.test(file.mimetype)) cb(null, true);
        else cb(new BadRequestException('Only image files are allowed'), false);
      },
    }),
  )
  async upload(@UploadedFile() file: Express.Multer.File | undefined, @Req() req: Request) {
    if (!file) throw new BadRequestException('No file uploaded');
    // The browser's word for the type is not enough: the file's own first
    // bytes decide, and they also pick the extension it is kept under.
    const kind = sniffImage(file.buffer);
    if (!kind) throw new BadRequestException('Only image files are allowed');
    const base = `${req.protocol}://${req.get('host')}`;
    const url = await this.storage.saveImage(file.buffer, `${randomUUID()}${kind.ext}`, kind.type, base);
    return { url };
  }
}
