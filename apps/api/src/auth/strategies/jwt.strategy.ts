import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';
import type { JwtPayload } from '@vertex/shared';
import { SessionsService } from '../sessions.service';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy, 'jwt') {
  constructor(
    config: ConfigService,
    private readonly sessions: SessionsService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: config.getOrThrow<string>('JWT_SECRET'),
    });
  }

  /** A token of a device signed out from the account page stops working, not only its renewal. */
  async validate(payload: JwtPayload): Promise<JwtPayload> {
    if (payload.sid && !(await this.sessions.isLive(payload.sid))) throw new UnauthorizedException('This device was signed out');
    return payload;
  }
}
