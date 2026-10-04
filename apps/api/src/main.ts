import './instrument';
import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestExpressApplication } from '@nestjs/platform-express';
import { mkdirSync, readFileSync } from 'node:fs';
import helmet from 'helmet';
import compression from 'compression';
import { AppModule } from './app.module';
import { trustProxySetting } from './config/trust-proxy';
import { UPLOAD_DIR } from './uploads/storage.service';

/**
 * Local-dev TLS, off unless both cert paths are set.
 *
 * A browser refuses to call an http:// API from an https:// page (mixed
 * content), so serving the web app over TLS for Web NFC means the API has to
 * answer over TLS too. Production terminates TLS at the proxy and leaves these
 * unset, which keeps the plain listener.
 */
function httpsOptions(): { key: Buffer; cert: Buffer } | undefined {
  const key = process.env.HTTPS_KEY_FILE;
  const cert = process.env.HTTPS_CERT_FILE;
  if (!key || !cert) return undefined;
  return { key: readFileSync(key), cert: readFileSync(cert) };
}

async function bootstrap() {
  const https = httpsOptions();
  // rawBody keeps the unparsed request body for handlers that need it.
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    bufferLogs: false,
    rawBody: true,
    ...(https ? { httpsOptions: https } : {}),
  });
  const config = app.get(ConfigService);

  // Which address counts as the caller's, for the sign-in limits and logs.
  const trustProxy = trustProxySetting(config.get<string>('TRUST_PROXY'));
  if (trustProxy !== undefined) app.set('trust proxy', trustProxy);

  // Uploaded images are served cross-origin (web app runs on a different port),
  // so relax Cross-Origin-Resource-Policy; helmet defaults to same-origin.
  app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));

  // Answers go out compressed: a workspace's lead list is JSON that shrinks
  // about tenfold, which is most of what a phone waits for on a slow network.
  // Small answers (under 1 KB) are left alone; compressing them costs more than it saves.
  app.use(compression({ threshold: 1024 }));

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
  Logger.log(
    `🚀 Vertex Connect API → ${https ? 'https' : 'http'}://localhost:${port}/api`,
    'Bootstrap',
  );
}

bootstrap();
