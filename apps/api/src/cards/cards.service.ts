import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, type TenantContext } from '@vertex/db';
import { isPaidPlan, type CreateCardInput, type UpdateCardInput } from '@vertex/shared';
import { PrismaService } from '../prisma/prisma.service';
import { LimitsService } from '../billing/limits.service';

const MANAGER_ROLES = ['OWNER', 'ADMIN', 'MANAGER'];

function isManager(role: string): boolean {
  return MANAGER_ROLES.includes(role);
}

@Injectable()
export class CardsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly limits: LimitsService,
  ) {}

  private get db() {
    return this.prisma.client;
  }

  async create(tenant: TenantContext, input: CreateCardInput) {
    const ownerId = input.ownerId ?? tenant.userId;
    if (ownerId !== tenant.userId && !isManager(tenant.role)) {
      throw new ForbiddenException('You cannot create a card for another user');
    }
    await this.limits.assertWithin(tenant.orgId, 'cards');

    const theme = (input.theme ?? undefined) as Prisma.InputJsonValue;
    // Seed the bio + vCard when a name is provided, so the card is useful immediately.
    const vcardData = input.fullName
      ? ({ fullName: input.fullName, ...(input.title ? { title: input.title } : {}) } as Prisma.InputJsonValue)
      : undefined;
    const sections = input.fullName
      ? {
          create: [
            {
              type: 'BIO' as const,
              order: 0,
              isVisible: true,
              content: { title: input.fullName, subtitle: input.title ?? '' } as Prisma.InputJsonValue,
            },
          ],
        }
      : undefined;

    const build = (slug: string): Prisma.CardUncheckedCreateInput => ({
      orgId: tenant.orgId,
      ownerId,
      slug,
      templateId: input.templateId,
      theme,
      ...(vcardData ? { vcardData } : {}),
      ...(sections ? { sections } : {}),
    });

    // Explicit slug: honour it (conflict is a real error).
    if (input.slug) {
      try {
        return await this.db.card.create({ data: build(input.slug) });
      } catch (err) {
        throw this.mapSlugConflict(err);
      }
    }

    // Auto slug: derive from the name (or "card") and retry with a suffix on collision.
    const base = this.slugify(input.fullName ?? '') || 'card';
    for (let attempt = 0; attempt < 8; attempt++) {
      const candidate = attempt === 0 ? base : `${base}-${this.randomToken(4)}`;
      try {
        return await this.db.card.create({ data: build(candidate) });
      } catch (err) {
        if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
          continue;
        }
        throw err;
      }
    }
    throw new ConflictException('Could not generate a unique card link');
  }

  private slugify(input: string): string {
    return input
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 40);
  }

  private randomToken(n = 4): string {
    return Math.random().toString(36).slice(2, 2 + n);
  }

  list(tenant: TenantContext) {
    // Employees see only their own cards; managers and above see all org cards (orgId is automatic).
    const where = isManager(tenant.role) ? {} : { ownerId: tenant.userId };
    return this.db.card.findMany({
      where,
      include: {
        // Base profile only (variantId null); variant sections/actions load per-variant.
        actions: { where: { deletedAt: null, variantId: null } },
        sections: { where: { deletedAt: null, variantId: null } },
        _count: { select: { variants: { where: { deletedAt: null } } } },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findOne(tenant: TenantContext, id: string) {
    const card = await this.db.card.findFirst({
      where: { id },
      include: {
        sections: { where: { deletedAt: null, variantId: null }, orderBy: { order: 'asc' } },
        actions: { where: { deletedAt: null, variantId: null }, orderBy: { order: 'asc' } },
      },
    });
    if (!card) throw new NotFoundException('Card not found');
    if (!isManager(tenant.role) && card.ownerId !== tenant.userId) {
      throw new ForbiddenException('You do not have permission to view this card');
    }
    return card;
  }

  async update(tenant: TenantContext, id: string, input: UpdateCardInput) {
    await this.ensureEditable(tenant, id);
    try {
      return await this.db.card.update({
        where: { id },
        data: input as Prisma.CardUpdateInput,
      });
    } catch (err) {
      throw this.mapSlugConflict(err);
    }
  }

  async remove(tenant: TenantContext, id: string) {
    await this.ensureEditable(tenant, id);
    await this.db.card.softDelete({ id });
    return { id, deleted: true };
  }

  /**
   * Verifies the card exists within the organization (orgId is automatic) and
   * that the user is allowed to edit it. Also used by the sections/actions
   * services to enforce child isolation through the parent.
   */
  async ensureEditable(tenant: TenantContext, cardId: string) {
    const card = await this.db.card.findFirst({ where: { id: cardId } });
    if (!card) throw new NotFoundException('Card not found');
    if (!isManager(tenant.role) && card.ownerId !== tenant.userId) {
      throw new ForbiddenException('You do not have permission to edit this card');
    }
    return card;
  }

  /**
   * Public view of a published card by slug (no tenant context). Resolves which
   * identity profile to serve from the card's variants using the Smart Identity Engine:
   *   1. If direct link (?p=accessKey) is used, forces that variant.
   *   2. Otherwise evaluates visibility rules, schedules, and priority weights.
   *   3. Randomly distributes traffic if A/B testing is active.
   *   4. Falls back to base profile (default identity).
   */
  async getPublicBySlug(
    slug: string,
    opts: { p?: string; code?: string; req?: any } = {},
  ) {
    const card = await this.db.card.findFirst({
      where: { slug, isPublished: true },
      select: {
        id: true,
        slug: true,
        templateId: true,
        theme: true,
        vcardData: true,
        // The verified badge is earned by the owning org's plan, never
        // self-declared in vcardData.
        org: { select: { plan: true } },
        sections: {
          where: { isVisible: true, deletedAt: null, variantId: null },
          orderBy: { order: 'asc' },
          select: { id: true, type: true, order: true, content: true },
        },
        actions: {
          where: { isActive: true, deletedAt: null, variantId: null },
          orderBy: { order: 'asc' },
          select: { id: true, type: true, order: true, config: true },
        },
        paymentLinks: {
          where: { isActive: true, deletedAt: null, variantId: null },
          orderBy: { order: 'asc' },
          select: { id: true, platform: true, displayName: true, url: true, description: true, order: true },
        },
        variants: {
          where: { deletedAt: null },
          orderBy: { order: 'asc' },
          select: {
            id: true,
            name: true,
            order: true,
            templateId: true,
            theme: true,
            vcardData: true,
            accessKey: true,
            passcode: true,
            scheduleStart: true,
            scheduleEnd: true,
            manualActive: true,
          },
        },
      },
    });
    if (!card) return null;

    const req = opts.req || { headers: {}, query: {} };
    const query = req.query || {};
    
    // 1. Build visitor context
    const visitorContext = getVisitorContext(req, { ...query, p: opts.p, code: opts.code });

    const variants = card.variants ?? [];
    let chosen: (typeof variants)[number] | null = null;
    let abSelection: 'A' | 'B' | null = null;

    // 2. Evaluate all matching variants in the engine
    const matchedVariants = variants
      .map((v) => {
        const resScore = calculateResolutionScore(v, visitorContext);
        return { variant: v, ...resScore };
      })
      .filter((r) => r.isMatch);

    if (matchedVariants.length > 0) {
      // Sort matching variants:
      // A. Access key (private key) variants have absolute top priority
      // B. Priority order ascending (lower order first)
      // C. Score descending (more rules satisfied is higher priority)
      // D. Specificity descending (more specific rules go first)
      matchedVariants.sort((a, b) => {
        const isAccessKeyA = a.variant.accessKey ? 1 : 0;
        const isAccessKeyB = b.variant.accessKey ? 1 : 0;
        if (isAccessKeyB !== isAccessKeyA) return isAccessKeyB - isAccessKeyA;
        if (a.priority !== b.priority) return a.priority - b.priority;
        if (b.score !== a.score) return b.score - a.score;
        return b.specificity - a.specificity;
      });

      const bestMatch = matchedVariants[0].variant;

      // 3. A/B testing evaluation
      const rulesEngine = (bestMatch.theme as any)?.rulesEngine || {};
      const abTest = rulesEngine.abTest || {};
      if (abTest.enabled && abTest.competingVariantId) {
        const visitorKey = visitorContext.p || visitorContext.ip || 'anonymous';
        const splitPct = abTest.split || 50;
        abSelection = getABSelection(visitorKey, splitPct);

        if (abSelection === 'B') {
          // Route to competing variant
          const compVariant = variants.find((v) => v.id === abTest.competingVariantId);
          if (compVariant) {
            chosen = compVariant;
          } else {
            chosen = bestMatch;
          }
        } else {
          chosen = bestMatch;
        }
      } else {
        chosen = bestMatch;
      }
    }

    const verified = isPaidPlan(card.org?.plan);

    const base = {
      id: card.id,
      slug: card.slug,
      templateId: card.templateId,
      theme: card.theme,
      vcardData: card.vcardData,
      sections: card.sections,
      actions: card.actions,
      paymentLinks: card.paymentLinks,
      verified,
      profileName: null as string | null,
      abTestGroup: null as string | null,
    };

    // 4. Fallback to default base profile
    if (!chosen) return base;

    // Passcode gate: reveal only when the correct code is supplied
    if (chosen.passcode && chosen.passcode !== opts.code) {
      return {
        id: card.id,
        slug: card.slug,
        locked: true as const,
        profileName: chosen.name,
        requiresPasscode: true as const,
      };
    }

    const [sections, actions, paymentLinks] = await Promise.all([
      this.db.cardSection.findMany({
        where: { variantId: chosen.id, isVisible: true, deletedAt: null },
        orderBy: { order: 'asc' },
        select: { id: true, type: true, order: true, content: true },
      }),
      this.db.cardAction.findMany({
        where: { variantId: chosen.id, isActive: true, deletedAt: null },
        orderBy: { order: 'asc' },
        select: { id: true, type: true, order: true, config: true },
      }),
      // Each identity carries its own payment links (section 9).
      this.db.paymentLink.findMany({
        where: { variantId: chosen.id, isActive: true, deletedAt: null },
        orderBy: { order: 'asc' },
        select: { id: true, platform: true, displayName: true, url: true, description: true, order: true },
      }),
    ]);

    // Payment methods are usually the same across identities, so when an
    // identity defines none of its own we fall back to the base profile's
    // payment links (added in the main Card Builder). This prevents links from
    // silently disappearing on identity-resolved public cards; an identity that
    // adds its own links overrides the base set.
    const resolvedPaymentLinks = paymentLinks.length > 0 ? paymentLinks : card.paymentLinks;

    return {
      id: card.id,
      slug: card.slug,
      templateId: chosen.templateId,
      theme: chosen.theme ?? card.theme,
      vcardData: chosen.vcardData ?? card.vcardData,
      sections,
      actions,
      paymentLinks: resolvedPaymentLinks,
      verified,
      profileName: chosen.name,
      abTestGroup: abSelection,
    };
  }

  private mapSlugConflict(err: unknown): unknown {
    if (
      err instanceof Prisma.PrismaClientKnownRequestError &&
      err.code === 'P2002'
    ) {
      return new ConflictException('slug is already in use');
    }
    if (
      err instanceof Prisma.PrismaClientKnownRequestError &&
      err.code === 'P2003'
    ) {
      return new NotFoundException('Selected organization or account owner no longer exists');
    }
    return err;
  }
}

// ============================================================================
//  SMART IDENTITY ENGINE RESOLUTION HELPERS
// ============================================================================

export interface VisitorContext {
  device: string;
  os: string;
  browser: string;
  language: string;
  country: string;
  region: string;
  city: string;
  timezone: string;
  trafficSource: string;
  utmSource?: string;
  utmMedium?: string;
  utmCampaign?: string;
  visitorType: string;
  dateTime: Date;
  p?: string;
  code?: string;
  ip: string;
}

export function parseUserAgent(ua: string): { device: string; os: string; browser: string } {
  ua = ua.toLowerCase();
  
  let device = 'Desktop';
  if (/ipad|tablet|playbook|silk/i.test(ua)) {
    device = 'Tablet';
  } else if (/mobile|iphone|ipod|android|blackberry|iemobile|opera mini/i.test(ua)) {
    device = 'Mobile';
  }

  let os = 'Unknown';
  if (/iphone|ipad|ipod/i.test(ua)) {
    os = 'iOS';
  } else if (/android/i.test(ua)) {
    os = 'Android';
  } else if (/windows/i.test(ua)) {
    os = 'Windows';
  } else if (/macintosh|mac os x/i.test(ua)) {
    os = 'macOS';
  } else if (/linux/i.test(ua)) {
    os = 'Linux';
  }

  let browser = 'Unknown';
  if (/chrome|crios|crmodo/i.test(ua) && !/edge|edg|opr|opera/i.test(ua)) {
    browser = 'Chrome';
  } else if (/safari/i.test(ua) && !/chrome|crios|opr|opera|edge|edg/i.test(ua)) {
    browser = 'Safari';
  } else if (/firefox|iceweasel/i.test(ua)) {
    browser = 'Firefox';
  } else if (/edge|edg/i.test(ua)) {
    browser = 'Edge';
  } else if (/opr|opera/i.test(ua)) {
    browser = 'Opera';
  }

  return { device, os, browser };
}

export function getVisitorContext(req: any, query: any): VisitorContext {
  const simDevice = query.sim_device;
  const simOs = query.sim_os;
  const simBrowser = query.sim_browser;
  const simLang = query.sim_language;
  const simCountry = query.sim_country;
  const simRegion = query.sim_region;
  const simCity = query.sim_city;
  const simTz = query.sim_timezone;
  const simSource = query.sim_source;
  const simUtmSource = query.sim_utm_source;
  const simUtmMedium = query.sim_utm_medium;
  const simUtmCampaign = query.sim_utm_campaign;
  const simVisitorType = query.sim_visitor_type;
  const simTime = query.sim_time;
  const simDate = query.sim_date;

  const ua = req.headers['user-agent'] || '';
  const parsedUa = parseUserAgent(ua);
  
  const realDevice = parsedUa.device;
  const realOs = parsedUa.os;
  const realBrowser = parsedUa.browser;
  
  const acceptLang = req.headers['accept-language'] || '';
  let realLang = 'en';
  if (acceptLang.startsWith('ar')) {
    realLang = 'ar';
  } else if (acceptLang.startsWith('fr')) {
    realLang = 'fr';
  } else if (acceptLang.startsWith('de')) {
    realLang = 'de';
  } else if (acceptLang.startsWith('es')) {
    realLang = 'es';
  }

  const realCountry = (
    req.headers['cf-ipcountry'] || 
    req.headers['x-vercel-ip-country'] || 
    req.headers['x-country'] || 
    ''
  ).toString().toUpperCase();

  const referrer = req.headers['referer'] || '';
  let realSource = 'Direct';
  if (query.utm_source === 'qr' || query.source === 'qr') {
    realSource = 'QR Code';
  } else if (query.utm_source === 'nfc' || query.source === 'nfc') {
    realSource = 'NFC';
  } else if (referrer.includes('linkedin.com')) {
    realSource = 'LinkedIn';
  } else if (referrer.includes('instagram.com')) {
    realSource = 'Instagram';
  } else if (referrer.includes('facebook.com')) {
    realSource = 'Facebook';
  } else if (referrer.includes('mailto:')) {
    realSource = 'Email';
  } else if (referrer) {
    realSource = 'Website';
  }

  let realDateTime = new Date();
  if (simTime || simDate) {
    try {
      const dateStr = simDate || realDateTime.toISOString().split('T')[0];
      const timeStr = simTime || '12:00';
      realDateTime = new Date(`${dateStr}T${timeStr}:00`);
    } catch (e) {
      // Ignored
    }
  }

  const ip = req.ip || req.headers['x-forwarded-for'] || '127.0.0.1';

  return {
    device: simDevice || realDevice,
    os: simOs || realOs,
    browser: simBrowser || realBrowser,
    language: simLang || realLang,
    country: simCountry || realCountry || 'EG',
    region: simRegion || 'Cairo',
    city: simCity || 'Cairo',
    timezone: simTz || 'Africa/Cairo',
    trafficSource: simSource || realSource,
    utmSource: simUtmSource || query.utm_source || undefined,
    utmMedium: simUtmMedium || query.utm_medium || undefined,
    utmCampaign: simUtmCampaign || query.utm_campaign || undefined,
    visitorType: simVisitorType || 'New Visitor',
    dateTime: realDateTime,
    p: query.p,
    code: query.code,
    ip: typeof ip === 'string' ? ip : Array.isArray(ip) ? ip[0] : '127.0.0.1',
  };
}

export function evaluateRuleGroup(group: any, context: VisitorContext): boolean {
  if (!group || !group.rules || group.rules.length === 0) return true;
  
  const results = group.rules.map((rule: any) => {
    if (rule.rules) {
      return evaluateRuleGroup(rule, context);
    }
    return evaluateCondition(rule, context);
  });

  if (group.operator === 'OR') {
    return results.some((r: boolean) => r);
  }
  return results.every((r: boolean) => r);
}

export function evaluateCondition(rule: any, context: VisitorContext): boolean {
  const { field, operator, value } = rule;
  
  let contextValue: any = null;
  if (field === 'device') contextValue = context.device;
  else if (field === 'os') contextValue = context.os;
  else if (field === 'browser') contextValue = context.browser;
  else if (field === 'language') contextValue = context.language;
  else if (field === 'country') contextValue = context.country;
  else if (field === 'region') contextValue = context.region;
  else if (field === 'city') contextValue = context.city;
  else if (field === 'timezone') contextValue = context.timezone;
  else if (field === 'trafficSource') contextValue = context.trafficSource;
  else if (field === 'utmSource') contextValue = context.utmSource;
  else if (field === 'utmMedium') contextValue = context.utmMedium;
  else if (field === 'utmCampaign') contextValue = context.utmCampaign;
  else if (field === 'visitorType') contextValue = context.visitorType;
  else if (field === 'date') {
    const visitorDate = context.dateTime;
    if (operator === 'between') {
      const [start, end] = Array.isArray(value) ? value : [null, null];
      if (!start || !end) return false;
      const visitorTime = visitorDate.getTime();
      return visitorTime >= new Date(start).getTime() && visitorTime <= new Date(end).getTime();
    } else if (operator === 'equals') {
      return visitorDate.toISOString().split('T')[0] === value;
    } else if (operator === 'isWeekend') {
      const day = visitorDate.getDay();
      return day === 0 || day === 6;
    } else if (operator === 'isWeekday') {
      const day = visitorDate.getDay();
      return day >= 1 && day <= 5;
    }
    return false;
  } else if (field === 'time') {
    const visitorTime = context.dateTime;
    const minutes = visitorTime.getHours() * 60 + visitorTime.getMinutes();
    
    if (operator === 'between') {
      const [startStr, endStr] = Array.isArray(value) ? value : ['00:00', '23:59'];
      const [startH, startM] = startStr.split(':').map(Number);
      const [endH, endM] = endStr.split(':').map(Number);
      const startMin = startH * 60 + startM;
      const endMin = endH * 60 + endM;
      return minutes >= startMin && minutes <= endMin;
    } else if (operator === 'isBusinessHours') {
      const day = visitorTime.getDay();
      const isWeekDay = day >= 1 && day <= 5;
      return isWeekDay && minutes >= 540 && minutes <= 1020;
    } else if (operator === 'isNightMode') {
      return minutes < 420 || minutes > 1140;
    }
    return false;
  }

  if (operator === 'equals') {
    return String(contextValue).toLowerCase() === String(value).toLowerCase();
  }
  if (operator === 'notEquals') {
    return String(contextValue).toLowerCase() !== String(value).toLowerCase();
  }
  if (operator === 'contains') {
    return String(contextValue).toLowerCase().includes(String(value).toLowerCase());
  }
  if (operator === 'notContains') {
    return !String(contextValue).toLowerCase().includes(String(value).toLowerCase());
  }
  if (operator === 'in') {
    const list = Array.isArray(value) ? value : [value];
    return list.map(v => String(v).toLowerCase()).includes(String(contextValue).toLowerCase());
  }
  if (operator === 'notIn') {
    const list = Array.isArray(value) ? value : [value];
    return !list.map(v => String(v).toLowerCase()).includes(String(contextValue).toLowerCase());
  }
  if (operator === 'always') {
    return true;
  }

  return false;
}

export function evaluateSchedule(variant: any, scheduling: any, now: Date): boolean {
  if (!scheduling) {
    const start = variant.scheduleStart ? new Date(variant.scheduleStart).getTime() : null;
    const end = variant.scheduleEnd ? new Date(variant.scheduleEnd).getTime() : null;
    const nowTime = now.getTime();
    if (start == null && end == null) return true;
    return (start == null || start <= nowTime) && (end == null || nowTime <= end);
  }

  const type = scheduling.type;
  if (type === 'always') return true;

  if (type === 'range') {
    const start = scheduling.start ? new Date(scheduling.start).getTime() : null;
    const end = scheduling.end ? new Date(scheduling.end).getTime() : null;
    const nowTime = now.getTime();
    return (start == null || start <= nowTime) && (end == null || nowTime <= end);
  }

  if (type === 'weekdays') {
    const day = now.getDay();
    return day >= 1 && day <= 5;
  }

  if (type === 'weekend') {
    const day = now.getDay();
    return day === 0 || day === 6;
  }

  if (type === 'businessHours') {
    const day = now.getDay();
    const isWeekDay = day >= 1 && day <= 5;
    const minutes = now.getHours() * 60 + now.getMinutes();
    return isWeekDay && minutes >= 540 && minutes <= 1020;
  }

  return true;
}

export function calculateResolutionScore(variant: any, context: VisitorContext): { isMatch: boolean; priority: number; score: number; specificity: number } {
  const priority = variant.order ?? 0;
  const rulesEngine = variant.theme?.rulesEngine ?? {};
  const rulesGroup = rulesEngine.rules;
  
  if (variant.accessKey) {
    const matched = context.p === variant.accessKey;
    return {
      isMatch: matched,
      priority: -1000,
      score: 1000,
      specificity: 1000,
    };
  }

  const workflow = rulesEngine.workflow ?? 'Published';
  if (workflow !== 'Published' && workflow !== 'Scheduled') {
    return { isMatch: false, priority, score: 0, specificity: 0 };
  }

  // A keyless profile only takes over the public link when its owner asked for
  // it: "Activate now" (an explicit override that beats the window), or a
  // schedule whose window is open right now. With neither, the default profile
  // stays — adding a profile must never silently hijack the card's link.
  const hasSchedule =
    !!rulesEngine.scheduling || !!variant.scheduleStart || !!variant.scheduleEnd;
  const isActiveNow =
    variant.manualActive === true ||
    (hasSchedule && evaluateSchedule(variant, rulesEngine.scheduling, context.dateTime));
  if (!isActiveNow) {
    return { isMatch: false, priority, score: 0, specificity: 0 };
  }

  if (!rulesGroup || !rulesGroup.rules || rulesGroup.rules.length === 0) {
    return {
      isMatch: true,
      priority,
      score: 1,
      specificity: 1,
    };
  }

  const matched = evaluateRuleGroup(rulesGroup, context);
  if (!matched) {
    return { isMatch: false, priority, score: 0, specificity: 0 };
  }

  let score = 0;
  let specificity = 0;
  
  function inspectNode(node: any) {
    if (node.rules) {
      score += 5;
      node.rules.forEach(inspectNode);
    } else {
      score += 10;
      const field = node.field;
      if (['city', 'region', 'utmCampaign', 'utmSource', 'utmMedium'].includes(field)) {
        specificity += 20;
      } else if (['country', 'language', 'trafficSource', 'visitorType'].includes(field)) {
        specificity += 10;
      } else if (['device', 'os', 'browser', 'time', 'date'].includes(field)) {
        specificity += 5;
      } else {
        specificity += 1;
      }
    }
  }
  
  inspectNode(rulesGroup);

  return {
    isMatch: true,
    priority,
    score,
    specificity,
  };
}

export function getABSelection(visitorKey: string, split: number): 'A' | 'B' {
  let hash = 0;
  for (let i = 0; i < visitorKey.length; i++) {
    hash = visitorKey.charCodeAt(i) + ((hash << 5) - hash);
  }
  const pct = Math.abs(hash % 100);
  return pct < split ? 'A' : 'B';
}

