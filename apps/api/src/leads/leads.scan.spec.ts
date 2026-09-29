import { ServiceUnavailableException, UnprocessableEntityException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { LeadsService, SCAN_LIMIT } from './leads.service';

function setup(opts: { key?: string; blocked?: number } = {}) {
  const db = {
    pipelineStage: { findFirst: jest.fn(async () => ({ id: 'stage1' })) },
    lead: { create: jest.fn(async ({ data }: { data: Record<string, unknown> }) => ({ id: 'lead1', ...data })) },
    leadActivity: { create: jest.fn(async () => ({})) },
  };
  const throttle = { blockedFor: jest.fn(async () => opts.blocked ?? 0), hit: jest.fn(async () => 1) };
  const webhooks = { emit: jest.fn(async () => {}) };
  const service = new LeadsService(
    { client: db } as never,
    {} as never,
    webhooks as never,
    new ConfigService(opts.key ? { ANTHROPIC_API_KEY: opts.key } : {}),
    throttle as never,
    {} as never,
    {} as never,
  );
  return { service, db, throttle, webhooks };
}

const tenant = { orgId: 'org1', userId: 'u1', role: 'EMPLOYEE' } as never;
const photo = { mediaType: 'image/jpeg', base64: '/9j/4AAQ' };

describe('LeadsService.scanCard', () => {
  afterEach(() => jest.restoreAllMocks());

  it('is off until the server has a key', async () => {
    expect(setup().service.scanAvailable()).toEqual({ available: false });
    expect(setup({ key: 'k' }).service.scanAvailable()).toEqual({ available: true });
    await expect(setup().service.scanCard('u1', photo)).rejects.toBeInstanceOf(ServiceUnavailableException);
  });

  it('reads the photo and counts it against the hourly limit', async () => {
    const { service, throttle } = setup({ key: 'k' });
    jest.spyOn(global, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ content: [{ type: 'tool_use', name: 'record_contact', input: { is_business_card: true, name: 'Omar Adel', phones: ['01001234567'] } }] })),
    );
    await expect(service.scanCard('u1', photo)).resolves.toMatchObject({ name: 'Omar Adel', phones: ['01001234567'] });
    expect(throttle.hit).toHaveBeenCalledWith('card-scan:u1', expect.any(Number));
    expect(throttle.blockedFor).toHaveBeenCalledWith('card-scan:u1', SCAN_LIMIT, expect.any(Number));
  });

  it('says plainly when the photo is not a card', async () => {
    const { service } = setup({ key: 'k' });
    jest.spyOn(global, 'fetch').mockResolvedValue(new Response(JSON.stringify({ content: [{ type: 'tool_use', name: 'record_contact', input: { is_business_card: false } }] })));
    await expect(service.scanCard('u1', photo)).rejects.toBeInstanceOf(UnprocessableEntityException);
  });

  it('stops at the hourly limit before calling the reader', async () => {
    const { service } = setup({ key: 'k', blocked: 900 });
    const fetch = jest.spyOn(global, 'fetch');
    await expect(service.scanCard('u1', photo)).rejects.toMatchObject({ status: 429 });
    expect(fetch).not.toHaveBeenCalled();
  });
});

describe('LeadsService.create', () => {
  it('adds the lead to the first stage, assigned to whoever added it, with the extras as a note', async () => {
    const { service, db, webhooks } = setup();
    await service.create(tenant, { name: 'Omar Adel', email: 'omar@x.co', phone: '010', company: 'Nile', title: 'CEO', website: 'nile.co', source: 'card_scan' });
    expect(db.lead.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ orgId: 'org1', assignedTo: 'u1', stageId: 'stage1', name: 'Omar Adel', source: 'card_scan', temperature: 'WARM' }),
    }));
    expect(db.leadActivity.create).toHaveBeenCalledWith({ data: expect.objectContaining({ leadId: 'lead1', type: 'NOTE', metadata: expect.objectContaining({ note: 'CEO\nnile.co', title: 'CEO' }) }) });
    expect(webhooks.emit).toHaveBeenCalledWith('org1', 'lead.created', expect.objectContaining({ leadId: 'lead1', source: 'card_scan' }));
  });

  it('adds no note when there is nothing extra', async () => {
    const { service, db } = setup();
    await service.create(tenant, { name: 'Mona', source: 'manual' });
    expect(db.leadActivity.create).not.toHaveBeenCalled();
  });
});
