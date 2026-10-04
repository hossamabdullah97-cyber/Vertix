import { Injectable } from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';
import { JwtService } from '@nestjs/jwt';

const jwt = new JwtService({});

/**
 * Rate limits counted per person once they are signed in, and per address
 * before that. Many people share one address (an office, a mobile network's
 * shared IPs), so counting by address alone lets one colleague use up
 * another's allowance. The session token is verified, not just read, so a
 * made-up one cannot dodge the address limit.
 */
@Injectable()
export class UserThrottlerGuard extends ThrottlerGuard {
  protected override async getTracker(req: Record<string, any>): Promise<string> {
    const header = req.headers?.authorization as string | undefined;
    const secret = process.env.JWT_SECRET;
    if (header?.startsWith('Bearer ') && secret) {
      try {
        const claims = jwt.verify<{ sub?: string }>(header.slice(7), { secret });
        if (claims.sub) return `user:${claims.sub}`;
      } catch {
        // Expired or not a session token: counted by address.
      }
    }
    return super.getTracker(req);
  }
}
