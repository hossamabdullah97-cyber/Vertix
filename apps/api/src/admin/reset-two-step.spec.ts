import { BadRequestException } from '@nestjs/common';
import { AdminService } from './admin.service';

function make(user: Record<string, unknown> | null) {
  const prisma = {
    client: {
      user: { findFirst: jest.fn().mockResolvedValue(user), update: jest.fn() },
      auditLog: { create: jest.fn() },
      organization: { findFirst: jest.fn().mockResolvedValue(null) },
    },
  };
  const mail = { send: jest.fn().mockResolvedValue(true) };
  const service = new AdminService(prisma as never, undefined, mail as never);
  jest.spyOn(service, 'logAdminAction').mockResolvedValue(undefined as never);
  return { service, prisma, mail };
}

describe('AdminService.resetTwoStep', () => {
  it('turns it off, records who did it, and tells the person', async () => {
    const { service, prisma, mail } = make({ email: 'mona@x.com', name: 'Mona', totpEnabledAt: new Date() });
    await expect(service.resetTwoStep('u1', 'admin1')).resolves.toEqual({ success: true });
    expect(prisma.client.user.update).toHaveBeenCalledWith({
      where: { id: 'u1' },
      data: { totpSecret: null, totpPendingSecret: null, totpEnabledAt: null, totpLastStep: null, totpRecoveryCodes: [] },
    });
    expect(service.logAdminAction).toHaveBeenCalledWith('admin1', 'RESET_TWO_STEP', 'User', 'u1', { email: 'mona@x.com' });
    expect(mail.send).toHaveBeenCalledWith(expect.objectContaining({ to: 'mona@x.com', subject: 'Two-step verification was turned off on your account' }));
  });

  it('refuses an account without it', async () => {
    await expect(make({ email: 'a@b.c', name: null, totpEnabledAt: null }).service.resetTwoStep('u1', 'admin1')).rejects.toThrow(BadRequestException);
  });
});
