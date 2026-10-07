import { z } from 'zod';

// ===========================================================================
//  Shared enums (mirror Prisma)
// ===========================================================================

export const Role = z.enum(['OWNER', 'ADMIN', 'MANAGER', 'EMPLOYEE']);
export type Role = z.infer<typeof Role>;

export const Plan = z.enum(['FREE', 'PERSONAL', 'PRO', 'BUSINESS', 'ENTERPRISE']);
export type Plan = z.infer<typeof Plan>;

// Plan limits. null = unlimited. Prices are server settings (apps/api/src/billing/prices.ts).
export interface PlanDef {
  label: string;
  cards: number | null;
  members: number | null;
  nfcTags: number | null;
}

export const PLAN_LIMITS: Record<Plan, PlanDef> = {
  FREE: { label: 'Free', cards: 1, members: 2, nfcTags: 5 },
  // One person's own workspace, paid: no seats to count.
  PERSONAL: { label: 'Personal', cards: 3, members: 1, nfcTags: 10 },
  PRO: { label: 'Pro', cards: 5, members: 5, nfcTags: 50 },
  BUSINESS: { label: 'Business', cards: 25, members: 25, nfcTags: 500 },
  ENTERPRISE: { label: 'Enterprise', cards: null, members: null, nfcTags: null },
};

/**
 * Whether a plan is paid. This is what earns an account its verified badge —
 * the badge is never self-declared, it is derived from the organization's plan.
 * Prices are settings on the server (see apps/api/src/billing/prices.ts).
 */
export function isPaidPlan(plan: Plan | null | undefined): boolean {
  return plan === 'PERSONAL' || plan === 'PRO' || plan === 'BUSINESS' || plan === 'ENTERPRISE';
}

/** The plans bought at checkout. */
export const PAID_PLANS = ['PERSONAL', 'PRO', 'BUSINESS'] as const;
export type PaidPlan = (typeof PAID_PLANS)[number];

/**
 * The plans a workspace is offered, by its kind: a person's own workspace has
 * no team to count seats for; a company's or team's is offered the team plans.
 */
export function plansFor(kind: 'PERSONAL' | 'TEAM' | null | undefined): Plan[] {
  return kind === 'PERSONAL' ? ['FREE', 'PERSONAL'] : ['FREE', 'PRO', 'BUSINESS', 'ENTERPRISE'];
}

export interface UsageSummary {
  plan: Plan;
  limits: PlanDef;
  usage: { cards: number; members: number; nfcTags: number };
  status: string;
  /** When the paid period ends (renews or lapses), if billing has reported one. */
  periodEnd: string | null;
  /** Whether the org has a subscription at Paymob that renews and can be cancelled. */
  subscribed: boolean;
}

/** Moving a card to another workspace of its owner's. */
export const moveCardSchema = z.object({ orgId: z.string().trim().min(1) });
export type MoveCardInput = z.infer<typeof moveCardSchema>;

export const checkoutSchema = z.object({
  plan: z.enum(PAID_PLANS),
  /** Paymob asks for the payer's mobile number. */
  phone: z.string().trim().regex(/^\+?[0-9 ]{8,16}$/, 'Enter a mobile number'),
});
export type CheckoutInput = z.infer<typeof checkoutSchema>;

/** Who invoices are made out to: the business's own name and tax number, when it has them. */
export const billingDetailsSchema = z.object({
  legalName: z.string().trim().max(160).optional().or(z.literal('')),
  taxId: z.string().trim().max(40).optional().or(z.literal('')),
  address: z.string().trim().max(400).optional().or(z.literal('')),
  /** Where receipts go, besides the owners. */
  email: z.string().trim().toLowerCase().email().max(200).optional().or(z.literal('')),
});
export type BillingDetails = z.infer<typeof billingDetailsSchema>;

export interface InvoiceParty {
  name: string;
  legalName?: string | null;
  taxId?: string | null;
  address?: string | null;
  email?: string | null;
}

export interface InvoiceView {
  id: string;
  number: string;
  plan: Plan;
  amountCents: number;
  taxCents: number;
  taxPercent: number | null;
  currency: string;
  paymentMethod: string | null;
  periodStart: string;
  periodEnd: string;
  paidAt: string;
  billedTo: InvoiceParty;
  seller: InvoiceParty;
}

export const Temperature = z.enum(['COLD', 'WARM', 'HOT']);
export type Temperature = z.infer<typeof Temperature>;

export const ActionType = z.enum([
  'SAVE_CONTACT',
  'WHATSAPP',
  'LINKEDIN',
  'BOOK_MEETING',
  'REQUEST_QUOTE',
  'CALL',
  'EMAIL',
  'MAPS',
  'WEBSITE',
  'FILE',
]);
export type ActionType = z.infer<typeof ActionType>;

export const EventType = z.enum(['VIEW', 'CLICK', 'SAVE', 'SHARE', 'NFC_SCAN']);
export type EventType = z.infer<typeof EventType>;

export const SectionType = z.enum([
  'BIO',
  'SOCIAL',
  'PORTFOLIO',
  'BOOKING',
  'VIDEO',
  'CREDENTIALS',
  'CLIENTS',
]);
export type SectionType = z.infer<typeof SectionType>;

export const TagStatus = z.enum(['UNASSIGNED', 'ACTIVE', 'DISABLED']);
export type TagStatus = z.infer<typeof TagStatus>;

export const HardwareType = z.enum([
  'CARD',
  'STICKER',
  'KEYCHAIN',
  'WRISTBAND',
  'OTHER',
]);
export type HardwareType = z.infer<typeof HardwareType>;

// ===========================================================================
//  Auth DTOs
// ===========================================================================

/**
 * Signing up: on one's own (a personal workspace in the person's name), or
 * for a company or team, which then needs its name. Without `kind`, as older
 * clients send it, it is a team.
 */
export const registerSchema = z
  .object({
    email: z.string().email(),
    password: z.string().min(8, 'Password must be at least 8 characters'),
    name: z.string().min(1).max(120).optional(),
    kind: z.enum(['personal', 'team']).default('team'),
    organizationName: z.string().trim().min(1).max(120).optional(),
  })
  .refine((d) => d.kind === 'personal' || !!d.organizationName, { message: 'Enter the company or team name', path: ['organizationName'] })
  .refine((d) => d.kind === 'team' || !!d.name?.trim(), { message: 'Enter your name', path: ['name'] });
/** Making a personal workspace a company's or team's: the name it goes by. */
export const convertWorkspaceSchema = z.object({ name: z.string().trim().min(1, 'Enter the company or team name').max(120) });
export type ConvertWorkspaceInput = z.infer<typeof convertWorkspaceSchema>;

// As sent: `kind` may be missing (an older client), which means a team.
export type RegisterInput = z.input<typeof registerSchema>;

export const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});
export type LoginInput = z.infer<typeof loginSchema>;

// Two-step verification: the 6-digit code from the authenticator app, or a
// recovery code ("k7f2-9xqa").
export const twoFactorCodeSchema = z.object({ code: z.string().trim().min(6).max(20) });
export type TwoFactorCodeInput = z.infer<typeof twoFactorCodeSchema>;

// The second step of a sign-in: the challenge the first step gave, and a code.
export const mfaLoginSchema = twoFactorCodeSchema.extend({ mfaToken: z.string().min(20).max(2048) });
export type MfaLoginInput = z.infer<typeof mfaLoginSchema>;

// Deleting one's own account: the password (when the account has one), a
// two-step code (when it is on), and the address typed out as confirmation.
export const deleteAccountSchema = z.object({
  password: z.string().max(200).optional(),
  code: z.string().trim().max(20).optional(),
  confirmEmail: z.string().trim().min(3).max(320),
});
export type DeleteAccountInput = z.infer<typeof deleteAccountSchema>;

// The ID token "Sign in with Google" gives the page.
export const googleSignInSchema = z.object({ credential: z.string().min(20).max(4096) });
export type GoogleSignInInput = z.infer<typeof googleSignInSchema>;

export const refreshSchema = z.object({
  refreshToken: z.string().min(1),
});
export type RefreshInput = z.infer<typeof refreshSchema>;

export const forgotPasswordSchema = z.object({
  email: z.string().email(),
});
export type ForgotPasswordInput = z.infer<typeof forgotPasswordSchema>;

export const verifyEmailSchema = z.object({
  token: z.string().min(1).max(200),
});
export type VerifyEmailInput = z.infer<typeof verifyEmailSchema>;

export const resetPasswordSchema = z.object({
  token: z.string().min(1),
  password: z.string().min(8, 'Password must be at least 8 characters'),
});
export type ResetPasswordInput = z.infer<typeof resetPasswordSchema>;

export const acceptInviteSchema = z.object({
  token: z.string().min(1),
  password: z.string().min(8, 'Password must be at least 8 characters'),
  name: z.string().min(1).max(120).optional(),
});
export type AcceptInviteInput = z.infer<typeof acceptInviteSchema>;

/** Account profile edits. `avatarUrl: null` clears the photo. */
export const updateProfileSchema = z.object({
  name: z.string().max(120).optional(),
  avatarUrl: z.string().url().nullable().optional(),
});
export type UpdateProfileInput = z.infer<typeof updateProfileSchema>;

// ===========================================================================
//  Helper types
// ===========================================================================

export interface JwtPayload {
  sub: string; // userId
  email: string;
  orgId?: string;
  role?: Role;
  isSuperAdmin?: boolean;
  /** The signed-in device this token belongs to (auth_sessions); absent on tokens issued before sessions were kept. */
  sid?: string;
}

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
}

/** A right password (or Google) on an account with two-step verification: a code is still needed. */
export interface MfaChallenge {
  mfaRequired: true;
  mfaToken: string;
}

export type SignInResult = AuthTokens | MfaChallenge;

// ===========================================================================
//  Cards DTOs
// ===========================================================================

// slug: lowercase letters, digits and dashes only (used in the public URL /c/[slug]).
const slugField = z
  .string()
  .min(3)
  .max(60)
  .regex(/^[a-z0-9-]+$/, 'slug may contain lowercase letters, digits and dashes only');

export const createCardSchema = z.object({
  // slug is optional — auto-generated from the name (or a random token) when omitted.
  slug: slugField.optional(),
  templateId: z.string().min(1).max(60),
  theme: z.record(z.unknown()).optional(),
  fullName: z.string().min(1).max(120).optional(), // seeds the bio + vCard
  title: z.string().max(120).optional(),
  ownerId: z.string().optional(), // defaults to the current user; a manager may set another.
});
export type CreateCardInput = z.infer<typeof createCardSchema>;

export const updateCardSchema = z.object({
  slug: slugField.optional(),
  templateId: z.string().min(1).max(60).optional(),
  theme: z.record(z.unknown()).optional(),
  vcardData: z.record(z.unknown()).optional(),
  isPublished: z.boolean().optional(),
});
export type UpdateCardInput = z.infer<typeof updateCardSchema>;

// --- Sections ---
export const createSectionSchema = z.object({
  type: SectionType,
  order: z.number().int().min(0).optional(),
  isVisible: z.boolean().optional(),
  content: z.record(z.unknown()),
});
export type CreateSectionInput = z.infer<typeof createSectionSchema>;

export const updateSectionSchema = z.object({
  order: z.number().int().min(0).optional(),
  isVisible: z.boolean().optional(),
  content: z.record(z.unknown()).optional(),
});
export type UpdateSectionInput = z.infer<typeof updateSectionSchema>;

// --- Actions ---
export const createActionSchema = z.object({
  type: ActionType,
  order: z.number().int().min(0).optional(),
  isActive: z.boolean().optional(),
  config: z.record(z.unknown()),
});
export type CreateActionInput = z.infer<typeof createActionSchema>;

export const updateActionSchema = z.object({
  order: z.number().int().min(0).optional(),
  isActive: z.boolean().optional(),
  config: z.record(z.unknown()).optional(),
});
export type UpdateActionInput = z.infer<typeof updateActionSchema>;

// --- Reorder (for sections or actions) ---
export const reorderSchema = z.object({
  ids: z.array(z.string()).min(1), // ids in their new order
});
export type ReorderInput = z.infer<typeof reorderSchema>;

// ===========================================================================
//  Payment Links (external link-sharing only — no payment processing)
// ===========================================================================

/**
 * Predefined payment platforms (Egyptian e-wallets + InstaPay), extensible.
 * A platform is only a display hint — Vertex Connect never talks to any of
 * these; it just opens the owner-provided external URL.
 */
export const PAYMENT_PLATFORMS = [
  { key: 'instapay', label: 'InstaPay (إينستاباي)', color: '#4B1F80', icon: 'link' },
  { key: 'vodafone_cash', label: 'Vodafone Cash (فودافون كاش)', color: '#E60000', icon: 'phone' },
  { key: 'orange_cash', label: 'Orange Cash (أورنج كاش)', color: '#FF7900', icon: 'phone' },
  { key: 'etisalat_cash', label: 'Etisalat Cash / e& Cash (اتصالات كاش)', color: '#00A651', icon: 'phone' },
  { key: 'we_pay', label: 'WE Pay (وي باي)', color: '#5F259F', icon: 'phone' },
  { key: 'fawry', label: 'Fawry (فوري)', color: '#FFC700', icon: 'link' },
  { key: 'meeza', label: 'Meeza (ميزة)', color: '#004A7C', icon: 'credit-card' },
  { key: 'smart_wallet', label: 'Bank Smart Wallet (المحفظة البنكية)', color: '#1E3A8A', icon: 'phone' },
  { key: 'valu', label: 'valU (فاليو)', color: '#5B168C', icon: 'link' },
  { key: 'bank_card', label: 'Bank Card / Visa & Mastercard (بطاقة بنكية)', color: '#0F172A', icon: 'credit-card' },
  { key: 'paypal', label: 'PayPal (بايبال)', color: '#003087', icon: 'link' },
  { key: 'paymob', label: 'Paymob (باي مب)', color: '#0052FF', icon: 'link' },
  { key: 'custom', label: 'Custom Payment Link (رابط دفع آخر)', color: '#334155', icon: 'link' },
] as const;

export type PaymentPlatformKey = (typeof PAYMENT_PLATFORMS)[number]['key'];
const PAYMENT_PLATFORM_KEYS = PAYMENT_PLATFORMS.map((p) => p.key) as [
  PaymentPlatformKey,
  ...PaymentPlatformKey[],
];

/**
 * A safe external URL to open: a valid http(s) URL only. Blocks javascript:,
 * data:, file: and the like so a shared link can never execute in the visitor's
 * browser. We validate the shape, never the payment behind it.
 */
// Only an http(s) URL with a host is accepted. This rejects javascript:, data:,
// file:, vbscript: and other schemes that could execute in the visitor's
// browser — a shared payment link is only ever opened, never run.
const HTTP_URL = /^https?:\/\/[^\s/$.?#][^\s]*$/i;

export const safeExternalUrl = z
  .string()
  .trim()
  .min(1, 'Payment link is required')
  .max(2000)
  .refine((u) => HTTP_URL.test(u), 'Enter a valid link starting with https://');

export const createPaymentLinkSchema = z.object({
  platform: z.enum(PAYMENT_PLATFORM_KEYS),
  displayName: z.string().trim().min(1).max(60),
  url: safeExternalUrl,
  description: z.string().trim().max(160).optional(),
  order: z.number().int().min(0).optional(),
  isActive: z.boolean().optional(),
});
export type CreatePaymentLinkInput = z.infer<typeof createPaymentLinkSchema>;

export const updatePaymentLinkSchema = z.object({
  platform: z.enum(PAYMENT_PLATFORM_KEYS).optional(),
  displayName: z.string().trim().min(1).max(60).optional(),
  url: safeExternalUrl.optional(),
  description: z.string().trim().max(160).optional(),
  order: z.number().int().min(0).optional(),
  isActive: z.boolean().optional(),
});
export type UpdatePaymentLinkInput = z.infer<typeof updatePaymentLinkSchema>;

// ===========================================================================
//  NFC DTOs
// ===========================================================================

/**
 * One spelling per chip. The same hardware serial arrives as "04:a1:b2…" from
 * Web NFC, "04A1B2…" from the mobile app and in whatever case or separators an
 * admin typed, and a chip registered one way would not be found the other.
 * A hex serial becomes upper-case byte pairs joined by colons, as printed on
 * the registry's chips; anything else (a supplier's own code) is only trimmed.
 */
export function normalizeUid(raw: string): string {
  const value = raw.trim();
  const hex = value.replace(/[\s:-]/g, '');
  if (/^[0-9a-f]+$/i.test(hex) && hex.length >= 8 && hex.length % 2 === 0) {
    return hex.toUpperCase().match(/../g)!.join(':');
  }
  return value;
}
const uidField = z.string().min(1).max(120).transform(normalizeUid);

export const createTagSchema = z.object({
  uid: uidField, // physical UID from the manufacturer
  hardwareType: HardwareType.optional(),
  batchId: z.string().max(120).optional(),
  /// The member the chip belongs to. Ignored for an employee, who is always
  /// recorded as the holder of a chip they register themselves.
  assignedUserId: z.string().optional(),
});
export type CreateTagInput = z.infer<typeof createTagSchema>;

// Factory batch registration — the manufacturer provides the list of UIDs.
export const createTagsBatchSchema = z.object({
  uids: z.array(uidField).min(1).max(1000),
  hardwareType: HardwareType.optional(),
  batchId: z.string().max(120).optional(),
  assignedUserId: z.string().optional(),
});
export type CreateTagsBatchInput = z.infer<typeof createTagsBatchSchema>;

export const updateTagSchema = z.object({
  status: TagStatus.optional(),
  hardwareType: HardwareType.optional(),
  batchId: z.string().max(120).nullable().optional(),
});
export type UpdateTagInput = z.infer<typeof updateTagSchema>;

export const assignTagSchema = z.object({
  cardId: z.string().min(1),
});
export type AssignTagInput = z.infer<typeof assignTagSchema>;

/**
 * The pipeline a new workspace starts with.
 *
 * Kept here because four places used to create it from their own copy of the
 * names, and the win flag has to be set on every one of them - a workspace
 * whose "Won" stage is not flagged reports no wins at all.
 */
export const DEFAULT_PIPELINE_STAGES: { name: string; isWon: boolean }[] = [
  { name: 'New', isWon: false },
  { name: 'Contacted', isWon: false },
  { name: 'Qualified', isWon: false },
  { name: 'Proposal', isWon: false },
  { name: 'Negotiation', isWon: false },
  { name: 'Won', isWon: true },
  { name: 'Lost', isWon: false },
];

/** The stock pipeline as Prisma createMany rows for one organization. */
export function defaultStageRows(orgId: string) {
  return DEFAULT_PIPELINE_STAGES.map((s, order) => ({
    orgId,
    name: s.name,
    order,
    isWon: s.isWon,
  }));
}

// Hands a chip to a member, or takes the holder off it (null).
export const setTagHolderSchema = z.object({
  userId: z.string().min(1).nullable(),
});
export type SetTagHolderInput = z.infer<typeof setTagHolderSchema>;

// ===========================================================================
//  Team & Members DTOs
// ===========================================================================

export const inviteMemberSchema = z.object({
  email: z.string().email(),
  name: z.string().min(1).max(120).optional(),
  role: Role.default('EMPLOYEE'),
  teamId: z.string().optional(),
});
export type InviteMemberInput = z.infer<typeof inviteMemberSchema>;

// Many people at once, from a spreadsheet. Owners are never made this way.
export const importMemberRowSchema = z.object({
  email: z.string().trim().toLowerCase().email(),
  name: z.string().trim().max(120).optional(),
  title: z.string().trim().max(120).optional(),
  phone: z.string().trim().max(40).optional(),
  team: z.string().trim().max(80).optional(),
  role: z.enum(['ADMIN', 'MANAGER', 'EMPLOYEE']).default('EMPLOYEE'),
});
export const importMembersSchema = z.object({
  rows: z.array(importMemberRowSchema).min(1).max(500),
  /** Also make each person a card, filled in from their row. */
  createCards: z.boolean().default(true),
  /** The language those cards are written in. */
  lang: z.enum(['en', 'ar']).default('en'),
});
export type ImportMemberRow = z.infer<typeof importMemberRowSchema>;
export type ImportMembersInput = z.infer<typeof importMembersSchema>;

export const MemberStatus = z.enum(['INVITED', 'ACTIVE', 'SUSPENDED']);
export const updateMemberSchema = z.object({
  role: Role.optional(),
  teamId: z.string().nullable().optional(),
  departmentId: z.string().nullable().optional(),
  status: MemberStatus.optional(),
});
export type UpdateMemberInput = z.infer<typeof updateMemberSchema>;

// Organization profile + brand center (branding is a free-form JSON blob:
// accent, logo, secondaryColor, font, watermark, …).
export const updateOrgSchema = z.object({
  name: z.string().min(1).max(120).optional(),
  branding: z.record(z.unknown()).nullable().optional(),
  settings: z.record(z.unknown()).nullable().optional(),
});
export type UpdateOrgInput = z.infer<typeof updateOrgSchema>;

// Whether the workspace requires its members to use two-step verification.
export const orgSecuritySchema = z.object({ require2fa: z.boolean() });
export type OrgSecurityInput = z.infer<typeof orgSecuritySchema>;

// Shared media asset (metadata for a file uploaded via /uploads).
export const createAssetSchema = z.object({
  name: z.string().min(1).max(200),
  url: z.string().min(1).max(2000),
  mimeType: z.string().max(120).optional(),
  size: z.number().int().nonnegative().optional(),
});
export type CreateAssetInput = z.infer<typeof createAssetSchema>;

export const createTeamSchema = z.object({
  name: z.string().min(1).max(120),
  managerId: z.string().optional(),
  color: z.string().max(30).optional(),
  departmentId: z.string().optional(),
});
export type CreateTeamInput = z.infer<typeof createTeamSchema>;

export const updateTeamSchema = z.object({
  name: z.string().min(1).max(120).optional(),
  managerId: z.string().nullable().optional(),
  color: z.string().max(30).nullable().optional(),
  departmentId: z.string().nullable().optional(),
});
export type UpdateTeamInput = z.infer<typeof updateTeamSchema>;

// ===========================================================================
//  Analytics DTOs
// ===========================================================================

export const LeadIntent = z.enum(['CONTACT', 'MEETING', 'QUOTE']);
export type LeadIntent = z.infer<typeof LeadIntent>;

// Public lead capture from a card's engagement workflows.
export const leadCaptureSchema = z
  .object({
    slug: z.string().min(1),
    intent: LeadIntent.default('CONTACT'),
    name: z.string().min(1).max(120),
    email: z.string().email().optional().or(z.literal('')),
    phone: z.string().max(40).optional(),
    company: z.string().max(120).optional(),
    note: z.string().max(1000).optional(),
    meetingAt: z.string().optional(), // ISO datetime for the MEETING intent
    visitorId: z.string().optional(),
    /// The chip UID the visitor arrived from, carried through the redirect. It
    /// credits the member whose hardware produced this client.
    tagUid: z.string().max(120).optional(),
    /// A field people never see. Bots fill every field, so a value here marks
    /// the request as one (see LeadsService.capture).
    website: z.string().max(500).optional(),
  })
  .refine((d) => !!d.email || !!d.phone, {
    message: 'Provide an email or a phone number',
    path: ['email'],
  });
export type LeadCaptureInput = z.infer<typeof leadCaptureSchema>;

// How a card owner hears about new leads outside the app.
export const leadAlertSettingsSchema = z
  .object({
    email: z.boolean(),
    whatsapp: z.boolean(),
    phone: z.string().trim().max(32).nullable(),
    lang: z.enum(['en', 'ar']),
    weeklyReport: z.boolean(),
    /** Tips and reminders by email (finish your card, leads waiting…). */
    tips: z.boolean(),
  })
  .partial();
export type LeadAlertSettingsInput = z.infer<typeof leadAlertSettingsSchema>;

/// A browser's Web Push subscription (PushSubscription.toJSON()), and the
/// language its notifications should be written in.
export const pushSubscribeSchema = z.object({
  endpoint: z.string().url().max(1000),
  keys: z.object({ p256dh: z.string().min(1).max(200), auth: z.string().min(1).max(100) }),
  lang: z.enum(['en', 'ar']).default('en'),
});
export type PushSubscribeInput = z.infer<typeof pushSubscribeSchema>;

// The card owner's answer to a visitor's meeting request.
export const meetingResponseSchema = z.object({
  decision: z.enum(['ACCEPT', 'DECLINE']),
  message: z.string().trim().max(1000).optional(),
});
export type MeetingResponseInput = z.infer<typeof meetingResponseSchema>;

// A lead someone adds themselves: typed in, or read from a paper card.
export const createLeadSchema = z
  .object({
    name: z.string().trim().max(120).optional(),
    email: z.string().trim().toLowerCase().email().optional().or(z.literal('')),
    phone: z.string().trim().max(40).optional(),
    company: z.string().trim().max(120).optional(),
    title: z.string().trim().max(120).optional(),
    website: z.string().trim().max(200).optional(),
    address: z.string().trim().max(240).optional(),
    note: z.string().trim().max(1000).optional(),
    // in_person: taken down on the spot, from the "Met someone" screen.
    // zapier: sent by a Zap (the Vertex Connect app in Zapier).
    source: z.enum(['card_scan', 'manual', 'in_person', 'zapier']).default('manual'),
  })
  .refine((d) => !!d.name || !!d.email || !!d.phone, { message: 'Give a name, an email or a phone number', path: ['name'] });
export type CreateLeadInput = z.infer<typeof createLeadSchema>;

/** "" and null both clear a text field on a lead. */
const clearableText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .nullable()
    .optional()
    .transform((v) => (v === '' ? null : v));

/** A change to a lead: only what is sent changes. */
export const updateLeadSchema = z.object({
  stageId: z.string().min(1).max(40).nullable().optional(),
  temperature: z.enum(['COLD', 'WARM', 'HOT']).optional(),
  value: z.number().finite().min(0).max(1e12).optional(),
  name: clearableText(120),
  email: z
    .union([z.string().trim().toLowerCase().email().max(200), z.literal(''), z.null()])
    .optional()
    .transform((v) => (v === '' ? null : v)),
  phone: clearableText(40),
  company: clearableText(120),
  /** The workspace's own fields, by field id; null clears one. */
  customFields: z.record(z.unknown()).optional(),
});
export type UpdateLeadInput = z.infer<typeof updateLeadSchema>;

/** Rows sent in one request of a spreadsheet import; a bigger file goes in several. */
export const LEAD_IMPORT_BATCH = 500;
/** The most rows one file may bring in. */
export const LEAD_IMPORT_MAX = 5000;

const importText = (max: number) => z.string().trim().max(max).optional();

/**
 * One row of a spreadsheet of leads, as the page read it. The page matches
 * the stage to the pipeline (it knows the names in both languages); the
 * owner is an email the server matches to a member.
 */
export const importLeadRowSchema = z.object({
  /** The row's line in the file, to say which row a problem is on. */
  line: z.number().int().min(1),
  name: importText(120),
  email: importText(200),
  phone: importText(40),
  company: importText(120),
  title: importText(120),
  note: importText(2000),
  stageId: z.string().trim().max(40).optional(),
  value: z.number().min(0).max(1_000_000_000_000).optional(),
  temperature: z.enum(['HOT', 'WARM', 'COLD']).optional(),
  owner: importText(200),
  /** When it really came in (YYYY-MM-DD), for history kept elsewhere until now. */
  createdOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  /** The workspace's own fields the file has columns for, by field id. */
  customFields: z.record(z.string().max(40), z.union([z.string().max(500), z.number(), z.boolean()])).optional(),
});
export type ImportLeadRow = z.infer<typeof importLeadRowSchema>;

export const importLeadsSchema = z.object({
  rows: z.array(importLeadRowSchema).min(1).max(LEAD_IMPORT_BATCH),
  /** A lead already here: left alone, or its empty fields filled from the file. */
  duplicates: z.enum(['skip', 'fill']).default('skip'),
  /** Only say what would happen. */
  dryRun: z.boolean().default(false),
});
export type ImportLeadsInput = z.infer<typeof importLeadsSchema>;

export type ImportOutcome = 'create' | 'fill' | 'duplicate' | 'invalid';
export type ImportProblem = 'empty' | 'badEmail' | 'badDate';
export type ImportNotice = 'unknownOwner' | 'unknownStage' | 'badField';

export interface ImportRowResult {
  line: number;
  outcome: ImportOutcome;
  problem?: ImportProblem;
  notices?: ImportNotice[];
  /** The lead created, or the one it duplicates. */
  leadId?: string;
}

export interface ImportLeadsResult {
  created: number;
  filled: number;
  duplicates: number;
  invalid: number;
  rows: ImportRowResult[];
}

// A user-logged CRM activity on a lead (note / call / email / meeting).
export const addLeadActivitySchema = z.object({
  type: z.enum(['NOTE', 'CALL', 'EMAIL', 'WHATSAPP', 'MEETING']),
  note: z.string().max(2000).optional(),
  meetingAt: z.string().optional(), // ISO datetime for MEETING
  /** Teammates a note names with @; each is told. Only those who can see the lead are kept. */
  mentions: z.array(z.string().min(1).max(40)).max(20).optional(),
});
export type AddLeadActivityInput = z.infer<typeof addLeadActivitySchema>;

/** Changing one's own note: its text, and who it names. */
export const editNoteSchema = z.object({
  note: z.string().trim().min(1).max(2000),
  mentions: z.array(z.string().min(1).max(40)).max(20).optional(),
});
export type EditNoteInput = z.infer<typeof editNoteSchema>;

/** Someone a note can name: a teammate who can see the lead. */
export interface Mentionable {
  id: string;
  name: string;
  email: string;
  avatarUrl: string | null;
}

/** A note on a lead, for the team's notes feed. */
export interface TeamNote {
  id: string;
  note: string;
  createdAt: string;
  editedAt: string | null;
  author: { id: string; name: string; avatarUrl: string | null } | null;
  mentions: { id: string; name: string }[];
  lead: { id: string; name: string | null; company: string | null };
}

/// Reaching out to a lead from the app: a call placed, or a WhatsApp message
/// or email opened ready to send. Logged on the lead, and it counts as the
/// contact the follow-up reminders wait for.
export const leadContactSchema = z.object({
  channel: z.enum(['CALL', 'WHATSAPP', 'EMAIL']),
  note: z.string().max(4000).optional(),
  subject: z.string().max(300).optional(),
  templateId: z.string().max(60).optional(),
});
export type LeadContactInput = z.infer<typeof leadContactSchema>;

// Ready messages ("message templates")
export const messageChannel = z.enum(['WHATSAPP', 'EMAIL']);
export const createMessageTemplateSchema = z.object({
  name: z.string().trim().min(1).max(80),
  channel: messageChannel,
  subject: z.string().max(300).optional().nullable(),
  body: z.string().trim().min(1).max(4000),
});
export type CreateMessageTemplateInput = z.infer<typeof createMessageTemplateSchema>;
export const updateMessageTemplateSchema = createMessageTemplateSchema.partial();
export type UpdateMessageTemplateInput = z.infer<typeof updateMessageTemplateSchema>;

/** The fields a ready message can use, as {{field}}. */
export const TEMPLATE_FIELDS = ['first_name', 'name', 'company', 'my_name', 'my_company', 'my_phone', 'card_link'] as const;
export type TemplateField = (typeof TEMPLATE_FIELDS)[number];

/**
 * Fills a ready message. A field with no value is dropped along with the
 * space before it, so "Hi {{first_name}}," reads "Hi," rather than "Hi ,";
 * unknown {{fields}} are left as typed, so a typo shows instead of vanishing.
 */
export function renderTemplate(text: string, values: Partial<Record<TemplateField, string | null | undefined>>): string {
  return text
    .replace(/([ \t]?)\{\{\s*([a-z_]+)\s*\}\}/g, (whole, space: string, key: string) => {
      if (!(TEMPLATE_FIELDS as readonly string[]).includes(key)) return whole;
      const v = values[key as TemplateField]?.trim();
      return v ? `${space}${v}` : '';
    })
    .replace(/[ \t]+([,.!?،؟])/g, '$1');
}

// CRM tasks — due-dated to-dos, optionally linked to a lead.
export const taskPriority = z.enum(['LOW', 'MEDIUM', 'HIGH']);
export const createTaskSchema = z.object({
  title: z.string().min(1).max(200),
  leadId: z.string().optional(),
  notes: z.string().max(2000).optional(),
  priority: taskPriority.optional(),
  dueDate: z.string().datetime().optional().or(z.literal('')),
});
export type CreateTaskInput = z.infer<typeof createTaskSchema>;

export const updateTaskSchema = z.object({
  title: z.string().min(1).max(200).optional(),
  notes: z.string().max(2000).optional(),
  priority: taskPriority.optional(),
  dueDate: z.string().datetime().nullable().optional().or(z.literal('')),
  completed: z.boolean().optional(),
});
export type UpdateTaskInput = z.infer<typeof updateTaskSchema>;

// Public event tracking from the card page (views, clicks, saves, shares).
export const trackEventSchema = z.object({
  slug: z.string().min(1),
  type: z.enum(['VIEW', 'CLICK', 'SAVE', 'SHARE']),
  visitorId: z.string().optional(),
  // Non-financial click context only (e.g. { kind: 'payment', platform,
  // variantId }). Never carries amounts, balances, or credentials.
  metadata: z.record(z.unknown()).optional(),
  /** The app session of a signed-in browser: the card's own people are not counted. */
  viewer: z.string().max(4000).optional(),
});
export type TrackEventInput = z.infer<typeof trackEventSchema>;

export interface AnalyticsOverview {
  totals: Record<string, number>; // by event type
  uniqueVisitors: number;
  leads: number;
  from: string;
  to: string;
}

export interface TimeseriesPoint {
  day: string;
  VIEW: number;
  CLICK: number;
  SAVE: number;
  SHARE: number;
  NFC_SCAN: number;
}

// Result of the NFC gateway resolution (for native apps that render instead of redirect).
export interface NfcResolution {
  tagUid: string;
  cardSlug: string;
  action: { type: ActionType; target: string } | null;
  redirectUrl: string;
  visitorId: string;
  /** ok: a card to open · unassigned: no card yet · disabled / unknown: not a working chip. */
  state: 'ok' | 'unassigned' | 'disabled' | 'unknown';
}

// Departments
export const createDepartmentSchema = z.object({
  name: z.string().min(1).max(120),
  managerId: z.string().optional(),
  color: z.string().max(30).optional(),
});
export type CreateDepartmentInput = z.infer<typeof createDepartmentSchema>;

export const updateDepartmentSchema = z.object({
  name: z.string().min(1).max(120).optional(),
  managerId: z.string().nullable().optional(),
  color: z.string().max(30).nullable().optional(),
});
export type UpdateDepartmentInput = z.infer<typeof updateDepartmentSchema>;

// Approvals
export const createApprovalSchema = z.object({
  type: z.string().min(1).max(60),
  title: z.string().min(1).max(200),
  description: z.string().max(2000).optional(),
  metadata: z.record(z.unknown()).optional(),
});
export type CreateApprovalInput = z.infer<typeof createApprovalSchema>;

export const resolveApprovalSchema = z.object({
  status: z.enum(['APPROVED', 'REJECTED']),
  comment: z.string().max(1000).optional(),
});
export type ResolveApprovalInput = z.infer<typeof resolveApprovalSchema>;

// --- Occasions (dated markers on a workspace's charts) ---
const dayField = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use a date like 2026-09-20');
/** Longest occasion, in days: long enough for a season, short of covering every chart. */
export const OCCASION_MAX_DAYS = 62;
export const createOccasionSchema = z.object({
  name: z.string().trim().min(1).max(80),
  startsOn: dayField,
  endsOn: dayField,
});
export type CreateOccasionInput = z.infer<typeof createOccasionSchema>;
export const updateOccasionSchema = createOccasionSchema.partial();
export type UpdateOccasionInput = z.infer<typeof updateOccasionSchema>;
export interface Occasion {
  id: string;
  name: string;
  /** YYYY-MM-DD, inclusive. */
  startsOn: string;
  /** YYYY-MM-DD, inclusive. */
  endsOn: string;
}
/** Why a date range cannot be an occasion, or null when it can. */
export function occasionRangeError(startsOn: string, endsOn: string): string | null {
  if (endsOn < startsOn) return 'The occasion ends before it starts';
  const days = (Date.parse(`${endsOn}T00:00:00Z`) - Date.parse(`${startsOn}T00:00:00Z`)) / 86_400_000 + 1;
  if (!Number.isFinite(days)) return 'Use a date like 2026-09-20';
  if (days > OCCASION_MAX_DAYS) return `An occasion can last at most ${OCCASION_MAX_DAYS} days`;
  return null;
}

// --- Working week ---
/**
 * Zones whose working week runs Sunday to Thursday (a Friday–Saturday
 * weekend): Egypt, Saudi Arabia and most of the Arab world. The UAE moved to a
 * Saturday–Sunday weekend in 2022, so it is not here.
 */
const SUN_THU_ZONES = new Set([
  'Africa/Cairo', 'Asia/Riyadh', 'Asia/Kuwait', 'Asia/Qatar', 'Asia/Bahrain', 'Asia/Muscat', 'Asia/Amman',
  'Asia/Baghdad', 'Asia/Damascus', 'Asia/Aden', 'Africa/Algiers', 'Africa/Tripoli', 'Africa/Khartoum',
]);

/** The weekdays (0 = Sunday) a card takes meetings on until its owner picks them. */
export function defaultWorkDays(timezone?: string | null, lang?: unknown): number[] {
  return lang === 'ar' || (timezone && SUN_THU_ZONES.has(timezone)) ? [0, 1, 2, 3, 4] : [1, 2, 3, 4, 5];
}

// ===========================================================================
//  Duplicate leads
// ===========================================================================

/** An email as compared for duplicates: trimmed, lower case. */
export function emailKey(email: string | null | undefined): string | null {
  const e = email?.trim().toLowerCase();
  return e && e.includes('@') ? e : null;
}

/**
 * A phone number as compared for duplicates: its digits, without the
 * international prefix or trunk zero, so "+20 100 123 4567", "0020100…" and
 * "0100 123 4567" are one number (an Egyptian number without a country code
 * is taken to be Egyptian). Too short to identify anyone: null.
 */
export function phoneKey(phone: string | null | undefined): string | null {
  // Arabic-Indic digits typed on an Arabic keyboard count too.
  let d = (phone ?? '')
    .replace(/[٠-٩]/g, (c) => String(c.charCodeAt(0) - 0x0660))
    .replace(/[۰-۹]/g, (c) => String(c.charCodeAt(0) - 0x06f0))
    .replace(/\D/g, '');
  if (d.startsWith('00')) d = d.slice(2);
  if (d.startsWith('20') && d.length === 12) d = d.slice(2);
  else if (d.startsWith('0')) d = d.replace(/^0+/, '');
  return d.length >= 7 ? d : null;
}

export interface DuplicateCandidate {
  id: string;
  email: string | null;
  phone: string | null;
}

/**
 * Leads that are the same person by a shared email or phone, gathered into
 * groups (a shares a phone with b, b an email with c: one group of three).
 * Groups keep the input's order, and each has the reason it was found.
 */
export function duplicateGroups<T extends DuplicateCandidate>(leads: T[]): { leads: T[]; by: ('email' | 'phone')[] }[] {
  const parent = leads.map((_, i) => i);
  const find = (i: number): number => (parent[i] === i ? i : (parent[i] = find(parent[i]!)));
  const reasons = new Map<number, Set<'email' | 'phone'>>();
  const firstWith = new Map<string, number>();
  leads.forEach((l, i) => {
    for (const [kind, key] of [['email', emailKey(l.email)], ['phone', phoneKey(l.phone)]] as const) {
      if (!key) continue;
      const seen = firstWith.get(`${kind}:${key}`);
      if (seen === undefined) {
        firstWith.set(`${kind}:${key}`, i);
        continue;
      }
      const a = find(seen);
      const b = find(i);
      const root = Math.min(a, b);
      const merged = new Set([...(reasons.get(a) ?? []), ...(reasons.get(b) ?? []), kind]);
      parent[Math.max(a, b)] = root;
      reasons.set(root, merged);
    }
  });
  const groups = new Map<number, T[]>();
  leads.forEach((l, i) => {
    const r = find(i);
    groups.set(r, [...(groups.get(r) ?? []), l]);
  });
  return [...groups.entries()]
    .filter(([, g]) => g.length > 1)
    .map(([root, g]) => ({ leads: g, by: [...(reasons.get(root) ?? [])].sort() }));
}

/** One group of leads, however they are ordered: their ids, sorted and joined. */
export const duplicateKey = (leads: { id: string }[]) => leads.map((l) => l.id).sort().join(',');

// Marking a group of leads as different people, for the whole team.
export const dismissDuplicatesSchema = z.object({ leadIds: z.array(z.string().min(1)).min(2).max(50) });
export type DismissDuplicatesInput = z.infer<typeof dismissDuplicatesSchema>;

// Merging duplicates into the lead that is kept.
export const mergeLeadsSchema = z.object({ duplicateIds: z.array(z.string().min(1)).min(1).max(20) });
export type MergeLeadsInput = z.infer<typeof mergeLeadsSchema>;

// ===========================================================================
//  Team goals
// ===========================================================================

export const GOAL_METRICS = ['LEADS', 'TAPS', 'MEETINGS', 'WON_DEALS', 'WON_VALUE'] as const;
export type GoalMetric = (typeof GOAL_METRICS)[number];
export const GOAL_PERIODS = ['WEEK', 'MONTH'] as const;
export type GoalPeriod = (typeof GOAL_PERIODS)[number];
export const GOAL_SCOPES = ['TEAM', 'EACH', 'MEMBER'] as const;
export type GoalScope = (typeof GOAL_SCOPES)[number];

// A target for the team's total, for each member alike, or for one member.
export const setGoalSchema = z
  .object({
    metric: z.enum(GOAL_METRICS),
    period: z.enum(GOAL_PERIODS),
    scope: z.enum(GOAL_SCOPES),
    userId: z.string().min(1).optional(),
    target: z.number().int().min(1).max(1_000_000_000),
  })
  .refine((g) => (g.scope === 'MEMBER') === !!g.userId, { message: 'Choose the member this goal is for', path: ['userId'] });
export type SetGoalInput = z.infer<typeof setGoalSchema>;

// ===========================================================================
//  Signed-in devices
// ===========================================================================

export type DeviceKind = 'phone' | 'tablet' | 'desktop';

export interface DeviceInfo {
  browser: string | null;
  os: string | null;
  kind: DeviceKind;
}

/**
 * What a browser's user agent says it is, in words a person recognises:
 * "Chrome", "iPhone", "phone". Unknown parts stay null rather than guessed.
 */
export function describeDevice(ua: string | null | undefined): DeviceInfo {
  const s = ua ?? '';
  // The Vertex Connect app names itself (apps/mobile/src/lib/api.ts).
  const browser = /VertexConnectApp\//.test(s)
    ? 'Vertex app'
    : /Edg(e|A|iOS)?\//.test(s)
    ? 'Edge'
    : /OPR\/|Opera/.test(s)
      ? 'Opera'
      : /SamsungBrowser\//.test(s)
        ? 'Samsung Internet'
        : /Firefox\/|FxiOS\//.test(s)
          ? 'Firefox'
          : /Chrome\/|CriOS\//.test(s)
            ? 'Chrome'
            : /Safari\//.test(s) && /Version\//.test(s)
              ? 'Safari'
              : null;
  const os = /iPhone/.test(s)
    ? 'iPhone'
    : /iPad/.test(s)
      ? 'iPad'
      : /Android/.test(s)
        ? 'Android'
        : /Windows/.test(s)
          ? 'Windows'
          : /Mac OS X|Macintosh/.test(s)
            ? 'macOS'
            : /CrOS/.test(s)
              ? 'ChromeOS'
              : /Linux/.test(s)
                ? 'Linux'
                : null;
  const kind: DeviceKind = /iPad|Tablet/.test(s) || (/Android/.test(s) && !/Mobile/.test(s)) ? 'tablet' : /Mobi|iPhone/.test(s) ? 'phone' : 'desktop';
  return { browser, os, kind };
}

/** "Chrome on Windows", or as much of it as is known. */
export function deviceLabel(ua: string | null | undefined): string {
  const { browser, os } = describeDevice(ua);
  if (browser && os) return `${browser} on ${os}`;
  return browser ?? os ?? 'Unknown device';
}

// ===========================================================================
//  Errors seen in browsers
// ===========================================================================

/** What a browser reports about an error the page met (see apps/web/lib/report-error.ts). */
export const clientErrorSchema = z.object({
  kind: z.enum(['error', 'unhandledrejection', 'react']),
  name: z.string().trim().max(120).default('Error'),
  message: z.string().trim().max(1000),
  stack: z.string().max(8000).optional(),
  /** The page, without its query string or fragment. */
  path: z.string().max(300).optional(),
  release: z.string().max(80).optional(),
});
export type ClientErrorInput = z.infer<typeof clientErrorSchema>;

export interface ErrorGroupView {
  id: string;
  source: 'BROWSER' | 'API';
  kind: string;
  name: string;
  message: string;
  stack: string | null;
  path: string | null;
  userAgent: string | null;
  release: string | null;
  count: number;
  users: number;
  firstSeenAt: string;
  lastSeenAt: string;
  resolvedAt: string | null;
}

// ===========================================================================
//  Custom fields on leads
// ===========================================================================

export const CUSTOM_FIELD_TYPES = ['TEXT', 'NUMBER', 'DATE', 'SELECT', 'CHECKBOX', 'URL'] as const;
export type CustomFieldType = (typeof CUSTOM_FIELD_TYPES)[number];
/** Fields a workspace may add to its leads. */
export const MAX_CUSTOM_FIELDS = 30;

export interface CustomFieldDef {
  id: string;
  label: string;
  type: CustomFieldType;
  options: string[];
  order: number;
}

export const customFieldSchema = z
  .object({
    label: z.string().trim().min(1).max(60),
    type: z.enum(CUSTOM_FIELD_TYPES),
    options: z.array(z.string().trim().min(1).max(60)).max(50).default([]),
  })
  .refine((f) => f.type !== 'SELECT' || f.options.length > 0, { message: 'A choice field needs at least one option', path: ['options'] })
  .refine((f) => new Set(f.options.map((o) => o.toLowerCase())).size === f.options.length, { message: 'Each option once', path: ['options'] });
export type CustomFieldInput = z.infer<typeof customFieldSchema>;

export const updateCustomFieldSchema = z.object({
  label: z.string().trim().min(1).max(60).optional(),
  options: z.array(z.string().trim().min(1).max(60)).max(50).optional(),
});
export type UpdateCustomFieldInput = z.infer<typeof updateCustomFieldSchema>;

export const reorderCustomFieldsSchema = z.object({ ids: z.array(z.string().min(1)).max(MAX_CUSTOM_FIELDS) });

export type CustomFieldValue = string | number | boolean;

/**
 * A value for a field, as it is stored: text and links trimmed (a link must
 * be http(s)), numbers as numbers, dates as YYYY-MM-DD, a choice exactly as
 * one of its options (matched without case), a checkbox as true/false.
 * Empty clears the field (null); anything that does not fit is undefined.
 */
export function coerceFieldValue(field: Pick<CustomFieldDef, 'type' | 'options'>, raw: unknown): CustomFieldValue | null | undefined {
  if (raw === null || raw === undefined || (typeof raw === 'string' && !raw.trim())) return null;
  switch (field.type) {
    case 'TEXT': {
      const v = String(raw).trim();
      return v.length <= 500 ? v : undefined;
    }
    case 'URL': {
      let v = String(raw).trim();
      if (!/^https?:\/\//i.test(v)) v = `https://${v}`;
      // A web address: http(s), a host with a dot, no spaces.
      return /^https?:\/\/[^\s/:?#]+\.[^\s/:?#]+(:\d+)?([/?#]\S*)?$/i.test(v) && v.length <= 500 ? v : undefined;
    }
    case 'NUMBER': {
      const n = typeof raw === 'number' ? raw : Number(String(raw).replace(/[\s,]/g, ''));
      return Number.isFinite(n) && Math.abs(n) < 1e15 ? n : undefined;
    }
    case 'DATE': {
      const v = raw instanceof Date ? raw.toISOString().slice(0, 10) : String(raw).trim().slice(0, 10);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) return undefined;
      const d = new Date(`${v}T00:00:00Z`);
      return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === v ? v : undefined;
    }
    case 'CHECKBOX': {
      if (typeof raw === 'boolean') return raw;
      const v = String(raw).trim().toLowerCase();
      if (['true', 'yes', 'y', '1', 'نعم', 'أيوه', 'ايوه', '✓'].includes(v)) return true;
      if (['false', 'no', 'n', '0', 'لا'].includes(v)) return false;
      return undefined;
    }
    case 'SELECT': {
      const v = String(raw).trim().toLowerCase();
      return field.options.find((o) => o.toLowerCase() === v);
    }
  }
}

// ===========================================================================
//  Getting started
// ===========================================================================

export type OnboardingStepId =
  | 'createCard'
  | 'addPhoto'
  | 'addContact'
  | 'publishCard'
  | 'shareCard'
  | 'firstLead'
  | 'leadAlerts'
  | 'inviteTeam'
  | 'linkTag';

export interface OnboardingStep {
  id: OnboardingStepId;
  done: boolean;
  /** Where to go to do it. */
  href: string;
}

export interface OnboardingView {
  steps: OnboardingStep[];
  done: number;
  total: number;
  /** The welcome was shown (it is shown once). */
  welcomed: boolean;
  /** The guide was hidden by the person; it can be brought back. */
  dismissed: boolean;
  /** When every step was first done; the guide then makes way. */
  completedAt: string | null;
  /** Finished just now, by this request: say so once. */
  justCompleted: boolean;
  workspaceKind: 'PERSONAL' | 'TEAM' | null;
}

export const onboardingUpdateSchema = z.object({
  welcomed: z.literal(true).optional(),
  dismissed: z.boolean().optional(),
});
export type OnboardingUpdate = z.infer<typeof onboardingUpdateSchema>;

// ── Help & support ──────────────────────────────────────────────────────────
export const SUPPORT_TOPICS = ['account', 'billing', 'cards', 'leads', 'chips', 'team', 'integrations', 'bug', 'other'] as const;
export type SupportTopic = (typeof SUPPORT_TOPICS)[number];

export const supportRequestSchema = z.object({
  topic: z.enum(SUPPORT_TOPICS),
  subject: z.string().trim().min(3).max(140),
  message: z.string().trim().min(10).max(5000),
  /** The page they were on, without its query. */
  page: z.string().trim().max(300).optional(),
  /** The language to confirm in. */
  lang: z.enum(['en', 'ar']).optional(),
});
export type SupportRequestInput = z.infer<typeof supportRequestSchema>;

export interface SupportRequestView {
  id: string;
  ref: string;
  topic: SupportTopic;
  subject: string;
  message: string;
  status: 'OPEN' | 'CLOSED';
  createdAt: string;
  closedAt: string | null;
}

export const helpFeedbackSchema = z.object({
  article: z.string().trim().regex(/^[a-z0-9-]{2,60}$/),
  helpful: z.boolean(),
});
export type HelpFeedbackInput = z.infer<typeof helpFeedbackSchema>;

// ── Status page ─────────────────────────────────────────────────────────────
export const STATUS_COMPONENTS = ['app', 'cards', 'email', 'webhooks'] as const;
export type StatusComponentId = (typeof STATUS_COMPONENTS)[number];
export type ComponentState = 'OPERATIONAL' | 'DEGRADED' | 'OUTAGE' | 'MAINTENANCE';
export const INCIDENT_IMPACTS = ['MINOR', 'MAJOR', 'MAINTENANCE'] as const;
export const INCIDENT_STATUSES = ['SCHEDULED', 'INVESTIGATING', 'IDENTIFIED', 'MONITORING', 'RESOLVED'] as const;
export type IncidentImpact = (typeof INCIDENT_IMPACTS)[number];
export type IncidentStatus = (typeof INCIDENT_STATUSES)[number];

export interface StatusIncidentView {
  id: string;
  title: string;
  titleAr: string | null;
  impact: IncidentImpact;
  status: IncidentStatus;
  components: StatusComponentId[];
  startsAt: string | null;
  endsAt: string | null;
  resolvedAt: string | null;
  createdAt: string;
  updates: { id: string; status: IncidentStatus; message: string; messageAr: string | null; createdAt: string }[];
}

export interface StatusView {
  /** The worst state of any part right now. */
  overall: ComponentState;
  components: {
    id: StatusComponentId;
    state: ComponentState;
    /** Share of checks over the last 90 days that found it working; null before any check. */
    uptime: number | null;
    /** Oldest first, 90 days; null where there was no check that day. */
    days: { day: string; uptime: number | null; worst: ComponentState | null }[];
  }[];
  /** Not yet resolved: going on now, or maintenance still to come. */
  active: StatusIncidentView[];
  /** Resolved in the last 14 days, newest first. */
  recent: StatusIncidentView[];
  checkedAt: string | null;
}

const statusText = z.string().trim().min(2).max(2000);
export const createIncidentSchema = z
  .object({
    title: z.string().trim().min(3).max(160),
    titleAr: z.string().trim().max(160).optional().or(z.literal('')),
    impact: z.enum(INCIDENT_IMPACTS),
    status: z.enum(INCIDENT_STATUSES).default('INVESTIGATING'),
    components: z.array(z.enum(STATUS_COMPONENTS)).min(1),
    message: statusText,
    messageAr: z.string().trim().max(2000).optional().or(z.literal('')),
    startsAt: z.string().datetime().optional(),
    endsAt: z.string().datetime().optional(),
  })
  .refine((d) => d.impact !== 'MAINTENANCE' || (!!d.startsAt && !!d.endsAt), { message: 'Maintenance needs a start and an end', path: ['startsAt'] })
  .refine((d) => !d.startsAt || !d.endsAt || d.endsAt > d.startsAt, { message: 'The end has to be after the start', path: ['endsAt'] });
export type CreateIncidentInput = z.infer<typeof createIncidentSchema>;

export const incidentUpdateSchema = z.object({
  status: z.enum(INCIDENT_STATUSES),
  message: statusText,
  messageAr: z.string().trim().max(2000).optional().or(z.literal('')),
});
export type IncidentUpdateInput = z.infer<typeof incidentUpdateSchema>;

// ── Tips and reminders by email ─────────────────────────────────────────────
export const unsubscribeSchema = z.object({ u: z.string().min(1).max(40), t: z.string().min(1).max(64) });
export const uiLanguageSchema = z.object({ lang: z.enum(['en', 'ar']) });
export const ENGAGEMENT_PREVIEW_KINDS = ['finishCard', 'shareCard', 'inviteTeam', 'leadsWaiting'] as const;
export const engagementPreviewSchema = z.object({ kind: z.enum(ENGAGEMENT_PREVIEW_KINDS), lang: z.enum(['en', 'ar']) });

// ── Custom roles ────────────────────────────────────────────────────────────
/**
 * The parts of a workspace a role can be given, and the levels each has:
 * basic is what a manager can do there, full what an admin can. A custom
 * role is a base role (which decides what data its holder sees, like all
 * leads or their own) plus a level per area (which decides what they can
 * change). Changing roles, ownership and deleting the workspace are never
 * part of one.
 */
export const PERMISSION_AREAS = [
  { id: 'people', levels: ['basic', 'full'] },
  { id: 'teams', levels: ['basic', 'full'] },
  { id: 'cards', levels: ['basic', 'full'] },
  { id: 'leads', levels: ['basic', 'full'] },
  { id: 'chips', levels: ['basic'] },
  { id: 'analytics', levels: ['basic'] },
  { id: 'workspace', levels: ['basic', 'full'] },
  { id: 'integrations', levels: ['basic', 'full'] },
  { id: 'billing', levels: ['full'] },
] as const;
export type PermissionArea = (typeof PERMISSION_AREAS)[number]['id'];
export type PermissionLevel = 'basic' | 'full';
export const CUSTOM_ROLE_BASES = ['ADMIN', 'MANAGER', 'EMPLOYEE'] as const;
export type CustomRoleBase = (typeof CUSTOM_ROLE_BASES)[number];

const ALL_CAPABILITIES = new Set<string>(PERMISSION_AREAS.flatMap((a) => a.levels.map((l) => `${a.id}:${l}`)));
export const isCapability = (c: string) => ALL_CAPABILITIES.has(c);

/** What a built-in role can do, as capabilities: admins everything, managers every basic level, employees none. */
export function roleCapabilities(role: string): string[] {
  if (role === 'OWNER' || role === 'ADMIN') return PERMISSION_AREAS.flatMap((a) => a.levels.map((l) => `${a.id}:${l}`));
  if (role === 'MANAGER') return PERMISSION_AREAS.filter((a) => (a.levels as readonly string[]).includes('basic')).map((a) => `${a.id}:basic`);
  return [];
}

/** Whether a set of capabilities reaches `level` in `area`; full includes basic. */
export function hasCapability(caps: readonly string[], area: string, level: PermissionLevel): boolean {
  return caps.includes(`${area}:${level}`) || (level === 'basic' && caps.includes(`${area}:full`));
}

/** What someone can do: their custom role's capabilities, or their built-in role's. */
export function capabilitiesOf(role: string | undefined | null, customRole?: { capabilities: string[] } | null): string[] {
  return customRole ? customRole.capabilities : role ? roleCapabilities(role) : [];
}

export const customRoleSchema = z.object({
  name: z.string().trim().min(2).max(60),
  description: z.string().trim().max(200).optional().or(z.literal('')),
  base: z.enum(CUSTOM_ROLE_BASES),
  capabilities: z
    .array(z.string())
    .max(40)
    .refine((cs) => cs.every(isCapability), { message: 'Unknown permission' }),
});
export type CustomRoleInput = z.infer<typeof customRoleSchema>;
export const assignCustomRoleSchema = z.object({ membershipId: z.string().min(1).max(40), customRoleId: z.string().min(1).max(40).nullable() });

export interface CustomRoleView {
  id: string;
  name: string;
  description: string | null;
  base: CustomRoleBase;
  capabilities: string[];
  members: number;
  createdAt: string;
}

// ── Single sign-on ──────────────────────────────────────────────────────────

export const SSO_PROVIDERS = ['GOOGLE', 'MICROSOFT', 'OIDC'] as const;
export type SsoProvider = (typeof SSO_PROVIDERS)[number];

/** Where a provider is found: fixed for Google, by directory for Microsoft, typed out for any other. */
export function ssoIssuer(provider: SsoProvider, opts: { tenantId?: string; issuer?: string }): string {
  if (provider === 'GOOGLE') return 'https://accounts.google.com';
  if (provider === 'MICROSOFT') return `https://login.microsoftonline.com/${(opts.tenantId ?? '').trim()}/v2.0`;
  return (opts.issuer ?? '').trim().replace(/\/$/, '');
}

const DOMAIN_RE = /^(?=.{3,253}$)([a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/;
// A Microsoft directory: its id, or one of its domains.
const TENANT_RE = /^([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}|[a-z0-9.-]+\.[a-z]{2,})$/i;

export const ssoConnectionSchema = z
  .object({
    provider: z.enum(SSO_PROVIDERS),
    tenantId: z.string().trim().max(100).optional(),
    issuer: z.string().trim().max(300).optional(),
    clientId: z.string().trim().min(1).max(300),
    /** Left out when editing keeps the stored one. */
    clientSecret: z.string().trim().max(2000).optional(),
  })
  .superRefine((v, ctx) => {
    if (v.provider === 'MICROSOFT' && !TENANT_RE.test(v.tenantId ?? '')) {
      ctx.addIssue({ code: 'custom', path: ['tenantId'], message: 'Enter the directory (tenant) ID' });
    }
    if (v.provider === 'OIDC' && !/^https?:\/\/\S+$/.test(v.issuer ?? '')) {
      ctx.addIssue({ code: 'custom', path: ['issuer'], message: 'Enter the issuer address' });
    }
  });
export type SsoConnectionInput = z.infer<typeof ssoConnectionSchema>;

export const ssoSettingsSchema = z.object({
  enforced: z.boolean().optional(),
  autoJoin: z.boolean().optional(),
  joinRole: z.enum(['ADMIN', 'MANAGER', 'EMPLOYEE']).optional(),
});
export type SsoSettingsInput = z.infer<typeof ssoSettingsSchema>;

export const ssoDomainSchema = z.object({
  domain: z
    .string()
    .trim()
    .toLowerCase()
    .transform((d) => d.replace(/^@/, ''))
    .refine((d) => DOMAIN_RE.test(d), { message: 'Enter a domain like example.com' }),
});
export const ssoStartSchema = z.object({ email: z.string().trim().email().max(254) });
export const ssoCallbackSchema = z.object({ code: z.string().min(1).max(4000), state: z.string().min(1).max(4000) });
export type SsoCallbackInput = z.infer<typeof ssoCallbackSchema>;

export interface SsoDomainView {
  id: string;
  domain: string;
  /** The TXT record to add at the domain. */
  record: string;
  verifiedAt: string | null;
}

export interface SsoView {
  connection: {
    provider: SsoProvider;
    issuer: string;
    tenantId: string | null;
    clientId: string;
    testedAt: string | null;
    enforced: boolean;
    autoJoin: boolean;
    joinRole: 'ADMIN' | 'MANAGER' | 'EMPLOYEE';
    lastUsedAt: string | null;
  } | null;
  domains: SsoDomainView[];
  /** What to give the provider as the app's redirect (reply) address. */
  redirectUri: string;
}

/** What the callback page gets: a session, the code screen, or a test's result. */
export type SsoCallbackResult = SignInResult | { tested: true; email: string };
