/**
 * Reads a photo of a paper business card with Claude and gives back the
 * contact on it. The model is made to answer through a tool, so what comes
 * back is structured, and it is told to leave out what is not printed rather
 * than guess. Nothing is kept here: the photo is read and forgotten.
 */

export interface ScannedContact {
  name: string | null;
  /** The name in the card's other script, when it has both. */
  nameAlt: string | null;
  title: string | null;
  company: string | null;
  emails: string[];
  phones: string[];
  website: string | null;
  address: string | null;
}

export class CardScanError extends Error {
  constructor(
    message: string,
    /** "not-a-card" when the photo shows no business card; "failed" otherwise. */
    readonly kind: 'not-a-card' | 'failed',
  ) {
    super(message);
  }
}

const TOOL = {
  name: 'record_contact',
  description: 'Record the contact details printed on the business card in the photo.',
  input_schema: {
    type: 'object',
    properties: {
      is_business_card: { type: 'boolean', description: 'False when the photo does not show a business card.' },
      name: { type: 'string', description: "The person's name, as printed." },
      name_alt: { type: 'string', description: 'The same name in the other script, when the card has both Arabic and English.' },
      title: { type: 'string', description: 'Job title.' },
      company: { type: 'string', description: 'Company or organisation.' },
      emails: { type: 'array', items: { type: 'string' } },
      phones: { type: 'array', items: { type: 'string' }, description: 'Phone and mobile numbers, with country code when printed.' },
      website: { type: 'string' },
      address: { type: 'string' },
    },
    required: ['is_business_card'],
  },
} as const;

const PROMPT =
  'This is a photo of a business card. It may be in Arabic, English, or both. ' +
  'Record the details exactly as printed, keeping Arabic in Arabic. When the card has the name in both Arabic and English, ' +
  'put the more prominent one in `name` and the other in `name_alt`. Leave out anything that is not on the card: never guess or complete it.';

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const text = (v: unknown, max = 160) => (typeof v === 'string' && v.trim() ? v.replace(/\s+/g, ' ').trim().slice(0, max) : null);
const list = (v: unknown, max: number) => (Array.isArray(v) ? v.map((x) => text(x, 60)).filter((x): x is string => !!x).slice(0, max) : []);

/** What the model gave, cleaned: trimmed, bounded, and only real emails. */
export function contactOf(input: Record<string, unknown>): ScannedContact {
  if (input.is_business_card === false) throw new CardScanError('Not a business card', 'not-a-card');
  const c: ScannedContact = {
    name: text(input.name, 120),
    nameAlt: text(input.name_alt, 120),
    title: text(input.title, 120),
    company: text(input.company, 120),
    emails: list(input.emails, 3).map((e) => e.toLowerCase().replace(/^mailto:/, '')).filter((e) => EMAIL.test(e)),
    phones: list(input.phones, 4).filter((p) => (p.match(/\d/g) ?? []).length >= 6),
    website: text(input.website, 200),
    address: text(input.address, 240),
  };
  if (!c.name && !c.company && !c.emails.length && !c.phones.length) throw new CardScanError('Nothing readable on the card', 'not-a-card');
  return c;
}

export class CardScanner {
  constructor(
    private readonly apiKey: string,
    private readonly model: string,
    private readonly http: typeof fetch = fetch,
  ) {}

  async read(image: { mediaType: string; base64: string }): Promise<ScannedContact> {
    let res: Response;
    try {
      res = await this.http('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: { 'x-api-key': this.apiKey, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
        body: JSON.stringify({
          model: this.model,
          max_tokens: 1024,
          tools: [TOOL],
          tool_choice: { type: 'tool', name: TOOL.name },
          messages: [
            {
              role: 'user',
              content: [
                { type: 'image', source: { type: 'base64', media_type: image.mediaType, data: image.base64 } },
                { type: 'text', text: PROMPT },
              ],
            },
          ],
        }),
        signal: AbortSignal.timeout(45_000),
      });
    } catch (err) {
      throw new CardScanError(`Could not reach the reader: ${(err as Error).message}`, 'failed');
    }
    const body = (await res.json().catch(() => null)) as { content?: { type: string; name?: string; input?: Record<string, unknown> }[]; error?: { message?: string } } | null;
    if (!res.ok) throw new CardScanError(`Reader refused (${res.status}): ${body?.error?.message ?? ''}`.trim(), 'failed');
    const call = body?.content?.find((c) => c.type === 'tool_use' && c.name === TOOL.name);
    if (!call?.input) throw new CardScanError('Reader gave no answer', 'failed');
    return contactOf(call.input);
  }
}
