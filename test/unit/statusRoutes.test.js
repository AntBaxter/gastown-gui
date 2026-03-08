import { describe, it, expect, beforeAll, afterAll } from 'vitest';

import { createServer } from 'node:http';

import { createApp } from '../../server/app/createApp.js';
import { registerStatusRoutes } from '../../server/routes/status.js';

describe('Status routes (real Express app)', () => {
  let server;
  let baseUrl;

  beforeAll(async () => {
    const calls = [];
    const statusService = {
      getStatus: async (options) => {
        calls.push(options);
        return { ok: true };
      },
    };

    const app = createApp({ allowedOrigins: ['*'] });
    registerStatusRoutes(app, { statusService });

    server = createServer(app);
    await new Promise((resolve) => server.listen(0, resolve));
    const { port } = server.address();
    baseUrl = `http://127.0.0.1:${port}`;

    // Expose for tests
    server.__calls = calls;
  });

  afterAll(async () => {
    await new Promise((resolve) => server.close(resolve));
  });

  it('GET /api/status returns status JSON', async () => {
    const res = await fetch(`${baseUrl}/api/status`);
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ ok: true });

    expect(server.__calls).toEqual([{ refresh: false }]);
  });

  it('GET /api/status?refresh=true passes refresh=true to service', async () => {
    const res = await fetch(`${baseUrl}/api/status?refresh=true`);
    expect(res.status).toBe(200);

    expect(server.__calls).toEqual([{ refresh: false }, { refresh: true }]);
  });
});

describe('Status routes error handling', () => {
  let server;
  let baseUrl;

  beforeAll(async () => {
    const statusService = {
      getStatus: async () => { throw new Error('gt not found'); },
    };

    const app = createApp({ allowedOrigins: ['*'] });
    registerStatusRoutes(app, { statusService });

    server = createServer(app);
    await new Promise((resolve) => server.listen(0, resolve));
    const { port } = server.address();
    baseUrl = `http://127.0.0.1:${port}`;
  });

  afterAll(async () => {
    await new Promise((resolve) => server.close(resolve));
  });

  it('GET /api/status returns 500 when service throws', async () => {
    const res = await fetch(`${baseUrl}/api/status`);
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body).toHaveProperty('error', 'gt not found');
  });
});

