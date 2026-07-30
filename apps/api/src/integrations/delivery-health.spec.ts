import { deliveryHealth, successRate } from './delivery-health';

/**
 * The health thresholds decide the badge an operator sees at a glance. These
 * pin every boundary so a change to the traffic-light rules is deliberate.
 */
describe('deliveryHealth', () => {
  it('is idle with no deliveries in the window', () => {
    expect(deliveryHealth({ total: 0, succeeded: 0, latestFailed: false })).toBe('idle');
  });

  it('is healthy when nearly everything succeeds and the last one did too', () => {
    expect(deliveryHealth({ total: 100, succeeded: 100, latestFailed: false })).toBe('healthy');
    expect(deliveryHealth({ total: 100, succeeded: 96, latestFailed: false })).toBe('healthy');
  });

  it('drops to warning on a fresh failure even at a high success rate', () => {
    expect(deliveryHealth({ total: 100, succeeded: 99, latestFailed: true })).toBe('warning');
  });

  it('is warning between 80% and 95% success', () => {
    expect(deliveryHealth({ total: 100, succeeded: 94, latestFailed: false })).toBe('warning');
    expect(deliveryHealth({ total: 100, succeeded: 80, latestFailed: false })).toBe('warning');
  });

  it('is degraded between 50% and 80% success', () => {
    expect(deliveryHealth({ total: 100, succeeded: 79, latestFailed: false })).toBe('degraded');
    expect(deliveryHealth({ total: 100, succeeded: 50, latestFailed: false })).toBe('degraded');
  });

  it('is error below 50% success', () => {
    expect(deliveryHealth({ total: 100, succeeded: 49, latestFailed: true })).toBe('error');
    expect(deliveryHealth({ total: 2, succeeded: 0, latestFailed: true })).toBe('error');
  });
});

describe('successRate', () => {
  it('is 0 when there is nothing to measure', () => {
    expect(successRate(0, 0)).toBe(0);
  });

  it('rounds to a whole percent', () => {
    expect(successRate(3, 2)).toBe(67);
    expect(successRate(100, 100)).toBe(100);
  });
});
