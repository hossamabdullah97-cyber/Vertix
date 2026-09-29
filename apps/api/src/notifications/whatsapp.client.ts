/**
 * Sends template messages through the WhatsApp Business Cloud API (Meta).
 * A business may only start a conversation with an approved template, so
 * alerts use one, in the recipient's language.
 */

export interface WhatsAppConfig {
  token: string;
  phoneNumberId: string;
  template: string;
  apiVersion: string;
}

export class WhatsAppError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

export class WhatsAppClient {
  constructor(
    readonly config: WhatsAppConfig,
    private readonly http: typeof fetch = fetch,
  ) {}

  async sendTemplate(input: { to: string; lang: 'en' | 'ar'; body: string[]; buttonSuffix?: string }): Promise<string | null> {
    const components: unknown[] = [{ type: 'body', parameters: input.body.map((text) => ({ type: 'text', text })) }];
    if (input.buttonSuffix) {
      components.push({ type: 'button', sub_type: 'url', index: '0', parameters: [{ type: 'text', text: input.buttonSuffix }] });
    }
    const res = await this.http(`https://graph.facebook.com/${this.config.apiVersion}/${this.config.phoneNumberId}/messages`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${this.config.token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        to: input.to,
        type: 'template',
        template: { name: this.config.template, language: { code: input.lang }, components },
      }),
      signal: AbortSignal.timeout(15_000),
    });
    const text = await res.text();
    if (!res.ok) throw new WhatsAppError(`WhatsApp send failed (${res.status}): ${text.slice(0, 300)}`, res.status);
    const json = (text ? JSON.parse(text) : {}) as { messages?: { id: string }[] };
    return json.messages?.[0]?.id ?? null;
  }
}
