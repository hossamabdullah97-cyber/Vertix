import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { AuthService } from './auth.service';
import { AuthThrottleService } from './auth-throttle.service';
import { AuthController } from './auth.controller';
import { TwoFactorController } from './two-factor.controller';
import { TwoFactorService } from './two-factor.service';
import { JwtStrategy } from './strategies/jwt.strategy';

@Module({
  imports: [PassportModule, JwtModule.register({})],
  controllers: [AuthController, TwoFactorController],
  providers: [AuthService, AuthThrottleService, TwoFactorService, JwtStrategy],
  exports: [AuthService, TwoFactorService],
})
export class AuthModule {}
