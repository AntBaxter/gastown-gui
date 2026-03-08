import { describe, it, expect, beforeAll, afterAll } from 'vitest';

import { createServer } from 'node:http';

import { createApp } from '../../server/app/createApp.js';
import { registerGitHubRoutes } from '../../server/routes/github.js';

describe('GitHub routes (real Express app)', () => {
  let server;
  let baseUrl;
  let calls;

  beforeAll(async () => {
    calls = [];
    const gitHubService = {
      listPullRequests: async (opts) => {
        calls.push(['listPullRequests', opts]);
        return [{ n: 1 }];
      },
      viewPullRequest: async (opts) => {
        calls.push(['viewPullRequest', opts]);
        return { n: 123 };
      },
      listIssues: async (opts) => {
        calls.push(['listIssues', opts]);
        return [{ n: 2 }];
      },
      viewIssue: async (opts) => {
        calls.push(['viewIssue', opts]);
        return { n: 456 };
      },
      listRepos: async (opts) => {
        calls.push(['listRepos', opts]);
        return [{ name: 'repo' }];
      },
    };

    const app = createApp({ allowedOrigins: ['*'] });
    registerGitHubRoutes(app, { gitHubService });

    server = createServer(app);
    await new Promise((resolve) => server.listen(0, resolve));
    const { port } = server.address();
    baseUrl = `http://127.0.0.1:${port}`;
  });

  afterAll(async () => {
    await new Promise((resolve) => server.close(resolve));
  });

  it('GET /api/github/prs forwards query params', async () => {
    const res = await fetch(`${baseUrl}/api/github/prs?state=closed&refresh=true`);
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual([{ n: 1 }]);

    expect(calls[0]).toEqual(['listPullRequests', { state: 'closed', refresh: true }]);
  });

  it('GET /api/github/pr/:repo/:number decodes repo param', async () => {
    const res = await fetch(`${baseUrl}/api/github/pr/acme%2Fone/123`);
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ n: 123 });

    expect(calls[1]).toEqual(['viewPullRequest', { repo: 'acme/one', number: '123' }]);
  });

  it('GET /api/github/repos forwards limit/visibility', async () => {
    const res = await fetch(`${baseUrl}/api/github/repos?limit=25&visibility=private`);
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual([{ name: 'repo' }]);

    expect(calls[2]).toEqual(['listRepos', { limit: 25, visibility: 'private', refresh: false }]);
  });
});

describe('GitHub routes error handling', () => {
  let server;
  let baseUrl;

  beforeAll(async () => {
    const gitHubService = {
      listPullRequests: async () => { throw new Error('gh not installed'); },
      viewPullRequest: async () => { throw new Error('gh not installed'); },
      listIssues: async () => { throw new Error('gh not installed'); },
      viewIssue: async () => { throw new Error('gh not installed'); },
      listRepos: async () => { throw new Error('gh not installed'); },
    };

    const app = createApp({ allowedOrigins: ['*'] });
    registerGitHubRoutes(app, { gitHubService });

    server = createServer(app);
    await new Promise((resolve) => server.listen(0, resolve));
    const { port } = server.address();
    baseUrl = `http://127.0.0.1:${port}`;
  });

  afterAll(async () => {
    await new Promise((resolve) => server.close(resolve));
  });

  it('GET /api/github/prs returns 500 when service throws', async () => {
    const res = await fetch(`${baseUrl}/api/github/prs`);
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body).toHaveProperty('error', 'gh not installed');
  });

  it('GET /api/github/pr/:repo/:number returns 500 when service throws', async () => {
    const res = await fetch(`${baseUrl}/api/github/pr/acme%2Fone/123`);
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body).toHaveProperty('error', 'gh not installed');
  });

  it('GET /api/github/repos returns 500 when service throws', async () => {
    const res = await fetch(`${baseUrl}/api/github/repos`);
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body).toHaveProperty('error', 'gh not installed');
  });
});

