import { BadRequestException } from '@nestjs/common';
import { AnalyticsController } from './analytics.controller';

// Addresses get edited by hand: a bad period or limit is a plain refusal or the
// default, never a database error.
describe('AnalyticsController query values', () => {
  const service = {
    overview: jest.fn(async () => ({})),
    tagPerformance: jest.fn(async () => []),
  };
  const controller = new AnalyticsController(service as never);
  const tenant = { orgId: 'o1', userId: 'u1', role: 'OWNER' } as never;

  it('refuses a period that is not dates, or ends before it starts', () => {
    expect(() => controller.overview(tenant, 'o1', 'nope', undefined)).toThrow(BadRequestException);
    expect(() => controller.overview(tenant, 'o1', '2026-10-06', '2026-10-01')).toThrow('The period must start before it ends');
  });

  it('takes the default for a limit that is not a sensible whole number', () => {
    for (const bad of ['x', '-5', '0', '1.5']) controller.tagPerformance(tenant, undefined, undefined, bad);
    for (const call of service.tagPerformance.mock.calls) expect((call as unknown[])[2]).toBeUndefined();
    controller.tagPerformance(tenant, undefined, undefined, '99999');
    expect((service.tagPerformance.mock.calls.at(-1) as unknown[])[2]).toBe(500);
  });
});
