import { createServer, type Server } from 'node:http';
import { call, expect, signIn, test } from './support';

/** Zapier's hooks, on the address the API lets tests use (playwright.config.ts). */
class FakeZapier {
  private server!: Server;
  received: { path: string; body: Record<string, unknown> }[] = [];

  async start() {
    this.server = createServer((req, res) => {
      let raw = '';
      req.on('data', (c) => (raw += c));
      req.on('end', () => {
        this.received.push({ path: req.url!, body: JSON.parse(raw || '{}') });
        res.writeHead(200, { 'content-type': 'application/json' });
        res.end('{"status":"success"}');
      });
    });
    await new Promise<void>((r) => this.server.listen(4107, '127.0.0.1', r));
  }

  stop() {
    this.server.close();
  }
}

test('Zaps start from Vertex events and add leads back, with an API key or from the Integrations page', async ({ page, account }) => {
  const zapier = new FakeZapier();
  await zapier.start();
  try {
    // The key the Vertex Connect app in Zapier signs in with.
    const created = await account.api<{ key: string }>('/api-keys', { body: { name: 'Zapier', scopes: ['crm:read', 'crm:write', 'integration:read', 'integration:write'] } });
    expect(created.status, JSON.stringify(created.data)).toBe(201);
    const key = created.data.key;
    const zap = <T = unknown>(path: string, opts: { method?: string; body?: unknown } = {}) => call<T>(path, { ...opts, token: key });

    // 1. Zapier tests the connection and names it after the workspace.
    const me = await zap<{ workspace: string }>('/zapier/me');
    expect(me.status).toBe(200);
    expect(me.data.workspace).toBeTruthy();

    // 2. A Zap turned on subscribes; another site is refused.
    expect((await zap('/zapier/hooks', { body: { hookUrl: 'https://example.com/steal', event: 'lead.created' } })).status).toBe(400);
    const sub = await zap<{ id: string }>('/zapier/hooks', { body: { hookUrl: 'http://localhost:4107/hooks/catch/1/new-lead/', event: 'lead.created' } });
    expect(sub.status, JSON.stringify(sub.data)).toBe(201);

    // 3. The Zap adds a lead: it is marked as from Zapier, and it is what the subscribed Zap is sent.
    const lead = await zap<{ id: string; source: string }>('/leads', { body: { name: 'Zap Lead', email: 'zap@example.com', source: 'zapier' } });
    expect(lead.status, JSON.stringify(lead.data)).toBe(201);
    expect(lead.data.source).toBe('zapier');
    const samples = await zap<{ name: string; leadId: string }[]>('/zapier/samples/lead.created');
    expect(samples.data[0]).toMatchObject({ name: 'Zap Lead', leadId: lead.data.id });
    // Delivered by the webhook queue (its poller is off under tests): queued for the Zap's hook.
    const log = await account.api<{ items?: { event: string; endpointId?: string }[] } | { event: string }[]>('/webhooks/deliveries/log');
    const deliveries = Array.isArray(log.data) ? log.data : log.data.items ?? [];
    expect(deliveries.some((d) => d.event === 'lead.created')).toBe(true);

    // 4. From the Integrations page: the Zap is listed, an example is sent, and it is removed.
    await signIn(page, account);
    await page.goto('/integrations');
    await page.getByRole('button', { name: /Zapier/ }).first().click();
    const sheet = page.getByRole('dialog');
    await expect(sheet.getByTestId('zapier-hook')).toHaveCount(1);
    await expect(sheet.getByTestId('zapier-hook')).toContainText('Lead captured');
    await sheet.getByRole('button', { name: 'Send an example', exact: true }).click();
    await expect(sheet.getByText('An example was sent')).toBeVisible();
    await expect.poll(() => zapier.received.length).toBe(1);
    expect(zapier.received[0]).toMatchObject({ path: '/hooks/catch/1/new-lead/', body: { event: 'lead.created', test: true, data: { name: 'Zap Lead' } } });

    // A second Zap, from a Catch Hook address pasted in: connected, and sent an example straight away.
    await sheet.getByLabel('Start the Zap when').selectOption('meeting.requested');
    await sheet.getByLabel('Zapier webhook address').fill('http://localhost:4107/hooks/catch/1/meetings/');
    await sheet.getByRole('button', { name: 'Connect and send an example' }).click();
    await expect(sheet.getByTestId('zapier-hook')).toHaveCount(2);
    await expect.poll(() => zapier.received.length).toBe(2);
    expect(zapier.received[1]).toMatchObject({ path: '/hooks/catch/1/meetings/', body: { event: 'meeting.requested' } });

    // 5. The Zap turned off unsubscribes.
    expect((await zap(`/zapier/hooks/${sub.data.id}`, { method: 'DELETE' })).status).toBe(200);
    expect((await account.api<unknown[]>('/zapier/hooks')).data).toHaveLength(1);
  } finally {
    zapier.stop();
  }
});
