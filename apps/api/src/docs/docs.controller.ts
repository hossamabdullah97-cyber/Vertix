import { Controller, Get, Header } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { openApiDocument } from '@vertex/shared/dist/api-reference';
import { Public } from '../auth/decorators/public.decorator';

/** The public API as OpenAPI, for code generators and tools like Postman. Readable without signing in. */
@Controller()
export class DocsController {
  constructor(private readonly config: ConfigService) {}

  @Public()
  @Get('openapi.json')
  @Header('Cache-Control', 'public, max-age=300')
  openapi() {
    const base = (this.config.get<string>('API_PUBLIC_URL') || 'http://localhost:4000').replace(/\/$/, '');
    return openApiDocument(base.endsWith('/api') ? base : `${base}/api`);
  }
}
