import { LeadImportService, importedDay } from './lead-import.service';
import type { ImportLeadRow } from '@vertex/shared';

const EXISTING = [
  { id: 'lead_mona', name: 'Mona Adel', email: 'mona@nile.co', phone: null, company: null, value: 0 },
  { id: 'lead_omar', name: null, email: null, phone: '+20 100 123 4567', company: 'Delta', value: 5000 },
];

function setup(role: 'OWNER' | 'MANAGER' | 'EMPLOYEE' = 'OWNER') {
  const created: Record<string, unknown>[] = [];
  const tx = {
    lead: {
      createManyAndReturn: jest.fn(async ({ data }: { data: Record<string, unknown>[] }) => {
        created.push(...data);
        return data.map((_, i) => ({ id: `new_${i + 1}` }));
      }),
      update: jest.fn(async () => ({})),
    },
    leadActivity: { createMany: jest.fn(async () => ({ count: 1 })), create: jest.fn(async () => ({})) },
  };
  const db = {
    pipelineStage: { findMany: jest.fn(async () => [{ id: 'st_new' }, { id: 'st_talk' }]) },
    membership: {
      findMany: jest.fn(async () => [
        { userId: 'u_me', user: { email: 'me@x.co' } },
        { userId: 'u_sara', user: { email: 'Sara@x.co' } },
      ]),
    },
    lead: { findMany: jest.fn(async () => EXISTING) },
    $transaction: jest.fn(async (fn: (t: typeof tx) => unknown) => fn(tx)),
  };
  const audit = { log: jest.fn(async () => undefined) };
  const notifications = { notify: jest.fn(async () => undefined) };
  const fields = {
    list: jest.fn(async () => [{ id: 'f_city', label: 'City', type: 'TEXT', options: [], order: 0 }, { id: 'f_size', label: 'Size', type: 'NUMBER', options: [], order: 1 }]),
    tolerant: jest.requireActual('./custom-fields.service').CustomFieldsService.prototype.tolerant,
  };
  const service = new LeadImportService({ client: db } as never, audit as never, notifications as never, fields as never);
  const tenant = { orgId: 'org1', userId: 'u_me', role } as const;
  const run = (rows: Partial<ImportLeadRow>[], opts: { duplicates?: 'skip' | 'fill'; dryRun?: boolean } = {}) =>
    service.import(tenant, { rows: rows.map((r, i) => ({ line: i + 2, ...r })), duplicates: opts.duplicates ?? 'skip', dryRun: opts.dryRun ?? false });
  return { service, db, tx, created, audit, notifications, run };
}

describe('importing leads from a spreadsheet', () => {
  it('creates the new ones, in the first stage, assigned to whoever imports them', async () => {
    const { run, created, tx } = setup();
    const out = await run([{ name: 'Hana Fathy', email: 'HANA@Studio.co', company: 'Studio', title: 'CEO', value: 1200.4, temperature: 'HOT', createdOn: '2025-03-01' }]);
    expect(out).toMatchObject({ created: 1, filled: 0, duplicates: 0, invalid: 0, rows: [{ line: 2, outcome: 'create', leadId: 'new_1' }] });
    expect(created[0]).toMatchObject({
      orgId: 'org1',
      assignedTo: 'u_me',
      stageId: 'st_new',
      email: 'hana@studio.co',
      value: 1200,
      temperature: 'HOT',
      source: 'import',
      createdAt: new Date('2025-03-01T12:00:00Z'),
    });
    // What has no column of its own is kept as the lead's first note.
    expect(tx.leadActivity.createMany).toHaveBeenCalledWith({ data: [expect.objectContaining({ leadId: 'new_1', type: 'NOTE' })] });
  });

  it('finds a lead already here by email or by phone, however the number was written', async () => {
    const { run, created } = setup();
    const out = await run([{ name: 'Mona', email: 'Mona@Nile.co' }, { name: 'Omar', phone: '01001234567' }]);
    expect(out.rows.map((r) => [r.outcome, r.leadId])).toEqual([
      ['duplicate', 'lead_mona'],
      ['duplicate', 'lead_omar'],
    ]);
    expect(created).toHaveLength(0);
  });

  it('takes a person written twice in the file once', async () => {
    const { run } = setup();
    const out = await run([{ name: 'Ali', phone: '0111 222 3334' }, { name: 'Ali S.', phone: '+201112223334' }]);
    expect(out.rows.map((r) => r.outcome)).toEqual(['create', 'duplicate']);
  });

  it('can fill in what a lead already here is missing, leaving what it has', async () => {
    const { run, tx } = setup();
    const out = await run([{ name: 'Someone else', email: 'mona@nile.co', phone: '0100 999 8887', company: 'Nile' }], { duplicates: 'fill' });
    expect(out.rows[0]).toMatchObject({ outcome: 'fill', leadId: 'lead_mona' });
    expect(tx.lead.update).toHaveBeenCalledWith({ where: { id: 'lead_mona' }, data: { phone: '0100 999 8887', company: 'Nile' } });
  });

  it('says which rows cannot be taken, and why', async () => {
    const { run } = setup();
    const out = await run([{ company: 'Only a company' }, { name: 'X', email: 'not-an-email' }, { name: 'Y', createdOn: '2099-01-01' }, { name: 'Z', createdOn: '2025-02-30' }]);
    expect(out.rows.map((r) => r.problem)).toEqual(['empty', 'badEmail', 'badDate', 'badDate']);
    expect(out.invalid).toBe(4);
  });

  it('hands rows to the teammates the file names, and tells each of them once', async () => {
    const { run, created, notifications } = setup('MANAGER');
    const out = await run([
      { name: 'A', owner: 'sara@x.co' },
      { name: 'B', owner: 'SARA@x.co' },
      { name: 'C', owner: 'nobody@x.co', stageId: 'st_elsewhere' },
      { name: 'D', stageId: 'st_talk' },
    ]);
    expect(created.map((c) => [c.assignedTo, c.stageId])).toEqual([
      ['u_sara', 'st_new'],
      ['u_sara', 'st_new'],
      ['u_me', 'st_new'],
      ['u_me', 'st_talk'],
    ]);
    expect(out.rows[2]!.notices).toEqual(['unknownOwner', 'unknownStage']);
    expect(notifications.notify).toHaveBeenCalledTimes(1);
    expect(notifications.notify).toHaveBeenCalledWith(expect.objectContaining({ userId: 'u_sara', type: 'lead.imported', metadata: { count: 2 } }));
  });

  it('keeps a member’s import theirs, and matches it only against the leads they see', async () => {
    const { run, created, db } = setup('EMPLOYEE');
    await run([{ name: 'A', owner: 'sara@x.co' }]);
    expect(created[0]!.assignedTo).toBe('u_me');
    expect(db.membership.findMany).not.toHaveBeenCalled();
    expect(db.lead.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { OR: [{ assignedTo: 'u_me' }, { card: { ownerId: 'u_me' } }] } }));
  });

  it('only says what would happen on a dry run', async () => {
    const { run, db, audit } = setup();
    const out = await run([{ name: 'New one' }, { email: 'mona@nile.co' }], { dryRun: true });
    expect(out).toMatchObject({ created: 1, duplicates: 1 });
    expect(db.$transaction).not.toHaveBeenCalled();
    expect(audit.log).not.toHaveBeenCalled();
  });
});

describe('the workspace’s own fields in a file', () => {
  it('are kept on new leads, a value that does not fit left out and said', async () => {
    const { run, created } = setup();
    const out = await run([{ name: 'A', customFields: { f_city: 'Giza', f_size: 'big' } }]);
    expect(created[0]).toMatchObject({ customFields: { f_city: 'Giza' } });
    expect(out.rows[0]!.notices).toEqual(['badField']);
  });
});

describe('importedDay', () => {
  it('takes a real past day, at noon so no time zone moves it', () => {
    const now = new Date('2026-10-05T00:00:00Z');
    expect(importedDay('2026-10-01', now)).toEqual(new Date('2026-10-01T12:00:00Z'));
    expect(importedDay(undefined, now)).toBeUndefined();
    expect(importedDay('2026-10-09', now)).toBeNull();
    expect(importedDay('1980-01-01', now)).toBeNull();
  });
});
