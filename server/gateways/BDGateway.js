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
  }

  async exec(args, options = {}) {
    const env = options.env ?? {};
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

  async create({ title, description, type, priority, labels, rig, parent } = {}) {
    const args = ['create', title];
    if (type) args.push('--type', type);
    if (description) args.push('--description', description);
    if (priority) args.push('--priority', priority);
    if (Array.isArray(labels) && labels.length > 0) {
      args.push('--labels', labels.join(','));
    }
    if (rig) args.push('--rig', rig);
    if (parent) args.push('--parent', parent);
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

  async depList(beadId) {
    const result = await this.exec(['dep', 'list', beadId, '--json'], { timeoutMs: 30000 });
    const raw = (result.stdout || '').trim();
    return { ...result, raw, data: parseJsonOrNull(raw) };
  }

  async depAdd(beadId, dependsOnId) {
    const result = await this.exec(['dep', 'add', beadId, dependsOnId], { timeoutMs: 30000 });
    return { ...result, raw: (result.stdout || '').trim() };
  }

  async depRemove(beadId, dependsOnId) {
    const result = await this.exec(['dep', 'remove', beadId, dependsOnId], { timeoutMs: 30000 });
    return { ...result, raw: (result.stdout || '').trim() };
  }

  async depTree(beadId) {
    const result = await this.exec(['dep', 'tree', beadId], { timeoutMs: 30000 });
    return { ...result, raw: (result.stdout || '').trim() };
  }

  async updateParent(beadId, parentId) {
    const args = ['update', beadId, '--parent', parentId];
    const result = await this.exec(args, { timeoutMs: 30000 });
    return { ...result, raw: (result.stdout || '').trim() };
  }

  async delete(beadId) {
    const result = await this.exec(['delete', beadId, '--yes'], { timeoutMs: 30000 });
    return { ...result, raw: (result.stdout || '').trim() };
  }

  async blocked({ rig } = {}) {
    const args = ['blocked'];
    if (rig) args.push('--rig', rig);
    args.push('--json');

    const result = await this.exec(args, { timeoutMs: 30000 });
    const raw = (result.stdout || '').trim();
    return { ...result, raw, data: parseJsonOrNull(raw) };
  }

  async children(epicId) {
    // Fetch children using bd children (alias for bd list --parent <id> --status all)
    const childResult = await this.exec(['children', epicId, '--json'], { timeoutMs: 30000 });
    const childRaw = (childResult.stdout || '').trim();
    const children = parseJsonOrNull(childRaw) || [];

    // Also fetch the epic itself for metadata
    const epicResult = await this.exec(['show', epicId, '--json'], { timeoutMs: 30000 });
    const epicRaw = (epicResult.stdout || '').trim();
    const epicData = parseJsonOrNull(epicRaw);
    const epic = Array.isArray(epicData) ? epicData[0] : epicData;

    return { ...childResult, raw: childRaw, data: children, epic };
  }
}
