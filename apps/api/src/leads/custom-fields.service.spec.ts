import { BadRequestException, NotFoundException } from '@nestjs/common';
import { MAX_CUSTOM_FIELDS } from '@vertex/shared';
import { CustomFieldsService, DUPLICATE_FIELD, TOO_MANY_FIELDS } from './custom-fields.service';

const FIELDS = [
  { id: 'f_budget', label: 'Budget', type: 'NUMBER', options: [], order: 0 },
  { id: 'f_ind', label: 'Industry', type: 'SELECT', options: ['Retail', 'Real estate'], order: 1 },
  { id: 'f_vip', label: 'VIP', type: 'CHECKBOX', options: [], order: 2 },
];

function setup(fields: unknown[] = FIELDS) {
  const db = {
    customField: {
      findMany: jest.fn(async () => fields),
      create: jest.fn(async ({ data }: { data: Record<string, unknown> }) => ({ id: 'f_new', ...data })),
      update: jest.fn(async ({ data }: { where: { id: string }; data: Record<string, unknown> }) => ({ id: "f_ind", ...data })),
      deleteMany: jest.fn(async () => ({ count: 1 })),
    },
    $executeRaw: jest.fn(async () => 2),
    $transaction: jest.fn(async (ops: unknown[]) => ops),
  };
  const service = new CustomFieldsService({ client: db } as never);
  const tenant = { orgId: 'org1', userId: 'u1', role: 'OWNER' } as const;
  return { service, db, tenant };
}

describe('a workspace’s own fields', () => {
  it('are added at the end, and only choice fields keep options', async () => {
    const { service, db, tenant } = setup();
    await service.create(tenant, { label: 'City', type: 'TEXT', options: ['ignored'] });
    expect(db.customField.create).toHaveBeenCalledWith(expect.objectContaining({ data: { orgId: 'org1', label: 'City', type: 'TEXT', options: [], order: 3 } }));
  });

  it('refuses a second field with the same name, and more than the limit', async () => {
    const { service, tenant } = setup();
    await expect(service.create(tenant, { label: 'budget', type: 'TEXT', options: [] })).rejects.toThrow(DUPLICATE_FIELD);
    const full = setup(Array.from({ length: MAX_CUSTOM_FIELDS }, (_, i) => ({ id: `f${i}`, label: `F${i}`, type: 'TEXT', options: [], order: i })));
    await expect(full.service.create(tenant, { label: 'One more', type: 'TEXT', options: [] })).rejects.toThrow(TOO_MANY_FIELDS);
  });

  it('takes a deleted field’s values off every lead of the workspace', async () => {
    const { service, db, tenant } = setup();
    await service.remove(tenant, 'f_vip');
    expect(db.$executeRaw).toHaveBeenCalledTimes(1);
    const sql = (db.$executeRaw.mock.calls[0] as unknown as [TemplateStringsArray, ...unknown[]]);
    expect(sql.slice(1)).toEqual(['f_vip', 'org1', 'f_vip']);
    db.customField.deleteMany.mockResolvedValue({ count: 0 });
    await expect(service.remove(tenant, 'nope')).rejects.toBeInstanceOf(NotFoundException);
  });

  it('puts them in the order given', async () => {
    const { service, db } = setup();
    await service.reorder(['f_vip', 'f_budget']);
    expect(db.customField.update.mock.calls.map(([a]) => [a.where.id, a.data.order])).toEqual([
      ['f_vip', 0],
      ['f_budget', 1],
      ['f_ind', 2],
    ]);
  });
});

describe('values on a lead', () => {
  it('are set, kept, and cleared by field id', async () => {
    const { service } = setup();
    const next = await service.apply({ f_budget: 100, f_vip: true }, { f_ind: 'retail', f_vip: '' });
    expect(next).toEqual({ f_budget: 100, f_ind: 'Retail' });
  });

  it('refuse another workspace’s field, or a value that does not fit, saying which', async () => {
    const { service } = setup();
    await expect(service.apply({}, { f_elsewhere: 'x' })).rejects.toThrow('Unknown field');
    await expect(service.apply({}, { f_ind: 'Banking' })).rejects.toThrow(new BadRequestException(`"Industry" can't take that value`));
  });

  it('on an import, keep what fits and say if something did not', () => {
    const { service } = setup();
    expect(service.tolerant({ f_budget: '5,000', f_ind: 'Banking', f_vip: 'نعم' }, FIELDS as never)).toEqual({ values: { f_budget: 5000, f_vip: true }, refused: true });
  });
});
