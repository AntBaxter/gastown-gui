import { AgentPath } from '../domain/values/AgentPath.js';

function requireAgentPath(req, res) {
  try {
    return new AgentPath(req.params.rig, req.params.name);
  } catch {
    res.status(400).json({ error: 'Invalid rig or agent name' });
    return null;
  }
}

export function registerAgentRoutes(app, { agentService } = {}) {
  if (!agentService) throw new Error('registerAgentRoutes requires agentService');

  app.get('/api/agents', async (req, res) => {
    try {
      const data = await agentService.listAgents({ refresh: req.query.refresh === 'true' });
      res.json(data);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get('/api/mayor/output', async (req, res) => {
    try {
      const lines = parseInt(req.query.lines) || 100;
      const result = await agentService.getMayorOutput(lines);
      res.json(result);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get('/api/polecat/:rig/:name/output', async (req, res) => {
    const agent = requireAgentPath(req, res);
    if (!agent) return;
    const lines = parseInt(req.query.lines) || 50;
    const output = await agentService.getPolecatOutput(agent.toSessionName(), lines);
    if (output !== null) {
      res.json({ session: agent.toSessionName(), output, running: true });
    } else {
      res.json({ session: agent.toSessionName(), output: null, running: false });
    }
  });

  app.get('/api/polecat/:rig/:name/transcript', async (req, res) => {
    const agent = requireAgentPath(req, res);
    if (!agent) return;
    try {
      const result = await agentService.getTranscript({
        rig: agent.rig.value,
        name: agent.name.value,
        sessionName: agent.toSessionName(),
      });
      res.json(result);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post('/api/polecat/:rig/:name/start', async (req, res) => {
    const agent = requireAgentPath(req, res);
    if (!agent) return;
    try {
      const result = await agentService.startAgent({
        rig: agent.rig.value,
        name: agent.name.value,
      });
      res.json(result);
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  app.post('/api/polecat/:rig/:name/stop', async (req, res) => {
    const agent = requireAgentPath(req, res);
    if (!agent) return;
    try {
      const result = await agentService.stopAgent({
        sessionName: agent.toSessionName(),
        rig: agent.rig.value,
        name: agent.name.value,
      });
      res.json(result);
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  app.post('/api/polecat/:rig/:name/restart', async (req, res) => {
    const agent = requireAgentPath(req, res);
    if (!agent) return;
    try {
      const result = await agentService.restartAgent({
        sessionName: agent.toSessionName(),
        rig: agent.rig.value,
        name: agent.name.value,
      });
      res.json(result);
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  app.get('/api/hook', async (req, res) => {
    try {
      const data = await agentService.getHookStatus();
      res.json(data);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get('/api/bead/:beadId/links', async (req, res) => {
    try {
      const links = await agentService.getBeadLinks(req.params.beadId);
      res.json(links);
    } catch (err) {
      res.json({ prs: [], commits: [] });
    }
  });
}
