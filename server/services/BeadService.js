const PRIORITY_MAP = {
  urgent: 'P0',
  critical: 'P0',
  high: 'P1',
  normal: 'P2',
  low: 'P3',
  backlog: 'P4',
};

function normalizeLabels(labels) {
  if (!Array.isArray(labels)) return [];
  return labels.filter((label) => typeof label === 'string' && label.trim().length > 0);
}

export class BeadService {
  constructor({ bdGateway, statusService, emit } = {}) {
    if (!bdGateway) throw new Error('BeadService requires bdGateway');
    if (!bdGateway.list) throw new Error('BeadService requires bdGateway.list()');
    if (!bdGateway.search) throw new Error('BeadService requires bdGateway.search()');
    if (!bdGateway.show) throw new Error('BeadService requires bdGateway.show()');
    if (!bdGateway.create) throw new Error('BeadService requires bdGateway.create()');

    this._bd = bdGateway;
    this._status = statusService ?? null;
    this._emit = emit ?? null;
  }

  async _getRigNames() {
    if (!this._status) return [];
    try {
      const status = await this._status.getStatus();
      return (status?.rigs || []).map(r => r.name).filter(Boolean);
    } catch {
      return [];
    }
  }

  async list({ status, rig } = {}) {
    // When no status filter, use --all to include closed beads
    const all = !status;

    // Multi-rig query (comma-separated)
    if (rig && rig !== 'all' && rig.includes(',')) {
      const rigNames = rig.split(',').filter(Boolean);
      return this._aggregateRigs(status, rigNames, all);
    }

    // Single rig query
    if (rig && rig !== 'all') {
      const rigName = rig === 'hq' ? null : rig;
      const result = await this._bd.list({ status, rig: rigName, all });
      if (!result.ok || !Array.isArray(result.data)) return [];
      return result.data.map(b => ({ ...b, rig: rig === 'hq' ? 'hq' : rigName }));
    }

    // "all" — aggregate HQ + all rigs
    // Default to 'open' when no status filter to avoid fetching thousands of closed beads
    if (rig === 'all') {
      const rigNames = await this._getRigNames();
      const effectiveStatus = status || 'open';
      return this._aggregateRigs(effectiveStatus, ['hq', ...rigNames], false);
    }

    // Default (no rig param) — HQ only (backward compatible)
    const result = await this._bd.list({ status, all });
    if (!result.ok || !Array.isArray(result.data)) return [];
    return result.data;
  }

  async _aggregateRigs(status, rigNames, all) {
    const queries = rigNames.map(name => {
      const rigArg = name === 'hq' ? null : name;
      return this._bd.list({ status, rig: rigArg, all }).then(r => ({ r, rigLabel: name }));
    });

    const results = await Promise.allSettled(queries);
    const merged = [];
    const seen = new Set();
    for (const outcome of results) {
      if (outcome.status !== 'fulfilled') continue;
      const { r, rigLabel } = outcome.value;
      if (!r.ok || !Array.isArray(r.data)) continue;
      for (const bead of r.data) {
        if (!seen.has(bead.id)) {
          seen.add(bead.id);
          merged.push({ ...bead, rig: rigLabel });
        }
      }
    }
    return merged;
  }

  async search(query, { rig } = {}) {
    // bd search doesn't support --rig, so we can only search default db.
    // For cross-rig search, we use bd list --rig per rig with no status filter
    // and filter client-side. This is a reasonable trade-off.
    if (rig === 'all') {
      const rigNames = await this._getRigNames();
      const queries = [
        this._bd.search(query).then(r => ({ r, rigLabel: 'hq' })),
        ...rigNames.map(name =>
          this._bd.list({ rig: name }).then(r => ({ r, rigLabel: name }))
        ),
      ];

      const results = await Promise.allSettled(queries);
      const merged = [];
      const seen = new Set();
      const lowerQuery = (query || '').toLowerCase();

      for (const outcome of results) {
        if (outcome.status !== 'fulfilled') continue;
        const { r, rigLabel } = outcome.value;
        if (!r.ok || !Array.isArray(r.data)) continue;
        for (const bead of r.data) {
          if (seen.has(bead.id)) continue;
          // For rig results (from bd list), filter by query match
          if (rigLabel !== 'hq' && lowerQuery) {
            const title = (bead.title || '').toLowerCase();
            const id = (bead.id || '').toLowerCase();
            if (!title.includes(lowerQuery) && !id.includes(lowerQuery)) continue;
          }
          seen.add(bead.id);
          merged.push({ ...bead, rig: rigLabel });
        }
      }
      return merged;
    }

    const result = await this._bd.search(query ?? '');
    if (!result.ok || !Array.isArray(result.data)) return [];
    return result.data;
  }

  async get(beadId) {
    const result = await this._bd.show(beadId);
    if (!result.ok) return { ok: false };
    return { ok: true, bead: result.data || { id: beadId } };
  }

  async listEpics({ rig } = {}) {
    const beads = await this.list({ rig });
    return beads.filter(b => b.issue_type === 'epic' && !b.ephemeral);
  }

  async getBlocked({ rig } = {}) {
    const result = await this._bd.blocked({ rig: rig && rig !== 'all' && rig !== 'hq' ? rig : undefined });
    if (!result.ok || !Array.isArray(result.data)) return [];
    return result.data;
  }

  async getChildren(epicId) {
    const result = await this._bd.children(epicId);
    if (!result.ok) return { ok: false, children: [], epic: null };
    return { ok: true, children: result.data || [], epic: result.epic || null };
  }

  async create({ title, description, type, priority, labels, rig, parent } = {}) {
    if (!title) return { ok: false, statusCode: 400, error: 'Title is required' };

    const normalizedPriority = priority ? PRIORITY_MAP[String(priority).toLowerCase()] || String(priority) : null;
    const normalizedLabels = normalizeLabels(labels);

    const result = await this._bd.create({
      title,
      description,
      type: type || null,
      priority: normalizedPriority && normalizedPriority !== 'P2' ? normalizedPriority : null,
      labels: normalizedLabels,
      rig: rig || null,
      parent: parent || null,
    });

    if (!result.ok) return { ok: false, statusCode: 500, error: result.error || 'Failed to create bead' };

    const beadId = result.beadId || null;
    if (beadId) {
      this._emit?.('bead_created', { bead_id: beadId, title });
    }

    return { ok: true, beadId, raw: result.raw };
  }

  async getDependencies(epicId) {
    if (!this._bd.depList) return [];
    const result = await this._bd.depList(epicId);
    if (!result.ok || !Array.isArray(result.data)) return [];
    return result.data;
  }

  async addDependency(beadId, dependsOnId) {
    if (!beadId || !dependsOnId) return { ok: false, error: 'Both bead ID and dependency ID are required' };
    if (!this._bd.depAdd) return { ok: false, error: 'Dependency management not available' };
    const result = await this._bd.depAdd(beadId, dependsOnId);
    if (!result.ok) return { ok: false, error: result.error || 'Failed to add dependency' };
    this._emit?.('bead_updated', { bead_id: beadId });
    return { ok: true, raw: result.raw };
  }

  async removeDependency(beadId, dependsOnId) {
    if (!beadId || !dependsOnId) return { ok: false, error: 'Both bead ID and dependency ID are required' };
    if (!this._bd.depRemove) return { ok: false, error: 'Dependency management not available' };
    const result = await this._bd.depRemove(beadId, dependsOnId);
    if (!result.ok) return { ok: false, error: result.error || 'Failed to remove dependency' };
    this._emit?.('bead_updated', { bead_id: beadId });
    return { ok: true, raw: result.raw };
  }

  async getDependencyTree(beadId) {
    if (!this._bd.depTree) return { ok: false, error: 'Dependency tree not available' };
    const result = await this._bd.depTree(beadId);
    if (!result.ok) return { ok: false, error: result.error || 'Failed to get dependency tree' };
    return { ok: true, raw: result.raw };
  }

  async setParent(beadId, parentId) {
    if (!beadId) return { ok: false, error: 'Bead ID is required' };
    if (!this._bd.updateParent) return { ok: false, error: 'Parent management not available' };
    const result = await this._bd.updateParent(beadId, parentId || '');
    if (!result.ok) return { ok: false, error: result.error || 'Failed to set parent' };
    this._emit?.('bead_updated', { bead_id: beadId });
    return { ok: true, raw: result.raw };
  }
}
