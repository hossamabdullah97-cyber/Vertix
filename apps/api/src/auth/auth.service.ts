import {
  Injectable,
  ConflictException,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import bcrypt from 'bcryptjs';
import {
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

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
    private readonly tokens: TokensService,
    private readonly mail: MailService,
  ) {}

  async register(input: RegisterInput): Promise<AuthTokens> {
    const existing = await this.prisma.client.user.findFirst({
      where: { email: input.email },
    });
    if (existing) {
      throw new ConflictException('Email is already in use');
    }

    const passwordHash = await bcrypt.hash(input.password, 10);

    const { user, orgId } = await this.prisma.client.$transaction(
      async (tx) => {
        const user = await tx.user.create({
          data: {
            email: input.email,
            name: input.name,
            passwordHash,
          },
        });
        const org = await tx.organization.create({
          data: {
            name: input.organizationName,
            slug: slugify(input.organizationName),
          },
        });
        await tx.membership.create({
          data: { userId: user.id, orgId: org.id, role: 'OWNER' },
        });
        // Seed the default 7-stage sales pipeline so the CRM works immediately.
        const stages = [
          'New',
          'Contacted',
          'Qualified',
          'Proposal',
          'Negotiation',
          'Won',
          'Lost',
        ];
        await tx.pipelineStage.createMany({
          data: stages.map((name, order) => ({ orgId: org.id, name, order })),
        });
        return { user, orgId: org.id };
      },
    );

    return this.issueTokens({
      sub: user.id,
      email: user.email,
      orgId,
      role: 'OWNER',
    });
  }

  async login(input: LoginInput): Promise<AuthTokens> {
    const user = await this.prisma.client.user.findFirst({
      where: { email: input.email },
    });
    if (!user || !user.passwordHash) {
      throw new UnauthorizedException('Invalid credentials');
    }
    const ok = await bcrypt.compare(input.password, user.passwordHash);
    if (!ok) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const membership = await this.prisma.client.membership.findFirst({
      where: { userId: user.id },
      orderBy: { createdAt: 'asc' },
    });

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

    // The refresh token deliberately carries no orgId/role, so they are read
    // back from the membership — which also means a role change or removal
    // takes effect on the next refresh instead of lingering for the token's
    // whole lifetime.
    const membership = await this.prisma.client.membership.findFirst({
      where: { userId: payload.sub },
      orderBy: { createdAt: 'asc' },
    });

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
    const user = await this.prisma.client.user.findFirst({ where: { email } });
    if (user) {
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
