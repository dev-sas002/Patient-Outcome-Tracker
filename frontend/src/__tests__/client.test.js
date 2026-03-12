import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { api } from '../api/client';

function jsonResponse(status, body) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  };
}

let store;

beforeEach(() => {
  store = new Map();
  vi.stubGlobal('localStorage', {
    getItem: (key) => (store.has(key) ? store.get(key) : null),
    setItem: (key, value) => store.set(key, String(value)),
    removeItem: (key) => store.delete(key),
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('api client', () => {
  it('sends the stored token as a bearer header', async () => {
    store.set('token', 'demo-token');
    const fetch = vi.fn().mockResolvedValue(jsonResponse(200, { success: true, data: {} }));
    vi.stubGlobal('fetch', fetch);

    await api.getStats();

    const [, options] = fetch.mock.calls[0];
    expect(options.headers.Authorization).toBe('Bearer demo-token');
  });

  it('drops empty query parameters', async () => {
    const fetch = vi.fn().mockResolvedValue(jsonResponse(200, { success: true, data: {} }));
    vi.stubGlobal('fetch', fetch);

    await api.getOutcomes({ page: 2, limit: 10, outcome: '' });

    expect(fetch.mock.calls[0][0]).toMatch(/\/api\/outcomes\?page=2&limit=10$/);
  });

  it('surfaces the server message and status on failure', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse(429, { success: false, message: 'Slow down' })));

    await expect(api.login('demo.user', 'not-a-real-password')).rejects.toMatchObject({
      message: 'Slow down',
      status: 429,
    });
  });

  it('keeps the real status when the body is not JSON', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: false,
        status: 502,
        json: async () => {
          throw new SyntaxError('Unexpected token <');
        },
      })
    );

    await expect(api.getStats()).rejects.toMatchObject({ message: 'Request failed (502)', status: 502 });
  });
});
