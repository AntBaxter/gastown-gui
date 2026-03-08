import path from 'node:path';
import fsPromises from 'node:fs/promises';

export class RigService {
  constructor({ gtGateway, bdGateway, cache, gtRoot, emit, rigsTtlMs = 30000 } = {}) {
    if (!gtGateway) throw new Error('RigService requires gtGateway');
    this._gt = gtGateway;
    this._bd = bdGateway ?? null;
    this._cache = cache ?? null;
    this._gtRoot = gtRoot;
    this._emit = emit ?? null;
    this._rigsTtlMs = rigsTtlMs;
  }

  async list({ refresh = false } = {}) {
    if (!refresh && this._cache?.get) {
      const cached = this._cache.get('rigs');
      if (cached !== undefined) return cached;
    }

    const result = await this._gt.rigList();
    if (!result.ok) return [];

    const rigs = [];
    for (const line of result.raw.split('\n')) {
      const match = line.match(/^  ([a-zA-Z0-9_-]+)$/);
      if (match) rigs.push({ name: match[1] });
    }

    this._cache?.set?.('rigs', rigs, this._rigsTtlMs);
    return rigs;
  }

  async add({ name, url } = {}) {
    if (!name || !url) throw new Error('Name and URL are required');

    const result = await this._gt.rigAdd(name, url);
    const hasError = result.raw && (result.raw.includes('Error:') || result.raw.includes('error:'));

    if (!result.ok || hasError) {
      throw new Error(hasError ? result.raw : (result.error || 'Failed to add rig'));
    }

    // Create agent beads for witness and refinery
    if (this._bd) {
      for (const role of ['witness', 'refinery']) {
        await this._bd.exec([
          'create', `Setup ${role} for ${name}`,
          '--type', 'agent', '--agent-rig', name,
          '--role-type', role, '--silent',
        ], { timeoutMs: 30000 }).catch(() => {});
      }
    }

    this._emit?.('rig_added', { name, url });
    return { success: true, name, raw: result.raw };
  }

  async dock(name) {
    const result = await this._gt.rigDock(name);
    if (!result.ok) throw new Error(result.error || 'Failed to dock rig');
    this._emit?.('rig_docked', { name });
    return { success: true, name, raw: result.raw };
  }

  async undock(name) {
    const result = await this._gt.rigUndock(name);
    if (!result.ok) throw new Error(result.error || 'Failed to undock rig');
    this._emit?.('rig_undocked', { name });
    return { success: true, name, raw: result.raw };
  }

  async remove(name) {
    const result = await this._gt.rigRemove(name);
    if (!result.ok) throw new Error(result.error || 'Failed to remove rig');
    this._emit?.('rig_removed', { name });
    return { success: true, name, raw: result.raw };
  }

  async getSetupStatus() {
    const status = {
      gt_installed: false,
      gt_version: null,
      bd_installed: false,
      bd_version: null,
      workspace_initialized: false,
      workspace_path: this._gtRoot,
      rigs: [],
    };

    // Check gt
    try {
      const gtResult = await this._gt._runner.exec('gt', ['version'], { timeoutMs: 5000 });
      status.gt_installed = gtResult.ok;
      if (gtResult.ok) {
        status.gt_version = (gtResult.stdout || '').trim().split('\n')[0];
      }
    } catch { /* not installed */ }

    // Check bd
    try {
      const bdResult = await this._gt._runner.exec('bd', ['version'], { timeoutMs: 5000 });
      status.bd_installed = bdResult.ok;
      if (bdResult.ok) {
        status.bd_version = (bdResult.stdout || '').trim().split('\n')[0];
      }
    } catch { /* not installed */ }

    // Check workspace
    try {
      await fsPromises.access(path.join(this._gtRoot, 'mayor'));
      status.workspace_initialized = true;
    } catch { /* not initialized */ }

    // Get rigs
    try {
      const rigResult = await this._gt.exec(['rig', 'list', '--json'], { timeoutMs: 30000 });
      if (rigResult.ok) {
        const parsed = JSON.parse((rigResult.stdout || '').trim());
        status.rigs = Array.isArray(parsed) ? parsed : [];
      }
    } catch { /* no rigs */ }

    return status;
  }
}
