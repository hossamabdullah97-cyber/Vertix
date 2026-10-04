import { BadRequestException, Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import type { MfaChallenge } from '@vertex/shared';
import { PrismaService } from '../prisma/prisma.service';
import { AuthThrottleService, tooManyAttempts } from './auth-throttle.service';
import { SecretBox } from './secret-box';
import { hashRecoveryCode, newRecoveryCodes, newTotpSecret, otpauthUrl, stepAt, verifyTotp } from './totp';

/** How long the code screen of a sign-in stays open. */
const CHALLENGE_TTL = '5m';
/** Wrong codes allowed per account in a window, before it waits. */
const CODE_LIMIT = 5;
const CODE_WINDOW_MS = 15 * 60_000;

/**
 * Two-step verification: after the password (or Google), a code from an
 * authenticator app on the person's phone, or one of their recovery codes.
 * Turned on by the person; a workspace can require it of its members
 * (TenantGuard).
 */
@Injectable()
export class TwoFactorService {
  private box?: SecretBox;

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
    private readonly throttle: AuthThrottleService,
  ) {}

  private get db() {
    return this.prisma.client;
  }

  private get secrets(): SecretBox {
    return (this.box ??= new SecretBox(this.config.get<string>('TOTP_ENCRYPTION_KEY'), this.config.getOrThrow<string>('JWT_SECRET')));
  }

  /** Signed with its own key, so it can never pass as a session token. */
  private get challengeSecret() {
    return `${this.config.getOrThrow<string>('JWT_SECRET')}:two-step`;
  }

  async challenge(userId: string): Promise<MfaChallenge> {
    const mfaToken = await this.jwt.signAsync({ sub: userId, purpose: 'two-step' }, { secret: this.challengeSecret, expiresIn: CHALLENGE_TTL });
    return { mfaRequired: true, mfaToken };
  }

  /** The person a sign-in's code screen belongs to, once their code is right. */
  async completeChallenge(mfaToken: string, code: string): Promise<string> {
    let sub: string;
    try {
      const p = await this.jwt.verifyAsync<{ sub: string; purpose?: string }>(mfaToken, { secret: this.challengeSecret });
      if (p.purpose !== 'two-step') throw new Error('wrong purpose');
      sub = p.sub;
    } catch {
      throw new UnauthorizedException('This sign-in has expired. Start again.');
    }
    await this.check(sub, code);
    return sub;
  }

  /**
   * Accepts a current code from the app (each once) or an unused recovery
   * code (spent by using it); anything else counts towards the limit.
   */
  async check(userId: string, code: string): Promise<'app' | 'recovery'> {
    const key = `two-step:${userId}`;
    const wait = await this.throttle.blockedFor(key, CODE_LIMIT, CODE_WINDOW_MS);
    if (wait > 0) throw tooManyAttempts(wait);

    const user = await this.db.user.findFirst({
      where: { id: userId, deletedAt: null },
      select: { totpSecret: true, totpEnabledAt: true, totpLastStep: true, totpRecoveryCodes: true },
    });
    if (!user?.totpEnabledAt || !user.totpSecret) throw new UnauthorizedException('Two-step verification is not on for this account');

    const digits = code.replace(/\s/g, '');
    if (/^\d{6}$/.test(digits)) {
      const step = verifyTotp(this.secrets.open(user.totpSecret), digits, Date.now(), user.totpLastStep);
      // Recorded only if no other request used this step first.
      if (step !== null) {
        const claimed = await this.db.user.updateMany({
          where: { id: userId, OR: [{ totpLastStep: null }, { totpLastStep: { lt: step } }] },
          data: { totpLastStep: step },
        });
        if (claimed.count) {
          await this.throttle.clear(key);
          return 'app';
        }
      }
    } else {
      const hash = hashRecoveryCode(code);
      if (user.totpRecoveryCodes.includes(hash)) {
        const spent = await this.db.$executeRaw`
          UPDATE users SET "totpRecoveryCodes" = array_remove("totpRecoveryCodes", ${hash})
          WHERE id = ${userId} AND ${hash} = ANY("totpRecoveryCodes")`;
        if (spent) {
          await this.throttle.clear(key);
          return 'recovery';
        }
      }
    }
    await this.throttle.hit(key, CODE_WINDOW_MS);
    throw new UnauthorizedException('That code is not right');
  }

  async status(userId: string) {
    const user = await this.db.user.findUniqueOrThrow({
      where: { id: userId },
      select: { totpEnabledAt: true, totpRecoveryCodes: true },
    });
    return { enabled: !!user.totpEnabledAt, enabledAt: user.totpEnabledAt, recoveryCodesLeft: user.totpEnabledAt ? user.totpRecoveryCodes.length : 0 };
  }

  /** A new secret to scan, waiting for its first code; any earlier one waiting is replaced. */
  async setup(userId: string): Promise<{ secret: string; otpauthUrl: string }> {
    const user = await this.db.user.findUniqueOrThrow({ where: { id: userId }, select: { email: true, totpEnabledAt: true } });
    if (user.totpEnabledAt) throw new BadRequestException('Two-step verification is already on');
    const secret = newTotpSecret();
    await this.db.user.update({ where: { id: userId }, data: { totpPendingSecret: this.secrets.seal(secret) } });
    return { secret, otpauthUrl: otpauthUrl(secret, user.email) };
  }

  /** The first code proves the app has the secret: turns it on and gives the recovery codes, shown once. */
  async enable(userId: string, code: string): Promise<{ recoveryCodes: string[] }> {
    const key = `two-step:${userId}`;
    const wait = await this.throttle.blockedFor(key, CODE_LIMIT, CODE_WINDOW_MS);
    if (wait > 0) throw tooManyAttempts(wait);
    const user = await this.db.user.findUniqueOrThrow({ where: { id: userId }, select: { totpPendingSecret: true, totpEnabledAt: true } });
    if (user.totpEnabledAt) throw new BadRequestException('Two-step verification is already on');
    if (!user.totpPendingSecret) throw new BadRequestException('Start the setup again');
    const secret = this.secrets.open(user.totpPendingSecret);
    const step = verifyTotp(secret, code);
    if (step === null) {
      await this.throttle.hit(key, CODE_WINDOW_MS);
      throw new BadRequestException('That code is not right');
    }
    const { codes, hashes } = newRecoveryCodes();
    await this.db.user.update({
      where: { id: userId },
      data: { totpSecret: user.totpPendingSecret, totpPendingSecret: null, totpEnabledAt: new Date(), totpLastStep: step, totpRecoveryCodes: hashes },
    });
    await this.throttle.clear(key);
    return { recoveryCodes: codes };
  }

  /** Off, with a code from the app or a recovery code. Refused where a workspace requires it. */
  async disable(userId: string, code: string): Promise<{ ok: true }> {
    const requiring = await this.requiringWorkspace(userId);
    if (requiring) throw new BadRequestException(`${requiring} requires two-step verification, so it cannot be turned off`);
    await this.check(userId, code);
    await this.db.user.update({
      where: { id: userId },
      data: { totpSecret: null, totpPendingSecret: null, totpEnabledAt: null, totpLastStep: null, totpRecoveryCodes: [] },
    });
    return { ok: true };
  }

  /** A fresh set of recovery codes; the old ones stop working. */
  async regenerateRecoveryCodes(userId: string, code: string): Promise<{ recoveryCodes: string[] }> {
    await this.check(userId, code);
    const { codes, hashes } = newRecoveryCodes();
    await this.db.user.update({ where: { id: userId }, data: { totpRecoveryCodes: hashes } });
    return { recoveryCodes: codes };
  }

  /** The name of a workspace the person is active in that requires two-step verification, if any. */
  async requiringWorkspace(userId: string): Promise<string | null> {
    const [row] = await this.db.$queryRaw<{ name: string }[]>`
      SELECT o.name FROM memberships m JOIN organizations o ON o.id = m."orgId"
      WHERE m."userId" = ${userId} AND m.status = 'ACTIVE' AND o."deletedAt" IS NULL
        AND coalesce((o.settings->>'require2fa')::boolean, false)
      LIMIT 1`;
    return row?.name ?? null;
  }
}
