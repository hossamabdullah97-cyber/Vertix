import { Body, Controller, Get, Ip, Patch, Post, UsePipes } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import {
  registerSchema,
  loginSchema,
  refreshSchema,
  googleSignInSchema,
  type GoogleSignInInput,
  forgotPasswordSchema,
  resetPasswordSchema,
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
import { OrgId } from './decorators/tenant.decorator';

/**
 * The pages that take a password or send a link: 20 requests a minute per
 * address, on top of the per-account limits inside AuthService.
 */
const AUTH_PAGE_LIMIT = { default: { limit: 20, ttl: 60_000 } };

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

  /**
   * The session (sub/orgId/role, straight from the token) merged with the
   * account profile stored on the user record. Callers rely on both halves.
   * `plan`/`verified` reflect the ACTIVE organization (the x-organization-id
   * header), not the token's org, since the app can switch workspaces.
   */
  @Get('me')
  async me(@CurrentUser() user: JwtPayload, @OrgId() activeOrgId?: string) {
    const [profile, badge] = await Promise.all([
      this.auth.getProfile(user.sub),
      this.auth.getPlanBadge(activeOrgId),
    ]);
    return { ...user, ...profile, ...badge, sub: user.sub };
  }

  /** Returns the same shape as GET /me so callers can swap their copy wholesale. */
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
