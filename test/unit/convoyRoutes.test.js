import { describe, it, expect, beforeAll, afterAll } from 'vitest';

import { createServer } from 'node:http';

import { createApp } from '../../server/app/createApp.js';
import { registerConvoyRoutes } from '../../server/routes/convoys.js';

describe('Convoy routes (real Express app)', () => {
  let server;
  let baseUrl;
  let calls;

  beforeAll(async () => {
    calls = [];
    const convoyService = {
      list: async (opts) => {
        calls.push(['list', opts]);
        return [{ id: 'convoy-1' }];
      },
      get: async (id) => {
        calls.push(['get', id]);
        return { id };
      },
      create: async (opts) => {
        calls.push(['create', opts]);
        return { ok: true, convoyId: 'convoy-xyz', raw: 'Created convoy: convoy-xyz' };
      },
    };

    const app = createApp({ allowedOrigins: ['*'] });
    registerConvoyRoutes(app, { convoyService });

    server = createServer(app);
    await new Promise((resolve) => server.listen(0, resolve));
    const { port } = server.address();
    baseUrl = `http://127.0.0.1:${port}`;
  });

  afterAll(async () => {
    await new Promise((resolve) => server.close(resolve));
  });

  it('GET /api/convoys forwards query params', async () => {
    const res = await fetch(`${baseUrl}/api/convoys?all=true&status=running&refresh=true`);
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual([{ id: 'convoy-1' }]);
    expect(calls[0]).toEqual(['list', { all: true, status: 'running', refresh: true }]);
  });

  it('GET /api/convoy/:id returns convoy JSON', async () => {
    const res = await fetch(`${baseUrl}/api/convoy/convoy-123`);
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ id: 'convoy-123' });
    expect(calls[1]).toEqual(['get', 'convoy-123']);
  });

  it('POST /api/convoy returns success payload', async () => {
    const res = await fetch(`${baseUrl}/api/convoy`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Test', issues: ['bd-1'], notify: 'mayor' }),
    });

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({
      success: true,
      convoy_id: 'convoy-xyz',
      raw: 'Created convoy: convoy-xyz',
    });
    expect(calls[2]).toEqual(['create', { name: 'Test', issues: ['bd-1'], notify: 'mayor' }]);
  });
});

describe('Convoy routes error handling', () => {
  let server;
  let baseUrl;

  beforeAll(async () => {
    const convoyService = {
      list: async () => { throw new Error('CLI not available'); },
      get: async () => { throw new Error('CLI not available'); },
      create: async () => { throw new Error('CLI not available'); },
    };

    const app = createApp({ allowedOrigins: ['*'] });
    registerConvoyRoutes(app, { convoyService });

    server = createServer(app);
    await new Promise((resolve) => server.listen(0, resolve));
    const { port } = server.address();
    baseUrl = `http://127.0.0.1:${port}`;
  });

  afterAll(async () => {
    await new Promise((resolve) => server.close(resolve));
  });

  it('GET /api/convoys returns 500 when service throws', async () => {
    const res = await fetch(`${baseUrl}/api/convoys`);
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body).toHaveProperty('error', 'CLI not available');
  });

  it('GET /api/convoy/:id returns 500 when service throws', async () => {
    const res = await fetch(`${baseUrl}/api/convoy/convoy-1`);
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body).toHaveProperty('error', 'CLI not available');
  });

  it('POST /api/convoy returns 500 when service throws', async () => {
    const res = await fetch(`${baseUrl}/api/convoy`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Test', issues: ['one'] }),
    });
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body).toHaveProperty('error', 'CLI not available');
  });
});

