import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import type { TenantContext } from '@vertex/db';
import { PrismaService } from '../prisma/prisma.service';
import { generateKey } from './token-hash';
import { isValidScope } from './scopes';
import { AuditService } from '../organizations/audit.service';

/**
 * Workspace-scoped API keys. The raw key is returned once at creation or
 * rotation and never again — only its hash is stored. All reads and writes are
 * tenant-isolated by the Prisma layer.
 */
@Injectable()
export class ApiKeysService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  private get db() {
    return this.prisma.client;
  }

  private validateScopes(scopes: string[]): void {
    if (!scopes.length) throw new BadRequestException('At least one scope is required.');
    const bad = scopes.filter((s) => !isValidScope(s));
    if (bad.length) throw new BadRequestException(`Unknown scope(s): ${bad.join(', ')}`);
  }

  private present(k: {
    id: string;
    name: string;
    prefix: string;
    scopes: string[];
    lastUsedAt: Date | null;
    expiresAt: Date | null;
    revokedAt: Date | null;
    createdAt: Date;
    creator?: { name: string | null; email: string } | null;
  }) {
    return {
      id: k.id,
      name: k.name,
      // Only the non-secret prefix is ever shown after creation.
      keyHint: `${k.prefix}…`,
      scopes: k.scopes,
      lastUsedAt: k.lastUsedAt,
      expiresAt: k.expiresAt,
      revoked: !!k.revokedAt,
      createdBy: k.creator?.name ?? k.creator?.email ?? null,
      createdAt: k.createdAt,
    };
  }

  async list(_tenant: TenantContext) {
    const rows = await this.db.apiKey.findMany({
      orderBy: { createdAt: 'desc' },
      include: { creator: { select: { name: true, email: true } } },
    });
    return rows.map((r) => this.present(r));
  }

  async create(
    tenant: TenantContext,
    input: { name: string; scopes: string[]; expiresAt?: string | null },
  ) {
    this.validateScopes(input.scopes);
    const key = generateKey('api_key');
    const created = await this.db.apiKey.create({
      data: {
        orgId: tenant.orgId,
        name: input.name,
        hashedKey: key.hashed,
        prefix: key.prefix,
        scopes: input.scopes,
        createdBy: tenant.userId,
        expiresAt: input.expiresAt ? new Date(input.expiresAt) : null,
      },
      include: { creator: { select: { name: true, email: true } } },
    });
    await this.audit.log(tenant, 'apikey.created', {
      targetType: 'apikey', targetId: created.id, metadata: { name: input.name, scopes: input.scopes },
    });
    // The raw key is returned here and nowhere else.
    return { ...this.present(created), key: key.raw };
  }

  private async owned(id: string) {
    const key = await this.db.apiKey.findFirst({ where: { id } }); // orgId auto-injected
    if (!key) throw new NotFoundException('API key not found');
    return key;
  }

  async revoke(tenant: TenantContext, id: string) {
    await this.owned(id);
    await this.db.apiKey.update({ where: { id }, data: { revokedAt: new Date() } });
    await this.audit.log(tenant, 'apikey.revoked', { targetType: 'apikey', targetId: id });
    return { ok: true as const };
  }

  /** Issues a fresh secret for an existing key and clears any revocation. */
  async rotate(tenant: TenantContext, id: string) {
    await this.owned(id);
    const key = generateKey('api_key');
    await this.db.apiKey.update({
      where: { id },
      data: { hashedKey: key.hashed, prefix: key.prefix, revokedAt: null },
    });
    await this.audit.log(tenant, 'apikey.rotated', { targetType: 'apikey', targetId: id });
    return { key: key.raw };
  }

  async remove(_tenant: TenantContext, id: string) {
    await this.owned(id);
    await this.db.apiKey.update({ where: { id }, data: { deletedAt: new Date() } });
    return { ok: true as const };
  }
}
