import { describe, it, expect } from 'vitest';

import { WorkService } from '../../server/services/WorkService.js';

function createStubGateways() {
  const calls = [];
  const gtGateway = {
    sling: async (opts) => {
      calls.push(['sling', opts]);
      return { ok: false, stdout: '', stderr: '', raw: '', error: 'failed' };
    },
    escalate: async (opts) => {
      calls.push(['escalate', opts]);
      return { ok: true, stdout: 'ok', stderr: '', raw: 'ok', error: null };
    },
  };

  const bdGateway = {
    markDone: async () => ({ ok: true, raw: 'done' }),
    park: async () => ({ ok: true, raw: 'parked' }),
    release: async () => ({ ok: true, raw: 'released' }),
    reassign: async () => ({ ok: true, raw: 'reassigned' }),
    delete: async () => ({ ok: true, raw: 'deleted' }),
  };

  return { calls, gtGateway, bdGateway };
}

describe('WorkService', () => {
  it('treats sling as success when output indicates work attached', async () => {
    const { calls, gtGateway, bdGateway } = createStubGateways();
    const emitted = [];

    gtGateway.sling = async (opts) => {
      calls.push(['sling', opts]);
      return { ok: false, stdout: '', stderr: '', raw: 'Work attached to hook', error: 'exit 1' };
    };

    const service = new WorkService({
      gtGateway,
      bdGateway,
      emit: (type, data) => emitted.push([type, data]),
    });

    const result = await service.sling({ bead: 'bead-1', target: 'mayor' });
    expect(result.ok).toBe(true);
    expect(emitted[0][0]).toBe('work_slung');
    expect(result.data).toMatchObject({ bead: 'bead-1', target: 'mayor', workAttached: true });
  });

  it('returns a typed 400 when formula is missing', async () => {
    const { gtGateway, bdGateway } = createStubGateways();
    gtGateway.sling = async () => ({ ok: false, stdout: '', stderr: '', raw: "formula 'foo' not found", error: null });

    const service = new WorkService({ gtGateway, bdGateway });
    const result = await service.sling({ bead: 'bead-1' });

    expect(result.ok).toBe(false);
    expect(result.statusCode).toBe(400);
    expect(result.body).toMatchObject({ errorType: 'formula_missing', formula: 'foo' });
  });

  it('maps priorities to severities for escalate', async () => {
    const { calls, gtGateway, bdGateway } = createStubGateways();
    const emitted = [];

    const service = new WorkService({
      gtGateway,
      bdGateway,
      emit: (type, data) => emitted.push([type, data]),
    });

    const result = await service.escalate({ convoy_id: 'convoy-1234567890', reason: 'Blocked', priority: 'critical' });
    expect(result.ok).toBe(true);

    const call = calls.find((c) => c[0] === 'escalate');
    expect(call[1]).toEqual({
      topic: 'Convoy convoy-1 needs attention',
      severity: 'CRITICAL',
      message: 'Blocked',
    });
    expect(emitted[0]).toEqual(['escalation', { convoy_id: 'convoy-1234567890', reason: 'Blocked', priority: 'critical', severity: 'CRITICAL' }]);
  });
});
