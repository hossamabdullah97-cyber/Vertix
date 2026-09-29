import {
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

function slugify(input: string): string {
  const base = input
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40);
  const suffix = Math.random().toString(36).slice(2, 7);
  return `${base || 'org'}-${suffix}`;
}

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
  ) {}

  async register(input: RegisterInput): Promise<AuthTokens> {
    const email = normalizeEmail(input.email);
    const existing = await this.prisma.client.user.findFirst({
      where: { email: emailIs(email) },
    });
    if (existing) {
      throw new ConflictException('Email is already in use');
    }

    const passwordHash = await bcrypt.hash(input.password, 10);

    const { user, orgId } = await this.createAccount(
      { email, name: input.name, passwordHash },
      input.organizationName,
    );

    return this.issueTokens({
      sub: user.id,
      email: user.email,
      orgId,
      role: 'OWNER',
    });
  }

  /**
   * `ip` is the caller's address as Express sees it (see TRUST_PROXY). Failed
   * attempts are counted per account and per account from that address;
   * once either is over its limit the account refuses sign-in, even with the
   * right password, until the window ends. Unknown emails are counted the
   * same way, so the limit says nothing about which accounts exist.
   */
  async login(input: LoginInput, ip = 'unknown'): Promise<AuthTokens> {
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

    const membership = await this.defaultMembership(user.id);

    return this.issueTokens({
      sub: user.id,
      email: user.email,
      orgId: membership?.orgId,
      role: membership?.role as Role | undefined,
    });
  }

  async refresh(refreshToken: string): Promise<AuthTokens> {
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
    const membership = await this.defaultMembership(payload.sub);

    return this.issueTokens({
      sub: payload.sub,
      email: payload.email,
      orgId: membership?.orgId,
      role: membership?.role as Role | undefined,
    });
  }

  /** Completes an invitation: sets the password, activates the membership, logs in. */
  async acceptInvite(
    token: string,
    password: string,
    name?: string,
  ): Promise<AuthTokens> {
    const rec = await this.tokens.verify('INVITE', token);
    if (!rec.userId || !rec.orgId) {
      throw new UnauthorizedException('Invalid invitation');
    }
    const passwordHash = await bcrypt.hash(password, 10);

    await this.prisma.client.user.update({
      where: { id: rec.userId },
      data: { passwordHash, emailVerified: new Date(), ...(name ? { name } : {}) },
    });
    await this.prisma.client.membership.update({
      where: { userId_orgId: { userId: rec.userId, orgId: rec.orgId } },
      data: { status: 'ACTIVE' },
    });
    await this.tokens.consume(rec.id);

    return this.issueTokens({
      sub: rec.userId,
      email: rec.email,
      orgId: rec.orgId,
      role: (rec.role as Role) ?? 'EMPLOYEE',
    });
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
    await this.prisma.client.user.update({
      where: { id: rec.userId },
      data: { passwordHash },
    });
    await this.tokens.consume(rec.id);
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
      },
    });
    if (!user) throw new UnauthorizedException('Account not found');
    return user;
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
  async google(credential: string): Promise<AuthTokens> {
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
            googleId: who.sub,
            emailVerified: user.emailVerified ?? new Date(),
            avatarUrl: user.avatarUrl ?? who.picture,
            name: user.name ?? who.name,
          },
        });
      }
      const membership = await this.defaultMembership(user.id);
      return this.issueTokens({
        sub: user.id,
        email: user.email,
        orgId: membership?.orgId,
        role: membership?.role as Role | undefined,
      });
    }

    const name = who.name ?? email.split('@')[0]!;
    const created = await this.createAccount(
      { email, name, googleId: who.sub, emailVerified: new Date(), avatarUrl: who.picture },
      name,
    );
    return this.issueTokens({ sub: created.user.id, email: created.user.email, orgId: created.orgId, role: 'OWNER' });
  }

  /** A new person with a workspace they own, its sales pipeline ready. */
  private createAccount(
    data: { email: string; name?: string | null; passwordHash?: string; googleId?: string; emailVerified?: Date; avatarUrl?: string | null },
    organizationName: string,
  ) {
    return this.prisma.client.$transaction(async (tx) => {
      const user = await tx.user.create({ data });
      const org = await tx.organization.create({
        data: { name: organizationName, slug: slugify(organizationName) },
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
        { sub: payload.sub, email: payload.email, isSuperAdmin },
        {
          secret: this.config.getOrThrow<string>('JWT_REFRESH_SECRET'),
          expiresIn: this.config.get<string>('JWT_REFRESH_TTL', '7d'),
        },
      ),
    ]);
    return { accessToken, refreshToken };
  }
}
