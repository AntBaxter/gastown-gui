export class NudgeService {
  constructor({ gtGateway, statusService, tmuxGateway, emit } = {}) {
    if (!gtGateway) throw new Error('NudgeService requires gtGateway');
    if (!statusService) throw new Error('NudgeService requires statusService');
    if (!tmuxGateway) throw new Error('NudgeService requires tmuxGateway');
    this._gt = gtGateway;
    this._status = statusService;
    this._tmux = tmuxGateway;
    this._emit = emit ?? null;
    this._messageHistory = [];
    this._maxHistory = 100;
  }

  async nudge({ target, message, autoStart = true } = {}) {
    if (!message) throw new Error('Message is required');

    const nudgeTarget = target || 'mayor';
    const sessionName = await this._resolveSessionName(nudgeTarget) || `hq-${nudgeTarget}`;

    const isRunning = await this._tmux.hasSession(sessionName);
    let wasAutoStarted = false;

    if (!isRunning) {
      if (nudgeTarget === 'mayor' && autoStart) {
        const startResult = await this._gt.serviceStart('mayor');
        if (!startResult.ok) {
          this._addMessage(nudgeTarget, message, 'failed', 'Failed to auto-start Mayor');
          throw new Error('Mayor not running and failed to auto-start');
        }
        wasAutoStarted = true;
        await new Promise(resolve => setTimeout(resolve, 2000));
        this._emit?.('service_started', { service: 'mayor', autoStarted: true });
      } else {
        this._addMessage(nudgeTarget, message, 'failed', `Session ${sessionName} not running`);
        const error = new Error(`${nudgeTarget} is not running`);
        error.statusCode = 400;
        throw error;
      }
    }

    const result = await this._gt.nudge(nudgeTarget, message);
    if (!result.ok) {
      this._addMessage(nudgeTarget, message, 'failed', result.error);
      throw new Error(result.error || 'Failed to send message');
    }

    const status = wasAutoStarted ? 'auto-started' : 'sent';
    const entry = this._addMessage(nudgeTarget, message, status);
    return { success: true, target: nudgeTarget, message, wasAutoStarted, messageId: entry.id };
  }

  getMessageHistory(limit = 50) {
    return this._messageHistory.slice(0, Math.min(limit, this._maxHistory));
  }

  _addMessage(target, message, status, response = null) {
    const entry = {
      id: Date.now().toString(36) + Math.random().toString(36).substr(2, 5),
      timestamp: new Date().toISOString(),
      target,
      message,
      status,
      response,
    };
    this._messageHistory.unshift(entry);
    if (this._messageHistory.length > this._maxHistory) {
      this._messageHistory.pop();
    }
    this._emit?.('mayor_message', entry);
    return entry;
  }

  async _resolveSessionName(target) {
    try {
      const status = await this._status.getStatus();
      const agents = [];
      if (Array.isArray(status?.agents)) agents.push(...status.agents);
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
      // Fall through to null
    }
    return null;
  }
}
