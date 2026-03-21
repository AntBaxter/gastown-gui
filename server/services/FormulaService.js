import path from 'node:path';
import os from 'node:os';
import fsPromises from 'node:fs/promises';

function parseJsonOrNull(text) {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

export class FormulaService {
  constructor({ gtGateway, bdGateway, cache, emit, formulasDir } = {}) {
    this._gt = gtGateway;
    this._bd = bdGateway;
    this._cache = cache ?? null;
    this._emit = emit ?? null;
    this._formulasDir = formulasDir ?? path.join(os.homedir(), '.beads', 'formulas');
  }

  async list({ refresh = false, ttlMs = 60_000 } = {}) {
    if (!refresh && this._cache?.get) {
      const cached = this._cache.get('formulas');
      if (cached) return cached;
    }

    // Try gt formula list --json first
    let result = await this._gt.exec(['formula', 'list', '--json'], { timeoutMs: 30000 });
    if (result.ok) {
      const parsed = parseJsonOrNull((result.stdout || '').trim());
      if (parsed) {
        this._cache?.set?.('formulas', parsed, ttlMs);
        return parsed;
      }
    }

    // Try gt formula list without --json
    result = await this._gt.exec(['formula', 'list'], { timeoutMs: 30000 });
    if (result.ok && result.stdout) {
      const lines = result.stdout.split('\n');
      const formulas = [];
      for (const line of lines) {
        const match = line.match(/^\s+(\S+)\s*(?:-\s*(.+))?$/);
        if (match) {
          formulas.push({ name: match[1], description: match[2] || '' });
        }
      }
      if (formulas.length > 0) {
        this._cache?.set?.('formulas', formulas, ttlMs);
        return formulas;
      }
    }

    // Fallback: try bd formula list
    const bdResult = await this._bd.exec(['formula', 'list', '--json'], { timeoutMs: 10000 });
    const parsed = parseJsonOrNull((bdResult.stdout || '').trim()) || [];
    this._cache?.set?.('formulas', parsed, ttlMs);
    return parsed;
  }

  async search(query) {
    const q = String(query || '').toLowerCase();
    const formulas = await this.list({ refresh: false });
    if (!q) return formulas;
    return formulas.filter(f => {
      const name = String(f.name || '').toLowerCase();
      const desc = String(f.description || '').toLowerCase();
      return name.includes(q) || desc.includes(q);
    });
  }

  async get(name) {
    const result = await this._gt.exec(['formula', 'show', name, '--json'], { timeoutMs: 30000 });
    if (!result.ok) return null;
    return parseJsonOrNull((result.stdout || '').trim()) || {};
  }

  async create({ name, description, template } = {}) {
    const args = ['formula', 'create', name];
    if (description) args.push('--description', description);
    if (template) args.push('--template', template);

    const result = await this._gt.exec(args, { timeoutMs: 30000 });
    if (result.ok) {
      this._cache?.delete?.('formulas');
      this._emit?.('formula_created', { name });
    }
    return { ok: result.ok, raw: (result.stdout || '').trim(), error: result.error };
  }

  async use({ name, target, args: formulaArgs } = {}) {
    const cmdArgs = ['formula', 'run', name];
    if (target) cmdArgs.push('--rig', target);
    if (formulaArgs) cmdArgs.push('--args', formulaArgs);

    const result = await this._gt.exec(cmdArgs, { timeoutMs: 30000 });
    if (result.ok) {
      this._emit?.('formula_used', { name, target });
    }
    return { ok: result.ok, raw: (result.stdout || '').trim(), error: result.error };
  }

  async remove(name) {
    const formulaPath = path.join(this._formulasDir, `${name}.toml`);

    try {
      await fsPromises.access(formulaPath);
    } catch {
      return { ok: false, error: 'Formula not found', status: 404 };
    }

    await fsPromises.unlink(formulaPath);
    this._cache?.delete?.('formulas');
    this._emit?.('formula_deleted', { name });
    return { ok: true };
  }
}
