import { describe, it, expect } from 'vitest';

import { BDGateway } from '../../server/gateways/BDGateway.js';

class FakeRunner {
  constructor() {
    this.calls = [];
    this._queue = [];
  }

  queue(result) {
    this._queue.push(result);
  }

  async exec(command, args, options) {
    this.calls.push({ command, args, options });
    return this._queue.shift() ?? { ok: true, exitCode: 0, stdout: '', stderr: '', error: null, signal: null };
  }
}

describe('BDGateway', () => {
  it('sets cwd for exec and does not force BEADS_DIR', async () => {
    const runner = new FakeRunner();
    const gateway = new BDGateway({ runner, gtRoot: '/tmp/gt' });

    await gateway.exec(['version']);

    expect(runner.calls[0].command).toBe('bd');
    expect(runner.calls[0].options.cwd).toBe('/tmp/gt');
    expect(runner.calls[0].options.env).toEqual({});
  });

  it('list() builds args and parses JSON', async () => {
    const runner = new FakeRunner();
    runner.queue({ ok: true, exitCode: 0, stdout: '[]', stderr: '', error: null, signal: null });
    const gateway = new BDGateway({ runner, gtRoot: '/tmp/gt' });

    const result = await gateway.list({ status: 'open' });

    expect(runner.calls[0].args).toEqual(['list', '--status=open', '--json']);
    expect(result.data).toEqual([]);
  });

  it('list() passes --rig flag when rig is specified', async () => {
    const runner = new FakeRunner();
    runner.queue({ ok: true, exitCode: 0, stdout: '[]', stderr: '', error: null, signal: null });
    const gateway = new BDGateway({ runner, gtRoot: '/tmp/gt' });

    await gateway.list({ status: 'open', rig: 'gastownui' });

    expect(runner.calls[0].args).toEqual(['list', '--status=open', '--rig', 'gastownui', '--json']);
  });

  it('list() passes --all flag when all is true', async () => {
    const runner = new FakeRunner();
    runner.queue({ ok: true, exitCode: 0, stdout: '[]', stderr: '', error: null, signal: null });
    const gateway = new BDGateway({ runner, gtRoot: '/tmp/gt' });

    await gateway.list({ all: true });

    expect(runner.calls[0].args).toEqual(['list', '--all', '--json']);
  });

  it('list() omits --all when status is specified', async () => {
    const runner = new FakeRunner();
    runner.queue({ ok: true, exitCode: 0, stdout: '[]', stderr: '', error: null, signal: null });
    const gateway = new BDGateway({ runner, gtRoot: '/tmp/gt' });

    await gateway.list({ status: 'open', all: true });

    // --all takes precedence over --status when both are set
    expect(runner.calls[0].args).toEqual(['list', '--all', '--json']);
  });

  it('search() uses list when query is empty', async () => {
    const runner = new FakeRunner();
    runner.queue({ ok: true, exitCode: 0, stdout: '[]', stderr: '', error: null, signal: null });
    const gateway = new BDGateway({ runner, gtRoot: '/tmp/gt' });

    await gateway.search('');
    expect(runner.calls[0].args).toEqual(['list', '--json']);
  });

  it('create() builds args with --json and extracts beadId', async () => {
    const runner = new FakeRunner();
    runner.queue({ ok: true, exitCode: 0, stdout: '{"id":"gt-abc123","title":"Fix login bug","status":"open"}\n', stderr: '', error: null, signal: null });
    const gateway = new BDGateway({ runner, gtRoot: '/tmp/gt' });

    const result = await gateway.create({
      title: 'Fix login bug',
      description: 'Steps to repro…',
      priority: 'P1',
      labels: ['bug', 'ui'],
    });

    expect(runner.calls[0].args).toEqual([
      'create',
      'Fix login bug',
      '--description',
      'Steps to repro…',
      '--priority',
      'P1',
      '--labels',
      'bug,ui',
      '--json',
    ]);
    expect(result.beadId).toBe('gt-abc123');
  });

  it('create() passes --rig flag when rig is specified', async () => {
    const runner = new FakeRunner();
    runner.queue({ ok: true, exitCode: 0, stdout: '{"id":"ga-xyz456","title":"Rig-specific bead","status":"open"}\n', stderr: '', error: null, signal: null });
    const gateway = new BDGateway({ runner, gtRoot: '/tmp/gt' });

    const result = await gateway.create({
      title: 'Rig-specific bead',
      rig: 'gastownui',
    });

    expect(runner.calls[0].args).toEqual([
      'create',
      'Rig-specific bead',
      '--rig',
      'gastownui',
      '--json',
    ]);
    expect(result.beadId).toBe('ga-xyz456');
  });

  it('create() returns null beadId when JSON parse fails', async () => {
    const runner = new FakeRunner();
    runner.queue({ ok: true, exitCode: 0, stdout: 'unexpected output\n', stderr: '', error: null, signal: null });
    const gateway = new BDGateway({ runner, gtRoot: '/tmp/gt' });

    const result = await gateway.create({ title: 'Test' });
    expect(result.beadId).toBeNull();
  });

  it('markDone() uses bd close with -r flag', async () => {
    const runner = new FakeRunner();
    runner.queue({ ok: true, exitCode: 0, stdout: 'closed', stderr: '', error: null, signal: null });
    const gateway = new BDGateway({ runner, gtRoot: '/tmp/gt' });

    await gateway.markDone({ beadId: 'bd-1', summary: 'ok' });
    expect(runner.calls[0].args).toEqual(['close', 'bd-1', '-r', 'ok']);
  });

  it('park() uses bd defer with -r flag', async () => {
    const runner = new FakeRunner();
    runner.queue({ ok: true, exitCode: 0, stdout: 'deferred', stderr: '', error: null, signal: null });
    const gateway = new BDGateway({ runner, gtRoot: '/tmp/gt' });

    await gateway.park({ beadId: 'bd-2', reason: 'waiting on upstream' });
    expect(runner.calls[0].args).toEqual(['defer', 'bd-2', '-r', 'waiting on upstream']);
  });

  it('release() uses bd update --status open', async () => {
    const runner = new FakeRunner();
    runner.queue({ ok: true, exitCode: 0, stdout: 'updated', stderr: '', error: null, signal: null });
    const gateway = new BDGateway({ runner, gtRoot: '/tmp/gt' });

    await gateway.release('bd-3');
    expect(runner.calls[0].args).toEqual(['update', 'bd-3', '--status', 'open']);
  });

  it('reassign() uses bd update --assignee', async () => {
    const runner = new FakeRunner();
    runner.queue({ ok: true, exitCode: 0, stdout: 'updated', stderr: '', error: null, signal: null });
    const gateway = new BDGateway({ runner, gtRoot: '/tmp/gt' });

    await gateway.reassign({ beadId: 'bd-4', target: 'mayor' });
    expect(runner.calls[0].args).toEqual(['update', 'bd-4', '--assignee', 'mayor']);
  });

  it('list() propagates runner failure with ok=false', async () => {
    const runner = new FakeRunner();
    runner.queue({ ok: false, exitCode: 1, stdout: '', stderr: 'bd: database locked', error: 'exit code 1', signal: null });
    const gateway = new BDGateway({ runner, gtRoot: '/tmp/gt' });

    const result = await gateway.list({ status: 'open' });
    expect(result.ok).toBe(false);
  });

  it('depList() uses bd dep list with --json', async () => {
    const runner = new FakeRunner();
    runner.queue({ ok: true, exitCode: 0, stdout: '[{"id":"dep-1","dependency_type":"blocks"}]', stderr: '', error: null, signal: null });
    const gateway = new BDGateway({ runner, gtRoot: '/tmp/gt' });

    const result = await gateway.depList('epic-1');
    expect(runner.calls[0].args).toEqual(['dep', 'list', 'epic-1', '--json']);
    expect(result.data).toEqual([{ id: 'dep-1', dependency_type: 'blocks' }]);
  });

  it('blocked() uses bd blocked with --json', async () => {
    const runner = new FakeRunner();
    runner.queue({ ok: true, exitCode: 0, stdout: '[{"id":"blocked-1","blocked_by":["dep-1"]}]', stderr: '', error: null, signal: null });
    const gateway = new BDGateway({ runner, gtRoot: '/tmp/gt' });

    const result = await gateway.blocked();
    expect(runner.calls[0].args).toEqual(['blocked', '--json']);
    expect(result.data).toEqual([{ id: 'blocked-1', blocked_by: ['dep-1'] }]);
  });

  it('list() handles invalid JSON in stdout', async () => {
    const runner = new FakeRunner();
    runner.queue({ ok: true, exitCode: 0, stdout: 'not json', stderr: '', error: null, signal: null });
    const gateway = new BDGateway({ runner, gtRoot: '/tmp/gt' });

    const result = await gateway.list({});
    expect(result.data).toBeNull();
  });

  it('create() propagates runner failure', async () => {
    const runner = new FakeRunner();
    runner.queue({ ok: false, exitCode: 1, stdout: '', stderr: 'creation failed', error: 'exit code 1', signal: null });
    const gateway = new BDGateway({ runner, gtRoot: '/tmp/gt' });

    const result = await gateway.create({ title: 'Test' });
    expect(result.ok).toBe(false);
  });
});
