import path from 'node:path';

function parseJsonOrNull(text) {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

export class BDGateway {
  constructor({ runner, gtRoot }) {
    if (!runner?.exec) throw new Error('BDGateway requires a runner with exec()');
    if (!gtRoot) throw new Error('BDGateway requires gtRoot');
    this._runner = runner;
    this._gtRoot = gtRoot;
    this._beadsDir = path.join(gtRoot, '.beads');
  }

  async exec(args, options = {}) {
    const env = { BEADS_DIR: this._beadsDir, ...(options.env ?? {}) };
    return this._runner.exec('bd', args, { cwd: this._gtRoot, ...options, env });
  }

  async list({ status, rig } = {}) {
    const args = ['list'];
    if (status) args.push(`--status=${status}`);
    if (rig) args.push('--rig', rig);
    args.push('--json');

    const result = await this.exec(args, { timeoutMs: 30000 });
    const raw = (result.stdout || '').trim();
    return { ...result, raw, data: parseJsonOrNull(raw) };
  }

  async search(query) {
    const args = [query ? 'search' : 'list'];
    if (query) args.push(query);
    args.push('--json');

    const result = await this.exec(args, { timeoutMs: 30000 });
    const raw = (result.stdout || '').trim();
    return { ...result, raw, data: parseJsonOrNull(raw) };
  }

  async create({ title, description, priority, labels, rig } = {}) {
    const args = ['create', title];
    if (description) args.push('--description', description);
    if (priority) args.push('--priority', priority);
    if (Array.isArray(labels) && labels.length > 0) {
      args.push('--labels', labels.join(','));
    }
    if (rig) args.push('--rig', rig);
    args.push('--json');

    const result = await this.exec(args, { timeoutMs: 30000 });
    const raw = (result.stdout || '').trim();

    const parsed = parseJsonOrNull(raw);
    const beadId = parsed?.id || null;

    return { ...result, raw, beadId };
  }

  async show(beadId) {
    const result = await this.exec(['show', beadId, '--json'], { timeoutMs: 30000 });
    const raw = (result.stdout || '').trim();
    return { ...result, raw, data: parseJsonOrNull(raw) };
  }

  async markDone({ beadId, summary } = {}) {
    const args = ['close', beadId];
    if (summary) args.push('-r', summary);
    const result = await this.exec(args, { timeoutMs: 30000 });
    return { ...result, raw: (result.stdout || '').trim() };
  }

  async park({ beadId, reason } = {}) {
    const args = ['defer', beadId];
    if (reason) args.push('-r', reason);
    const result = await this.exec(args, { timeoutMs: 30000 });
    return { ...result, raw: (result.stdout || '').trim() };
  }

  async release(beadId) {
    const result = await this.exec(['update', beadId, '--status', 'open'], { timeoutMs: 30000 });
    return { ...result, raw: (result.stdout || '').trim() };
  }

  async reassign({ beadId, target } = {}) {
    const result = await this.exec(['update', beadId, '--assignee', target], { timeoutMs: 30000 });
    return { ...result, raw: (result.stdout || '').trim() };
  }
}
