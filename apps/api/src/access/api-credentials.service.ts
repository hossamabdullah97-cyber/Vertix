import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { classifyKey, hashKey } from './token-hash';

/** The principal a valid key/token resolves to, used to build req.user/apiAuth. */
export type ResolvedCredential =
  | { kind: 'api_key'; id: string; orgId: string; scopes: string[] }
  | { kind: 'pat'; id: string; userId: string; scopes: string[] };

/**
 * Verifies a presented API key or personal access token. Runs inside the auth
 * guard, before any tenant context exists, so lookups are global by hash — the
 * hash is unguessable, and a revoked or expired credential resolves to null.
 * Only the hash is ever compared; the raw key is never stored to compare against.
 */
@Injectable()
export class ApiCredentialsService {
  constructor(private readonly prisma: PrismaService) {}

  private get db() {
    return this.prisma.client;
  }

  private live(row: { revokedAt: Date | null; expiresAt: Date | null }, now: Date): boolean {
    if (row.revokedAt) return false;
    if (row.expiresAt && row.expiresAt.getTime() <= now.getTime()) return false;
    return true;
  }

  async verify(raw: string, now = new Date()): Promise<ResolvedCredential | null> {
    const kind = classifyKey(raw);
    if (!kind) return null;
    const hashed = hashKey(raw);

    if (kind === 'api_key') {
      const key = await this.db.apiKey.findFirst({
        where: { hashedKey: hashed, deletedAt: null },
        select: { id: true, orgId: true, scopes: true, revokedAt: true, expiresAt: true },
      });
      if (!key || !this.live(key, now)) return null;
      this.touch('api_key', key.id);
      return { kind: 'api_key', id: key.id, orgId: key.orgId, scopes: key.scopes };
    }

    const pat = await this.db.personalAccessToken.findFirst({
      where: { hashedKey: hashed, deletedAt: null },
      select: { id: true, userId: true, scopes: true, revokedAt: true, expiresAt: true },
    });
    if (!pat || !this.live(pat, now)) return null;
    this.touch('pat', pat.id);
    return { kind: 'pat', id: pat.id, userId: pat.userId, scopes: pat.scopes };
  }

  /** Records last use without blocking the request (best-effort). */
  private touch(kind: 'api_key' | 'pat', id: string): void {
    const at = new Date();
    const p =
      kind === 'api_key'
        ? this.db.apiKey.update({ where: { id }, data: { lastUsedAt: at } })
        : this.db.personalAccessToken.update({ where: { id }, data: { lastUsedAt: at } });
    void Promise.resolve(p).catch(() => undefined);
  }
}
