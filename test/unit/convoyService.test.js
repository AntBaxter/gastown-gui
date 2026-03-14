import { describe, it, expect } from 'vitest';

import { CacheRegistry } from '../../server/infrastructure/CacheRegistry.js';
import { ConvoyService } from '../../server/services/ConvoyService.js';

describe('ConvoyService', () => {
  it('lists convoys via gt and caches by query', async () => {
    let now = Date.now();
    const cache = new CacheRegistry({ now: () => now });

    const gtGateway = {
      listCalls: 0,
      listConvoys: async () => {
        gtGateway.listCalls++;
        return { ok: true, data: [{ id: 'convoy-1' }] };
      },
      convoyStatus: async () => ({ ok: true, data: {} }),
      createConvoy: async () => ({ ok: true, raw: '', convoyId: 'convoy-1' }),
    };

    const service = new ConvoyService({ gtGateway, cache });

    const first = await service.list({ all: true, status: 'running', ttlMs: 1000 });
    const second = await service.list({ all: true, status: 'running', ttlMs: 1000 });

    expect(first).toEqual([{ id: 'convoy-1', name: null, issues: [] }]);
    expect(second).toEqual([{ id: 'convoy-1', name: null, issues: [] }]);
    expect(gtGateway.listCalls).toBe(1);

    now += 1001;
    await service.list({ all: true, status: 'running', ttlMs: 1000 });
    expect(gtGateway.listCalls).toBe(2);
  });

  it('maps API title/tracked fields to name/issues', async () => {
    const gtGateway = {
      listConvoys: async () => ({
        ok: true,
        data: [{ id: 'c-1', title: 'My Convoy', tracked: ['bd-1', 'bd-2'] }],
      }),
      convoyStatus: async () => ({ ok: true, data: {} }),
      createConvoy: async () => ({ ok: true, raw: '', convoyId: 'c-1' }),
    };

    const service = new ConvoyService({ gtGateway });
    const result = await service.list();

    expect(result[0].name).toBe('My Convoy');
    expect(result[0].issues).toEqual(['bd-1', 'bd-2']);
    expect(result[0].title).toBe('My Convoy');
    expect(result[0].tracked).toEqual(['bd-1', 'bd-2']);
  });

  it('returns integration branch status', async () => {
    const gtGateway = {
      listConvoys: async () => ({ ok: true, data: [] }),
      convoyStatus: async () => ({ ok: true, data: {} }),
      createConvoy: async () => ({ ok: true, raw: '', convoyId: '' }),
      integrationBranchStatus: async (id) => ({
        ok: true,
        data: { branch: 'integration/auth', commits_ahead: 5, ready_to_land: false },
      }),
    };

    const service = new ConvoyService({ gtGateway });
    const result = await service.integrationBranchStatus('convoy-1');
    expect(result).toEqual({ branch: 'integration/auth', commits_ahead: 5, ready_to_land: false });
  });

  it('feeds convoy by slinging ready issues', async () => {
    const slingCalls = [];
    const gtGateway = {
      listConvoys: async () => ({ ok: true, data: [] }),
      convoyStatus: async () => ({
        ok: true,
        data: {
          id: 'convoy-1',
          issues: [
            { id: 'bd-1', status: 'open' },
            { id: 'bd-2', status: 'closed' },
            { id: 'bd-3', status: 'open' },
          ],
        },
      }),
      createConvoy: async () => ({ ok: true, raw: '', convoyId: '' }),
      sling: async ({ bead }) => {
        slingCalls.push(bead);
        return { ok: true, raw: 'slung' };
      },
    };

    const service = new ConvoyService({ gtGateway });
    const result = await service.feed('convoy-1');
    expect(result.ok).toBe(true);
    expect(result.slung).toBe(2);
    expect(slingCalls).toEqual(['bd-1', 'bd-3']);
  });

  it('creates a convoy and emits convoy_created', async () => {
    const events = [];
    const gtGateway = {
      listConvoys: async () => ({ ok: true, data: [] }),
      convoyStatus: async () => ({ ok: true, data: {} }),
      createConvoy: async () => ({ ok: true, raw: 'Created convoy: convoy-abc', convoyId: 'convoy-abc' }),
    };

    const service = new ConvoyService({
      gtGateway,
      emit: (type, data) => events.push({ type, data }),
    });

    const result = await service.create({ name: 'Test', issues: ['bd-1'], notify: 'mayor' });
    expect(result.ok).toBe(true);
    expect(result.convoyId).toBe('convoy-abc');
    expect(events).toEqual([{ type: 'convoy_created', data: { convoy_id: 'convoy-abc', name: 'Test' } }]);
  });
});

