import { Controller, Get, NotFoundException, Param, Res } from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';
import type { Response } from 'express';
import { Public } from '../auth/decorators/public.decorator';
import { StorageService } from './storage.service';

/**
 * Uploaded images kept in the database, at /uploads/<name> (outside the /api
 * prefix, see main.ts), the same address files on the local disk have. The
 * disk is looked at first by the static middleware; what it does not have
 * comes here. Public: they show on public cards.
 */
@Controller('uploads')
export class UploadedFilesController {
  constructor(private readonly storage: StorageService) {}

  @Public()
  @SkipThrottle()
  @Get(':name')
  async serve(@Param('name') name: string, @Res() res: Response) {
    const file = await this.storage.fromDb(name);
    if (!file) throw new NotFoundException();
    res.setHeader('Content-Type', file.type);
    // Names are random and never reused, so a file never changes.
    res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.end(file.bytes);
  }
}
