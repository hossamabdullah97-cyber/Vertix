import { BadRequestException, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { LeadAlertsService } from './lead-alerts.service';

function setup(opts: { row?: Record<string, unknown> | null; whatsapp?: boolean; deleted?: boolean } = {}) {
  const store = { row: opts.row ?? null } as { row: Record<string, unknown> | null };
  const db = {
    leadAlertSettings: {
      findUnique: jest.fn(async () => store.row),
      upsert: jest.fn(async ({ create, update }: { create: Record<string, unknown>; update: Record<string, unknown> }) => {
        store.row = store.row ? { ...store.row, ...update } : create;
        return store.row;
      }),
    },
    user: { findUnique: jest.fn(async () => ({ email: 'owner@example.com', deletedAt: opts.deleted ? new Date() : null })) },
  };
  const mail = { send: jest.fn(async () => true) };
  const throttle = { blockedFor: jest.fn(async () => 0), hit: jest.fn(async () => 1) };
  const config = new ConfigService({
    APP_PUBLIC_URL: 'https://app.example/',
    ...(opts.whatsapp ? { WHATSAPP_TOKEN: 't', WHATSAPP_PHONE_NUMBER_ID: '123' } : {}),
  });
  const service = new LeadAlertsService({ client: db } as never, mail as never, config, throttle as never);
  const http = jest.fn(async () => new Response(JSON.stringify({ messages: [{ id: 'wamid.1' }] }), { status: 200 }));
  const wa = (service as unknown as { wa: { http: unknown } | null }).wa;
  if (wa) (wa as { http: unknown }).http = http;
  return { service, db, mail, http, store, throttle };
}

const alert = {
  leadId: 'lead1',
  intent: 'CONTACT' as const,
  name: 'Omar',
  phone: '+201001234567',
  timezone: 'Africa/Cairo',
  cardName: 'Mariam',
};

describe('LeadAlertsService', () => {
  it('emails by default, with a link to the lead', async () => {
    const { service, mail, http } = setup({ whatsapp: true });
    await service.leadCaptured('u1', alert);
    expect(mail.send).toHaveBeenCalledWith(expect.objectContaining({ to: 'owner@example.com', subject: 'Omar shared their details' }));
    expect((mail.send.mock.calls[0] as unknown as [{ html: string }])[0].html).toContain('https://app.example/leads?lead=lead1');
    expect(http).not.toHaveBeenCalled();
  });

  it("writes in the card's language until the owner picks one", async () => {
    const fresh = setup();
    await fresh.service.leadCaptured('u1', { ...alert, lang: 'ar' });
    expect(fresh.mail.send).toHaveBeenCalledWith(expect.objectContaining({ subject: 'Omar شارك بياناته' }));

    const chosen = setup({ row: { email: true, whatsapp: false, phone: null, lang: 'en' } });
    await chosen.service.leadCaptured('u1', { ...alert, lang: 'ar' });
    expect(chosen.mail.send).toHaveBeenCalledWith(expect.objectContaining({ subject: 'Omar shared their details' }));
  });

  it('sends the WhatsApp template in the owner’s language when turned on', async () => {
    const { service, mail, http } = setup({ whatsapp: true, row: { email: false, whatsapp: true, phone: '201001234567', lang: 'ar' } });
    await service.leadCaptured('u1', alert);
    expect(mail.send).not.toHaveBeenCalled();
    const [url, init] = http.mock.calls[0] as unknown as [string, { body: string }];
    expect(url).toBe('https://graph.facebook.com/v21.0/123/messages');
    const body = JSON.parse(init.body);
    expect(body.to).toBe('201001234567');
    expect(body.template.name).toBe('new_lead');
    expect(body.template.language.code).toBe('ar');
    expect(body.template.components[1].parameters[0].text).toBe('lead1');
  });

  it('never throws, whatever a channel does', async () => {
    const { service, mail, http } = setup({ whatsapp: true, row: { email: true, whatsapp: true, phone: '201001234567', lang: 'en' } });
    mail.send.mockRejectedValueOnce(new Error('down'));
    http.mockResolvedValueOnce(new Response('{"error":{}}', { status: 400 }));
    await expect(service.leadCaptured('u1', alert)).resolves.toBeUndefined();
  });

  it('says nothing to a deleted account', async () => {
    const { service, mail } = setup({ deleted: true });
    await service.leadCaptured('u1', alert);
    expect(mail.send).not.toHaveBeenCalled();
  });

  it('keeps the number in international form and checks it', async () => {
    const { service } = setup({ whatsapp: true });
    await expect(service.update('u1', { phone: '010 0123 4567' })).resolves.toMatchObject({ phone: '201001234567' });
    await expect(service.update('u1', { phone: '123' })).rejects.toBeInstanceOf(BadRequestException);
  });

  it('turns WhatsApp on only with a number, and only when the server can send', async () => {
    await expect(setup({ whatsapp: false }).service.update('u1', { whatsapp: true, phone: '+201001234567' })).rejects.toBeInstanceOf(ServiceUnavailableException);
    await expect(setup({ whatsapp: true }).service.update('u1', { whatsapp: true })).rejects.toBeInstanceOf(BadRequestException);
    const { service } = setup({ whatsapp: true });
    await expect(service.update('u1', { whatsapp: true, phone: '+201001234567' })).resolves.toMatchObject({ whatsapp: true, whatsappReady: true });
    await expect(service.update('u1', { phone: null })).resolves.toMatchObject({ whatsapp: false, phone: null });
  });

  it('limits test messages', async () => {
    const { service, throttle, http } = setup({ whatsapp: true, row: { phone: '201001234567', lang: 'en' } });
    await expect(service.sendTest('u1')).resolves.toEqual({ ok: true });
    expect(http).toHaveBeenCalledTimes(1);
    throttle.blockedFor.mockResolvedValueOnce(900);
    await expect(service.sendTest('u1')).rejects.toMatchObject({ status: 429 });
  });

  it('emails a sample alert on request, without WhatsApp being set up', async () => {
    const { service, mail } = setup({ row: { email: true, whatsapp: false, phone: null, lang: 'ar' } });
    await expect(service.sendTest('u1', 'email')).resolves.toEqual({ ok: true });
    expect(mail.send).toHaveBeenCalledWith(expect.objectContaining({ to: 'owner@example.com', subject: 'زائر تجريبي يطلب اجتماعاً' }));
  });
});
