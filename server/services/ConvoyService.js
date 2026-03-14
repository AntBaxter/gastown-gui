export class ConvoyService {
  constructor({ gtGateway, cache, emit } = {}) {
    if (!gtGateway) throw new Error('ConvoyService requires gtGateway');
    if (!gtGateway.listConvoys) throw new Error('ConvoyService requires gtGateway.listConvoys()');
    if (!gtGateway.convoyStatus) throw new Error('ConvoyService requires gtGateway.convoyStatus()');
    if (!gtGateway.createConvoy) throw new Error('ConvoyService requires gtGateway.createConvoy()');

    this._gt = gtGateway;
    this._cache = cache ?? null;
    this._emit = emit ?? null;
  }

  async list({ all = false, status, refresh = false, ttlMs = 10000 } = {}) {
    const key = `convoys_${all ? 'true' : 'false'}_${status || 'all'}`;

    if (!refresh && this._cache?.getOrExecute) {
      return this._cache.getOrExecute(key, () => this._fetchList({ all, status }), ttlMs);
    }
    if (!refresh && this._cache?.get) {
      const cached = this._cache.get(key);
      if (cached !== undefined) return cached;
    }

    const convoys = await this._fetchList({ all, status });
    this._cache?.set?.(key, convoys, ttlMs);
    return convoys;
  }

  async _fetchList({ all, status }) {
    const result = await this._gt.listConvoys({ all, status });
    if (!result.ok) throw new Error(result.error || 'Failed to list convoys');
    const items = Array.isArray(result.data) ? result.data : [];
    return items.map(c => ({
      ...c,
      name: c.name ?? c.title ?? null,
      issues: c.issues ?? c.tracked ?? [],
    }));
  }

  async get(convoyId) {
    const result = await this._gt.convoyStatus(convoyId);
    if (!result.ok) throw new Error(result.error || 'Failed to get convoy status');
    return result.data || { id: convoyId, raw: result.raw };
  }

  async create({ name, issues = [], notify } = {}) {
    if (!name) return { ok: false, error: 'Name is required' };

    const result = await this._gt.createConvoy({ name, issues, notify });
    if (!result.ok) return { ok: false, error: result.error || 'Failed to create convoy' };

    const convoyId = result.convoyId || (result.raw || '').trim() || null;
    if (convoyId) {
      this._emit?.('convoy_created', { convoy_id: convoyId, name });
    }

    return { ok: true, convoyId, raw: result.raw };
  }

  async integrationBranchStatus(convoyId) {
    const result = await this._gt.integrationBranchStatus(convoyId);
    if (!result.ok) throw new Error(result.error || 'Failed to get integration branch status');
    return result.data || { raw: result.raw };
  }

  async createIntegrationBranch(convoyId, { branch } = {}) {
    const result = await this._gt.createIntegrationBranch(convoyId, { branch });
    if (!result.ok) return { ok: false, error: result.error || 'Failed to create integration branch' };
    return { ok: true, raw: result.raw };
  }

  async landIntegrationBranch(convoyId, { dryRun = false } = {}) {
    const result = await this._gt.landIntegrationBranch(convoyId, { dryRun });
    if (!result.ok) return { ok: false, error: result.error || 'Failed to land integration branch' };
    return { ok: true, raw: result.raw };
  }

  async feed(convoyId) {
    const convoy = await this.get(convoyId);
    const issues = convoy.issues || convoy.tracked || [];
    const ready = issues.filter(i => {
      const status = typeof i === 'string' ? 'open' : (i.status || 'open');
      return status === 'open';
    });

    if (ready.length === 0) {
      return { ok: true, slung: 0, message: 'No ready issues to feed' };
    }

    const results = [];
    for (const issue of ready) {
      const beadId = typeof issue === 'string' ? issue : issue.id;
      if (!beadId) continue;
      try {
        const r = await this._gt.sling({ bead: beadId });
        results.push({ beadId, ok: r.ok, raw: r.raw });
      } catch (err) {
        results.push({ beadId, ok: false, error: err.message });
      }
    }

    return { ok: true, slung: results.filter(r => r.ok).length, total: results.length, results };
  }
}

