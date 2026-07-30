import {
  BadRequestException,
  Controller,
  Post,
  Req,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import { extname, join } from 'node:path';
import { randomUUID } from 'node:crypto';
import type { Request } from 'express';

/** Where uploaded images live (served statically at /uploads). */
export const UPLOAD_DIR = join(process.cwd(), 'uploads');

const ALLOWED = /^image\/(jpe?g|png|webp|gif|avif)$/;

/**
 * Authenticated by the global JwtAuthGuard, but deliberately not tenant-scoped:
 * an account photo belongs to the user, so someone in a personal workspace with
 * no organization must still be able to upload one.
 */
@Controller('uploads')
export class UploadsController {
  @Post()
  @UseInterceptors(
    FileInterceptor('file', {
      storage: diskStorage({
        destination: UPLOAD_DIR,
        filename: (_req, file, cb) => {
          const ext = extname(file.originalname).toLowerCase() || '.jpg';
          cb(null, `${randomUUID()}${ext}`);
        },
      }),
      limits: { fileSize: 5 * 1024 * 1024 }, // 5 MB
      fileFilter: (_req, file, cb) => {
        if (ALLOWED.test(file.mimetype)) cb(null, true);
        else cb(new BadRequestException('Only image files are allowed'), false);
      },
    }),
  )
  upload(@UploadedFile() file: Express.Multer.File | undefined, @Req() req: Request) {
    if (!file) throw new BadRequestException('No file uploaded');
    const base = `${req.protocol}://${req.get('host')}`;
    return { url: `${base}/uploads/${file.filename}` };
  }
}
