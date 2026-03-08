function parseJsonOrNull(text) {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

export class GTGateway {
  constructor({ runner, gtRoot }) {
    if (!runner?.exec) throw new Error('GTGateway requires a runner with exec()');
    if (!gtRoot) throw new Error('GTGateway requires gtRoot');
    this._runner = runner;
    this._gtRoot = gtRoot;
  }

  async exec(args, options = {}) {
    return this._runner.exec('gt', args, { cwd: this._gtRoot, ...options });
  }

  async status({ fast = true, allowExitCodes } = {}) {
    const args = ['status', '--json'];
    if (fast) args.push('--fast');
    const result = await this.exec(args, { timeoutMs: 30000, allowExitCodes });
    const raw = (result.stdout || '').trim();
    return { ...result, raw, data: parseJsonOrNull(raw) };
  }

  async listConvoys({ all = false, status } = {}) {
    const args = ['convoy', 'list', '--json'];
    if (all) args.push('--all');
    if (status) args.push(`--status=${status}`);
    const result = await this.exec(args, { timeoutMs: 30000 });
    const raw = (result.stdout || '').trim();
    return { ...result, raw, data: parseJsonOrNull(raw) };
  }

  async convoyStatus(convoyId) {
    const result = await this.exec(['convoy', 'status', convoyId, '--json'], { timeoutMs: 30000 });
    const raw = (result.stdout || '').trim();
    return { ...result, raw, data: parseJsonOrNull(raw) };
  }

  async createConvoy({ name, issues = [], notify } = {}) {
    const args = ['convoy', 'create', name, ...(issues || [])];
    if (notify) args.push('--notify', notify);

    const result = await this.exec(args, { timeoutMs: 30000 });
    const raw = (result.stdout || '').trim();

    const match = raw.match(/(?:Created|created)\s*(?:convoy)?:?\s*(\S+)/i);
    const convoyId = match ? match[1] : null;

    return { ...result, raw, convoyId };
  }

  async sling({ bead, target, molecule, args: slingArgs } = {}) {
    const cmdArgs = ['sling', bead];
    if (target) cmdArgs.push(target);
    if (molecule) cmdArgs.push('--molecule', molecule);
    if (slingArgs) cmdArgs.push('--args', slingArgs);

    const result = await this.exec(cmdArgs, { timeoutMs: 90000 });
    const raw = `${result.stdout || ''}${result.stderr || ''}`.trim();
    return { ...result, raw };
  }

  async escalate({ topic, severity, message } = {}) {
    if (!topic) throw new Error('GTGateway.escalate requires topic');
    if (!message) throw new Error('GTGateway.escalate requires message');

    const args = ['escalate', topic, '-s', severity || 'MEDIUM', '-r', message];
    const result = await this.exec(args, { timeoutMs: 30000 });
    const raw = `${result.stdout || ''}${result.stderr || ''}`.trim();
    return { ...result, raw };
  }

  async mailInbox() {
    const result = await this.exec(['mail', 'inbox', '--json'], { timeoutMs: 30000 });
    const raw = (result.stdout || '').trim();
    return { ...result, raw, data: parseJsonOrNull(raw) };
  }

  async mailRead(id) {
    const result = await this.exec(['mail', 'read', id, '--json'], { timeoutMs: 30000 });
    const raw = (result.stdout || '').trim();
    return { ...result, raw, data: parseJsonOrNull(raw) };
  }

  async mailSend({ to, subject, message, priority } = {}) {
    const args = ['mail', 'send', to, '-s', subject, '-m', message];
    if (priority) args.push('--priority', priority);
    const result = await this.exec(args, { timeoutMs: 30000 });
    const raw = (result.stdout || '').trim();
    return { ...result, raw };
  }

  async mailMarkRead(id) {
    const result = await this.exec(['mail', 'mark-read', id], { timeoutMs: 30000 });
    const raw = (result.stdout || '').trim();
    return { ...result, raw };
  }

  async mailMarkUnread(id) {
    const result = await this.exec(['mail', 'mark-unread', id], { timeoutMs: 30000 });
    const raw = (result.stdout || '').trim();
    return { ...result, raw };
  }

  async nudge(target, message) {
    const result = await this.exec(['nudge', target, message], { timeoutMs: 10000 });
    const raw = (result.stdout || '').trim();
    return { ...result, raw };
  }

  async hookStatus() {
    const result = await this.exec(['hook', 'status', '--json'], { timeoutMs: 30000 });
    const raw = (result.stdout || '').trim();
    return { ...result, raw, data: parseJsonOrNull(raw) };
  }

  async rigList() {
    const result = await this.exec(['rig', 'list'], { timeoutMs: 30000 });
    const raw = (result.stdout || '').trim();
    return { ...result, raw };
  }

  async rigAdd(name, url) {
    const result = await this.exec(['rig', 'add', name, url], { timeoutMs: 120000 });
    const raw = (result.stdout || '').trim();
    return { ...result, raw };
  }

  async rigDock(name) {
    const result = await this.exec(['rig', 'dock', name], { timeoutMs: 60000 });
    const raw = (result.stdout || '').trim();
    return { ...result, raw };
  }

  async rigUndock(name) {
    const result = await this.exec(['rig', 'undock', name], { timeoutMs: 30000 });
    const raw = (result.stdout || '').trim();
    return { ...result, raw };
  }

  async rigRemove(name) {
    const result = await this.exec(['rig', 'remove', name], { timeoutMs: 30000 });
    const raw = (result.stdout || '').trim();
    return { ...result, raw };
  }

  async crewList() {
    const result = await this.exec(['crew', 'list', '--json'], { timeoutMs: 30000 });
    const raw = (result.stdout || '').trim();
    return { ...result, raw, data: parseJsonOrNull(raw) };
  }

  async crewStatus(name) {
    const result = await this.exec(['crew', 'status', name, '--json'], { timeoutMs: 30000 });
    const raw = (result.stdout || '').trim();
    return { ...result, raw, data: parseJsonOrNull(raw) };
  }

  async crewAdd(name, rig) {
    const args = ['crew', 'add', name];
    if (rig) args.push('--rig', rig);
    const result = await this.exec(args, { timeoutMs: 30000 });
    const raw = (result.stdout || '').trim();
    return { ...result, raw };
  }

  async crewRemove(name) {
    const result = await this.exec(['crew', 'remove', name], { timeoutMs: 30000 });
    const raw = (result.stdout || '').trim();
    return { ...result, raw };
  }

  async doctor({ json = false } = {}) {
    const args = ['doctor'];
    if (json) args.push('--json');
    const result = await this.exec(args, { timeoutMs: 25000, allowExitCodes: [0, 1] });
    const raw = (result.stdout || '').trim();
    return { ...result, raw, data: json ? parseJsonOrNull(raw) : null };
  }

  async doctorFix() {
    const result = await this.exec(['doctor', '--fix'], { timeoutMs: 60000 });
    const raw = (result.stdout || '').trim();
    return { ...result, raw };
  }

  async serviceStart(name, rig) {
    const args = [name, 'start'];
    if (rig) args.push(rig);
    const result = await this.exec(args, { timeoutMs: 30000 });
    const raw = (result.stdout || '').trim();
    return { ...result, raw };
  }

  async serviceStop(name, rig) {
    const args = [name, 'stop'];
    if (rig) args.push(rig);
    const result = await this.exec(args, { timeoutMs: 10000 });
    const raw = (result.stdout || '').trim();
    return { ...result, raw };
  }
}
