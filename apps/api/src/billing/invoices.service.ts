import { Injectable, Logger, NotFoundException, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma } from '@vertex/db';
import type { BillingDetails, InvoiceParty, InvoiceView, Plan } from '@vertex/shared';
import { PrismaService } from '../prisma/prisma.service';
import { MailService } from '../mail/mail.service';
import { workspaceLink } from '../common/workspace-link';
import type { PaymobSubscription, PaymobTransaction } from './paymob.client';
import { planItemName, type PaidPlan } from './prices';

const DAY = 86_400_000;

/** "MasterCard •••• 2346" from what Paymob says about the card, or null. */
export function cardLabel(source: PaymobTransaction['source_data']): string | null {
  const digits = (source?.pan ?? '').replace(/\D/g, '').slice(-4);
  const brand = source?.sub_type?.trim() || (source?.type === 'card' ? 'Card' : source?.type?.trim()) || '';
  if (!brand && !digits) return null;
  return [brand || 'Card', digits && `•••• ${digits}`].filter(Boolean).join(' ');
}

/** The VAT inside a tax-included amount, in whole piastres. */
export function taxInside(amountCents: number, percent: number | null): number {
  if (!percent || percent <= 0) return 0;
  return Math.round(amountCents - amountCents / (1 + percent / 100));
}

/** VC-2026-00042 */
export function invoiceNumber(seq: number, at: Date): string {
  return `VC-${at.getUTCFullYear()}-${String(seq).padStart(5, '0')}`;
}

function text(v: unknown): string | null {
  return typeof v === 'string' && v.trim() ? v.trim() : null;
}

/** The billing details kept in a workspace's settings. */
export function billingDetailsOf(settings: unknown): BillingDetails {
  const s = settings && typeof settings === 'object' && !Array.isArray(settings) ? (settings as Record<string, unknown>) : {};
  const b = s.billing && typeof s.billing === 'object' ? (s.billing as Record<string, unknown>) : {};
  return { legalName: text(b.legalName) ?? '', taxId: text(b.taxId) ?? '', address: text(b.address) ?? '', email: text(b.email) ?? '' };
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
}

/**
 * Invoices: one for every payment Paymob took, made when Paymob confirms it
 * and never changed afterwards. Who it is billed to is copied from the
 * workspace's billing details at that moment, and the seller from the
 * server's settings (BILLING_SELLER_*), so an old invoice reads as it did.
 */
@Injectable()
export class InvoicesService {
  private readonly logger = new Logger(InvoicesService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    @Optional() private readonly mail?: MailService,
  ) {}

  private get db() {
    return this.prisma.client;
  }

  private seller(): InvoiceParty {
    const get = (k: string) => this.config.get<string>(k)?.trim() || null;
    return {
      name: get('BILLING_SELLER_NAME') ?? 'Vertex Connect',
      address: get('BILLING_SELLER_ADDRESS'),
      taxId: get('BILLING_SELLER_TAX_ID'),
      email: get('BILLING_SELLER_EMAIL'),
    };
  }

  private vatPercent(): number | null {
    const v = Number(this.config.get<string>('BILLING_VAT_PERCENT'));
    return Number.isFinite(v) && v > 0 && v < 100 ? v : null;
  }

  /**
   * The invoice for a payment Paymob confirmed, made once however many times
   * Paymob reports it. Returns null when the payment already has one.
   */
  async record(orgId: string, plan: PaidPlan, tx: PaymobTransaction, sub: PaymobSubscription | null, now = new Date()) {
    const txId = String(tx.id);
    if (await this.db.invoice.findUnique({ where: { paymobTransactionId: txId }, select: { id: true } })) return null;

    const org = await this.db.organization.findUnique({ where: { id: orgId }, select: { name: true, settings: true } });
    const details = billingDetailsOf(org?.settings);
    const owners = await this.db.membership.findMany({
      where: { orgId, role: 'OWNER', status: 'ACTIVE' },
      select: { user: { select: { email: true } } },
      orderBy: { createdAt: 'asc' },
    });
    const billedTo: InvoiceParty = {
      name: org?.name ?? '',
      legalName: details.legalName || null,
      taxId: details.taxId || null,
      address: details.address || null,
      email: details.email || owners[0]?.user.email || null,
    };
    const percent = this.vatPercent();
    const periodEnd = sub?.next_billing ? new Date(`${sub.next_billing.slice(0, 10)}T23:59:59+02:00`) : new Date(now.getTime() + 30 * DAY);

    let invoice;
    try {
      invoice = await this.db.$transaction(async (tx2) => {
        const [{ n }] = await tx2.$queryRaw<{ n: bigint }[]>`SELECT nextval('invoice_number_seq') AS n`;
        return tx2.invoice.create({
          data: {
            orgId,
            number: invoiceNumber(Number(n), now),
            paymobTransactionId: txId,
            plan: plan as Plan,
            amountCents: tx.amount_cents,
            taxCents: taxInside(tx.amount_cents, percent),
            taxPercent: percent,
            currency: tx.currency || 'EGP',
            paymentMethod: cardLabel(tx.source_data),
            periodStart: now,
            periodEnd,
            paidAt: now,
            billedTo: { ...billedTo },
            seller: { ...this.seller() },
          },
        });
      });
    } catch (err) {
      // Two reports of one payment at once: the other one made it.
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') return null;
      throw err;
    }
    this.logger.log(`Invoice ${invoice.number} for org ${orgId}: ${tx.amount_cents / 100} ${invoice.currency}`);
    await this.sendReceipt(orgId, invoice.id, owners.map((o) => o.user.email), billedTo).catch((e) =>
      this.logger.warn(`Receipt for ${invoice.number} not sent: ${(e as Error).message}`),
    );
    return invoice;
  }

  /** The workspace's invoices, newest first. */
  async list(): Promise<InvoiceView[]> {
    const rows = await this.db.invoice.findMany({ orderBy: { paidAt: 'desc' }, take: 120 });
    return rows.map(view);
  }

  async get(id: string): Promise<InvoiceView> {
    const row = await this.db.invoice.findFirst({ where: { id } });
    if (!row) throw new NotFoundException('Invoice not found');
    return view(row);
  }

  async details(orgId: string): Promise<BillingDetails> {
    const org = await this.db.organization.findUnique({ where: { id: orgId }, select: { settings: true } });
    return billingDetailsOf(org?.settings);
  }

  /** Changes who future invoices are made out to; invoices already made keep theirs. */
  async setDetails(orgId: string, input: BillingDetails): Promise<BillingDetails> {
    const org = await this.db.organization.findUnique({ where: { id: orgId }, select: { settings: true } });
    const stored = org?.settings && typeof org.settings === 'object' && !Array.isArray(org.settings) ? (org.settings as Record<string, unknown>) : {};
    const billing = {
      legalName: input.legalName?.trim() || null,
      taxId: input.taxId?.trim() || null,
      address: input.address?.trim() || null,
      email: input.email?.trim() || null,
    };
    await this.db.organization.update({ where: { id: orgId }, data: { settings: { ...stored, billing } as Prisma.InputJsonValue } });
    return billingDetailsOf({ billing });
  }

  private async sendReceipt(orgId: string, invoiceId: string, owners: string[], billedTo: InvoiceParty) {
    if (!this.mail) return;
    const invoice = await this.db.invoice.findUniqueOrThrow({ where: { id: invoiceId } });
    const to = [...new Set([billedTo.email, ...owners].filter((e): e is string => !!e))];
    if (!to.length) return;
    const appUrl = (this.config.get<string>('APP_PUBLIC_URL') || 'http://localhost:3000').replace(/\/$/, '');
    const link = appUrl + workspaceLink(`/billing/invoices/${invoice.id}`, orgId);
    const amount = `${(invoice.amountCents / 100).toLocaleString('en-US', { minimumFractionDigits: 2 })} ${invoice.currency}`;
    const day = (d: Date) => d.toISOString().slice(0, 10);
    const html =
      `<p>Thank you. We received your payment for <strong>${escapeHtml(billedTo.name)}</strong>.</p>` +
      `<table cellpadding="4" style="border-collapse:collapse">` +
      `<tr><td>Invoice</td><td><strong>${escapeHtml(invoice.number)}</strong></td></tr>` +
      `<tr><td>Plan</td><td>${escapeHtml(planItemName(invoice.plan as PaidPlan))}</td></tr>` +
      `<tr><td>Period</td><td>${day(invoice.periodStart)} – ${day(invoice.periodEnd)}</td></tr>` +
      `<tr><td>Amount</td><td>${escapeHtml(amount)}</td></tr>` +
      (invoice.paymentMethod ? `<tr><td>Paid with</td><td>${escapeHtml(invoice.paymentMethod)}</td></tr>` : '') +
      `</table>` +
      `<p><a href="${link}">View or print the invoice</a>. All your invoices are on the Billing page.</p>`;
    for (const email of to) {
      await this.mail.send({ to: email, subject: `Your Vertex Connect invoice ${invoice.number}`, html });
    }
  }
}

function party(v: unknown): InvoiceParty {
  const o = v && typeof v === 'object' ? (v as Record<string, unknown>) : {};
  return { name: text(o.name) ?? '', legalName: text(o.legalName), taxId: text(o.taxId), address: text(o.address), email: text(o.email) };
}

function view(r: {
  id: string;
  number: string;
  plan: string;
  amountCents: number;
  taxCents: number;
  taxPercent: number | null;
  currency: string;
  paymentMethod: string | null;
  periodStart: Date;
  periodEnd: Date;
  paidAt: Date;
  billedTo: unknown;
  seller: unknown;
}): InvoiceView {
  return {
    id: r.id,
    number: r.number,
    plan: r.plan as Plan,
    amountCents: r.amountCents,
    taxCents: r.taxCents,
    taxPercent: r.taxPercent,
    currency: r.currency,
    paymentMethod: r.paymentMethod,
    periodStart: r.periodStart.toISOString(),
    periodEnd: r.periodEnd.toISOString(),
    paidAt: r.paidAt.toISOString(),
    billedTo: party(r.billedTo),
    seller: party(r.seller),
  };
}
