import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../prisma/prisma.service';
import { OAuthService } from '../oauth.service';
import { envClientCredentials } from '../oauth-providers';
import { OAuthAppsService } from '../oauth-apps.service';

const PROVIDER = 'google_calendar';
/** A card's free times are asked for on every open of its meeting form: Google is asked at most this often per person. */
const BUSY_CACHE_MS = 60_000;
/** The card's form waits this long for Google, then offers the times it knows. */
const TIMEOUT_MS = 3_000;

export interface Busy {
  start: Date;
  end: Date;
}

export interface CalendarEvent {
  id: string;
  link: string | null;
}

/** What is put on the calendar for a meeting request. */
export interface MeetingDetails {
  start: Date;
  minutes: number;
  timezone: string;
  /** Who asked, and how to reach them. */
  name: string;
  email?: string | null;
  phone?: string | null;
  company?: string | null;
  note?: string | null;
  /** Where the lead is in the app. */
  leadUrl: string;
}

class CalendarError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

/**
 * A person's own Google Calendar, once they connected it: meeting requests
 * from their card are held on it (tentative) until they answer, and its busy
 * times are left out of the times their card offers. Everything here is
 * best-effort: a calendar that is down or disconnected never stops a booking.
 */
@Injectable()
export class GoogleCalendarService {
  private readonly logger = new Logger(GoogleCalendarService.name);
  private readonly busyCache = new Map<string, { at: number; busy: Busy[] }>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly oauth: OAuthService,
    private readonly apps: OAuthAppsService,
  ) {}

  private get base(): string {
    return (this.config.get<string>('GOOGLE_CALENDAR_API_URL') || 'https://www.googleapis.com/calendar/v3').replace(/\/$/, '');
  }

  /** Whether people in this workspace can connect a calendar at all. */
  async available(orgId: string): Promise<boolean> {
    if (envClientCredentials(PROVIDER, this.config)) return true;
    return (await this.apps.configuredProviders(orgId)).has(PROVIDER);
  }

  /** This person's connection in this workspace, if any. */
  async connection(orgId: string, userId: string) {
    return this.prisma.client.integrationConnection.findFirst({
      where: { orgId, provider: PROVIDER, userId, deletedAt: null, status: { not: 'DISCONNECTED' } },
      select: { status: true, externalAccountName: true, updatedAt: true, lastError: true },
    });
  }

  private async connected(orgId: string, userId: string): Promise<boolean> {
    const c = await this.connection(orgId, userId);
    return c?.status === 'CONNECTED';
  }

  /** Calls the Calendar API as this person, renewing their token once if Google says it is stale. */
  private async call<T>(orgId: string, userId: string, path: string, init: { method?: string; body?: unknown } = {}): Promise<T> {
    for (let attempt = 0; attempt < 2; attempt++) {
      const { token } = await this.oauth.getAuth(orgId, PROVIDER, attempt > 0, userId);
      const res = await fetch(`${this.base}${path}`, {
        method: init.method ?? 'GET',
        headers: { authorization: `Bearer ${token}`, accept: 'application/json', ...(init.body ? { 'content-type': 'application/json' } : {}) },
        body: init.body ? JSON.stringify(init.body) : undefined,
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
      if (res.status === 401 && attempt === 0) continue;
      if (res.status === 204 || res.status === 410) return undefined as T;
      const text = await res.text();
      if (!res.ok) throw new CalendarError(`Google Calendar answered ${res.status}: ${text.slice(0, 200)}`, res.status);
      return (text ? JSON.parse(text) : undefined) as T;
    }
    throw new CalendarError('Google Calendar refused the renewed token', 401);
  }

  private async note(orgId: string, userId: string, err: unknown) {
    const message = (err as Error).message;
    this.logger.warn(`calendar for ${userId}: ${message}`);
    await this.prisma.client.integrationConnection
      .updateMany({ where: { orgId, provider: PROVIDER, userId }, data: { lastError: message.slice(0, 500) } })
      .catch(() => undefined);
  }

  /**
   * When this person is busy between two moments, from their primary
   * calendar. Nothing (rather than an error) when it is not connected or
   * Google does not answer in time: the card then offers what it knows.
   */
  async busy(orgId: string, userId: string, from: Date, to: Date): Promise<Busy[]> {
    // Asked first, so a calendar just disconnected stops counting at once.
    if (!(await this.connected(orgId, userId))) return [];
    const key = `${orgId}:${userId}`;
    const hit = this.busyCache.get(key);
    if (hit && Date.now() - hit.at < BUSY_CACHE_MS) return hit.busy;
    try {
      const r = await this.call<{ calendars?: Record<string, { busy?: { start: string; end: string }[] }> }>(orgId, userId, '/freeBusy', {
        method: 'POST',
        body: { timeMin: from.toISOString(), timeMax: to.toISOString(), items: [{ id: 'primary' }] },
      });
      const busy = (r?.calendars?.primary?.busy ?? [])
        .map((b) => ({ start: new Date(b.start), end: new Date(b.end) }))
        .filter((b) => !Number.isNaN(b.start.getTime()) && !Number.isNaN(b.end.getTime()));
      this.busyCache.set(key, { at: Date.now(), busy });
      return busy;
    } catch (err) {
      await this.note(orgId, userId, err);
      return [];
    }
  }

  /** Forget what was read, so a time just held is not offered from an old answer. */
  forget(orgId: string, userId: string) {
    this.busyCache.delete(`${orgId}:${userId}`);
  }

  /** Holds the time of a meeting request on the calendar, tentatively, until it is answered. */
  async hold(orgId: string, userId: string, m: MeetingDetails): Promise<CalendarEvent | null> {
    if (!(await this.connected(orgId, userId))) return null;
    try {
      const end = new Date(m.start.getTime() + m.minutes * 60_000);
      const event = await this.call<{ id: string; htmlLink?: string }>(orgId, userId, '/calendars/primary/events', {
        method: 'POST',
        body: {
          summary: `Meeting request: ${m.name}${m.company ? ` (${m.company})` : ''}`,
          description: [
            m.email ? `Email: ${m.email}` : '',
            m.phone ? `Phone: ${m.phone}` : '',
            m.note ? `\n${m.note}` : '',
            `\nAnswer the request in Vertex: ${m.leadUrl}`,
          ]
            .filter(Boolean)
            .join('\n'),
          start: { dateTime: m.start.toISOString(), timeZone: m.timezone },
          end: { dateTime: end.toISOString(), timeZone: m.timezone },
          status: 'tentative',
          // Its own reminder, so a request not yet answered is not missed.
          reminders: { useDefault: true },
          source: { title: 'Vertex Connect', url: m.leadUrl },
        },
      });
      this.forget(orgId, userId);
      return { id: event.id, link: event.htmlLink ?? null };
    } catch (err) {
      await this.note(orgId, userId, err);
      return null;
    }
  }

  /** The request was accepted: the hold becomes the meeting. */
  async confirm(orgId: string, userId: string, eventId: string, name: string): Promise<boolean> {
    try {
      await this.call(orgId, userId, `/calendars/primary/events/${encodeURIComponent(eventId)}`, {
        method: 'PATCH',
        body: { status: 'confirmed', summary: `Meeting with ${name}` },
      });
      this.forget(orgId, userId);
      return true;
    } catch (err) {
      await this.note(orgId, userId, err);
      return false;
    }
  }

  /** The request was declined: its time is given back. */
  async cancel(orgId: string, userId: string, eventId: string): Promise<boolean> {
    try {
      await this.call(orgId, userId, `/calendars/primary/events/${encodeURIComponent(eventId)}`, { method: 'DELETE' });
      this.forget(orgId, userId);
      return true;
    } catch (err) {
      if (err instanceof CalendarError && err.status === 404) return true;
      await this.note(orgId, userId, err);
      return false;
    }
  }
}
