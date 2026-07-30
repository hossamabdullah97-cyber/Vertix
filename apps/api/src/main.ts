import './instrument';
import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestExpressApplication } from '@nestjs/platform-express';
import { mkdirSync } from 'node:fs';
import helmet from 'helmet';
import { AppModule } from './app.module';
import { UPLOAD_DIR } from './uploads/uploads.controller';

async function bootstrap() {
  // rawBody enables Stripe webhook signature verification.
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    bufferLogs: false,
    rawBody: true,
  });
  const config = app.get(ConfigService);

  // Uploaded images are served cross-origin (web app runs on a different port),
  // so relax Cross-Origin-Resource-Policy; helmet defaults to same-origin.
  app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));

  // Serve uploaded images at /uploads (outside the /api global prefix).
  mkdirSync(UPLOAD_DIR, { recursive: true });
  app.useStaticAssets(UPLOAD_DIR, { prefix: '/uploads' });

  app.setGlobalPrefix('api');
  // Input validation is handled per-route by ZodValidationPipe (schemas from @vertex/shared).

  const origins = config
    .get<string>('CORS_ORIGINS', 'http://localhost:3000')
    .split(',')
    .map((o) => o.trim());
  app.enableCors({ origin: origins, credentials: true });

  app.enableShutdownHooks();

  const port = config.get<number>('PORT', 4000);
  await app.listen(port);
  Logger.log(`🚀 Vertex Connect API → http://localhost:${port}/api`, 'Bootstrap');
}

bootstrap();
