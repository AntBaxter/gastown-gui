const VALID_SERVICES = ['mayor', 'witness', 'refinery', 'deacon'];
const NEEDS_RIG = ['witness', 'refinery'];

function validateService(name) {
  if (!VALID_SERVICES.includes(name.toLowerCase())) {
    const error = new Error(`Invalid service: ${name}. Valid services: ${VALID_SERVICES.join(', ')}`);
    error.statusCode = 400;
    throw error;
  }
}

function requireRig(name, rig) {
  if (NEEDS_RIG.includes(name.toLowerCase()) && !rig) {
    const error = new Error(`${name} requires a rig parameter`);
    error.statusCode = 400;
    throw error;
  }
}

export class ServiceControlService {
  constructor({ gtGateway, statusService, tmuxGateway, emit } = {}) {
    if (!gtGateway) throw new Error('ServiceControlService requires gtGateway');
    if (!statusService) throw new Error('ServiceControlService requires statusService');
    if (!tmuxGateway) throw new Error('ServiceControlService requires tmuxGateway');
    this._gt = gtGateway;
    this._status = statusService;
    this._tmux = tmuxGateway;
    this._emit = emit ?? null;
  }

  async start(name, rig) {
    validateService(name);
    requireRig(name, rig);

    const result = await this._gt.serviceStart(name, rig);
    if (!result.ok) throw new Error(result.error || `Failed to start ${name}`);

    this._emit?.('service_started', { service: name });
    return { success: true, service: name, message: `${name} started`, raw: result.raw };
  }

  async stop(name, rig) {
    validateService(name);
    requireRig(name, rig);

    const result = await this._gt.serviceStop(name, rig);

    if (!result.ok) {
      // Try killing tmux session directly
      const sessionName = await this._resolveSessionName(name) || `hq-${name}`;
      const killResult = await this._tmux.killSession(sessionName);
      if (killResult.killed) {
        this._emit?.('service_stopped', { service: name });
        return { success: true, service: name, message: `${name} stopped via tmux` };
      }
      throw new Error(result.error || `Failed to stop ${name}`);
    }

    this._emit?.('service_stopped', { service: name });
    return { success: true, service: name, message: `${name} stopped`, raw: result.raw };
  }

  async restart(name, rig) {
    validateService(name);
    requireRig(name, rig);

    // Stop first (ignore errors)
    try {
      await this._gt.serviceStop(name, rig);
    } catch { /* ignore */ }

    await new Promise(resolve => setTimeout(resolve, 1000));

    const result = await this._gt.serviceStart(name, rig);
    if (!result.ok) throw new Error(result.error || `Failed to restart ${name}`);

    this._emit?.('service_restarted', { service: name });
    return { success: true, service: name, message: `${name} restarted`, raw: result.raw };
  }

  async getStatus(name) {
    const sessionName = await this._resolveSessionName(name);
    let running = false;
    if (sessionName) {
      running = await this._tmux.hasSession(sessionName);
    }
    return { service: name, running, session: running ? sessionName : null };
  }

  async _resolveSessionName(target) {
    try {
      const status = await this._status.getStatus();
      const agents = [...(status?.agents || [])];
      for (const rig of status?.rigs || []) {
        for (const agent of rig.agents || []) {
          agents.push(agent);
        }
      }
      const agent = agents.find(a =>
        a.name === target || a.address === target || a.address === `${target}/`
      );
      if (agent?.session) return agent.session;
    } catch {
      // Fall through
    }
    return null;
  }
}
