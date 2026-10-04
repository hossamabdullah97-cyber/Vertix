import { isQuietWeek, weeklyReportHtml, weeklyReportSubject, type WeeklyReport } from './weekly-report';
import { localDay, WeeklyReportService } from './weekly-report.service';

const report = (over: Partial<WeeklyReport> = {}): WeeklyReport => ({
  orgName: 'Acme <Trading>',
  from: new Date('2026-09-27T06:00:00Z'),
  to: new Date('2026-10-04T06:00:00Z'),
  taps: [40, 30],
  reached: [25, 25],
  leads: [12, 8],
  meetings: [3, 5],
  won: { count: 2, value: 45000 },
  contacted: 9,
  medianReplyHours: 3.2,
  waiting: { total: 7, top: [{ id: 'L1', name: 'Mona Adel', company: 'Nile Co', hours: 50 }] },
  members: [{ name: 'Omar', leads: 6, scans: 20 }],
  topChip: { label: 'Omar', scans: 18 },
  ...over,
});

describe('weekly report email', () => {
  it('leads with the new leads, in both languages', () => {
    expect(weeklyReportSubject(report(), 'en')).toBe('Your week on Vertex Connect: 12 new leads');
    expect(weeklyReportSubject(report(), 'ar')).toBe('أسبوعك على Vertex Connect: 12 عميلاً جديداً');
    expect(weeklyReportSubject(report({ leads: [1, 0] }), 'en')).toBe('Your week on Vertex Connect: 1 new lead');
  });

  it('shows the week against the last, the waiting leads with a link, and the team', () => {
    const html = weeklyReportHtml(report(), 'en', 'https://app.example/');
    expect(html).toContain('▲ 50%'); // leads 12 vs 8
    expect(html).toContain('▼ 40%'); // meetings 3 vs 5
    expect(html).toContain('same as last week'); // reached 25 vs 25
    expect(html).toContain('7 leads are waiting for a reply');
    expect(html).toContain('https://app.example/leads?lead=L1');
    expect(html).toContain('waiting 2 days');
    expect(html).toContain('Your team reached out to 9 of 12 new leads. Half of them heard back within 3 hours.');
    expect(html).toContain('2 deals won, worth');
    expect(html).toContain('and 6 more');
  });

  it('says so plainly when nobody reached out at all', () => {
    expect(weeklyReportHtml(report({ contacted: 0, medianReplyHours: null }), 'en', 'https://a')).toContain("Nobody has reached out to this week's 12 new leads yet.");
  });

  it('escapes what people typed', () => {
    const html = weeklyReportHtml(report({ waiting: { total: 1, top: [{ id: 'L1', name: '<script>x</script>', company: null, hours: 30 }] } }), 'en', 'https://a');
    expect(html).not.toContain('<script>x');
    expect(html).toContain('Acme &lt;Trading&gt;');
  });

  it('is written right to left in Arabic', () => {
    const html = weeklyReportHtml(report(), 'ar', 'https://a');
    expect(html).toContain('dir="rtl"');
    expect(html).toContain('7 عملاء ينتظرون ردك');
    expect(html).toContain('ينتظر منذ يومين');
  });

  it('knows a week with nothing in it', () => {
    const quiet = report({ taps: [0, 3], reached: [0, 2], leads: [0, 1], meetings: [0, 0], won: { count: 0, value: 0 }, waiting: { total: 0, top: [] } });
    expect(isQuietWeek(quiet)).toBe(true);
    expect(weeklyReportSubject(quiet, 'en')).toBe('Your week on Vertex Connect');
  });
});

describe('WeeklyReportService', () => {
  it('reads the day in the workspace time zone', () => {
    // Saturday 23:30 UTC is already Sunday in Cairo.
    expect(localDay('Africa/Cairo', new Date('2026-10-03T23:30:00Z'))).toEqual({ weekday: 0, date: '2026-10-04' });
  });

  function setup(claimed = 1) {
    const db = {
      organization: { findMany: jest.fn().mockResolvedValue([{ id: 'o1' }]) },
      $executeRaw: jest.fn().mockResolvedValue(claimed),
      membership: { findMany: jest.fn().mockResolvedValue([]) },
    };
    const service = new WeeklyReportService({ client: db } as never, {} as never, { send: jest.fn() } as never, { get: () => 'Africa/Cairo' } as never);
    return { service, db };
  }

  it('sends only on Sunday from nine', async () => {
    const { service, db } = setup();
    await service.sweep(new Date('2026-10-04T05:00:00Z')); // Sunday 08:00 Cairo
    await service.sweep(new Date('2026-10-05T07:00:00Z')); // Monday 10:00
    expect(db.organization.findMany).not.toHaveBeenCalled();
    await service.sweep(new Date('2026-10-04T07:00:00Z')); // Sunday 10:00
    expect(db.$executeRaw).toHaveBeenCalledTimes(1);
  });

  it('owners and admins by default, managers only when they asked; never an unconfirmed address', async () => {
    const { service, db } = setup();
    db.membership.findMany.mockResolvedValue([
      { role: 'OWNER', user: { id: 'u1', email: 'o@x', leadAlerts: null } },
      { role: 'ADMIN', user: { id: 'u2', email: 'a@x', leadAlerts: { weeklyReport: false, lang: 'en' } } },
      { role: 'MANAGER', user: { id: 'u3', email: 'm@x', leadAlerts: null } },
      { role: 'MANAGER', user: { id: 'u4', email: 'm2@x', leadAlerts: { weeklyReport: true, lang: 'ar' } } },
    ]);
    await expect(service.recipients('o1')).resolves.toEqual([
      { userId: 'u1', email: 'o@x', lang: 'en' },
      { userId: 'u4', email: 'm2@x', lang: 'ar' },
    ]);
    expect(db.membership.findMany.mock.calls[0][0].where.user).toEqual({ deletedAt: null, emailVerified: { not: null } });
  });
});
