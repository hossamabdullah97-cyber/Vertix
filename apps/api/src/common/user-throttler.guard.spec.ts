import { JwtService } from '@nestjs/jwt';
import { UserThrottlerGuard } from './user-throttler.guard';

describe('UserThrottlerGuard', () => {
  const guard = new UserThrottlerGuard({ throttlers: [] } as never, {} as never, {} as never);
  const tracker = (req: Record<string, unknown>) => (guard as unknown as { getTracker: (r: unknown) => Promise<string> }).getTracker(req);
  const secret = 'throttle-test-secret-value';
  beforeAll(() => {
    process.env.JWT_SECRET = secret;
  });

  it('counts a signed-in person by who they are, wherever they come from', async () => {
    const token = new JwtService({}).sign({ sub: 'u1' }, { secret });
    await expect(tracker({ ip: '10.0.0.1', headers: { authorization: `Bearer ${token}` } })).resolves.toBe('user:u1');
    await expect(tracker({ ip: '10.0.0.2', headers: { authorization: `Bearer ${token}` } })).resolves.toBe('user:u1');
  });

  it('counts by address when the token is missing, forged or not a session', async () => {
    const forged = new JwtService({}).sign({ sub: 'u1' }, { secret: 'someone-elses-secret' });
    await expect(tracker({ ip: '10.0.0.1', headers: {} })).resolves.toBe('10.0.0.1');
    await expect(tracker({ ip: '10.0.0.1', headers: { authorization: `Bearer ${forged}` } })).resolves.toBe('10.0.0.1');
    await expect(tracker({ ip: '10.0.0.1', headers: { authorization: 'Bearer vx_personal_token' } })).resolves.toBe('10.0.0.1');
  });
});
