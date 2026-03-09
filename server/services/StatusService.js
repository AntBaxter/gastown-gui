import path from 'node:path';
import fsPromises from 'node:fs/promises';

function parseTmuxPolecatSessions(output, rigNames = []) {
  const sessions = new Set();
  const rigsByLongest = [...new Set(rigNames)].filter(Boolean).sort((a, b) => b.length - a.length);

  for (const line of String(output || '').split('\n')) {
    const match = line.match(/^(gt-[^:]+):/);
    if (!match) continue;

    const session = match[1].replace('gt-', '');

    // Prefer matching known rig names to disambiguate hyphens inside agent names.
    let matched = false;
    for (const rig of rigsByLongest) {
      const prefix = `${rig}-`;
      if (!session.startsWith(prefix)) continue;
      const name = session.slice(prefix.length);
      if (!name) continue;
      sessions.add(`${rig}/${name}`);
      matched = true;
      break;
    }

    if (matched) continue;

    // Fallback heuristic: treat last dash-separated segment as agent name.
    const parts = session.split('-');
    if (parts.length < 2) continue;
    const name = parts.pop();
    const rig = parts.join('-');
    sessions.add(`${rig}/${name}`);
  }

  return sessions;
}

async function readRigConfig({ gtRoot, rigName }) {
  const rigConfigPath = path.join(gtRoot, rigName, 'config.json');
  const content = await fsPromises.readFile(rigConfigPath, 'utf8');
  return JSON.parse(content);
}

export class StatusService {
  constructor({
    gtGateway,
    tmuxGateway,
    cache,
    gtRoot,
    statusTtlMs = 5000,
    rigConfigTtlMs = 300000,
    missingRigConfigTtlMs = 60000,
  } = {}) {
    if (!gtGateway?.status) throw new Error('StatusService requires gtGateway.status()');
    if (!tmuxGateway?.listSessions) throw new Error('StatusService requires tmuxGateway.listSessions()');
    if (!gtRoot) throw new Error('StatusService requires gtRoot');

    this._gt = gtGateway;
    this._tmux = tmuxGateway;
    this._cache = cache ?? null;
    this._gtRoot = gtRoot;
    this._statusTtlMs = statusTtlMs;
    this._rigConfigTtlMs = rigConfigTtlMs;
    this._missingRigConfigTtlMs = missingRigConfigTtlMs;
  }

  async getStatus({ refresh = false } = {}) {
    if (!refresh && this._cache?.getOrExecute) {
      return this._cache.getOrExecute('status', () => this._fetchStatus(), this._statusTtlMs);
    }

    if (!refresh && this._cache?.get) {
      const cached = this._cache.get('status');
      if (cached !== undefined) return cached;
    }

    const status = await this._fetchStatus();
    this._cache?.set?.('status', status, this._statusTtlMs);
    return status;
  }

  async _fetchStatus() {
    const [statusResult, sessionsText] = await Promise.all([
      this._gt.status({ fast: true, allowExitCodes: [0, 1] }),
      this._tmux.listSessions(),
    ]);

    if (!statusResult.ok) {
      throw new Error(statusResult.error || 'Failed to get status');
    }

    const data = statusResult.data;
    if (!data) return { raw: statusResult.raw };

    const rigs = Array.isArray(data.rigs) ? data.rigs : [];
    const runningPolecats = parseTmuxPolecatSessions(sessionsText, rigs.map(rig => rig?.name));

    // Set running flags on town-level agents from tmux sessions
    for (const agent of data.agents || []) {
      const addr = agent.address?.replace(/\/$/, '');
      if (!agent.running && addr) {
        agent.running = runningPolecats.has(addr);
      }
    }

    for (const rig of rigs) {
      if (!rig?.name) continue;

      if (!rig.git_url) {
        const rigConfig = await this._getRigConfig(rig.name);
        rig.git_url = rigConfig?.git_url || null;
      }

      // Set running flags on rig agents from tmux sessions
      for (const agent of rig.agents || []) {
        const addr = (agent.address || `${rig.name}/${agent.name}`)?.replace(/\/$/, '');
        if (!agent.running && addr) {
          agent.running = runningPolecats.has(addr);
        }
      }

      for (const hook of rig.hooks || []) {
        const agentPath = hook.agent;
        hook.running = runningPolecats.has(agentPath);

        // Compatibility: older systems may store polecats in a subdirectory
        const polecatPath = String(agentPath || '').replace(/\//, '/polecats/');
        if (!hook.running && polecatPath !== agentPath && runningPolecats.has(polecatPath)) {
          hook.running = true;
        }
      }
    }

    data.runningPolecats = Array.from(runningPolecats);
    return data;
  }

  async _getRigConfig(rigName) {
    const key = `rig-config:${rigName}`;

    if (this._cache?.get) {
      const cached = this._cache.get(key);
      if (cached !== undefined) return cached;
    }

    try {
      const config = await readRigConfig({ gtRoot: this._gtRoot, rigName });
      this._cache?.set?.(key, config, this._rigConfigTtlMs);
      return config;
    } catch {
      this._cache?.set?.(key, null, this._missingRigConfigTtlMs);
      return null;
    }
  }
}
