import { createServer, type Server } from 'node:http';
import { call, expect, publishedCard, signIn, test } from './support';

/** Google, on the port the API is told about (playwright.config.ts): sign-in, tokens and the Calendar API. */
class FakeGoogle {
  private server!: Server;
  events: { method: string; path: string; body: Record<string, unknown> | undefined }[] = [];
  busy: { start: string; end: string }[] = [];

  async start() {
    this.server = createServer((req, res) => {
      let raw = '';
      req.on('data', (c) => (raw += c));
      req.on('end', () => {
        const url = new URL(req.url!, 'http://localhost:4106');
        const json = (status: number, body?: unknown) => {
          res.writeHead(status, { 'content-type': 'application/json' });
          res.end(body === undefined ? '' : JSON.stringify(body));
        };
        if (url.pathname === '/authorize') {
          // The person agrees at once.
          res.writeHead(302, { location: `${url.searchParams.get('redirect_uri')}?code=c-1&state=${encodeURIComponent(url.searchParams.get('state')!)}` });
          return res.end();
        }
        if (url.pathname === '/token') {
          const idToken = `x.${Buffer.from(JSON.stringify({ email: 'hana.owner@gmail.com' })).toString('base64url')}.y`;
          return json(200, { access_token: 'g-access', refresh_token: 'g-refresh', expires_in: 3600, id_token: idToken });
        }
        if (req.headers.authorization !== 'Bearer g-access') return json(401, { error: 'unauthorized' });
        if (url.pathname === '/freeBusy') return json(200, { calendars: { primary: { busy: this.busy } } });
        const body = raw ? (JSON.parse(raw) as Record<string, unknown>) : undefined;
        this.events.push({ method: req.method!, path: url.pathname, body });
        if (req.method === 'POST') return json(200, { id: 'evt-e2e', htmlLink: 'https://calendar.google.com/calendar/event?eid=e2e' });
        if (req.method === 'PATCH') return json(200, { id: 'evt-e2e' });
        return json(204);
      });
    });
    await new Promise<void>((r) => this.server.listen(4106, '127.0.0.1', r));
  }

  stop() {
    this.server.close();
  }
}

type Day = { date: string; slots: { time: string; at: string }[] };

test('a card owner connects their Google Calendar: busy times leave the card, and requests land in it', async ({ page, account }) => {
  const google = new FakeGoogle();
  await google.start();
  try {
    const card = await publishedCard(account, 'Hana Owner');
    // Meetings every day, 09:00–17:00 Cairo, half an hour each, no notice.
    const theme = { availability: { enabled: true, timezone: 'Africa/Cairo', days: [0, 1, 2, 3, 4, 5, 6], start: '09:00', end: '17:00', length: 30, notice: 0 } };
    expect((await account.api(`/cards/${card.id}`, { method: 'PATCH', body: { theme } })).status).toBe(200);
    const slots = async () => (await call<{ days: Day[] }>(`/c/${card.slug}/availability`)).data.days.flatMap((d) => d.slots.map((s) => s.at));
    const before = await slots();
    const [taken, asked] = [before[2]!, before[5]!];
    // The owner is busy at the third time the card offers.
    google.busy = [{ start: taken, end: new Date(new Date(taken).getTime() + 30 * 60_000).toISOString() }];

    // 1. From the card's meeting hours, the owner connects their own calendar.
    await signIn(page, account);
    await page.goto(`/cards/${card.id}`);
    const row = page.getByTestId('calendar-connect');
    await expect(row).toContainText('Connect your calendar');
    await row.getByRole('button', { name: 'Connect' }).click();
    await page.waitForURL(new RegExp(`/cards/${card.id}`));
    await expect(row).toContainText('Connected as');
    await expect(row).toContainText('hana.owner@gmail.com');
    await expect(row).toContainText('Your busy times are now left out');
    expect(new URL(page.url()).searchParams.get('connected')).toBeNull();

    // 2. The busy time is no longer offered, and cannot be asked for.
    const after = await slots();
    expect(after).not.toContain(taken);
    expect(after).toContain(asked);
    const refused = await call('/leads/capture', { body: { slug: card.slug, name: 'Too Late', email: 'late@example.com', intent: 'MEETING', meetingAt: taken } });
    expect(refused.status).toBe(409);

    // 3. A visitor asks for a free time: it is held on the calendar, tentatively.
    const sent = await call<{ leadId: string }>('/leads/capture', { body: { slug: card.slug, name: 'Laila Visitor', email: 'laila@example.com', company: 'Nile Foods', intent: 'MEETING', meetingAt: asked } });
    expect(sent.status).toBe(201);
    await expect.poll(() => google.events.filter((e) => e.method === 'POST').length).toBe(1);
    expect(google.events[0]!.body).toMatchObject({ summary: 'Meeting request: Laila Visitor (Nile Foods)', status: 'tentative', start: { dateTime: asked, timeZone: 'Africa/Cairo' } });

    // 4. The owner sees it held, accepts, and the calendar event is the meeting.
    await page.goto(`/leads?lead=${sent.data.leadId}`);
    const drawer = page.getByRole('dialog');
    await expect(drawer.getByTestId('meeting-calendar')).toHaveText('Held on your Google Calendar until you answer');
    await drawer.getByRole('button', { name: 'Accept', exact: true }).click();
    await drawer.getByRole('button', { name: /Accept and/ }).click();
    await expect(drawer.getByTestId('meeting-calendar')).toHaveText('On your Google Calendar');
    expect(google.events.at(-1)).toMatchObject({ method: 'PATCH', path: '/calendars/primary/events/evt-e2e', body: { status: 'confirmed', summary: 'Meeting with Laila Visitor' } });

    // 5. Disconnected: the card offers every time again.
    await page.goto(`/cards/${card.id}`);
    await row.getByRole('button', { name: 'Disconnect' }).click();
    await expect(row).toContainText('Connect your calendar');
    expect(await slots()).toContain(taken);
  } finally {
    google.stop();
  }
});
