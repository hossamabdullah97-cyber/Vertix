import { z } from 'zod';

// ===========================================================================
//  Shared enums (mirror Prisma)
// ===========================================================================

export const Role = z.enum(['OWNER', 'ADMIN', 'MANAGER', 'EMPLOYEE']);
export type Role = z.infer<typeof Role>;

export const Plan = z.enum(['FREE', 'PRO', 'BUSINESS', 'ENTERPRISE']);
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
  return plan === 'PRO' || plan === 'BUSINESS' || plan === 'ENTERPRISE';
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

export const checkoutSchema = z.object({
  plan: z.enum(['PRO', 'BUSINESS']),
  /** Paymob asks for the payer's mobile number. */
  phone: z.string().trim().regex(/^\+?[0-9 ]{8,16}$/, 'Enter a mobile number'),
});
export type CheckoutInput = z.infer<typeof checkoutSchema>;

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

export const registerSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8, 'Password must be at least 8 characters'),
  name: z.string().min(1).max(120).optional(),
  organizationName: z.string().min(1).max(120),
});
export type RegisterInput = z.infer<typeof registerSchema>;

export const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});
export type LoginInput = z.infer<typeof loginSchema>;

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
}

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
}

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
    source: z.enum(['card_scan', 'manual']).default('manual'),
  })
  .refine((d) => !!d.name || !!d.email || !!d.phone, { message: 'Give a name, an email or a phone number', path: ['name'] });
export type CreateLeadInput = z.infer<typeof createLeadSchema>;

// A user-logged CRM activity on a lead (note / call / email / meeting).
export const addLeadActivitySchema = z.object({
  type: z.enum(['NOTE', 'CALL', 'EMAIL', 'WHATSAPP', 'MEETING']),
  note: z.string().max(2000).optional(),
  meetingAt: z.string().optional(), // ISO datetime for MEETING
});
export type AddLeadActivityInput = z.infer<typeof addLeadActivitySchema>;

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
