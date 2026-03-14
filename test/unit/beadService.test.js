import { describe, it, expect } from 'vitest';

import { BeadService } from '../../server/services/BeadService.js';

function makeBdGateway(overrides = {}) {
  return {
    list: async () => ({ ok: true, data: [] }),
    search: async () => ({ ok: true, data: [] }),
    show: async () => ({ ok: false }),
    create: async () => ({ ok: true, beadId: 'bead-1', raw: '' }),
    ...overrides,
  };
}

function makeStatusService(rigs = []) {
  return {
    getStatus: async () => ({ rigs }),
  };
}

describe('BeadService', () => {
  it('maps UI priorities and emits bead_created', async () => {
    const calls = [];
    const emitted = [];

    const bdGateway = makeBdGateway({
      create: async (opts) => {
        calls.push(opts);
        return { ok: true, beadId: 'gt-abc123', raw: 'Created bead: gt-abc123' };
      },
    });

    const service = new BeadService({
      bdGateway,
      emit: (type, data) => emitted.push([type, data]),
    });

    const result = await service.create({
      title: 'Fix login',
      description: 'Steps…',
      priority: 'high',
      labels: ['bug', '', ' ui '],
    });

    expect(result.ok).toBe(true);
    expect(calls[0]).toEqual({
      title: 'Fix login',
      description: 'Steps…',
      type: null,
      priority: 'P1',
      labels: ['bug', ' ui '],
      rig: null,
    });
    expect(emitted).toEqual([['bead_created', { bead_id: 'gt-abc123', title: 'Fix login' }]]);
  });

  it('omits default/normal priority', async () => {
    const calls = [];
    const bdGateway = makeBdGateway({
      create: async (opts) => {
        calls.push(opts);
        return { ok: true, beadId: 'bead-1', raw: 'Created bead: bead-1' };
      },
    });

    const service = new BeadService({ bdGateway });
    await service.create({ title: 'T', priority: 'normal' });

    expect(calls[0].priority).toBe(null);
  });

  it('returns ok=false for missing beads', async () => {
    const bdGateway = makeBdGateway({
      show: async () => ({ ok: false, error: 'not found' }),
    });

    const service = new BeadService({ bdGateway });
    await expect(service.get('missing')).resolves.toEqual({ ok: false });
  });

  it('list with rig=all aggregates HQ + all rigs', async () => {
    const bdGateway = makeBdGateway({
      list: async ({ rig } = {}) => {
        if (!rig) return { ok: true, data: [{ id: 'hq-1', title: 'HQ bead' }] };
        if (rig === 'myrig') return { ok: true, data: [{ id: 'mr-1', title: 'Rig bead' }] };
        return { ok: true, data: [] };
      },
    });

    const statusService = makeStatusService([{ name: 'myrig' }]);
    const service = new BeadService({ bdGateway, statusService });

    const result = await service.list({ rig: 'all' });

    expect(result).toEqual([
      { id: 'hq-1', title: 'HQ bead', rig: 'hq' },
      { id: 'mr-1', title: 'Rig bead', rig: 'myrig' },
    ]);
  });

  it('list with rig=all deduplicates by id', async () => {
    const bdGateway = makeBdGateway({
      list: async ({ rig } = {}) => {
        if (!rig) return { ok: true, data: [{ id: 'shared-1', title: 'Shared' }] };
        if (rig === 'r1') return { ok: true, data: [{ id: 'shared-1', title: 'Shared' }] };
        return { ok: true, data: [] };
      },
    });

    const statusService = makeStatusService([{ name: 'r1' }]);
    const service = new BeadService({ bdGateway, statusService });

    const result = await service.list({ rig: 'all' });
    expect(result).toHaveLength(1);
    expect(result[0].rig).toBe('hq');
  });

  it('list with specific rig queries that rig', async () => {
    const calls = [];
    const bdGateway = makeBdGateway({
      list: async (opts) => {
        calls.push(opts);
        return { ok: true, data: [{ id: 'mr-1', title: 'Rig bead' }] };
      },
    });

    const service = new BeadService({ bdGateway });
    const result = await service.list({ rig: 'myrig', status: 'open' });

    expect(calls[0]).toEqual({ status: 'open', rig: 'myrig' });
    expect(result).toEqual([{ id: 'mr-1', title: 'Rig bead', rig: 'myrig' }]);
  });

  it('list with rig=hq queries default (no --rig flag)', async () => {
    const calls = [];
    const bdGateway = makeBdGateway({
      list: async (opts) => {
        calls.push(opts);
        return { ok: true, data: [{ id: 'hq-1', title: 'HQ' }] };
      },
    });

    const service = new BeadService({ bdGateway });
    const result = await service.list({ rig: 'hq' });

    expect(calls[0].rig).toBeFalsy();
    expect(result[0].rig).toBe('hq');
  });

  it('list without rig returns default HQ beads (backward compatible)', async () => {
    const bdGateway = makeBdGateway({
      list: async () => ({ ok: true, data: [{ id: 'hq-1', title: 'HQ' }] }),
    });

    const service = new BeadService({ bdGateway });
    const result = await service.list({});

    expect(result).toEqual([{ id: 'hq-1', title: 'HQ' }]);
  });

  it('search with rig=all aggregates and filters by query', async () => {
    const bdGateway = makeBdGateway({
      search: async () => ({ ok: true, data: [{ id: 'hq-1', title: 'Login bug' }] }),
      list: async ({ rig } = {}) => {
        if (rig === 'r1') return { ok: true, data: [
          { id: 'r1-1', title: 'Login fix' },
          { id: 'r1-2', title: 'Unrelated' },
        ] };
        return { ok: true, data: [] };
      },
    });

    const statusService = makeStatusService([{ name: 'r1' }]);
    const service = new BeadService({ bdGateway, statusService });

    const result = await service.search('login', { rig: 'all' });

    expect(result.map(b => b.id)).toEqual(['hq-1', 'r1-1']);
  });
});
