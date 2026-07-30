import {
  Injectable,
  Logger,
  OnModuleInit,
  OnModuleDestroy,
} from '@nestjs/common';
import { prisma, type ExtendedPrismaClient } from '@vertex/db';

/**
 * Wraps the extended Prisma client (with soft delete) and binds its lifecycle
 * to Nest's lifecycle. Inject it: constructor(private prisma: PrismaService).
 */
@Injectable()
export class PrismaService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PrismaService.name);
  readonly client: ExtendedPrismaClient = prisma;

  async onModuleInit(): Promise<void> {
    try {
      await this.client.$connect();
      this.logger.log('Connected to database');
    } catch (err) {
      // Do not crash the server — status is reflected via /api/health until the DB is available.
      this.logger.warn(
        `Database connection failed at startup: ${(err as Error).message}`,
      );
    }
  }

  async onModuleDestroy(): Promise<void> {
    await this.client.$disconnect();
  }
}
