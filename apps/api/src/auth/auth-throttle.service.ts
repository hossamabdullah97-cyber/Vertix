import { HttpException, HttpStatus, Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

/** Failed sign-ins are counted in windows of this length. */
export const SIGN_IN_WINDOW_MS = 15 * 60_000;
/** From one address against one account: enough for typos, not for guessing. */
export const SIGN_IN_LIMIT_PER_ADDRESS = 5;
/**
 * Against one account from anywhere: stops guessing spread over many
 * addresses, and is high enough that someone cannot lock a person out
 * without sending many requests.
 */
export const SIGN_IN_LIMIT_PER_ACCOUNT = 20;
/** Reset links asked for one address, per hour, so no one floods an inbox. */
export const RESET_WINDOW_MS = 60 * 60_000;
export const RESET_LIMIT = 5;

/** Seconds left in a window that has reached its limit, or 0 when it has room. */
export function secondsBlocked(
  row: { count: number; windowStart: Date } | undefined,
  limit: number,
  windowMs: number,
  now: Date,
): number {
  if (!row) return 0;
  const ends = row.windowStart.getTime() + windowMs;
  if (ends <= now.getTime() || row.count < limit) return 0;
  return Math.ceil((ends - now.getTime()) / 1000);
}

/** The 429 the sign-in pages turn into "try again after …" in the reader's language. */
export function tooManyAttempts(retryAfter: number): HttpException {
  const minutes = Math.max(1, Math.ceil(retryAfter / 60));
  return new HttpException(
    {
      statusCode: HttpStatus.TOO_MANY_REQUESTS,
      message: `Too many attempts. Try again in ${minutes} minute${minutes === 1 ? '' : 's'}.`,
      retryAfter,
    },
    HttpStatus.TOO_MANY_REQUESTS,
  );
}

/**
 * Fixed-window counters for the sign-in limits, kept in the database so
 * every API instance and every restart counts the same attempts.
 */
@Injectable()
export class AuthThrottleService {
  constructor(private readonly prisma: PrismaService) {}

  /** How many seconds the key is still blocked for, 0 when it may go ahead. */
  async blockedFor(key: string, limit: number, windowMs: number, now = new Date()): Promise<number> {
    const rows = await this.prisma.client.$queryRaw<{ count: number; windowStart: Date }[]>`
      SELECT "count", "windowStart" FROM "auth_throttles" WHERE "key" = ${key}`;
    return secondsBlocked(rows[0], limit, windowMs, now);
  }

  /**
   * Counts one more attempt and returns the count in the current window. One
   * statement, so two attempts at once cannot both read the old count.
   */
  async hit(key: string, windowMs: number): Promise<number> {
    const rows = await this.prisma.client.$queryRaw<{ count: number }[]>`
      INSERT INTO "auth_throttles" ("key", "count", "windowStart") VALUES (${key}, 1, now())
      ON CONFLICT ("key") DO UPDATE SET
        "count" = CASE WHEN "auth_throttles"."windowStart" <= now() - (${windowMs}::int * interval '1 millisecond')
                       THEN 1 ELSE "auth_throttles"."count" + 1 END,
        "windowStart" = CASE WHEN "auth_throttles"."windowStart" <= now() - (${windowMs}::int * interval '1 millisecond')
                             THEN now() ELSE "auth_throttles"."windowStart" END
      RETURNING "count"`;
    // Now and then, forget windows long over.
    if (Math.random() < 0.02) {
      await this.prisma.client.$executeRaw`
        DELETE FROM "auth_throttles" WHERE "windowStart" < now() - interval '1 day'`;
    }
    return rows[0]?.count ?? 1;
  }

  /** A successful sign-in starts the account's count again. */
  async clear(...keys: string[]): Promise<void> {
    if (keys.length === 0) return;
    await this.prisma.client.authThrottle.deleteMany({ where: { key: { in: keys } } });
  }
}
