import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { generateKey } from './token-hash';
import { isValidScope } from './scopes';

/**
 * Personal access tokens, owned by one user across all their workspaces. Not
 * tenant-scoped — every query is filtered by userId so a user can only see and
 * manage their own tokens. Only the hash is stored.
 */
@Injectable()
export class PersonalTokensService {
  constructor(private readonly prisma: PrismaService) {}

  private get db() {
    return this.prisma.client;
  }

  private validateScopes(scopes: string[]): void {
    if (!scopes.length) throw new BadRequestException('At least one scope is required.');
    const bad = scopes.filter((s) => !isValidScope(s));
    if (bad.length) throw new BadRequestException(`Unknown scope(s): ${bad.join(', ')}`);
  }

  private present(t: {
    id: string;
    name: string;
    prefix: string;
    scopes: string[];
    lastUsedAt: Date | null;
    expiresAt: Date | null;
    revokedAt: Date | null;
    createdAt: Date;
  }) {
    return {
      id: t.id,
      name: t.name,
      keyHint: `${t.prefix}…`,
      scopes: t.scopes,
      lastUsedAt: t.lastUsedAt,
      expiresAt: t.expiresAt,
      revoked: !!t.revokedAt,
      createdAt: t.createdAt,
    };
  }

  async list(userId: string) {
    const rows = await this.db.personalAccessToken.findMany({
      where: { userId, deletedAt: null },
      orderBy: { createdAt: 'desc' },
    });
    return rows.map((r) => this.present(r));
  }

  async create(
    userId: string,
    input: { name: string; scopes: string[]; expiresAt?: string | null },
  ) {
    this.validateScopes(input.scopes);
    const key = generateKey('pat');
    const created = await this.db.personalAccessToken.create({
      data: {
        userId,
        name: input.name,
        hashedKey: key.hashed,
        prefix: key.prefix,
        scopes: input.scopes,
        expiresAt: input.expiresAt ? new Date(input.expiresAt) : null,
      },
    });
    return { ...this.present(created), key: key.raw };
  }

  /** Scoped by userId so one user cannot touch another's token. */
  private async owned(userId: string, id: string) {
    const token = await this.db.personalAccessToken.findFirst({
      where: { id, userId, deletedAt: null },
    });
    if (!token) throw new NotFoundException('Token not found');
    return token;
  }

  async revoke(userId: string, id: string) {
    await this.owned(userId, id);
    await this.db.personalAccessToken.update({
      where: { id },
      data: { revokedAt: new Date() },
    });
    return { ok: true as const };
  }

  async remove(userId: string, id: string) {
    await this.owned(userId, id);
    await this.db.personalAccessToken.update({
      where: { id },
      data: { deletedAt: new Date() },
    });
    return { ok: true as const };
  }
}
