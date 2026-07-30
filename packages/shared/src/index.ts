import { z } from 'zod';

// ===========================================================================
//  Shared enums (mirror Prisma)
// ===========================================================================

export const Role = z.enum(['OWNER', 'ADMIN', 'MANAGER', 'EMPLOYEE']);
export type Role = z.infer<typeof Role>;

export const Plan = z.enum(['FREE', 'PRO', 'BUSINESS', 'ENTERPRISE']);
export type Plan = z.infer<typeof Plan>;

// Plan limits & pricing. null = unlimited. price = monthly USD.
export interface PlanDef {
  label: string;
  price: number;
  cards: number | null;
  members: number | null;
  nfcTags: number | null;
}

export const PLAN_LIMITS: Record<Plan, PlanDef> = {
  FREE: { label: 'Free', price: 0, cards: 1, members: 2, nfcTags: 5 },
  PRO: { label: 'Pro', price: 19, cards: 5, members: 5, nfcTags: 50 },
  BUSINESS: { label: 'Business', price: 79, cards: 25, members: 25, nfcTags: 500 },
  ENTERPRISE: { label: 'Enterprise', price: 0, cards: null, members: null, nfcTags: null },
};

/**
 * Whether a plan is paid. This is what earns an account its verified badge —
 * the badge is never self-declared, it is derived from the organization's plan.
 * ENTERPRISE is priced at 0 in the table because it is quoted per contract, so
 * it is listed explicitly rather than inferred from `price`.
 */
export function isPaidPlan(plan: Plan | null | undefined): boolean {
  return plan === 'PRO' || plan === 'BUSINESS' || plan === 'ENTERPRISE';
}

export interface UsageSummary {
  plan: Plan;
  limits: PlanDef;
  usage: { cards: number; members: number; nfcTags: number };
  status: string;
}

export const checkoutSchema = z.object({
  plan: z.enum(['PRO', 'BUSINESS']),
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

export const refreshSchema = z.object({
  refreshToken: z.string().min(1),
});
export type RefreshInput = z.infer<typeof refreshSchema>;

export const forgotPasswordSchema = z.object({
  email: z.string().email(),
});
export type ForgotPasswordInput = z.infer<typeof forgotPasswordSchema>;

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

export const createTagSchema = z.object({
  uid: z.string().min(1).max(120), // physical UID from the manufacturer
  hardwareType: HardwareType.optional(),
  batchId: z.string().max(120).optional(),
});
export type CreateTagInput = z.infer<typeof createTagSchema>;

// Factory batch registration — the manufacturer provides the list of UIDs.
export const createTagsBatchSchema = z.object({
  uids: z.array(z.string().min(1).max(120)).min(1).max(1000),
  hardwareType: HardwareType.optional(),
  batchId: z.string().max(120).optional(),
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
  })
  .refine((d) => !!d.email || !!d.phone, {
    message: 'Provide an email or a phone number',
    path: ['email'],
  });
export type LeadCaptureInput = z.infer<typeof leadCaptureSchema>;

// A user-logged CRM activity on a lead (note / call / email / meeting).
export const addLeadActivitySchema = z.object({
  type: z.enum(['NOTE', 'CALL', 'EMAIL', 'MEETING']),
  note: z.string().max(2000).optional(),
  meetingAt: z.string().optional(), // ISO datetime for MEETING
});
export type AddLeadActivityInput = z.infer<typeof addLeadActivitySchema>;

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
