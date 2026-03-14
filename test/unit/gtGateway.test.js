import { describe, it, expect } from 'vitest';

import { GTGateway } from '../../server/gateways/GTGateway.js';

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

describe('GTGateway', () => {
  it('execs gt in gtRoot', async () => {
    const runner = new FakeRunner();
    const gateway = new GTGateway({ runner, gtRoot: '/tmp/gt' });

    await gateway.exec(['status']);
    expect(runner.calls[0]).toEqual({
      command: 'gt',
      args: ['status'],
      options: { cwd: '/tmp/gt' },
    });
  });

  it('status() builds correct args and parses JSON', async () => {
    const runner = new FakeRunner();
    runner.queue({ ok: true, exitCode: 0, stdout: '{"rigs":[]}', stderr: '', error: null, signal: null });
    const gateway = new GTGateway({ runner, gtRoot: '/tmp/gt' });

    const result = await gateway.status();

    expect(runner.calls[0].args).toEqual(['status', '--json', '--fast']);
    expect(result.data).toEqual({ rigs: [] });
  });

  it('status() forwards allowExitCodes to runner', async () => {
    const runner = new FakeRunner();
    runner.queue({ ok: true, exitCode: 1, stdout: '{"rigs":[]}', stderr: '', error: null, signal: null });
    const gateway = new GTGateway({ runner, gtRoot: '/tmp/gt' });

    await gateway.status({ allowExitCodes: [0, 1] });
    expect(runner.calls[0].options.allowExitCodes).toEqual([0, 1]);
  });

  it('listConvoys() supports all + status options', async () => {
    const runner = new FakeRunner();
    runner.queue({ ok: true, exitCode: 0, stdout: '[]', stderr: '', error: null, signal: null });
    const gateway = new GTGateway({ runner, gtRoot: '/tmp/gt' });

    await gateway.listConvoys({ all: true, status: 'running' });
    expect(runner.calls[0].args).toEqual(['convoy', 'list', '--json', '--all', '--status=running']);
  });

  it('createConvoy() extracts convoyId from output', async () => {
    const runner = new FakeRunner();
    runner.queue({ ok: true, exitCode: 0, stdout: 'Created convoy: convoy-abc123\n', stderr: '', error: null, signal: null });
    const gateway = new GTGateway({ runner, gtRoot: '/tmp/gt' });

    const result = await gateway.createConvoy({ name: 'Test', issues: ['one'], notify: 'mayor' });
    expect(runner.calls[0].args).toEqual(['convoy', 'create', 'Test', 'one', '--notify', 'mayor']);
    expect(result.convoyId).toBe('convoy-abc123');
  });

  it('sling() builds args for target/molecule/args', async () => {
    const runner = new FakeRunner();
    runner.queue({ ok: true, exitCode: 0, stdout: 'ok', stderr: 'warn', error: null, signal: null });
    const gateway = new GTGateway({ runner, gtRoot: '/tmp/gt' });

    const result = await gateway.sling({
      bead: 'bd-1',
      target: 'mayor',
      molecule: 'foo',
      args: '--bar',
    });

    expect(runner.calls[0].args).toEqual(['sling', 'bd-1', 'mayor', '--molecule', 'foo', '--args', '--bar']);
    expect(result.raw).toBe('okwarn');
  });

  it('escalate() builds args and returns raw output', async () => {
    const runner = new FakeRunner();
    runner.queue({ ok: true, exitCode: 0, stdout: 'sent', stderr: '', error: null, signal: null });
    const gateway = new GTGateway({ runner, gtRoot: '/tmp/gt' });

    const result = await gateway.escalate({
      topic: 'Convoy abc needs attention',
      severity: 'HIGH',
      message: 'Blocked',
    });

    expect(runner.calls[0].args).toEqual(['escalate', 'Convoy abc needs attention', '-s', 'HIGH', '-r', 'Blocked']);
    expect(result.raw).toBe('sent');
  });

  it('status() propagates runner failure with ok=false', async () => {
    const runner = new FakeRunner();
    runner.queue({ ok: false, exitCode: 1, stdout: '', stderr: 'gt: command failed', error: 'exit code 1', signal: null });
    const gateway = new GTGateway({ runner, gtRoot: '/tmp/gt' });

    const result = await gateway.status();
    expect(result.ok).toBe(false);
  });

  it('status() handles invalid JSON in stdout', async () => {
    const runner = new FakeRunner();
    runner.queue({ ok: true, exitCode: 0, stdout: 'not json', stderr: '', error: null, signal: null });
    const gateway = new GTGateway({ runner, gtRoot: '/tmp/gt' });

    const result = await gateway.status();
    expect(result.data).toBeNull();
  });

  it('integrationBranchStatus() builds correct args', async () => {
    const runner = new FakeRunner();
    runner.queue({ ok: true, exitCode: 0, stdout: '{"branch":"integration/auth"}', stderr: '', error: null, signal: null });
    const gateway = new GTGateway({ runner, gtRoot: '/tmp/gt' });

    const result = await gateway.integrationBranchStatus('epic-123');
    expect(runner.calls[0].args).toEqual(['mq', 'integration', 'status', 'epic-123', '--json']);
    expect(result.data).toEqual({ branch: 'integration/auth' });
  });

  it('createIntegrationBranch() passes optional branch flag', async () => {
    const runner = new FakeRunner();
    runner.queue({ ok: true, exitCode: 0, stdout: 'Created', stderr: '', error: null, signal: null });
    const gateway = new GTGateway({ runner, gtRoot: '/tmp/gt' });

    await gateway.createIntegrationBranch('epic-123', { branch: 'integration/custom' });
    expect(runner.calls[0].args).toEqual(['mq', 'integration', 'create', 'epic-123', '--branch', 'integration/custom']);
  });

  it('landIntegrationBranch() supports dry-run', async () => {
    const runner = new FakeRunner();
    runner.queue({ ok: true, exitCode: 0, stdout: 'Dry run OK', stderr: '', error: null, signal: null });
    const gateway = new GTGateway({ runner, gtRoot: '/tmp/gt' });

    const result = await gateway.landIntegrationBranch('epic-123', { dryRun: true });
    expect(runner.calls[0].args).toEqual(['mq', 'integration', 'land', 'epic-123', '--dry-run']);
    expect(result.raw).toBe('Dry run OK');
  });

  it('listConvoys() handles invalid JSON in stdout', async () => {
    const runner = new FakeRunner();
    runner.queue({ ok: true, exitCode: 0, stdout: 'broken', stderr: '', error: null, signal: null });
    const gateway = new GTGateway({ runner, gtRoot: '/tmp/gt' });

    const result = await gateway.listConvoys({});
    expect(result.data).toBeNull();
  });
});
