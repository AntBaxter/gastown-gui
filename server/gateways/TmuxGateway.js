export class TmuxGateway {
  constructor({ runner, socketName = 'gt' }) {
    if (!runner?.exec) throw new Error('TmuxGateway requires a runner with exec()');
    this._runner = runner;
    this._socketName = socketName;
  }

  _args(...args) {
    return ['-L', this._socketName, ...args];
  }

  async hasSession(sessionName) {
    const result = await this._runner.exec('tmux', this._args('has-session', '-t', sessionName), {
      timeoutMs: 5000,
      allowExitCodes: [0, 1],
    });
    return result.exitCode === 0;
  }

  async listSessions() {
    const result = await this._runner.exec('tmux', this._args('ls'), {
      timeoutMs: 5000,
      allowExitCodes: [0, 1],
    });
    return String(result.stdout || '');
  }

  async capturePane({ sessionName, lines } = {}) {
    const result = await this._runner.exec('tmux', this._args('capture-pane', '-t', sessionName, '-p'), {
      timeoutMs: 5000,
    });

    if (!result.ok) return null;
    const output = String(result.stdout || '');
    if (!output) return '';

    const safeLines = Math.max(1, Math.min(10000, parseInt(lines, 10) || 50));
    const outputLines = output.split('\n');
    while (outputLines.length > 0 && outputLines[outputLines.length - 1] === '') {
      outputLines.pop();
    }
    return outputLines.slice(-safeLines).join('\n').trim();
  }

  async killSession(sessionName) {
    const result = await this._runner.exec('tmux', this._args('kill-session', '-t', sessionName), {
      timeoutMs: 5000,
      allowExitCodes: [0, 1],
    });
    return { ok: result.ok, killed: result.exitCode === 0, exitCode: result.exitCode, error: result.error };
  }
}
