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

describe('Convoy integration branch routes', () => {
  let server;
  let baseUrl;
  let calls;

  beforeAll(async () => {
    calls = [];
    const convoyService = {
      list: async () => [],
      get: async () => ({}),
      create: async () => ({ ok: true, convoyId: 'c-1', raw: '' }),
      integrationBranchStatus: async (id, opts) => {
        calls.push(['integrationBranchStatus', id, opts]);
        return { branch: 'integration/test', commits_ahead: 5, ready_to_land: false };
      },
      createIntegrationBranch: async (id, opts) => {
        calls.push(['createIntegrationBranch', id, opts]);
        return { ok: true, raw: 'Created integration branch' };
      },
      landIntegrationBranch: async (id, opts) => {
        calls.push(['landIntegrationBranch', id, opts]);
        return { ok: true, raw: 'Landed' };
      },
      feed: async (id) => {
        calls.push(['feed', id]);
        return { ok: true, slung: 2, total: 2 };
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

  it('GET /api/convoy/:id/integration-branch/status returns branch status', async () => {
    const res = await fetch(`${baseUrl}/api/convoy/convoy-abc/integration-branch/status`);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ branch: 'integration/test', commits_ahead: 5, ready_to_land: false });
    expect(calls.find(c => c[0] === 'integrationBranchStatus')).toEqual(['integrationBranchStatus', 'convoy-abc', { rig: undefined }]);
  });

  it('POST /api/convoy/:id/integration-branch creates branch', async () => {
    const res = await fetch(`${baseUrl}/api/convoy/convoy-abc/integration-branch`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ branch: 'integration/custom' }),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(calls.find(c => c[0] === 'createIntegrationBranch')).toEqual(['createIntegrationBranch', 'convoy-abc', { branch: 'integration/custom', rig: undefined }]);
  });

  it('POST /api/convoy/:id/integration-branch/land lands branch', async () => {
    const res = await fetch(`${baseUrl}/api/convoy/convoy-abc/integration-branch/land`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ dryRun: true }),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(calls.find(c => c[0] === 'landIntegrationBranch')).toEqual(['landIntegrationBranch', 'convoy-abc', { dryRun: true, rig: undefined }]);
  });

  it('POST /api/convoy/:id/feed feeds convoy', async () => {
    const res = await fetch(`${baseUrl}/api/convoy/convoy-abc/feed`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{}',
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ ok: true, slung: 2, total: 2 });
    expect(calls.find(c => c[0] === 'feed')).toEqual(['feed', 'convoy-abc']);
  });
});

describe('Convoy prepare-integration route', () => {
  let server;
  let baseUrl;
  let calls;

  beforeAll(async () => {
    calls = [];
    const convoyService = {
      list: async () => [],
      get: async () => ({}),
      create: async () => ({ ok: true, convoyId: 'c-1', raw: '' }),
      integrationBranchStatus: async () => ({}),
      createIntegrationBranch: async () => ({ ok: true, raw: '' }),
      landIntegrationBranch: async () => ({ ok: true, raw: '' }),
      feed: async () => ({ ok: true, slung: 0, total: 0 }),
      prepareIntegration: async (id, opts) => {
        calls.push(['prepareIntegration', id, opts]);
        return {
          epicId: 'epic-123',
          integrationBranch: 'integration/my-feature',
          reparented: [{ id: 'bd-1', from: null }],
          skipped: [],
        };
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

  it('POST /api/convoy/:id/prepare-integration returns result', async () => {
    const res = await fetch(`${baseUrl}/api/convoy/convoy-abc/prepare-integration`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ epicName: 'My Feature', beadIds: ['bd-1', 'bd-2'] }),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.epicId).toBe('epic-123');
    expect(body.integrationBranch).toBe('integration/my-feature');
    expect(calls[0]).toEqual(['prepareIntegration', 'convoy-abc', {
      epicName: 'My Feature',
      branchName: undefined,
      beadIds: ['bd-1', 'bd-2'],
      rig: undefined,
    }]);
  });

  it('POST /api/convoy/:id/prepare-integration returns 400 without epicName', async () => {
    const res = await fetch(`${baseUrl}/api/convoy/convoy-abc/prepare-integration`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ beadIds: ['bd-1'] }),
    });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe('epicName is required');
  });

  it('POST /api/convoy/:id/prepare-integration returns 400 without beadIds', async () => {
    const res = await fetch(`${baseUrl}/api/convoy/convoy-abc/prepare-integration`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ epicName: 'Test' }),
    });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe('beadIds must be a non-empty array');
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
