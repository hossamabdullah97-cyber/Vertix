import { createServer, type Server } from 'node:http';
import { call, expect, publishedCard, test } from './support';

interface Message {
  to: string;
  title: string;
  body: string;
  data: { url: string; leadId?: string; orgId?: string; notificationId?: string };
}

/** Expo's push service, on the port the API is told about (playwright.config.ts). */
class FakeExpo {
  private server!: Server;
  received: Message[] = [];
  /** What Expo answers for each phone: delivered, or the app is gone from it. */
  answer: 'ok' | 'DeviceNotRegistered' = 'ok';

  async start() {
    this.server = createServer((req, res) => {
      let raw = '';
      req.on('data', (c) => (raw += c));
      req.on('end', () => {
        const messages = JSON.parse(raw) as Message[];
        this.received.push(...messages);
        const data = messages.map(() =>
          this.answer === 'ok' ? { status: 'ok', id: 'ticket' } : { status: 'error', message: 'gone', details: { error: 'DeviceNotRegistered' } },
        );
        res.writeHead(200, { 'content-type': 'application/json' });
        res.end(JSON.stringify({ data }));
      });
    });
    await new Promise<void>((r) => this.server.listen(4108, '127.0.0.1', r));
  }

  stop() {
    this.server.close();
  }
}

test('the phone app gets a new lead on its lock screen, in its language, and a phone the app left is forgotten', async ({ account }) => {
  const expo = new FakeExpo();
  await expo.start();
  try {
    const phones = async () => (await account.api<{ phones: number }>('/notifications/push')).data.phones;
    const token = `ExponentPushToken[e2e-${Date.now()}]`;

    // 1. The app on a phone registers, in Arabic; anything but an Expo token is refused.
    expect((await account.api('/notifications/push/app', { method: 'POST', body: { token: 'not-a-token', platform: 'ios' } })).status).toBe(400);
    expect((await account.api('/notifications/push/app', { method: 'POST', body: { token, platform: 'ios', lang: 'ar' } })).status).toBe(201);
    expect(await phones()).toBe(1);

    // 2. A visitor leaves their details on a card: the phone is told, in Arabic, with where a tap goes.
    const card = await publishedCard(account, 'Push Owner');
    const lead = await call<{ leadId: string }>('/leads/capture', { body: { slug: card.slug, name: 'Salma Visitor', email: 'salma@example.com' } });
    expect(lead.status).toBe(201);
    await expect.poll(() => expo.received.filter((m) => m.to === token).length).toBe(1);
    const message = expo.received.find((m) => m.to === token)!;
    expect(message.title).toBe('عميل جديد');
    expect(message.body).toContain('Salma Visitor');
    expect(message.data.leadId).toBe(lead.data.leadId);
    expect(message.data.url).toContain(`/leads?lead=${lead.data.leadId}`);
    expect(message.data.orgId).toBe(account.orgId);

    // 3. The app was removed from the phone: Expo says so, and the phone is forgotten.
    expo.answer = 'DeviceNotRegistered';
    await call('/leads/capture', { body: { slug: card.slug, name: 'Second Visitor', email: 'second@example.com' } });
    await expect.poll(phones).toBe(0);

    // 4. Signing out of the app stops it on that phone.
    expect((await account.api('/notifications/push/app', { method: 'POST', body: { token, platform: 'android', lang: 'en' } })).status).toBe(201);
    expect((await account.api('/notifications/push/app', { method: 'DELETE', body: { token } })).status).toBe(200);
    expect(await phones()).toBe(0);
  } finally {
    expo.stop();
  }
});

test('Sign in with Apple stays hidden and refused until the server has it set up', async () => {
  expect((await call<{ apple: boolean }>('/auth/providers')).data.apple).toBe(false);
  const refused = await call('/auth/apple', { body: { identityToken: 'x'.repeat(40), nonce: 'n'.repeat(32) } });
  expect(refused.status).toBe(503);
});
