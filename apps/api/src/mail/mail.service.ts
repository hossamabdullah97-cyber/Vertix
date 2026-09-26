import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

interface SendArgs {
  to: string;
  subject: string;
  html: string;
}

/**
 * Provider-agnostic email sender. Uses Resend when RESEND_API_KEY is set;
 * otherwise logs the message (and any links) so flows are testable in dev.
 */
@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);

  constructor(private readonly config: ConfigService) {}

  private get from(): string {
    return this.config.get<string>(
      'EMAIL_FROM',
      'Vertex Connect <onboarding@resend.dev>',
    );
  }

  /**
   * Returns whether the message was actually handed to a provider. Never
   * throws: a one-time invite/reset link is only ever generated here — the
   * token store keeps just its hash — so a delivery failure must be reported
   * back to the caller, not crash it, or a link that already exists in the
   * database (membership created, token issued) becomes unrecoverable. The
   * caller decides what to tell the end user; this layer never leaks
   * provider/network detail beyond its own logs.
   */
  async send({ to, subject, html }: SendArgs): Promise<boolean> {
    const key = this.config.get<string>('RESEND_API_KEY');
    if (!key) {
      this.logger.log(`[DEV EMAIL] to=${to} | ${subject}`);
      this.logLink('DEV EMAIL', to, html);
      return true; // no provider configured is a deliberate local-dev state, not a failure
    }
    try {
      const res = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${key}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ from: this.from, to, subject, html }),
      });
      if (!res.ok) {
        this.logger.error(`Email send failed (${res.status}): ${await res.text()}`);
        this.logLink('UNDELIVERED EMAIL', to, html);
        return false;
      }
      return true;
    } catch (err) {
      this.logger.error(`Email send threw for ${to}: ${this.describeFetchError(err)}`);
      this.logLink('UNDELIVERED EMAIL', to, html);
      return false;
    }
  }

  /** Recovers the actionable link from an email that was never delivered. */
  private logLink(tag: string, to: string, html: string): void {
    const link = html.match(/href="([^"]+)"/)?.[1];
    if (link) this.logger.log(`[${tag}] to=${to} | link: ${link}`);
  }

  /**
   * `fetch()` collapses every network-layer failure (DNS, TCP refusal, TLS
   * handshake failure/timeout, proxy interception) into the same generic
   * "fetch failed", with the actual reason nested one level down in Node's
   * underlying `cause` (a libuv/OpenSSL error carrying `code`/`errno`/
   * `syscall`). Surfacing that here — server-side log only, never returned
   * to a caller — is the difference between "fetch failed" and something
   * diagnosable like ETIMEDOUT vs ECONNRESET vs a TLS alert code.
   */
  private describeFetchError(err: unknown): string {
    if (!(err instanceof Error)) return String(err);
    const parts = [`name=${err.name}`, `message=${err.message}`];
    const cause = (err as { cause?: unknown }).cause;
    if (cause && typeof cause === 'object') {
      const c = cause as Record<string, unknown>;
      if (c.code) parts.push(`cause.code=${c.code}`);
      if (c.errno !== undefined) parts.push(`cause.errno=${c.errno}`);
      if (c.syscall) parts.push(`cause.syscall=${c.syscall}`);
      if (c.message) parts.push(`cause.message=${c.message}`);
    }
    return parts.join(' | ');
  }

  sendInvite(to: string, link: string, orgName: string, role: string) {
    return this.send({
      to,
      subject: `You've been invited to ${orgName} on Vertex Connect`,
      html: this.layout(
        `You're invited to join <b>${orgName}</b> as <b>${role}</b>.`,
        'Accept invitation',
        link,
      ),
    });
  }

  sendPasswordReset(to: string, link: string) {
    return this.send({
      to,
      subject: 'Reset your Vertex Connect password',
      html: this.layout(
        'We received a request to reset your password. This link expires in 1 hour.',
        'Reset password',
        link,
      ),
    });
  }

  sendAddedNotice(to: string, orgName: string) {
    return this.send({
      to,
      subject: `You've been added to ${orgName}`,
      html: this.layout(
        `You now have access to <b>${orgName}</b> on Vertex Connect.`,
        'Open Vertex Connect',
        this.config.get<string>('APP_PUBLIC_URL', 'http://localhost:3000'),
      ),
    });
  }

  private layout(body: string, cta: string, link: string): string {
    return `
      <div style="font-family:system-ui,sans-serif;max-width:480px;margin:auto">
        <h2 style="color:#16161a">Vertex Connect</h2>
        <p style="color:#3f3f46;font-size:15px;line-height:1.5">${body}</p>
        <p><a href="${link}" style="display:inline-block;background:#534ab7;color:#fff;text-decoration:none;padding:12px 20px;border-radius:10px;font-weight:600">${cta}</a></p>
        <p style="color:#6b6b76;font-size:12px">Or paste this link: ${link}</p>
      </div>`;
  }
}
