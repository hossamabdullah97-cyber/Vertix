import { BadRequestException, Injectable } from '@nestjs/common';
import { createHash, randomBytes } from 'node:crypto';
import { PrismaService } from '../prisma/prisma.service';

type TokenType = 'INVITE' | 'PASSWORD_RESET';

interface CreateArgs {
  type: TokenType;
  email: string;
  userId?: string;
  orgId?: string;
  role?: string;
  teamId?: string;
  ttlMs: number;
}

function hash(raw: string): string {
  return createHash('sha256').update(raw).digest('hex');
}

/**
 * One-time tokens for invitations and password resets.
 * The raw token is returned (to email); only its hash is stored.
 */
@Injectable()
export class TokensService {
  constructor(private readonly prisma: PrismaService) {}

  private get db() {
    return this.prisma.client;
  }

  async create(args: CreateArgs): Promise<string> {
    const raw = randomBytes(32).toString('hex');
    await this.db.token.create({
      data: {
        type: args.type as never,
        tokenHash: hash(raw),
        email: args.email,
        userId: args.userId,
        orgId: args.orgId,
        role: args.role as never,
        teamId: args.teamId,
        expiresAt: new Date(Date.now() + args.ttlMs),
      },
    });
    return raw;
  }

  /** Validates a raw token (correct type, not used, not expired). */
  async verify(type: TokenType, raw: string) {
    const token = await this.db.token.findUnique({
      where: { tokenHash: hash(raw) },
    });
    if (
      !token ||
      token.type !== type ||
      token.usedAt ||
      token.expiresAt.getTime() < Date.now()
    ) {
      throw new BadRequestException('Invalid or expired link');
    }
    return token;
  }

  async consume(id: string): Promise<void> {
    await this.db.token.update({
      where: { id },
      data: { usedAt: new Date() },
    });
  }

  /**
   * Burns a user's outstanding tokens of one type. Used when a fresh invitation
   * supersedes an earlier one, so only the newest link stays live.
   */
  async revokePending(type: TokenType, userId: string): Promise<void> {
    await this.db.token.updateMany({
      where: { type: type as never, userId, usedAt: null },
      data: { usedAt: new Date() },
    });
  }
}
