import { describe, it, expect, beforeAll, afterAll } from 'vitest';

import { createServer } from 'node:http';

import { createApp } from '../../server/app/createApp.js';
import { registerBeadRoutes } from '../../server/routes/beads.js';

describe('Bead routes (real Express app)', () => {
  let server;
  let baseUrl;
  let calls;

  beforeAll(async () => {
    calls = [];
    const beadService = {
      list: async (opts) => {
        calls.push(['list', opts]);
        return [{ id: 'bead-1' }];
      },
      search: async (query, opts) => {
        calls.push(['search', query, opts]);
        return [{ id: 'bead-2' }];
      },
      create: async (opts) => {
        calls.push(['create', opts]);
        if (!opts.title) return { ok: false, statusCode: 400, error: 'Title is required' };
        return { ok: true, beadId: 'bead-xyz', raw: 'Created bead: bead-xyz' };
      },
      get: async (beadId) => {
        calls.push(['get', beadId]);
        if (beadId === 'missing') return { ok: false };
        return { ok: true, bead: { id: beadId } };
      },
      getDependencies: async (epicId) => {
        calls.push(['getDependencies', epicId]);
        return [{ id: 'dep-1', dependency_type: 'blocks' }];
      },
      getBlocked: async () => {
        calls.push(['getBlocked']);
        return [{ id: 'blocked-1', blocked_by: ['dep-1'] }];
      },
      getInsights: async (opts) => {
        calls.push(['getInsights', opts]);
        return { health: {}, criticalPath: [], topBlockers: [], staleItems: [] };
      },
    };

    const app = createApp({ allowedOrigins: ['*'] });
    registerBeadRoutes(app, { beadService });

    server = createServer(app);
    await new Promise((resolve) => server.listen(0, resolve));
    const { port } = server.address();
    baseUrl = `http://127.0.0.1:${port}`;
  });

  afterAll(async () => {
    await new Promise((resolve) => server.close(resolve));
  });

  it('GET /api/beads forwards status', async () => {
    const res = await fetch(`${baseUrl}/api/beads?status=open`);
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual([{ id: 'bead-1' }]);
    expect(calls[0]).toEqual(['list', { status: 'open', rig: undefined }]);
  });

  it('GET /api/beads forwards rig param', async () => {
    calls.length = 0;
    const res = await fetch(`${baseUrl}/api/beads?rig=all`);
    expect(res.status).toBe(200);
    expect(calls[0]).toEqual(['list', { status: undefined, rig: 'all' }]);
  });

  it('GET /api/beads/search forwards q and rig', async () => {
    calls.length = 0;
    const res = await fetch(`${baseUrl}/api/beads/search?q=login&rig=all`);
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual([{ id: 'bead-2' }]);
    expect(calls[0]).toEqual(['search', 'login', { rig: 'all' }]);
  });

  it('POST /api/beads returns 400 when title is missing', async () => {
    const res = await fetch(`${baseUrl}/api/beads`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });

    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toEqual({ success: false, error: 'Title is required' });
  });

  it('GET /api/bead/:beadId returns 404 when missing', async () => {
    const res = await fetch(`${baseUrl}/api/bead/missing`);
    expect(res.status).toBe(404);
  });

  it('GET /api/beads/dependencies returns 400 without epic param', async () => {
    const res = await fetch(`${baseUrl}/api/beads/dependencies`);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe('epic query parameter required');
  });

  it('GET /api/beads/blocked returns array', async () => {
    const res = await fetch(`${baseUrl}/api/beads/blocked`);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(Array.isArray(body)).toBe(true);
  });

  it('GET /api/beads/insights returns insights object', async () => {
    calls.length = 0;
    const res = await fetch(`${baseUrl}/api/beads/insights?rig=all`);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toHaveProperty('health');
    expect(body).toHaveProperty('criticalPath');
    expect(body).toHaveProperty('topBlockers');
    expect(body).toHaveProperty('staleItems');
    expect(calls[0]).toEqual(['getInsights', { rig: 'all' }]);
  });
});
