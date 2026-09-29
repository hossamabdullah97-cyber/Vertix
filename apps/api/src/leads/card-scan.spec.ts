import { CardScanError, CardScanner, contactOf } from './card-scan';

const answer = (input: Record<string, unknown>, status = 200) =>
  new Response(JSON.stringify(status === 200 ? { content: [{ type: 'tool_use', name: 'record_contact', input }] } : { error: { message: 'bad key' } }), { status });

describe('CardScanner', () => {
  it('sends the photo to Claude and reads the structured answer', async () => {
    const http = jest.fn(async () =>
      answer({ is_business_card: true, name: 'مريم خالد', name_alt: 'Mariam Khaled', title: 'Sales Director', company: 'Vertex Build', emails: ['Mariam@Vertex.io'], phones: ['+20 100 123 4567'], website: 'vertex.io' }),
    );
    const scanner = new CardScanner('key', 'claude-haiku-4-5-20251001', http as never);
    const c = await scanner.read({ mediaType: 'image/jpeg', base64: 'AAAA' });
    expect(c).toEqual({ name: 'مريم خالد', nameAlt: 'Mariam Khaled', title: 'Sales Director', company: 'Vertex Build', emails: ['mariam@vertex.io'], phones: ['+20 100 123 4567'], website: 'vertex.io', address: null });
    const [url, init] = http.mock.calls[0] as unknown as [string, { headers: Record<string, string>; body: string }];
    expect(url).toBe('https://api.anthropic.com/v1/messages');
    expect(init.headers['x-api-key']).toBe('key');
    const body = JSON.parse(init.body);
    expect(body.model).toBe('claude-haiku-4-5-20251001');
    expect(body.tool_choice).toEqual({ type: 'tool', name: 'record_contact' });
    expect(body.messages[0].content[0]).toEqual({ type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: 'AAAA' } });
  });

  it('says when the reader refuses or cannot be reached', async () => {
    await expect(new CardScanner('k', 'm', (async () => answer({}, 401)) as never).read({ mediaType: 'image/png', base64: 'A' })).rejects.toMatchObject({ kind: 'failed' });
    await expect(new CardScanner('k', 'm', (async () => { throw new Error('offline'); }) as never).read({ mediaType: 'image/png', base64: 'A' })).rejects.toMatchObject({ kind: 'failed' });
  });
});

describe('contactOf', () => {
  it('keeps only real emails and phone-like numbers, trimmed', () => {
    const c = contactOf({ is_business_card: true, name: '  Omar   Adel ', emails: ['omar@x.co', 'not an email', 'mailto:a@b.co'], phones: ['12', '010 0123 4567'] });
    expect(c.name).toBe('Omar Adel');
    expect(c.emails).toEqual(['omar@x.co', 'a@b.co']);
    expect(c.phones).toEqual(['010 0123 4567']);
  });

  it('tells a photo that is not a card apart', () => {
    expect(() => contactOf({ is_business_card: false })).toThrow(CardScanError);
    expect(() => contactOf({ is_business_card: true, title: 'Only a title' })).toThrow('Nothing readable');
  });
});
