import { describe, it, expect } from 'vitest';

import { BeadService } from '../../server/services/BeadService.js';

describe('BeadService', () => {
  it('maps UI priorities and emits bead_created', async () => {
    const calls = [];
    const emitted = [];

    const bdGateway = {
      list: async () => ({ ok: true, data: [] }),
      search: async () => ({ ok: true, data: [] }),
      show: async () => ({ ok: false }),
      create: async (opts) => {
        calls.push(opts);
        return { ok: true, beadId: 'gt-abc123', raw: 'Created bead: gt-abc123' };
      },
    };

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
      priority: 'P1',
      labels: ['bug', ' ui '],
      rig: null,
    });
    expect(emitted).toEqual([['bead_created', { bead_id: 'gt-abc123', title: 'Fix login' }]]);
  });

  it('omits default/normal priority', async () => {
    const calls = [];
    const bdGateway = {
      list: async () => ({ ok: true, data: [] }),
      search: async () => ({ ok: true, data: [] }),
      show: async () => ({ ok: false }),
      create: async (opts) => {
        calls.push(opts);
        return { ok: true, beadId: 'bead-1', raw: 'Created bead: bead-1' };
      },
    };

    const service = new BeadService({ bdGateway });
    await service.create({ title: 'T', priority: 'normal' });

    expect(calls[0].priority).toBe(null);
  });

  it('returns ok=false for missing beads', async () => {
    const bdGateway = {
      list: async () => ({ ok: true, data: [] }),
      search: async () => ({ ok: true, data: [] }),
      create: async () => ({ ok: true, beadId: 'bead-1', raw: '' }),
      show: async () => ({ ok: false, error: 'not found' }),
    };

    const service = new BeadService({ bdGateway });
    await expect(service.get('missing')).resolves.toEqual({ ok: false });
  });
});

