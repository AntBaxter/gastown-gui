import path from 'node:path';
import os from 'node:os';
import fsPromises from 'node:fs/promises';

export class AgentService {
  constructor({ gtGateway, statusService, tmuxGateway, bdGateway, cache, gtRoot, emit, agentsTtlMs = 15000 } = {}) {
    if (!gtGateway) throw new Error('AgentService requires gtGateway');
    if (!statusService) throw new Error('AgentService requires statusService');
    if (!tmuxGateway) throw new Error('AgentService requires tmuxGateway');
    this._gt = gtGateway;
    this._status = statusService;
    this._tmux = tmuxGateway;
    this._bd = bdGateway ?? null;
    this._cache = cache ?? null;
    this._gtRoot = gtRoot;
    this._emit = emit ?? null;
    this._agentsTtlMs = agentsTtlMs;
  }

  async listAgents({ refresh = false } = {}) {
    if (!refresh && this._cache?.get) {
      const cached = this._cache.get('agents');
      if (cached !== undefined) return cached;
    }

    const status = await this._status.getStatus({ refresh });
    const townAgents = status?.agents || [];
    const runningPolecats = new Set(status?.runningPolecats || []);

    for (const agent of townAgents) {
      agent.running = runningPolecats.has(agent.address?.replace(/\/$/, ''));
    }

    const rigAgents = [];
    for (const rig of status?.rigs || []) {
      for (const agent of rig.agents || []) {
        const addr = agent.address?.replace(/\/$/, '');
        const isRunning = agent.running || runningPolecats.has(addr);
        rigAgents.push({
          ...agent,
          id: agent.address || `${rig.name}/${agent.name}`,
          rig: rig.name,
          running: isRunning,
        });
      }
    }

    const response = { agents: townAgents, rigAgents, runningPolecats: Array.from(runningPolecats) };
    this._cache?.set?.('agents', response, this._agentsTtlMs);
    return response;
  }

  async getPolecatOutput(sessionName, lines = 50) {
    return this._tmux.capturePane({ sessionName, lines });
  }

  async getMayorOutput(lines = 100) {
    const sessionName = await this._resolveSessionName('mayor') || 'hq-mayor';
    const [output, isRunning] = await Promise.all([
      this._tmux.capturePane({ sessionName, lines }),
      this._tmux.hasSession(sessionName),
    ]);

    return { session: sessionName, output, running: isRunning };
  }

  async getTranscript({ rig, name, sessionName, lines = 2000 } = {}) {
    const output = await this._tmux.capturePane({ sessionName, lines });

    let transcriptContent = null;
    const transcriptPaths = [
      path.join(this._gtRoot, rig, '.claude', 'sessions'),
      path.join(this._gtRoot, rig, '.claude', 'transcripts'),
      path.join(os.homedir(), '.claude', 'projects', rig, 'sessions'),
    ];

    for (const transcriptPath of transcriptPaths) {
      try {
        await fsPromises.access(transcriptPath);
        const dirFiles = await fsPromises.readdir(transcriptPath);
        const filteredFiles = dirFiles.filter(f =>
          f.endsWith('.json') || f.endsWith('.md') || f.endsWith('.jsonl')
        );

        const filesWithTime = await Promise.all(
          filteredFiles.map(async f => {
            const stat = await fsPromises.stat(path.join(transcriptPath, f));
            return { name: f, time: stat.mtime.getTime() };
          })
        );
        filesWithTime.sort((a, b) => b.time - a.time);

        if (filesWithTime.length > 0) {
          transcriptContent = await fsPromises.readFile(
            path.join(transcriptPath, filesWithTime[0].name),
            'utf-8'
          );
          break;
        }
      } catch {
        // Ignore, try next path
      }
    }

    return {
      session: sessionName,
      rig,
      name,
      running: output !== null,
      output: output || '(No tmux output available)',
      transcript: transcriptContent,
      hasTranscript: !!transcriptContent,
    };
  }

  async startAgent({ rig, name } = {}) {
    const result = await this._gt.exec(['sling', '--rig', rig, '--agent', name], { timeoutMs: 30000 });
    if (!result.ok) throw new Error(result.error || 'Failed to start agent');

    this._emit?.('agent_started', { rig, name, agentPath: `${rig}/${name}` });
    return { success: true, message: `Started ${rig}/${name}`, raw: (result.stdout || '').trim() };
  }

  async stopAgent({ sessionName, rig, name } = {}) {
    const killResult = await this._tmux.killSession(sessionName);

    if (!killResult.killed) {
      const errText = killResult.error || '';
      if (errText.includes("can't find session")) {
        return { success: true, message: `${rig}/${name} was not running` };
      }
      throw new Error(killResult.error || 'Failed to stop agent');
    }

    this._emit?.('agent_stopped', { rig, name, session: sessionName });
    return { success: true, message: `Stopped ${rig}/${name}` };
  }

  async restartAgent({ sessionName, rig, name } = {}) {
    // Kill existing session (ignore errors)
    await this._tmux.killSession(sessionName);
    await new Promise(resolve => setTimeout(resolve, 500));

    const result = await this._gt.exec(['sling', '--rig', rig, '--agent', name], { timeoutMs: 30000 });
    if (!result.ok) throw new Error(result.error || 'Failed to restart agent');

    this._emit?.('agent_restarted', { rig, name, agentPath: `${rig}/${name}` });
    return { success: true, message: `Restarted ${rig}/${name}`, raw: (result.stdout || '').trim() };
  }

  async getHookStatus() {
    const result = await this._gt.hookStatus();
    if (!result.ok) throw new Error(result.error || 'Failed to get hook status');
    return result.data || { hooked: null };
  }

  async getBeadLinks(beadId) {
    const links = { prs: [], commits: [] };
    if (!this._bd) return links;

    let beadClosedAt = null;
    const beadResult = await this._bd.show(beadId);
    if (beadResult.ok) {
      const bead = Array.isArray(beadResult.data) ? beadResult.data[0] : beadResult.data;
      if (bead?.closed_at) beadClosedAt = new Date(bead.closed_at);
    }

    const rigResult = await this._gt.rigList();
    if (!rigResult.ok) return links;

    const rigNames = rigResult.raw
      .split('\n')
      .filter(line => line.match(/^  \S/) && !line.includes(':'))
      .map(line => line.trim());

    for (const rigName of rigNames) {
      const rigPath = path.join(this._gtRoot, rigName, 'mayor', 'rig');
      try {
        const gitResult = await this._gt._runner.exec('git', ['-C', rigPath, 'remote', 'get-url', 'origin'], { timeoutMs: 5000 });
        const repoUrl = (gitResult.stdout || '').trim();

        const repoMatch = repoUrl.match(/github\.com[/:]([^/]+\/[^/.\s]+)/);
        if (!repoMatch) continue;
        const repo = repoMatch[1].replace(/\.git$/, '');

        try {
          const ghResult = await this._gt._runner.exec('gh', [
            'pr', 'list', '--repo', repo, '--state', 'all', '--limit', '20',
            '--json', 'number,title,url,state,headRefName,body,createdAt,updatedAt',
          ], { timeoutMs: 10000 });

          const prs = JSON.parse((ghResult.stdout || '') || '[]');
          for (const pr of prs) {
            let isRelated =
              (pr.title && pr.title.includes(beadId)) ||
              (pr.headRefName && pr.headRefName.includes(beadId)) ||
              (pr.body && pr.body.includes(beadId));

            if (!isRelated && beadClosedAt && pr.headRefName?.startsWith('polecat/')) {
              const prUpdated = new Date(pr.updatedAt || pr.createdAt);
              const timeDiff = Math.abs(beadClosedAt - prUpdated);
              if (timeDiff < 60 * 60 * 1000) isRelated = true;
            }

            if (isRelated) {
              links.prs.push({
                repo,
                number: pr.number,
                title: pr.title,
                url: pr.url,
                state: pr.state,
                branch: pr.headRefName,
              });
            }
          }
        } catch {
          // Skip repos we can't query
        }
      } catch {
        // Skip rigs without git repos
      }
    }

    return links;
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
