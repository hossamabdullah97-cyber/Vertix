import { formatNumber } from '@/lib/format';
import type { Locale } from '@/lib/i18n/config';
import type { ComponentState, IncidentImpact, IncidentStatus, StatusComponentId } from '@vertex/shared';

/**
 * The status page's words in both languages. Kept here rather than in the
 * i18n namespaces: the page is server-rendered for anyone, and the admin
 * console shares the labels.
 */
export const STATUS_STRINGS = {
  en: {
    title: 'System status',
    subtitle: 'Whether Vertex Connect is working right now, and how it has been.',
    overall: {
      OPERATIONAL: 'Everything is working',
      DEGRADED: 'Some things are slower or failing',
      OUTAGE: 'Some things are not working',
      MAINTENANCE: 'Planned maintenance is under way',
    } as Record<ComponentState, string>,
    unreachable: 'We can’t reach Vertex Connect right now',
    unreachableBody: 'The service isn’t answering. We are told automatically and are on it. Try again in a few minutes.',
    state: { OPERATIONAL: 'Working', DEGRADED: 'Degraded', OUTAGE: 'Outage', MAINTENANCE: 'Maintenance' } as Record<ComponentState, string>,
    components: {
      app: { name: 'App and API', desc: 'Signing in, the dashboard, leads, and the API.' },
      cards: { name: 'Public cards', desc: 'Card pages, QR codes and NFC taps.' },
      email: { name: 'Email', desc: 'Lead alerts, invitations, sign-in and reports.' },
      webhooks: { name: 'Webhooks and integrations', desc: 'Events sent to your systems and connected apps.' },
    } as Record<StatusComponentId, { name: string; desc: string }>,
    uptime: '{{value}} uptime',
    days90: '90 days ago',
    today: 'Today',
    noData: 'No checks',
    active: 'Going on now',
    scheduled: 'Planned maintenance',
    recent: 'Past incidents',
    recentNone: 'Nothing to report in the last 14 days.',
    affects: 'Affects',
    from: 'From',
    to: 'until',
    resolved: 'Resolved',
    checked: 'Checked {{time}}',
    notChecked: 'Not checked yet',
    impact: { MINOR: 'Minor', MAJOR: 'Major', MAINTENANCE: 'Maintenance' } as Record<IncidentImpact, string>,
    status: {
      SCHEDULED: 'Scheduled',
      INVESTIGATING: 'Investigating',
      IDENTIFIED: 'Cause found',
      MONITORING: 'Fixed, watching',
      RESOLVED: 'Resolved',
    } as Record<IncidentStatus, string>,
    help: 'Something not working that isn’t listed? Write to us from the help center.',
  },
  ar: {
    title: 'حالة الخدمة',
    subtitle: 'هل يعمل Vertex Connect الآن، وكيف كان أداؤه.',
    overall: {
      OPERATIONAL: 'كل شيء يعمل',
      DEGRADED: 'بعض الخدمات أبطأ أو تتعثر',
      OUTAGE: 'بعض الخدمات لا تعمل',
      MAINTENANCE: 'صيانة مخطط لها جارية',
    } as Record<ComponentState, string>,
    unreachable: 'لا يمكننا الوصول إلى Vertex Connect الآن',
    unreachableBody: 'الخدمة لا تستجيب. يصلنا تنبيه تلقائي ونعمل على حلها. حاول مرة أخرى بعد دقائق.',
    state: { OPERATIONAL: 'يعمل', DEGRADED: 'متعثر', OUTAGE: 'متوقف', MAINTENANCE: 'صيانة' } as Record<ComponentState, string>,
    components: {
      app: { name: 'التطبيق والـ API', desc: 'تسجيل الدخول ولوحة التحكم والعملاء والـ API.' },
      cards: { name: 'البطاقات العامة', desc: 'صفحات البطاقات ورموز QR ولمسات NFC.' },
      email: { name: 'البريد الإلكتروني', desc: 'تنبيهات العملاء والدعوات وتسجيل الدخول والتقارير.' },
      webhooks: { name: 'الـ Webhooks والتكاملات', desc: 'الأحداث المرسلة إلى أنظمتك والتطبيقات المربوطة.' },
    } as Record<StatusComponentId, { name: string; desc: string }>,
    uptime: 'يعمل {{value}} من الوقت',
    days90: 'قبل 90 يومًا',
    today: 'اليوم',
    noData: 'لا فحوصات',
    active: 'يحدث الآن',
    scheduled: 'صيانة مخطط لها',
    recent: 'حوادث سابقة',
    recentNone: 'لا شيء يُذكر في آخر 14 يومًا.',
    affects: 'يؤثر على',
    from: 'من',
    to: 'حتى',
    resolved: 'تم الحل',
    checked: 'آخر فحص {{time}}',
    notChecked: 'لم يُفحص بعد',
    impact: { MINOR: 'بسيط', MAJOR: 'كبير', MAINTENANCE: 'صيانة' } as Record<IncidentImpact, string>,
    status: {
      SCHEDULED: 'مجدولة',
      INVESTIGATING: 'نتحقق من الأمر',
      IDENTIFIED: 'عرفنا السبب',
      MONITORING: 'تم الإصلاح ونراقب',
      RESOLVED: 'تم الحل',
    } as Record<IncidentStatus, string>,
    help: 'شيء لا يعمل وغير مذكور هنا؟ راسلنا من مركز المساعدة.',
  },
};

/** Colours per state: a dot, a bar, and a banner. */
export const STATE_TONE: Record<ComponentState, { dot: string; bar: string; banner: string; text: string }> = {
  OPERATIONAL: { dot: 'bg-emerald-500', bar: 'bg-emerald-500', banner: 'bg-emerald-500/[0.08] ring-emerald-500/25', text: 'text-emerald-700 dark:text-emerald-300' },
  DEGRADED: { dot: 'bg-amber-500', bar: 'bg-amber-500', banner: 'bg-amber-500/[0.1] ring-amber-500/30', text: 'text-amber-800 dark:text-amber-300' },
  OUTAGE: { dot: 'bg-red-500', bar: 'bg-red-500', banner: 'bg-red-500/[0.08] ring-red-500/25', text: 'text-red-700 dark:text-red-300' },
  MAINTENANCE: { dot: 'bg-sky-500', bar: 'bg-sky-500', banner: 'bg-sky-500/[0.08] ring-sky-500/25', text: 'text-sky-700 dark:text-sky-300' },
};

/** "99.95%": two decimals, never rounding a bad day up to 100%. */
export function formatUptime(v: number, locale: Locale): string {
  // Isolated, so the sign stays after the number inside an Arabic sentence.
  return `\u2066${formatNumber(Math.floor(v * 10000) / 10000, locale, { style: 'percent', maximumFractionDigits: 2 })}\u2069`;
}
