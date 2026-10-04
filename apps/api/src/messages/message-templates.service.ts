import { Injectable, NotFoundException } from '@nestjs/common';
import type { TenantContext } from '@vertex/db';
import type { CreateMessageTemplateInput, UpdateMessageTemplateInput } from '@vertex/shared';
import { PrismaService } from '../prisma/prisma.service';
import { DEFAULT_TEMPLATES } from './default-templates';

const SELECT = { id: true, name: true, channel: true, subject: true, body: true, order: true, updatedAt: true } as const;

/**
 * A workspace's ready messages. The first time anyone opens them, the
 * workspace gets a starting set in that person's language; it is recorded in
 * the workspace's settings, so deleting them all later does not bring them back.
 */
@Injectable()
export class MessageTemplatesService {
  constructor(private readonly prisma: PrismaService) {}

  private get db() {
    return this.prisma.client;
  }

  async list(tenant: TenantContext, lang: 'en' | 'ar') {
    const rows = await this.db.messageTemplate.findMany({ orderBy: [{ order: 'asc' }, { createdAt: 'asc' }], select: SELECT });
    if (rows.length) return rows;

    const org = await this.db.organization.findUnique({ where: { id: tenant.orgId }, select: { settings: true } });
    const settings = (org?.settings ?? {}) as Record<string, unknown>;
    if (settings.templatesSeeded) return rows;

    await this.db.$transaction(async (tx) => {
      // Two first visits at once must not seed twice.
      const [lock] = await tx.$queryRaw<{ ok: boolean }[]>`SELECT pg_try_advisory_xact_lock(hashtext(${'templates:' + tenant.orgId})) AS ok`;
      if (!lock?.ok) return;
      const fresh = await tx.organization.findUnique({ where: { id: tenant.orgId }, select: { settings: true } });
      if (((fresh?.settings ?? {}) as Record<string, unknown>).templatesSeeded) return;
      await tx.messageTemplate.createMany({
        data: DEFAULT_TEMPLATES[lang].map((t, order) => ({ ...t, order, orgId: tenant.orgId, createdBy: tenant.userId })),
      });
      await tx.organization.update({
        where: { id: tenant.orgId },
        data: { settings: { ...((fresh?.settings ?? {}) as Record<string, unknown>), templatesSeeded: true } },
      });
    });
    return this.db.messageTemplate.findMany({ orderBy: [{ order: 'asc' }, { createdAt: 'asc' }], select: SELECT });
  }

  async create(tenant: TenantContext, input: CreateMessageTemplateInput) {
    const last = await this.db.messageTemplate.findFirst({ orderBy: { order: 'desc' }, select: { order: true } });
    return this.db.messageTemplate.create({
      data: {
        orgId: tenant.orgId,
        createdBy: tenant.userId,
        name: input.name,
        channel: input.channel,
        subject: input.channel === 'EMAIL' ? input.subject || null : null,
        body: input.body,
        order: (last?.order ?? -1) + 1,
      },
      select: SELECT,
    });
  }

  async update(_tenant: TenantContext, id: string, input: UpdateMessageTemplateInput) {
    const found = await this.db.messageTemplate.findFirst({ where: { id }, select: { id: true, channel: true } });
    if (!found) throw new NotFoundException('Template not found');
    const channel = input.channel ?? found.channel;
    return this.db.messageTemplate.update({
      where: { id },
      data: {
        ...(input.name !== undefined ? { name: input.name } : {}),
        ...(input.channel !== undefined ? { channel: input.channel } : {}),
        ...(input.body !== undefined ? { body: input.body } : {}),
        ...(input.subject !== undefined || channel !== 'EMAIL' ? { subject: channel === 'EMAIL' ? input.subject || null : null } : {}),
      },
      select: SELECT,
    });
  }

  async remove(_tenant: TenantContext, id: string) {
    const found = await this.db.messageTemplate.findFirst({ where: { id }, select: { id: true } });
    if (!found) throw new NotFoundException('Template not found');
    await this.db.messageTemplate.update({ where: { id }, data: { deletedAt: new Date() } });
    return { id, deleted: true };
  }
}
