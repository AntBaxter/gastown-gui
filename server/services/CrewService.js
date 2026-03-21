function parseJsonOrNull(text) {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

import { SafeSegment } from '../domain/values/SafeSegment.js';

export class CrewService {
  constructor({ gtGateway, cache, emit, crewsTtlMs = 5000 } = {}) {
    if (!gtGateway) throw new Error('CrewService requires gtGateway');
    this._gt = gtGateway;
    this._cache = cache ?? null;
    this._emit = emit ?? null;
    this._crewsTtlMs = crewsTtlMs;
  }

  async list({ refresh = false } = {}) {
    if (!refresh && this._cache?.get) {
      const cached = this._cache.get('crews');
      if (cached !== undefined) return cached;
    }

    const result = await this._gt.crewList();
    if (!result.ok) throw new Error(result.error || 'Failed to list crews');

    if (result.data) {
      this._cache?.set?.('crews', result.data, this._crewsTtlMs);
      return result.data;
    }

    // Parse non-JSON output — skip status/info lines like "No crews found"
    const crews = [];
    for (const line of result.raw.split('\n').filter(Boolean)) {
      // Skip lines that look like status messages rather than crew entries
      if (/^(No |no |Error|error|Warning|warning|Usage|usage)/.test(line)) continue;
      const match = line.match(/^(\S+)\s+/);
      if (match) crews.push({ name: match[1] });
    }
    this._cache?.set?.('crews', crews, this._crewsTtlMs);
    return crews;
  }

  async status(name) {
    const result = await this._gt.crewStatus(name);
    if (!result.ok) {
      const error = new Error(result.error || 'Crew not found');
      error.statusCode = 404;
      throw error;
    }
    return result.data || { name, raw: result.raw };
  }

  async add({ name, rig } = {}) {
    if (!name) throw new Error('Crew name is required');
    if (!rig) {
      const err = new Error('Rig is required: gt crew add cannot infer rig from the server process');
      err.statusCode = 400;
      throw err;
    }
    if (!SafeSegment.isValid(name)) {
      const err = new Error('Invalid crew name: use only letters, numbers, hyphens, dots, or underscores (no spaces)');
      err.statusCode = 400;
      throw err;
    }
    const result = await this._gt.crewAdd(name, rig);
    if (!result.ok) throw new Error(result.error || 'Failed to add crew');
    this._emit?.('crew_added', { name, rig });
    return { success: true, name, rig, raw: result.raw };
  }

  async remove(name) {
    if (!name) throw new Error('Crew name is required');
    const result = await this._gt.crewRemove(name);
    if (!result.ok) throw new Error(result.error || 'Failed to remove crew');
    this._emit?.('crew_removed', { name });
    return { success: true, name, raw: result.raw };
  }
}
