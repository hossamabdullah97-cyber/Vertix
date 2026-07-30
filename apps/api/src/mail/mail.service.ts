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

  async send({ to, subject, html }: SendArgs): Promise<void> {
    const key = this.config.get<string>('RESEND_API_KEY');
    if (!key) {
      this.logger.log(`[DEV EMAIL] to=${to} | ${subject}`);
      const link = html.match(/href="([^"]+)"/)?.[1];
      if (link) this.logger.log(`[DEV EMAIL] link: ${link}`);
      return;
    }
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
    }
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
