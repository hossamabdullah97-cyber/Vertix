import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import type { TenantContext } from '@vertex/db';
import {
  occasionRangeError,
  type CreateOccasionInput,
  type Occasion,
  type UpdateOccasionInput,
} from '@vertex/shared';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from './audit.service';

const day = (d: Date) => d.toISOString().slice(0, 10);
const toDate = (s: string) => new Date(`${s}T00:00:00Z`);

/**
 * Occasions a workspace marks on its charts: an exhibition, a launch. The
 * charts count whole UTC days, so an occasion is stored as whole days too.
 */
@Injectable()
export class OccasionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  private get db() {
    return this.prisma.client;
  }

  private shape(o: { id: string; name: string; startsOn: Date; endsOn: Date }): Occasion {
    return { id: o.id, name: o.name, startsOn: day(o.startsOn), endsOn: day(o.endsOn) };
  }

  async list(): Promise<Occasion[]> {
    const rows = await this.db.occasion.findMany({ orderBy: { startsOn: 'desc' } });
    return rows.map((o) => this.shape(o));
  }

  async create(tenant: TenantContext, input: CreateOccasionInput): Promise<Occasion> {
    const problem = occasionRangeError(input.startsOn, input.endsOn);
    if (problem) throw new BadRequestException(problem);
    const o = await this.db.occasion.create({
      data: {
        orgId: tenant.orgId,
        name: input.name,
        startsOn: toDate(input.startsOn),
        endsOn: toDate(input.endsOn),
        createdById: tenant.userId,
      },
    });
    await this.audit.log(tenant, 'occasion.created', { targetType: 'occasion', targetId: o.id, metadata: { name: o.name } });
    return this.shape(o);
  }

  async update(tenant: TenantContext, id: string, input: UpdateOccasionInput): Promise<Occasion> {
    const current = await this.db.occasion.findFirst({ where: { id } });
    if (!current) throw new NotFoundException('Occasion not found');
    const startsOn = input.startsOn ?? day(current.startsOn);
    const endsOn = input.endsOn ?? day(current.endsOn);
    const problem = occasionRangeError(startsOn, endsOn);
    if (problem) throw new BadRequestException(problem);
    const o = await this.db.occasion.update({
      where: { id },
      data: { ...(input.name !== undefined ? { name: input.name } : {}), startsOn: toDate(startsOn), endsOn: toDate(endsOn) },
    });
    await this.audit.log(tenant, 'occasion.updated', { targetType: 'occasion', targetId: o.id, metadata: { name: o.name } });
    return this.shape(o);
  }

  async remove(tenant: TenantContext, id: string) {
    const current = await this.db.occasion.findFirst({ where: { id } });
    if (!current) throw new NotFoundException('Occasion not found');
    await this.db.occasion.delete({ where: { id } });
    await this.audit.log(tenant, 'occasion.deleted', { targetType: 'occasion', targetId: id, metadata: { name: current.name } });
    return { id, deleted: true };
  }
}
