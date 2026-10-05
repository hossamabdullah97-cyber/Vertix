import { Body, Controller, Get, Ip, Patch, Post, UsePipes } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import {
  registerSchema,
  loginSchema,
  refreshSchema,
  googleSignInSchema,
  mfaLoginSchema,
  type MfaLoginInput,
  type GoogleSignInInput,
  forgotPasswordSchema,
  resetPasswordSchema,
  verifyEmailSchema,
  type VerifyEmailInput,
  acceptInviteSchema,
  updateProfileSchema,
  type UpdateProfileInput,
  type RegisterInput,
  type LoginInput,
  type RefreshInput,
  type ForgotPasswordInput,
  type ResetPasswordInput,
  type AcceptInviteInput,
  type JwtPayload,
} from '@vertex/shared';
import { AuthService } from './auth.service';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { Public } from './decorators/public.decorator';
import { CurrentUser } from './decorators/current-user.decorator';
import { TwoStepExempt } from './decorators/two-step-exempt.decorator';
import { OrgId, Tenant } from './decorators/tenant.decorator';
import type { TenantContext } from '@vertex/db';
import { PersonRoute } from './decorators/person-route.decorator';

/**
 * The pages that take a password or send a link: 20 requests a minute per
 * address, on top of the per-account limits inside AuthService.
 */
const AUTH_PAGE_LIMIT = { default: { limit: 20, ttl: 60_000 } };

@TwoStepExempt()
@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Public()
  @Throttle(AUTH_PAGE_LIMIT)
  @Post('register')
  @UsePipes(new ZodValidationPipe(registerSchema))
  register(@Body() body: RegisterInput) {
    return this.auth.register(body);
  }

  @Public()
  @Throttle(AUTH_PAGE_LIMIT)
  @Post('login')
  login(@Body(new ZodValidationPipe(loginSchema)) body: LoginInput, @Ip() ip: string) {
    return this.auth.login(body, ip);
  }

  /** The code screen of a sign-in with two-step verification. */
  @Public()
  @Throttle(AUTH_PAGE_LIMIT)
  @Post('login/2fa')
  loginTwoStep(@Body(new ZodValidationPipe(mfaLoginSchema)) body: MfaLoginInput) {
    return this.auth.completeTwoStep(body.mfaToken, body.code);
  }

  /** Which sign-in methods the page should offer. */
  @Public()
  @Get('providers')
  providers() {
    return this.auth.providers();
  }

  @Public()
  @Throttle(AUTH_PAGE_LIMIT)
  @Post('google')
  google(@Body(new ZodValidationPipe(googleSignInSchema)) body: GoogleSignInInput) {
    return this.auth.google(body.credential);
  }

  @Public()
  @Post('refresh')
  @UsePipes(new ZodValidationPipe(refreshSchema))
  refresh(@Body() body: RefreshInput) {
    return this.auth.refresh(body.refreshToken);
  }

  @Public()
  @Throttle(AUTH_PAGE_LIMIT)
  @Post('accept-invite')
  acceptInvite(
    @Body(new ZodValidationPipe(acceptInviteSchema)) body: AcceptInviteInput,
  ) {
    return this.auth.acceptInvite(body.token, body.password, body.name);
  }

  @Public()
  @Throttle(AUTH_PAGE_LIMIT)
  @Post('forgot-password')
  forgotPassword(
    @Body(new ZodValidationPipe(forgotPasswordSchema)) body: ForgotPasswordInput,
  ) {
    return this.auth.forgotPassword(body.email);
  }

  @Public()
  @Throttle(AUTH_PAGE_LIMIT)
  @Post('reset-password')
  resetPassword(
    @Body(new ZodValidationPipe(resetPasswordSchema)) body: ResetPasswordInput,
  ) {
    return this.auth.resetPassword(body.token, body.password);
  }

  /** Opens an email-confirmation link (signed in or not: the link is the proof). */
  @Public()
  @Throttle(AUTH_PAGE_LIMIT)
  @Post('verify-email')
  verifyEmail(@Body(new ZodValidationPipe(verifyEmailSchema)) body: VerifyEmailInput) {
    return this.auth.verifyEmail(body.token);
  }

  /** Sends the signed-in account a new confirmation link. */
  @Throttle(AUTH_PAGE_LIMIT)
  @Post('verify-email/resend')
  resendVerification(@CurrentUser() user: JwtPayload) {
    return this.auth.resendVerification(user.sub);
  }

  /**
   * The session (sub/orgId/role, straight from the token) merged with the
   * account profile stored on the user record. Callers rely on both halves.
   * `plan`/`verified` reflect the ACTIVE organization (the x-organization-id
   * header), not the token's org, since the app can switch workspaces.
   */
  @PersonRoute()
  @Get('me')
  async me(@CurrentUser() user: JwtPayload, @OrgId() activeOrgId?: string, @Tenant() tenant?: TenantContext) {
    const [profile, badge, twoFactorRequired, workspaceKind] = await Promise.all([
      this.auth.getProfile(user.sub),
      this.auth.getPlanBadge(activeOrgId),
      this.auth.workspaceRequiresTwoStep(activeOrgId),
      this.auth.workspaceKind(activeOrgId),
    ]);
    // The token names the workspace it was issued in; the role shown is the
    // one held in the workspace open now (an owner of their own, a member of
    // the company's).
    // In no workspace (removed from the last one), there is no role to show.
    const active = tenant ? { orgId: tenant.orgId, role: tenant.role } : user.isSuperAdmin ? {} : { orgId: undefined, role: undefined };
    return { ...user, ...active, ...profile, ...badge, twoFactorRequired, workspaceKind, sub: user.sub };
  }

  /** Returns the same shape as GET /me so callers can swap their copy wholesale. */
  @PersonRoute()
  @Patch('me')
  async updateMe(
    @CurrentUser() user: JwtPayload,
    @Body(new ZodValidationPipe(updateProfileSchema)) body: UpdateProfileInput,
    @OrgId() activeOrgId?: string,
  ) {
    const profile = await this.auth.updateProfile(user.sub, body);
    const badge = await this.auth.getPlanBadge(activeOrgId);
    return { ...user, ...profile, ...badge, sub: user.sub };
  }
}
