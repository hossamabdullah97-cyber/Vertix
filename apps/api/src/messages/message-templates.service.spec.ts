import { MessageTemplatesService } from './message-templates.service';

const tenant = { orgId: 'o1', userId: 'u1', role: 'MANAGER' } as never;

function setup(existing: unknown[], settings: Record<string, unknown> | null = null) {
  const created: unknown[] = [];
  const tx = {
    $queryRaw: jest.fn().mockResolvedValue([{ ok: true }]),
    organization: { findUnique: jest.fn().mockResolvedValue({ settings }), update: jest.fn() },
    messageTemplate: { createMany: jest.fn(async ({ data }: { data: unknown[] }) => created.push(...data)) },
  };
  const db = {
    messageTemplate: { findMany: jest.fn().mockResolvedValueOnce(existing).mockImplementation(async () => created) },
    organization: { findUnique: jest.fn().mockResolvedValue({ settings }) },
    $transaction: jest.fn(async (fn: (t: typeof tx) => unknown) => fn(tx)),
  };
  return { service: new MessageTemplatesService({ client: db } as never), db, tx, created };
}

describe('MessageTemplatesService', () => {
  it('gives a new workspace a starting set in the language it is opened in, once', async () => {
    const { service, tx, created } = setup([]);
    const list = (await service.list(tenant, 'ar')) as unknown as { name: string; channel: string; orgId: string }[];
    expect(list.length).toBe(4);
    expect(list[0]).toMatchObject({ name: 'سعدت بلقائك', channel: 'WHATSAPP', orgId: 'o1' });
    expect(created.some((t) => (t as { channel: string }).channel === 'EMAIL')).toBe(true);
    expect(tx.organization.update).toHaveBeenCalledWith({ where: { id: 'o1' }, data: { settings: { templatesSeeded: true } } });
  });

  it('does not bring the starting set back once a workspace deleted it', async () => {
    const { service, db } = setup([], { templatesSeeded: true });
    await expect(service.list(tenant, 'en')).resolves.toEqual([]);
    expect(db.$transaction).not.toHaveBeenCalled();
  });
});
