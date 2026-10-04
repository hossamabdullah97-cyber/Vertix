import { BadRequestException, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { TwoFactorService } from './two-factor.service';
import { SecretBox } from './secret-box';
import { hashRecoveryCode, stepAt, totpCode } from './totp';

const SECRET = 'JBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXP';
const box = new SecretBox(undefined, 'jwt');

function make(user: Record<string, unknown> | null, opts: { requiring?: string | null; claim?: number; spend?: number } = {}) {
  const updates: unknown[] = [];
  const prisma = {
    client: {
      user: {
        findFirst: jest.fn().mockResolvedValue(user),
        findUniqueOrThrow: jest.fn().mockResolvedValue(user),
        update: jest.fn(async (a: unknown) => updates.push(a)),
        updateMany: jest.fn().mockResolvedValue({ count: opts.claim ?? 1 }),
      },
      $executeRaw: jest.fn().mockResolvedValue(opts.spend ?? 1),
      $queryRaw: jest.fn().mockResolvedValue(opts.requiring ? [{ name: opts.requiring }] : []),
    },
  };
  const throttle = { blockedFor: jest.fn().mockResolvedValue(0), hit: jest.fn(), clear: jest.fn() };
  const config = { get: () => undefined, getOrThrow: () => 'jwt' };
  const service = new TwoFactorService(prisma as never, new JwtService({}), config as never, throttle as never);
  return { service, prisma, throttle, updates };
}

const on = (extra: Record<string, unknown> = {}) => ({
  totpSecret: box.seal(SECRET),
  totpEnabledAt: new Date(),
  totpLastStep: null,
  totpRecoveryCodes: [hashRecoveryCode('abcd-efgh')],
  ...extra,
});

describe('TwoFactorService', () => {
  it('accepts the current code and records its step so it cannot be used again', async () => {
    const { service, prisma } = make(on());
    await expect(service.check('u1', totpCode(SECRET, stepAt(Date.now())))).resolves.toBe('app');
    expect(prisma.client.user.updateMany).toHaveBeenCalledWith(expect.objectContaining({ data: { totpLastStep: stepAt(Date.now()) } }));
  });

  it('refuses a code another request already used, and counts it', async () => {
    const { service, throttle } = make(on(), { claim: 0 });
    await expect(service.check('u1', totpCode(SECRET, stepAt(Date.now())))).rejects.toThrow(UnauthorizedException);
    expect(throttle.hit).toHaveBeenCalled();
  });

  it('spends a recovery code once', async () => {
    const { service } = make(on());
    await expect(service.check('u1', 'ABCD EFGH')).resolves.toBe('recovery');
    const spent = make(on(), { spend: 0 });
    await expect(spent.service.check('u1', 'abcd-efgh')).rejects.toThrow('That code is not right');
  });

  it('waits once there have been too many wrong codes', async () => {
    const { service, throttle } = make(on());
    throttle.blockedFor.mockResolvedValue(600);
    await expect(service.check('u1', '000000')).rejects.toThrow(/Too many attempts/);
  });

  it('turns on only with a right first code, keeping the recovery codes hashed', async () => {
    const pending = { totpPendingSecret: box.seal(SECRET), totpEnabledAt: null };
    const wrong = make(pending);
    await expect(wrong.service.enable('u1', '000000')).rejects.toThrow(BadRequestException);
    const { service, updates } = make(pending);
    const { recoveryCodes } = await service.enable('u1', totpCode(SECRET, stepAt(Date.now())));
    expect(recoveryCodes).toHaveLength(10);
    const data = (updates[0] as { data: Record<string, unknown> }).data;
    expect(data.totpEnabledAt).toBeInstanceOf(Date);
    expect(data.totpRecoveryCodes).toEqual(recoveryCodes.map(hashRecoveryCode));
  });

  it('cannot be turned off while a workspace requires it', async () => {
    const { service } = make(on(), { requiring: 'Acme' });
    await expect(service.disable('u1', totpCode(SECRET, stepAt(Date.now())))).rejects.toThrow('Acme requires two-step verification, so it cannot be turned off');
  });

  it('only completes a sign-in from its own challenge token', async () => {
    const { service } = make(on());
    const { mfaToken } = await service.challenge('u1');
    await expect(service.completeChallenge(mfaToken, totpCode(SECRET, stepAt(Date.now())))).resolves.toBe('u1');
    const session = await new JwtService({}).signAsync({ sub: 'u1' }, { secret: 'jwt' });
    await expect(service.completeChallenge(session, '123456')).rejects.toThrow('This sign-in has expired. Start again.');
  });
});
