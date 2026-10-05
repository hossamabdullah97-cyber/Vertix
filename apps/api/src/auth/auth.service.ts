import {
  BadRequestException,
  Injectable,
  ConflictException,
  Logger,
  ServiceUnavailableException,
  ForbiddenException,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import bcrypt from 'bcryptjs';
import {
  defaultStageRows,
  isPaidPlan,
  type RegisterInput,
  type LoginInput,
  type JwtPayload,
  type AuthTokens,
  type SignInResult,
  type Role,
  type Plan,
} from '@vertex/shared';
import { PrismaService } from '../prisma/prisma.service';
import { TokensService } from '../mail/tokens.service';
import { MailService } from '../mail/mail.service';
import {
  AuthThrottleService,
  RESET_LIMIT,
  RESET_WINDOW_MS,
  SIGN_IN_LIMIT_PER_ACCOUNT,
  SIGN_IN_LIMIT_PER_ADDRESS,
  SIGN_IN_WINDOW_MS,
  tooManyAttempts,
} from './auth-throttle.service';
import { GoogleIdTokenVerifier, GoogleTokenError } from './google-id-token';
import { workspaceSlug } from '../common/workspace-slug';
import { TwoFactorService } from './two-factor.service';
import { requiresTwoStep } from './guards/tenant.guard';
import { SessionsService, type ClientInfo } from './sessions.service';

const VERIFY_TTL_MS = 3 * 24 * 60 * 60 * 1000;
const VERIFY_RESEND_LIMIT = 5;
const VERIFY_RESEND_WINDOW_MS = 60 * 60 * 1000;


/** Stored and compared without the case or spaces a phone keyboard adds. */
function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

/** Matches an address however it was capitalised when the account was made. */
function emailIs(email: string) {
  return { equals: email.trim(), mode: 'insensitive' as const };
}

export const SUSPENDED_MESSAGE =
  'This account has been suspended. Ask your workspace owner to restore it.';

export const ACCOUNT_ACCEPTS_SIGNED_IN = 'You already have an account. Sign in to accept the invitation.';

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);
  private googleVerifier: GoogleIdTokenVerifier | null = null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
    private readonly tokens: TokensService,
    private readonly mail: MailService,
    private readonly throttle: AuthThrottleService,
    private readonly twoFactor: TwoFactorService,
    private readonly sessions: SessionsService,
  ) {}

  async register(input: RegisterInput, client: ClientInfo = {}): Promise<AuthTokens> {
    const email = normalizeEmail(input.email);
    const existing = await this.prisma.client.user.findFirst({
      where: { email: emailIs(email) },
    });
    if (existing) {
      throw new ConflictException('Email is already in use');
    }

    const passwordHash = await bcrypt.hash(input.password, 10);

    // On one's own, the workspace is the person's, in their name.
    const personal = input.kind === 'personal';
    const { user, orgId } = await this.createAccount(
      { email, name: input.name, passwordHash },
      personal ? input.name!.trim() : input.organizationName!,
      personal ? 'PERSONAL' : 'TEAM',
    );
    // The account is usable straight away; the link only has to be opened
    // before inviting anyone or paying (see verified-email.ts). A mail
    // failure must not fail the sign-up: the link can be sent again.
    await this.sendVerification(user.id, user.email).catch(() => undefined);

    return this.openSession({ sub: user.id, email: user.email, orgId, role: 'OWNER' }, client);
  }

  /**
   * `ip` is the caller's address as Express sees it (see TRUST_PROXY). Failed
   * attempts are counted per account and per account from that address;
   * once either is over its limit the account refuses sign-in, even with the
   * right password, until the window ends. Unknown emails are counted the
   * same way, so the limit says nothing about which accounts exist.
   */
  async login(input: LoginInput, ip = 'unknown', userAgent?: string): Promise<SignInResult> {
    const email = normalizeEmail(input.email);
    const keys = { address: `sign-in:${ip}:${email}`, account: `sign-in:${email}` };
    const wait = Math.max(
      await this.throttle.blockedFor(keys.address, SIGN_IN_LIMIT_PER_ADDRESS, SIGN_IN_WINDOW_MS),
      await this.throttle.blockedFor(keys.account, SIGN_IN_LIMIT_PER_ACCOUNT, SIGN_IN_WINDOW_MS),
    );
    if (wait > 0) throw tooManyAttempts(wait);

    const refuse = async () => {
      await Promise.all([this.throttle.hit(keys.address, SIGN_IN_WINDOW_MS), this.throttle.hit(keys.account, SIGN_IN_WINDOW_MS)]);
      return new UnauthorizedException('Invalid credentials');
    };
    const user = await this.prisma.client.user.findFirst({
      where: { email: emailIs(input.email), deletedAt: null },
    });
    if (!user || !user.passwordHash) {
      throw await refuse();
    }
    const ok = await bcrypt.compare(input.password, user.passwordHash);
    if (!ok) {
      throw await refuse();
    }
    await this.throttle.clear(keys.address, keys.account);
    return this.signIn(user, { ip, userAgent });
  }

  /** The second step of a sign-in: the code screen's code, then the session. */
  async completeTwoStep(mfaToken: string, code: string, client: ClientInfo = {}): Promise<AuthTokens> {
    const userId = await this.twoFactor.completeChallenge(mfaToken, code);
    const user = await this.prisma.client.user.findFirst({ where: { id: userId, deletedAt: null }, select: { id: true, email: true } });
    if (!user) throw new UnauthorizedException('Account not found');
    return this.sessionFor(user, client);
  }

  /** A session, or first the code screen when the account has two-step verification. */
  private async signIn(user: { id: string; email: string; totpEnabledAt: Date | null }, client: ClientInfo): Promise<SignInResult> {
    if (user.totpEnabledAt) {
      // Suspended everywhere is refused before the code, as without two-step.
      await this.defaultMembership(user.id);
      return this.twoFactor.challenge(user.id);
    }
    return this.sessionFor(user, client);
  }

  /** A sign-in of an existing account: a new device, told to its owner if unfamiliar. */
  private async sessionFor(user: { id: string; email: string }, client: ClientInfo): Promise<AuthTokens> {
    const membership = await this.defaultMembership(user.id);
    return this.openSession(
      { sub: user.id, email: user.email, orgId: membership?.orgId, role: membership?.role as Role | undefined },
      client,
      { announce: true },
    );
  }

  async refresh(refreshToken: string, client: ClientInfo = {}): Promise<AuthTokens> {
    let payload: JwtPayload;
    try {
      payload = await this.jwt.verifyAsync<JwtPayload>(refreshToken, {
        secret: this.config.getOrThrow<string>('JWT_REFRESH_SECRET'),
      });
    } catch {
      throw new UnauthorizedException('Invalid refresh token');
    }

    // A deleted account's refresh token must not keep its session alive.
    const account = await this.prisma.client.user.findUnique({
      where: { id: payload.sub },
      select: { deletedAt: true },
    });
    if (!account || account.deletedAt) {
      throw new UnauthorizedException('Invalid refresh token');
    }

    // The refresh token deliberately carries no orgId/role, so they are read
    // back from the membership — which also means a role change, removal or
    // suspension takes effect on the next refresh instead of lingering for
    // the token's whole lifetime.
    // A device signed out from the account page renews no more.
    if (payload.sid && !(await this.sessions.renew(payload.sid, payload.sub, client))) {
      throw new UnauthorizedException('Invalid refresh token');
    }

    const membership = await this.defaultMembership(payload.sub);
    const next = { sub: payload.sub, email: payload.email, orgId: membership?.orgId, role: membership?.role as Role | undefined };
    // A token from before devices were kept becomes one, so it can be listed and signed out.
    return payload.sid ? this.issueTokens({ ...next, sid: payload.sid }) : this.openSession(next, client);
  }

  /** Signs out the device a refresh token belongs to; an unreadable token has nothing to end. */
  async logout(refreshToken: string): Promise<{ ok: true }> {
    try {
      const payload = await this.jwt.verifyAsync<JwtPayload>(refreshToken, { secret: this.config.getOrThrow<string>('JWT_REFRESH_SECRET') });
      if (payload.sid) await this.sessions.revoke(payload.sub, payload.sid).catch(() => undefined);
    } catch {
      // Expired or forged: the browser forgets it either way.
    }
    return { ok: true };
  }

  /** Completes an invitation: sets the password, activates the membership, logs in. */
  async acceptInvite(
    token: string,
    password: string,
    name?: string,
    client: ClientInfo = {},
  ): Promise<SignInResult> {
    const rec = await this.tokens.verify('INVITE', token);
    if (!rec.userId || !rec.orgId) {
      throw new UnauthorizedException('Invalid invitation');
    }
    // The link sets a password, so it is only for someone who has no account
    // yet. An account holder accepts from the app, signed in, and keeps theirs.
    const holder = await this.prisma.client.user.findUnique({ where: { id: rec.userId }, select: { passwordHash: true, googleId: true } });
    if (holder?.passwordHash || holder?.googleId) {
      throw new BadRequestException(ACCOUNT_ACCEPTS_SIGNED_IN);
    }
    const passwordHash = await bcrypt.hash(password, 10);

    const user = await this.prisma.client.user.update({
      where: { id: rec.userId },
      data: { passwordHash, emailVerified: new Date(), ...(name ? { name } : {}) },
      select: { totpEnabledAt: true },
    });
    await this.prisma.client.membership.update({
      where: { userId_orgId: { userId: rec.userId, orgId: rec.orgId } },
      data: { status: 'ACTIVE' },
    });
    await this.tokens.consume(rec.id);

    // Someone who already has an account with two-step verification still gives a code.
    if (user.totpEnabledAt) return this.twoFactor.challenge(rec.userId);
    return this.openSession({ sub: rec.userId, email: rec.email, orgId: rec.orgId, role: (rec.role as Role) ?? 'EMPLOYEE' }, client);
  }

  /** Emails a fresh confirmation link; any earlier one stops working. */
  private async sendVerification(userId: string, email: string): Promise<boolean> {
    await this.tokens.revokePending('EMAIL_VERIFY', userId);
    const token = await this.tokens.create({
      type: 'EMAIL_VERIFY',
      email,
      userId,
      ttlMs: VERIFY_TTL_MS,
    });
    const appUrl = this.config.get<string>('APP_PUBLIC_URL', 'http://localhost:3000');
    return this.mail.sendEmailVerification(email, `${appUrl}/verify-email?token=${token}`);
  }

  /** "Send the link again", from the notice in the app. A few times an hour. */
  async resendVerification(userId: string): Promise<{ ok: true; alreadyVerified?: true; emailSent?: boolean }> {
    const user = await this.prisma.client.user.findFirst({
      where: { id: userId, deletedAt: null },
      select: { email: true, emailVerified: true },
    });
    if (!user) throw new UnauthorizedException('Account not found');
    if (user.emailVerified) return { ok: true, alreadyVerified: true };

    const key = `verify:${userId}`;
    const wait = await this.throttle.blockedFor(key, VERIFY_RESEND_LIMIT, VERIFY_RESEND_WINDOW_MS);
    if (wait > 0) throw tooManyAttempts(wait);
    await this.throttle.hit(key, VERIFY_RESEND_WINDOW_MS);

    const emailSent = await this.sendVerification(userId, user.email);
    return { ok: true, emailSent };
  }

  /**
   * Opens a confirmation link. Works signed out too (the link may be opened
   * on another device), since holding the link is the proof.
   */
  async verifyEmail(token: string): Promise<{ ok: true; email: string }> {
    const rec = await this.tokens.verify('EMAIL_VERIFY', token);
    const user = rec.userId
      ? await this.prisma.client.user.findFirst({ where: { id: rec.userId, deletedAt: null }, select: { id: true, email: true, emailVerified: true } })
      : null;
    // The link proves the address it was sent to, nothing else.
    if (!user || normalizeEmail(user.email) !== normalizeEmail(rec.email)) {
      throw new BadRequestException('Invalid or expired link');
    }
    if (!user.emailVerified) {
      await this.prisma.client.user.update({ where: { id: user.id }, data: { emailVerified: new Date() } });
    }
    await this.tokens.consume(rec.id);
    return { ok: true, email: user.email };
  }

  /** Sends a password-reset link. Always succeeds (does not reveal account existence). */
  async forgotPassword(email: string): Promise<{ ok: true }> {
    // Counted per address asked for, whether or not it has an account.
    const key = `reset:${normalizeEmail(email)}`;
    const wait = await this.throttle.blockedFor(key, RESET_LIMIT, RESET_WINDOW_MS);
    if (wait > 0) throw tooManyAttempts(wait);
    await this.throttle.hit(key, RESET_WINDOW_MS);

    const user = await this.prisma.client.user.findFirst({
      where: { email: emailIs(email), deletedAt: null },
    });
    if (user) {
      email = user.email;
      const token = await this.tokens.create({
        type: 'PASSWORD_RESET',
        email,
        userId: user.id,
        ttlMs: 60 * 60 * 1000, // 1 hour
      });
      const appUrl = this.config.get<string>('APP_PUBLIC_URL', 'http://localhost:3000');
      await this.mail.sendPasswordReset(email, `${appUrl}/reset-password?token=${token}`);
    }
    return { ok: true };
  }

  async resetPassword(token: string, password: string): Promise<{ ok: true }> {
    const rec = await this.tokens.verify('PASSWORD_RESET', token);
    if (!rec.userId) throw new UnauthorizedException('Invalid token');
    const passwordHash = await bcrypt.hash(password, 10);
    // The link came to the inbox, so following it confirms the address too.
    const user = await this.prisma.client.user.findUnique({ where: { id: rec.userId }, select: { emailVerified: true } });
    await this.prisma.client.user.update({
      where: { id: rec.userId },
      data: { passwordHash, ...(user && !user.emailVerified ? { emailVerified: new Date() } : {}) },
    });
    await this.tokens.consume(rec.id);
    // Whoever knew the old password is signed out wherever they were.
    await this.sessions.revokeAll(rec.userId);
    return { ok: true };
  }

  /** The signed-in user's own account profile (name + avatar), not their card. */
  async getProfile(userId: string) {
    const user = await this.prisma.client.user.findFirst({
      where: { id: userId, deletedAt: null },
      select: {
        id: true,
        email: true,
        name: true,
        avatarUrl: true,
        isSuperAdmin: true,
        createdAt: true,
        emailVerified: true,
        totpEnabledAt: true,
      },
    });
    if (!user) throw new UnauthorizedException('Account not found');
    const { emailVerified, totpEnabledAt, ...rest } = user;
    return { ...rest, emailVerified: !!emailVerified, twoFactorEnabled: !!totpEnabledAt };
  }

  /** Whether the active workspace requires two-step verification. */
  async workspaceRequiresTwoStep(orgId?: string): Promise<boolean> {
    if (!orgId) return false;
    const org = await this.prisma.client.organization.findUnique({ where: { id: orgId }, select: { settings: true } });
    return requiresTwoStep(org?.settings);
  }

  /**
   * The active organization's plan and the verified badge it earns. A personal
   * workspace has no organization, so it is on the free tier and unverified.
   */
  async getPlanBadge(
    orgId: string | undefined,
  ): Promise<{ plan: Plan; verified: boolean }> {
    if (!orgId || orgId === 'admin') return { plan: 'FREE', verified: false };
    const org = await this.prisma.client.organization.findFirst({
      where: { id: orgId, deletedAt: null },
      select: { plan: true },
    });
    const plan = (org?.plan as Plan) ?? 'FREE';
    return { plan, verified: isPaidPlan(plan) };
  }

  /** Whether the active workspace is a person's own or a company's (null with none). */
  async workspaceKind(orgId: string | undefined): Promise<'PERSONAL' | 'TEAM' | null> {
    if (!orgId || orgId === 'admin') return null;
    const org = await this.prisma.client.organization.findFirst({ where: { id: orgId, deletedAt: null }, select: { kind: true } });
    return org?.kind ?? null;
  }

  /** Updates the account profile. `avatarUrl: null` clears the photo. */
  async updateProfile(
    userId: string,
    data: { name?: string; avatarUrl?: string | null },
  ) {
    await this.prisma.client.user.update({
      where: { id: userId },
      data: {
        ...(data.name !== undefined ? { name: data.name.trim() || null } : {}),
        ...(data.avatarUrl !== undefined ? { avatarUrl: data.avatarUrl } : {}),
      },
    });
    return this.getProfile(userId);
  }

  /** The sign-in methods this server offers, for the sign-in page. */
  providers(): { google: string | null } {
    return { google: this.config.get<string>('GOOGLE_CLIENT_ID') || null };
  }

  /**
   * Sign in (or sign up) with a Google ID token. The Google account is
   * matched first by its id, then by a verified email: an existing account
   * with that email is linked to it, and a new person gets an account and a
   * workspace of their own, as with register().
   */
  async google(credential: string, client: ClientInfo = {}): Promise<SignInResult> {
    const clientId = this.config.get<string>('GOOGLE_CLIENT_ID');
    if (!clientId) throw new ServiceUnavailableException('Google sign-in is not set up on this server');
    this.googleVerifier ??= new GoogleIdTokenVerifier(clientId);

    let who;
    try {
      who = await this.googleVerifier.verify(credential);
    } catch (err) {
      if (err instanceof GoogleTokenError) {
        this.logger.warn(`Google sign-in refused: ${err.message}`);
        throw new UnauthorizedException('Google sign-in failed');
      }
      throw err;
    }
    // An unverified address could belong to anyone; it must not open, or
    // claim, an account.
    if (!who.emailVerified) throw new UnauthorizedException('Google has not verified this email address');
    const email = normalizeEmail(who.email);

    let user =
      (await this.prisma.client.user.findUnique({ where: { googleId: who.sub } })) ??
      (await this.prisma.client.user.findFirst({ where: { email: emailIs(email) } }));

    if (user?.deletedAt) throw new UnauthorizedException('Google sign-in failed');

    if (user) {
      if (user.googleId && user.googleId !== who.sub) {
        throw new UnauthorizedException('This account is linked to a different Google account');
      }
      if (!user.googleId || !user.emailVerified || !user.avatarUrl) {
        user = await this.prisma.client.user.update({
          where: { id: user.id },
          data: {
            // A password set by someone who never proved they own this inbox
            // is dropped now that its real owner has: otherwise a person could
            // sign up with another's address, wait for them to arrive through
            // Google, and keep a way into the account they then fill.
            ...(!user.emailVerified && user.passwordHash ? { passwordHash: null } : {}),
            googleId: who.sub,
            emailVerified: user.emailVerified ?? new Date(),
            avatarUrl: user.avatarUrl ?? who.picture,
            name: user.name ?? who.name,
          },
        });
      }
      return this.signIn(user, client);
    }

    const name = who.name ?? email.split('@')[0]!;
    // Google says who the person is, not whether there is a team: they start
    // on their own, and can make it a company's workspace later.
    const created = await this.createAccount(
      { email, name, googleId: who.sub, emailVerified: new Date(), avatarUrl: who.picture },
      name,
      'PERSONAL',
    );
    return this.openSession({ sub: created.user.id, email: created.user.email, orgId: created.orgId, role: 'OWNER' }, client);
  }

  /** A new person with a workspace they own (their own, or a team's), its sales pipeline ready. */
  private createAccount(
    data: { email: string; name?: string | null; passwordHash?: string; googleId?: string; emailVerified?: Date; avatarUrl?: string | null },
    organizationName: string,
    kind: 'PERSONAL' | 'TEAM',
  ) {
    return this.prisma.client.$transaction(async (tx) => {
      const user = await tx.user.create({ data });
      const org = await tx.organization.create({
        data: { name: organizationName, slug: workspaceSlug(organizationName), kind },
      });
      await tx.membership.create({
        data: { userId: user.id, orgId: org.id, role: 'OWNER' },
      });
      // Seed the default 7-stage sales pipeline so the CRM works immediately.
      await tx.pipelineStage.createMany({ data: defaultStageRows(org.id) });
      return { user, orgId: org.id };
    });
  }

  /**
   * The workspace a session opens in: the oldest one the person is still
   * active in. Someone suspended from every workspace they belong to cannot
   * start a session (a platform admin still can, for the admin console); a
   * person with no workspace at all still can.
   */
  private async defaultMembership(userId: string) {
    const active = await this.prisma.client.membership.findFirst({
      where: { userId, status: 'ACTIVE' },
      orderBy: { createdAt: 'asc' },
    });
    if (active) return active;
    const suspended = await this.prisma.client.membership.findFirst({
      where: { userId, status: 'SUSPENDED' },
      select: { id: true },
    });
    if (suspended) {
      const user = await this.prisma.client.user.findUnique({
        where: { id: userId },
        select: { isSuperAdmin: true },
      });
      if (!user?.isSuperAdmin) throw new ForbiddenException(SUSPENDED_MESSAGE);
    }
    return null;
  }

  /** A new signed-in device and its first tokens. */
  private async openSession(payload: JwtPayload, client: ClientInfo, opts: { announce?: boolean } = {}): Promise<AuthTokens> {
    const sid = await this.sessions.start(payload.sub, client, opts);
    return this.issueTokens({ ...payload, sid });
  }

  private async issueTokens(payload: JwtPayload): Promise<AuthTokens> {
    const user = await this.prisma.client.user.findUnique({
      where: { id: payload.sub },
      select: { isSuperAdmin: true },
    });
    const isSuperAdmin = user?.isSuperAdmin || false;

    const [accessToken, refreshToken] = await Promise.all([
      this.jwt.signAsync({ ...payload, isSuperAdmin }, {
        secret: this.config.getOrThrow<string>('JWT_SECRET'),
        expiresIn: this.config.get<string>('JWT_ACCESS_TTL', '15m'),
      }),
      this.jwt.signAsync(
        { sub: payload.sub, email: payload.email, isSuperAdmin, sid: payload.sid },
        {
          secret: this.config.getOrThrow<string>('JWT_REFRESH_SECRET'),
          expiresIn: this.config.get<string>('JWT_REFRESH_TTL', '7d'),
        },
      ),
    ]);
    return { accessToken, refreshToken };
  }
}
