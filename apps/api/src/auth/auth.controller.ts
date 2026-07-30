import { Body, Controller, Get, Patch, Post, UsePipes } from '@nestjs/common';
import {
  registerSchema,
  loginSchema,
  refreshSchema,
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

@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Public()
  @Post('register')
  @UsePipes(new ZodValidationPipe(registerSchema))
  register(@Body() body: RegisterInput) {
    return this.auth.register(body);
  }

  @Public()
  @Post('login')
  @UsePipes(new ZodValidationPipe(loginSchema))
  login(@Body() body: LoginInput) {
    return this.auth.login(body);
  }

  @Public()
  @Post('refresh')
  @UsePipes(new ZodValidationPipe(refreshSchema))
  refresh(@Body() body: RefreshInput) {
    return this.auth.refresh(body.refreshToken);
  }

  @Public()
  @Post('accept-invite')
  acceptInvite(
    @Body(new ZodValidationPipe(acceptInviteSchema)) body: AcceptInviteInput,
  ) {
    return this.auth.acceptInvite(body.token, body.password, body.name);
  }

  @Public()
  @Post('forgot-password')
  forgotPassword(
    @Body(new ZodValidationPipe(forgotPasswordSchema)) body: ForgotPasswordInput,
  ) {
    return this.auth.forgotPassword(body.email);
  }

  @Public()
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
