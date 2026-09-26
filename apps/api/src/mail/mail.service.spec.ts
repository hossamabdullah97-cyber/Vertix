import { MailService } from './mail.service';

/**
 * A transactional link (invite/reset) is only ever handed out once — the
 * token store keeps just its hash. If sending it throws, that link is gone
 * for good unless send() recovers it into the logs instead of crashing the
 * caller. This mirrors a real incident: fetch() to Resend threw a network
 * error mid-invite, and because send() had no try/catch, the exception
 * propagated out of MembersService.invite() — after the membership and
 * token were already written to the database — turning a working invite
 * into a 500 with an unrecoverable link.
 */

function makeService(config: Partial<Record<string, unknown>> = {}) {
  const cfg = {
    get: (key: string, dflt?: unknown) => config[key] ?? dflt,
  };
  return new MailService(cfg as never);
}

describe('MailService.send — no API key configured (local dev)', () => {
  it('logs the link and reports success, so the flow stays usable without a provider', async () => {
    const service = makeService({ RESEND_API_KEY: undefined });
    const logSpy = jest.spyOn((service as any).logger, 'log').mockImplementation();

    await expect(
      service.send({ to: 'a@b.co', subject: 'Hi', html: '<a href="http://x/accept?token=t">go</a>' }),
    ).resolves.toBe(true);

    const logged = logSpy.mock.calls.map((c) => String(c[0])).join('\n');
    expect(logged).toContain('[DEV EMAIL]');
    expect(logged).toContain('http://x/accept?token=t');
  });
});

describe('MailService.send — a configured provider that fails', () => {
  it('reports failure and recovers the link when the network call itself throws, without crashing the caller', async () => {
    const service = makeService({ RESEND_API_KEY: 're_test' });
    const errorSpy = jest.spyOn((service as any).logger, 'error').mockImplementation();
    const logSpy = jest.spyOn((service as any).logger, 'log').mockImplementation();
    global.fetch = jest.fn().mockRejectedValue(new TypeError('fetch failed'));

    await expect(
      service.send({ to: 'a@b.co', subject: 'Hi', html: '<a href="http://x/accept?token=t">go</a>' }),
    ).resolves.toBe(false);

    // The technical detail is logged server-side...
    expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining('fetch failed'));
    const logged = logSpy.mock.calls.map((c) => String(c[0])).join('\n');
    expect(logged).toContain('[UNDELIVERED EMAIL]');
    expect(logged).toContain('http://x/accept?token=t');
  });

  it('surfaces the nested cause (code/errno/syscall) that fetch collapses into a generic message', async () => {
    // Node's fetch wraps every network-layer failure — DNS, TCP refusal, a
    // hung/failed TLS handshake — in the same "TypeError: fetch failed",
    // with the actual reason one level down in `.cause`. Losing that level
    // is exactly what made this undiagnosable in production.
    const service = makeService({ RESEND_API_KEY: 're_test' });
    const errorSpy = jest.spyOn((service as any).logger, 'error').mockImplementation();
    jest.spyOn((service as any).logger, 'log').mockImplementation();
    const networkError = new TypeError('fetch failed');
    (networkError as unknown as { cause: unknown }).cause = {
      code: 'ETIMEDOUT',
      errno: -4039,
      syscall: 'connect',
      message: 'connect ETIMEDOUT 172.66.165.132:443',
    };
    global.fetch = jest.fn().mockRejectedValue(networkError);

    await service.send({ to: 'a@b.co', subject: 'Hi', html: '<a href="http://x/t">go</a>' });

    const logged = errorSpy.mock.calls.map((c) => String(c[0])).join('\n');
    expect(logged).toContain('cause.code=ETIMEDOUT');
    expect(logged).toContain('cause.syscall=connect');
    expect(logged).toContain('172.66.165.132:443');
  });

  it('reports failure on a non-OK HTTP response too, without leaking the provider status/body to the return value', async () => {
    const service = makeService({ RESEND_API_KEY: 're_test' });
    const logSpy = jest.spyOn((service as any).logger, 'log').mockImplementation();
    jest.spyOn((service as any).logger, 'error').mockImplementation();
    global.fetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 429,
      text: async () => 'quota exceeded',
    });

    const delivered = await service.send({
      to: 'a@b.co',
      subject: 'Hi',
      html: '<a href="http://x/accept?token=t">go</a>',
    });

    // The caller gets a plain boolean — no status code or provider body.
    expect(delivered).toBe(false);
    const logged = logSpy.mock.calls.map((c) => String(c[0])).join('\n');
    expect(logged).toContain('[UNDELIVERED EMAIL]');
  });

  it('never throws out of send(), even when the caller has no try/catch of its own', async () => {
    // This is the exact shape of the bug: MembersService.invite() awaits
    // sendInvite() with no surrounding try/catch, so send() itself is the
    // only place this can be stopped from becoming an unhandled 500.
    const service = makeService({ RESEND_API_KEY: 're_test' });
    jest.spyOn((service as any).logger, 'error').mockImplementation();
    jest.spyOn((service as any).logger, 'log').mockImplementation();
    global.fetch = jest.fn().mockRejectedValue(new TypeError('fetch failed'));

    await expect(
      service.sendInvite('a@b.co', 'http://x/accept?token=t', 'Acme', 'EMPLOYEE'),
    ).resolves.toBe(false);
  });
});
