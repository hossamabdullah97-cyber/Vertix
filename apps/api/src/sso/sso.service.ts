import { BadRequestException, ConflictException, ForbiddenException, Injectable, Logger, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { resolveTxt } from 'node:dns/promises';
import { runWithTenant, type TenantContext } from '@vertex/db';
import {
  ssoIssuer,
  type Role,
  type SsoCallbackResult,
  type SsoConnectionInput,
  type SsoSettingsInput,
  type SsoView,
} from '@vertex/shared';
import { PrismaService } from '../prisma/prisma.service';
import { CredentialVault } from '../integrations/credential-vault.service';
import { LimitsService } from '../billing/limits.service';
import { AuthService, SUSPENDED_MESSAGE } from '../auth/auth.service';
import { SecretBox } from '../auth/secret-box';
import type { ClientInfo } from '../auth/sessions.service';
import { OidcClient, OidcError, checkIssuerUrl, pkce, randomToken, type OidcClaims } from './oidc';

/** How long someone has at their company's provider before the sign-in must start again. */
const STATE_TTL_MS = 10 * 60 * 1000;
const RECORD_PREFIX = 'vertex-verification=';

export const SSO_FAILED = 'Single sign-on failed';

interface State {
  /** The connection. */
  c: string;
  n: string;
  v: string;
  exp: number;
  /** A test started by this admin: checks the setup, signs nobody in. */
  t?: string;
}

/**
 * Single sign-on for company workspaces (OpenID Connect). A workspace proves
 * it owns an email domain with a DNS record, connects its own app at Google
 * Workspace, Microsoft Entra ID or another provider, tests it, and from then
 * on people with an address on that domain sign in through it; it may also
 * add them on their first sign-in, and require it of its members.
 */
@Injectable()
export class SsoService {
  private readonly logger = new Logger(SsoService.name);
  /** Replaceable in tests. */
  oidc = new OidcClient();
  dnsTxt: (domain: string) => Promise<string[][]> = resolveTxt;
  private box: SecretBox | null = null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly vault: CredentialVault,
    private readonly limits: LimitsService,
    private readonly auth: AuthService,
  ) {}

  private get db() {
    return this.prisma.client;
  }

  private get production() {
    return this.config.get<string>('NODE_ENV') === 'production';
  }

  private get redirectUri() {
    return `${(this.config.get<string>('APP_PUBLIC_URL') || 'http://localhost:3000').replace(/\/$/, '')}/sso/callback`;
  }

  /** The sign-in's own details travel through the provider sealed, so nothing needs keeping here meanwhile. */
  private get stateBox() {
    return (this.box ??= new SecretBox(undefined, this.config.getOrThrow<string>('JWT_SECRET'), 'sso-state-v1'));
  }

  private aad(orgId: string) {
    return `${orgId}:sso`;
  }

  private async requireCompany(orgId: string) {
    const org = await this.db.organization.findUnique({ where: { id: orgId }, select: { kind: true } });
    if (org?.kind !== 'TEAM') throw new ForbiddenException('Single sign-on is for company workspaces');
  }

  private async audit(tenant: TenantContext, action: string, metadata?: Record<string, unknown>) {
    await this.db.auditLog
      .create({ data: { orgId: tenant.orgId, actorId: tenant.userId, action, targetType: 'sso', metadata: metadata as never } })
      .catch((e) => this.logger.warn(`audit ${action}: ${(e as Error).message}`));
  }

  // ── Settings ─────────────────────────────────────────────────────────────

  async view(orgId: string): Promise<SsoView> {
    const [c, domains] = await Promise.all([
      this.db.ssoConnection.findFirst({ where: { orgId } }),
      this.db.ssoDomain.findMany({ where: { orgId }, orderBy: { createdAt: 'asc' } }),
    ]);
    return {
      connection: c && {
        provider: c.provider,
        issuer: c.issuer,
        tenantId: c.provider === 'MICROSOFT' ? (/microsoftonline\.com\/([^/]+)\//.exec(c.issuer)?.[1] ?? null) : null,
        clientId: c.clientId,
        testedAt: c.testedAt?.toISOString() ?? null,
        enforced: c.enforced,
        autoJoin: c.autoJoin,
        joinRole: c.joinRole === 'OWNER' ? 'ADMIN' : c.joinRole,
        lastUsedAt: c.lastUsedAt?.toISOString() ?? null,
      },
      domains: domains.map((d) => ({ id: d.id, domain: d.domain, record: RECORD_PREFIX + d.token, verifiedAt: d.verifiedAt?.toISOString() ?? null })),
      redirectUri: this.redirectUri,
    };
  }

  /**
   * Connects the workspace's app at its provider, or changes it. A change of
   * provider or app has to be tested again before anyone signs in with it,
   * and stops requiring it meanwhile, so a typo cannot lock the team out.
   */
  async save(tenant: TenantContext, input: SsoConnectionInput): Promise<SsoView> {
    await this.requireCompany(tenant.orgId);
    const existing = await this.db.ssoConnection.findFirst({ where: { orgId: tenant.orgId } });
    if (!existing && !input.clientSecret) throw new BadRequestException('Enter the client secret');

    let issuer: string;
    try {
      issuer = await checkIssuerUrl(ssoIssuer(input.provider, input), this.production);
      await this.oidc.discover(issuer);
    } catch (e) {
      if (e instanceof OidcError) {
        this.logger.warn(`SSO provider check failed for ${tenant.orgId}: ${e.message}`);
        throw new BadRequestException('Could not read the provider’s OpenID Connect settings at that address');
      }
      throw e;
    }
    const secret = input.clientSecret ? this.vault.encrypt(input.clientSecret, this.aad(tenant.orgId)) : existing!.clientSecret;
    const changed = !existing || existing.issuer !== issuer || existing.clientId !== input.clientId || !!input.clientSecret;
    const data = {
      provider: input.provider,
      issuer,
      clientId: input.clientId,
      clientSecret: secret,
      ...(changed ? { testedAt: null, enforced: false } : {}),
    };
    if (existing) await this.db.ssoConnection.update({ where: { id: existing.id }, data });
    else await this.db.ssoConnection.create({ data: { ...data, orgId: tenant.orgId } });
    await this.audit(tenant, existing ? 'sso.updated' : 'sso.created', { provider: input.provider, issuer });
    return this.view(tenant.orgId);
  }

  async settings(tenant: TenantContext, input: SsoSettingsInput): Promise<SsoView> {
    const c = await this.db.ssoConnection.findFirst({ where: { orgId: tenant.orgId } });
    if (!c) throw new NotFoundException('Set up single sign-on first');
    if (input.enforced && !c.enforced) {
      if (!c.testedAt) throw new BadRequestException('Test single sign-on before requiring it');
      const verified = await this.db.ssoDomain.count({ where: { orgId: tenant.orgId, verifiedAt: { not: null } } });
      if (!verified) throw new BadRequestException('Verify a domain before requiring single sign-on');
    }
    await this.db.ssoConnection.update({ where: { id: c.id }, data: input });
    await this.audit(tenant, 'sso.settings_changed', input);
    return this.view(tenant.orgId);
  }

  async remove(tenant: TenantContext): Promise<SsoView> {
    const c = await this.db.ssoConnection.findFirst({ where: { orgId: tenant.orgId } });
    if (c) {
      await this.db.ssoConnection.delete({ where: { id: c.id } });
      await this.audit(tenant, 'sso.removed');
    }
    return this.view(tenant.orgId);
  }

  async addDomain(tenant: TenantContext, domain: string): Promise<SsoView> {
    await this.requireCompany(tenant.orgId);
    const mine = await this.db.ssoDomain.findFirst({ where: { orgId: tenant.orgId, domain } });
    if (mine) throw new ConflictException('This domain is already in the list');
    if (await this.verifiedElsewhere(domain, tenant.orgId)) throw new ConflictException('This domain is verified by another workspace');
    await this.db.ssoDomain.create({ data: { orgId: tenant.orgId, domain, token: randomToken(18) } });
    await this.audit(tenant, 'sso.domain_added', { domain });
    return this.view(tenant.orgId);
  }

  private verifiedElsewhere(domain: string, orgId: string) {
    return runWithTenant({ orgId: 'admin', userId: 'system', role: 'OWNER' }, () =>
      this.db.ssoDomain.findFirst({ where: { domain, verifiedAt: { not: null }, orgId: { not: orgId } }, select: { id: true } }),
    );
  }

  /** Looks for the TXT record at the domain. */
  async verifyDomain(tenant: TenantContext, id: string): Promise<SsoView> {
    const d = await this.db.ssoDomain.findFirst({ where: { id, orgId: tenant.orgId } });
    if (!d) throw new NotFoundException('Domain not found');
    if (!d.verifiedAt) {
      if (await this.verifiedElsewhere(d.domain, tenant.orgId)) throw new ConflictException('This domain is verified by another workspace');
      if (!(await this.hasRecord(d.domain, RECORD_PREFIX + d.token))) {
        throw new BadRequestException(`No TXT record with the code was found at ${d.domain} yet. DNS changes can take up to an hour.`);
      }
      try {
        await this.db.ssoDomain.update({ where: { id: d.id }, data: { verifiedAt: new Date() } });
      } catch (e) {
        if ((e as { code?: string }).code === 'P2002') throw new ConflictException('This domain is verified by another workspace');
        throw e;
      }
      await this.audit(tenant, 'sso.domain_verified', { domain: d.domain });
    }
    return this.view(tenant.orgId);
  }

  private async hasRecord(domain: string, record: string): Promise<boolean> {
    // The browser tests use addresses at .test, a name that never resolves;
    // there is no DNS to ask, so those count as proven there and only there.
    if (this.config.get<string>('NODE_ENV') === 'test' && domain.endsWith('.test')) return true;
    const records = await this.dnsTxt(domain).catch(() => [] as string[][]);
    return records.some((chunks) => chunks.join('').trim() === record);
  }

  async removeDomain(tenant: TenantContext, id: string): Promise<SsoView> {
    const d = await this.db.ssoDomain.findFirst({ where: { id, orgId: tenant.orgId } });
    if (!d) throw new NotFoundException('Domain not found');
    await this.db.ssoDomain.delete({ where: { id: d.id } });
    // Requiring it with no domain left would require it of nobody, silently.
    const left = await this.db.ssoDomain.count({ where: { orgId: tenant.orgId, verifiedAt: { not: null } } });
    if (!left) await this.db.ssoConnection.updateMany({ where: { orgId: tenant.orgId }, data: { enforced: false } });
    await this.audit(tenant, 'sso.domain_removed', { domain: d.domain });
    return this.view(tenant.orgId);
  }

  // ── Signing in ───────────────────────────────────────────────────────────

  /** A test sign-in for the admin setting it up: proves the setup without signing anyone in. */
  async startTest(tenant: TenantContext): Promise<{ url: string }> {
    const c = await this.db.ssoConnection.findFirst({ where: { orgId: tenant.orgId } });
    if (!c) throw new NotFoundException('Set up single sign-on first');
    return { url: await this.authorizationUrl(c, undefined, tenant.userId) };
  }

  /** Where to send someone who typed their work address. */
  async start(email: string): Promise<{ url: string }> {
    const address = email.trim().toLowerCase();
    const domain = address.split('@')[1] ?? '';
    const found = await this.db.ssoDomain.findFirst({
      where: { domain, verifiedAt: { not: null }, org: { deletedAt: null, isActive: true } },
      select: { org: { select: { ssoConnection: true } } },
    });
    const c = found?.org.ssoConnection;
    if (!c || !c.testedAt) throw new NotFoundException('No single sign-on is set up for this address');
    return { url: await this.authorizationUrl(c, address) };
  }

  private async authorizationUrl(
    c: { id: string; issuer: string; clientId: string; provider: string },
    loginHint?: string,
    testBy?: string,
  ): Promise<string> {
    let doc;
    try {
      doc = await this.oidc.discover(c.issuer);
    } catch (e) {
      this.logger.warn(`SSO discovery failed for ${c.id}: ${(e as Error).message}`);
      throw new BadRequestException('Your company’s sign-in provider could not be reached. Try again in a moment.');
    }
    const { verifier, challenge } = pkce();
    const state: State = { c: c.id, n: randomToken(), v: verifier, exp: Date.now() + STATE_TTL_MS, ...(testBy ? { t: testBy } : {}) };
    const extra: Record<string, string> = {};
    // Google: show only the company's accounts in the chooser.
    if (c.provider === 'GOOGLE' && loginHint) extra.hd = loginHint.split('@')[1]!;
    if (testBy) extra.prompt = 'login';
    return this.oidc.authorizationUrl(doc, {
      clientId: c.clientId,
      redirectUri: this.redirectUri,
      state: Buffer.from(this.stateBox.seal(JSON.stringify(state))).toString('base64url'),
      nonce: state.n,
      challenge,
      loginHint,
      extra,
    });
  }

  private readState(raw: string): State {
    try {
      const s = JSON.parse(this.stateBox.open(Buffer.from(raw, 'base64url').toString('utf8'))) as State;
      if (typeof s.c === 'string' && typeof s.exp === 'number') {
        if (s.exp < Date.now()) throw new BadRequestException('This sign-in took too long. Start again.');
        return s;
      }
    } catch (e) {
      if (e instanceof BadRequestException) throw e;
    }
    throw new BadRequestException('This sign-in link is not valid. Start again.');
  }

  /** The person is back from their provider with a code. */
  async callback(code: string, rawState: string, client: ClientInfo): Promise<SsoCallbackResult> {
    const state = this.readState(rawState);
    const c = await this.db.ssoConnection.findUnique({
      where: { id: state.c },
      include: { org: { select: { id: true, deletedAt: true, isActive: true, ssoDomains: { where: { verifiedAt: { not: null } }, select: { domain: true } } } } },
    });
    if (!c || c.org.deletedAt || !c.org.isActive) throw new BadRequestException('This sign-in link is not valid. Start again.');

    let claims: OidcClaims;
    try {
      const doc = await this.oidc.discover(c.issuer);
      const secret = this.vault.decrypt(c.clientSecret, this.aad(c.orgId));
      claims = await this.oidc.exchange(doc, { clientId: c.clientId, clientSecret: secret, redirectUri: this.redirectUri, code, verifier: state.v, nonce: state.n });
    } catch (e) {
      this.logger.warn(`SSO sign-in failed for workspace ${c.orgId}: ${(e as Error).message}`);
      throw new UnauthorizedException(SSO_FAILED);
    }
    const email = (claims.email ?? (c.provider === 'MICROSOFT' ? claims.preferredUsername : null))?.toLowerCase() ?? null;

    if (state.t) {
      await this.db.ssoConnection.update({ where: { id: c.id }, data: { testedAt: new Date() } });
      await this.audit({ orgId: c.orgId, userId: state.t, role: 'ADMIN' }, 'sso.tested', { email });
      return { tested: true, email: email ?? claims.sub };
    }

    const domain = email?.split('@')[1];
    const domains = c.org.ssoDomains.map((d) => d.domain);
    if (!email || !domain || claims.emailVerified === false) throw new UnauthorizedException(SSO_FAILED);
    if (!domains.includes(domain)) throw new ForbiddenException('That account’s address is not on a domain this workspace has verified');
    // Google signs in personal accounts too; only the company's own carry its domain.
    if (c.provider === 'GOOGLE' && (!claims.hd || !domains.includes(claims.hd))) {
      throw new ForbiddenException('That account’s address is not on a domain this workspace has verified');
    }

    const user = await this.account(c.id, claims, email);
    const role = await this.place(c, user.id);
    await this.db.ssoConnection.update({ where: { id: c.id }, data: { lastUsedAt: new Date() } });
    return this.auth.ssoSession(user, c.orgId, role, client);
  }

  /** The account this person is: by the provider's id for them, else by address, else a new one. */
  private async account(connectionId: string, claims: OidcClaims, email: string) {
    const linked = await this.db.ssoIdentity.findUnique({ where: { connectionId_subject: { connectionId, subject: claims.sub } }, include: { user: true } });
    let user = linked && !linked.user.deletedAt ? linked.user : null;
    if (linked && !user) await this.db.ssoIdentity.delete({ where: { id: linked.id } });
    user ??= await this.db.user.findFirst({ where: { email: { equals: email, mode: 'insensitive' } } });

    if (user) {
      await this.db.user.update({
        where: { id: user.id },
        data: {
          // As with Google: a password set by someone who never proved this
          // inbox was theirs goes, now that its owner's company vouches for it.
          ...(!user.emailVerified && user.passwordHash ? { passwordHash: null } : {}),
          emailVerified: user.emailVerified ?? new Date(),
          name: user.name ?? claims.name,
        },
      });
    } else {
      user = await this.db.user.create({ data: { email, name: claims.name ?? email.split('@')[0]!, emailVerified: new Date() } });
    }
    if (!linked || linked.userId !== user.id) {
      await this.db.ssoIdentity.upsert({
        where: { connectionId_subject: { connectionId, subject: claims.sub } },
        create: { connectionId, subject: claims.sub, userId: user.id },
        update: { userId: user.id },
      });
    }
    return { id: user.id, email: user.email };
  }

  /** Their place in the workspace: as it is, accepted if invited, or new if the workspace adds people. */
  private place(c: { orgId: string; autoJoin: boolean; joinRole: Role }, userId: string): Promise<Role> {
    return runWithTenant({ orgId: c.orgId, userId, role: 'OWNER' }, async () => {
      // deletedAt left open on purpose: a removed member's row is the one to revive.
      const m = await this.db.membership.findFirst({ where: { userId, deletedAt: undefined }, select: { id: true, role: true, status: true, deletedAt: true } });
      if (m && !m.deletedAt) {
        if (m.status === 'SUSPENDED') throw new ForbiddenException(SUSPENDED_MESSAGE);
        if (m.status === 'INVITED') await this.db.membership.update({ where: { id: m.id }, data: { status: 'ACTIVE' } });
        return m.role as Role;
      }
      if (!c.autoJoin) throw new ForbiddenException('Ask your workspace admin to invite you');
      const role = c.joinRole === 'OWNER' ? 'EMPLOYEE' : c.joinRole;
      await this.limits.guard(c.orgId, 'members', async (tx) => {
        if (m) {
          await tx.membership.update({
            where: { id: m.id },
            data: { role, status: 'ACTIVE', deletedAt: null, teamId: null, departmentId: null, customRoleId: null },
          });
        } else {
          await tx.membership.create({ data: { orgId: c.orgId, userId, role, status: 'ACTIVE' } });
        }
      });
      await this.db.auditLog
        .create({ data: { orgId: c.orgId, actorId: userId, action: 'member.joined', targetType: 'membership', metadata: { via: 'sso' } } })
        .catch(() => undefined);
      return role as Role;
    });
  }
}
