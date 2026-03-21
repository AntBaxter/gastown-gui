export class ConvoyService {
  constructor({ gtGateway, bdGateway, cache, emit } = {}) {
    if (!gtGateway) throw new Error('ConvoyService requires gtGateway');
    if (!gtGateway.listConvoys) throw new Error('ConvoyService requires gtGateway.listConvoys()');
    if (!gtGateway.convoyStatus) throw new Error('ConvoyService requires gtGateway.convoyStatus()');
    if (!gtGateway.createConvoy) throw new Error('ConvoyService requires gtGateway.createConvoy()');

    this._gt = gtGateway;
    this._bd = bdGateway ?? null;
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

  async integrationBranchStatus(convoyId) {
    if (!this._gt.integrationBranchStatus) {
      throw new Error('Gateway does not support integrationBranchStatus');
    }
    const result = await this._gt.integrationBranchStatus(convoyId);
    if (!result.ok) throw new Error(result.error || 'Failed to get integration branch status');
    return result.data || { raw: result.raw };
  }

  async createIntegrationBranch(convoyId, { branch } = {}) {
    if (!this._gt.integrationBranchCreate) {
      throw new Error('Gateway does not support integrationBranchCreate');
    }
    const result = await this._gt.integrationBranchCreate(convoyId, { branch });
    if (!result.ok) throw new Error(result.error || 'Failed to create integration branch');

    if (this._emit) {
      this._emit('integration_branch_created', { convoy_id: convoyId, branch });
    }

    return { ok: true, raw: result.raw };
  }

  async landIntegrationBranch(convoyId, { dryRun = false } = {}) {
    if (!this._gt.integrationBranchLand) {
      throw new Error('Gateway does not support integrationBranchLand');
    }
    const result = await this._gt.integrationBranchLand(convoyId, { dryRun });
    if (!result.ok) throw new Error(result.error || 'Failed to land integration branch');

    if (!dryRun && this._emit) {
      this._emit('integration_branch_landed', { convoy_id: convoyId });
    }

    return { ok: true, raw: result.raw };
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

  async prepareIntegration(convoyId, { epicName, branchName, beadIds, rig } = {}) {
    if (!this._bd) {
      throw new Error('ConvoyService requires bdGateway for prepareIntegration');
    }
    if (!epicName) throw new Error('epicName is required');
    if (!Array.isArray(beadIds) || beadIds.length === 0) {
      throw new Error('beadIds must be a non-empty array');
    }

    // 1. Create an epic bead in the target rig (so it shares the same prefix as children)
    const createResult = await this._bd.create({ title: epicName, type: 'epic', rig });
    if (!createResult.ok || !createResult.beadId) {
      throw new Error(createResult.error || 'Failed to create epic bead');
    }
    const epicId = createResult.beadId;

    // 2-5. Fetch each bead, check parent, reparent as needed
    const beadIdSet = new Set(beadIds);
    const reparented = [];
    const skipped = [];

    for (const beadId of beadIds) {
      try {
        const showResult = await this._bd.show(beadId);
        if (!showResult.ok) {
          skipped.push({ id: beadId, reason: 'failed to fetch bead' });
          continue;
        }

        const bead = Array.isArray(showResult.data) ? showResult.data[0] : showResult.data;
        const currentParent = bead?.parent || bead?.parent_id || null;

        // Skip beads whose parent is already in the set
        if (currentParent && beadIdSet.has(currentParent)) {
          skipped.push({ id: beadId, reason: `parent ${currentParent} already in set` });
          continue;
        }

        // For beads with existing parents outside the set, add note and label
        if (currentParent) {
          reparented.push({ id: beadId, from: currentParent });
          await this._bd.updateNotes(beadId, `reparented_from: ${currentParent}`);
          await this._bd.addLabel(beadId, 'gt:reparented');
        }

        // Reparent to the new epic
        const parentResult = await this._bd.updateParent(beadId, epicId);
        if (!parentResult.ok) {
          skipped.push({ id: beadId, reason: 'failed to reparent' });
          continue;
        }

        // Track root-level reparents (no previous parent)
        if (!currentParent) {
          reparented.push({ id: beadId, from: null });
        }
      } catch (err) {
        skipped.push({ id: beadId, reason: err.message });
      }
    }

    // 6. Create integration branch
    if (!this._gt.integrationBranchCreate) {
      throw new Error('Gateway does not support integrationBranchCreate');
    }
    const branchResult = await this._gt.integrationBranchCreate(epicId, {
      branch: branchName || undefined,
      rig,
    });
    if (!branchResult.ok) {
      throw new Error(branchResult.error || 'Failed to create integration branch');
    }

    if (this._emit) {
      this._emit('integration_prepared', {
        convoy_id: convoyId,
        epic_id: epicId,
      });
    }

    return {
      epicId,
      integrationBranch: (branchResult.raw || '').trim() || null,
      reparented,
      skipped,
    };
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

