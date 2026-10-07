import { beforeEach, describe, expect, it, jest } from '@jest/globals';

jest.mock('@react-native-async-storage/async-storage', () => require('@react-native-async-storage/async-storage/jest/async-storage-mock'));
const mockNet = { isConnected: true as boolean | null };
jest.mock('@react-native-community/netinfo', () => ({ __esModule: true, default: { fetch: async () => mockNet, addEventListener: () => () => undefined } }));
const mockApi = jest.fn<(path: string, init?: unknown) => Promise<unknown>>();
jest.mock('./api', () => {
  class ApiError extends Error {
    status: number;
    constructor(message: string, code: number) {
      super(message);
      this.status = code;
    }
  }
  return { ApiError, api: (p: string, i?: unknown) => mockApi(p, i), activeOrg: async () => 'org_1' };
});

import AsyncStorage from '@react-native-async-storage/async-storage';
import { ApiError } from './api';
import { flush, pendingCount, write } from './outbox';

const offline = () => new (ApiError as unknown as new (m: string, s: number) => Error)('No connection', 0);

beforeEach(async () => {
  await AsyncStorage.clear();
  mockApi.mockReset();
  mockNet.isConnected = true;
});

describe('outbox', () => {
  it('sends straight away with a connection', async () => {
    mockApi.mockResolvedValue({ id: 'L1' });
    await expect(write('/leads', { method: 'POST', json: { name: 'Mona' } })).resolves.toEqual({ queued: false, data: { id: 'L1' } });
    expect(await pendingCount()).toBe(0);
  });

  it('keeps anything made offline, new leads included, and sends it in order once back, in its workspace', async () => {
    mockNet.isConnected = false;
    await expect(write('/leads', { method: 'POST', json: { name: 'Mona' } })).resolves.toEqual({ queued: true });
    await write('/tasks/T1', { method: 'PATCH', json: { completed: true } });
    expect(mockApi).not.toHaveBeenCalled();
    expect(await pendingCount()).toBe(2);

    mockNet.isConnected = true;
    mockApi.mockResolvedValue({});
    await flush();
    expect(mockApi.mock.calls.map((c) => c[0])).toEqual(['/leads', '/tasks/T1']);
    expect(mockApi.mock.calls[0]![1]).toEqual({ method: 'POST', json: { name: 'Mona' }, orgId: 'org_1' });
    expect(await pendingCount()).toBe(0);
  });

  it('keeps a change whose connection failed on the way, but never sends a new record twice', async () => {
    mockApi.mockRejectedValue(offline());
    await expect(write('/leads/L1', { method: 'PATCH', json: { stageId: 's2' } })).resolves.toEqual({ queued: true });
    await expect(write('/leads', { method: 'POST', json: { name: 'Mona' } })).rejects.toThrow('No connection');
    expect(await pendingCount()).toBe(1);
  });

  it('waits on while the server cannot be reached, and drops what it refuses', async () => {
    mockNet.isConnected = false;
    await write('/leads/L1', { method: 'PATCH', json: { stageId: 's2' } });
    await write('/leads/L2', { method: 'PATCH', json: { stageId: 's3' } });
    mockApi.mockRejectedValueOnce(offline());
    await flush();
    expect(await pendingCount()).toBe(2);
    mockApi.mockRejectedValueOnce(new (ApiError as unknown as new (m: string, s: number) => Error)('Lead not found', 404)).mockResolvedValueOnce({});
    await flush();
    expect(await pendingCount()).toBe(0);
  });
});
