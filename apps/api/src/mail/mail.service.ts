import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

interface SendArgs {
  to: string;
  subject: string;
  html: string;
  /** Where replies go, e.g. the card owner rather than our no-reply address. */
  replyTo?: string;
  attachments?: { filename: string; content: string; contentType: string }[];
}

/**
 * Provider-agnostic email sender. Uses Resend when RESEND_API_KEY is set;
 * otherwise logs the message (and any links) so flows are testable in dev.
 */
@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);
  /** The last sends to the provider and whether each went through, for the status page. */
  private readonly outcomes: { at: number; ok: boolean }[] = [];

  constructor(private readonly config: ConfigService) {}

  private record(ok: boolean) {
    this.outcomes.push({ at: Date.now(), ok });
    if (this.outcomes.length > 200) this.outcomes.splice(0, this.outcomes.length - 200);
  }

  /** How sends to the provider went lately (none counted when no provider is set). */
  recentOutcomes(sinceMs: number, now = Date.now()): { sent: number; failed: number } {
    const recent = this.outcomes.filter((o) => o.at >= now - sinceMs);
    return { sent: recent.length, failed: recent.filter((o) => !o.ok).length };
  }

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
  async send({ to, subject, html, replyTo, attachments }: SendArgs): Promise<boolean> {
    const key = this.config.get<string>('RESEND_API_KEY');
    if (!key) {
      this.logger.log(`[DEV EMAIL] to=${to} | ${subject}${attachments?.length ? ` | attached: ${attachments.map((a) => a.filename).join(', ')}` : ''}`);
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
        body: JSON.stringify({
          from: this.from,
          to,
          subject,
          html,
          ...(replyTo ? { reply_to: replyTo } : {}),
          ...(attachments?.length
            ? {
                attachments: attachments.map((a) => ({
                  filename: a.filename,
                  content: Buffer.from(a.content).toString('base64'),
                  content_type: a.contentType,
                })),
              }
            : {}),
        }),
      });
      this.record(res.ok);
      if (!res.ok) {
        this.logger.error(`Email send failed (${res.status}): ${await res.text()}`);
        this.logLink('UNDELIVERED EMAIL', to, html);
        return false;
      }
      return true;
    } catch (err) {
      this.record(false);
      this.logger.error(`Email send threw for ${to}: ${this.describeFetchError(err)}`);
      this.logLink('UNDELIVERED EMAIL', to, html);
      return false;
    }
  }

  /** Recovers the actionable link from an email that was never delivered. */
  private logLink(tag: string, to: string, html: string): void {
    // The first web link: a phone or mail link is not the one to follow.
    const link = html.match(/href="(https?:[^"]+)"/)?.[1];
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

  sendEmailVerification(to: string, link: string) {
    return this.send({
      to,
      subject: 'Confirm your email for Vertex Connect',
      html: this.layout(
        'Confirm this is your email address to finish setting up your account. You can then invite your team and choose a plan. This link expires in 3 days.',
        'Confirm email',
        link,
      ),
    });
  }

  /** For someone who already has an account: they choose, signed in, whether to join. */
  sendJoinInvite(to: string, link: string, orgName: string, role: string, inviter: string | null) {
    return this.send({
      to,
      subject: `${inviter ?? 'Someone'} invited you to ${orgName} on Vertex Connect`,
      html: this.layout(
        `${inviter ? `<b>${escapeHtml(inviter)}</b> invited you` : "You're invited"} to join <b>${escapeHtml(orgName)}</b> as <b>${role}</b>. Sign in to accept or decline. Nothing changes until you do.`,
        'See the invitation',
        link,
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

function escapeHtml(v: string): string {
  return v.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
}
