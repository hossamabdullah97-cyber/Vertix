import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import type { Prisma, TenantContext } from '@vertex/db';
import {
  MAX_CUSTOM_FIELDS,
  coerceFieldValue,
  type CustomFieldDef,
  type CustomFieldInput,
  type CustomFieldValue,
  type UpdateCustomFieldInput,
} from '@vertex/shared';
import { PrismaService } from '../prisma/prisma.service';

export const TOO_MANY_FIELDS = `A workspace can have up to ${MAX_CUSTOM_FIELDS} fields.`;
export const DUPLICATE_FIELD = 'There is already a field with this name.';

type Values = Record<string, CustomFieldValue>;

const valuesOf = (v: unknown): Values => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Values) : {});

/**
 * The fields a workspace adds to its leads, and their values on each lead.
 * Values are stored by field id, so a field can be renamed or moved without
 * touching a lead; deleting a field takes its values off every lead.
 */
@Injectable()
export class CustomFieldsService {
  constructor(private readonly prisma: PrismaService) {}

  private get db() {
    return this.prisma.client;
  }

  async list(): Promise<CustomFieldDef[]> {
    return this.db.customField.findMany({ orderBy: [{ order: 'asc' }, { createdAt: 'asc' }], select: { id: true, label: true, type: true, options: true, order: true } });
  }

  async create(tenant: TenantContext, input: CustomFieldInput): Promise<CustomFieldDef> {
    const fields = await this.list();
    if (fields.length >= MAX_CUSTOM_FIELDS) throw new BadRequestException(TOO_MANY_FIELDS);
    if (fields.some((f) => f.label.toLowerCase() === input.label.toLowerCase())) throw new BadRequestException(DUPLICATE_FIELD);
    return this.db.customField.create({
      data: { orgId: tenant.orgId, label: input.label, type: input.type, options: input.type === 'SELECT' ? input.options : [], order: (fields.at(-1)?.order ?? -1) + 1 },
      select: { id: true, label: true, type: true, options: true, order: true },
    });
  }

  /** Renames a field, or changes a choice field's options (values for an option taken away stay until edited). */
  async update(id: string, input: UpdateCustomFieldInput): Promise<CustomFieldDef> {
    const fields = await this.list();
    const field = fields.find((f) => f.id === id);
    if (!field) throw new NotFoundException('Field not found');
    if (input.label && fields.some((f) => f.id !== id && f.label.toLowerCase() === input.label!.toLowerCase())) throw new BadRequestException(DUPLICATE_FIELD);
    if (input.options && field.type === 'SELECT') {
      if (!input.options.length) throw new BadRequestException('A choice field needs at least one option');
      if (new Set(input.options.map((o) => o.toLowerCase())).size !== input.options.length) throw new BadRequestException('Each option once');
    }
    return this.db.customField.update({
      where: { id },
      data: { ...(input.label ? { label: input.label } : {}), ...(input.options && field.type === 'SELECT' ? { options: input.options } : {}) },
      select: { id: true, label: true, type: true, options: true, order: true },
    });
  }

  /** Deletes a field, and its value from every lead of the workspace. */
  async remove(tenant: TenantContext, id: string) {
    const { count } = await this.db.customField.deleteMany({ where: { id } });
    if (!count) throw new NotFoundException('Field not found');
    await this.db.$executeRaw`UPDATE leads SET "customFields" = "customFields" - ${id} WHERE "orgId" = ${tenant.orgId} AND "customFields" ? ${id}`;
    return { ok: true };
  }

  /** Puts the fields in the order given (ids not named keep their place after them). */
  async reorder(ids: string[]): Promise<CustomFieldDef[]> {
    const fields = await this.list();
    const known = new Set(fields.map((f) => f.id));
    const ordered = [...ids.filter((id) => known.has(id)), ...fields.map((f) => f.id).filter((id) => !ids.includes(id))];
    await this.db.$transaction(ordered.map((id, order) => this.db.customField.update({ where: { id }, data: { order } })));
    return this.list();
  }

  /**
   * A lead's values with a change laid over them: each named field set, or
   * cleared with an empty value. A field that is not the workspace's, or a
   * value that does not fit its field, is refused, saying which.
   */
  async apply(current: unknown, patch: Record<string, unknown>, fields?: CustomFieldDef[]): Promise<Prisma.InputJsonValue> {
    const defs = new Map((fields ?? (await this.list())).map((f) => [f.id, f]));
    const next: Values = { ...valuesOf(current) };
    for (const [id, raw] of Object.entries(patch)) {
      const field = defs.get(id);
      if (!field) throw new BadRequestException('Unknown field');
      const value = coerceFieldValue(field, raw);
      if (value === undefined) throw new BadRequestException(`"${field.label}" can't take that value`);
      if (value === null) delete next[id];
      else next[id] = value;
    }
    return next;
  }

  /** For an import: the values that fit, and whether any did not. */
  tolerant(patch: Record<string, unknown>, fields: CustomFieldDef[]): { values: Values; refused: boolean } {
    const defs = new Map(fields.map((f) => [f.id, f]));
    const values: Values = {};
    let refused = false;
    for (const [id, raw] of Object.entries(patch)) {
      const field = defs.get(id);
      const value = field ? coerceFieldValue(field, raw) : undefined;
      if (value === undefined) refused = true;
      else if (value !== null) values[id] = value;
    }
    return { values, refused };
  }
}
