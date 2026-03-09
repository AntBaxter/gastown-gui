import { describe, it, expect } from 'vitest';

import { TmuxGateway } from '../../server/gateways/TmuxGateway.js';

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

describe('TmuxGateway', () => {
  it('hasSession returns true when exitCode is 0', async () => {
    const runner = new FakeRunner();
    runner.queue({ ok: true, exitCode: 0, stdout: '', stderr: '', error: null, signal: null });
    const gateway = new TmuxGateway({ runner });

    const running = await gateway.hasSession('gt-mayor');

    expect(running).toBe(true);
    expect(runner.calls[0].command).toBe('tmux');
    expect(runner.calls[0].args).toEqual(['-L', 'gt', 'has-session', '-t', 'gt-mayor']);
    expect(runner.calls[0].options.allowExitCodes).toEqual([0, 1]);
  });

  it('hasSession returns false when exitCode is 1', async () => {
    const runner = new FakeRunner();
    runner.queue({ ok: true, exitCode: 1, stdout: '', stderr: '', error: null, signal: null });
    const gateway = new TmuxGateway({ runner });

    const running = await gateway.hasSession('missing');
    expect(running).toBe(false);
  });

  it('capturePane returns last N lines', async () => {
    const runner = new FakeRunner();
    runner.queue({ ok: true, exitCode: 0, stdout: 'a\nb\nc\n', stderr: '', error: null, signal: null });
    const gateway = new TmuxGateway({ runner });

    const output = await gateway.capturePane({ sessionName: 'gt-x', lines: 2 });
    expect(output).toBe('b\nc');
  });

  it('killSession reports killed=false when exitCode is 1', async () => {
    const runner = new FakeRunner();
    runner.queue({ ok: true, exitCode: 1, stdout: '', stderr: '', error: null, signal: null });
    const gateway = new TmuxGateway({ runner });

    const result = await gateway.killSession('missing');
    expect(result.killed).toBe(false);
  });
});

