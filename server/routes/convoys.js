export function registerConvoyRoutes(app, { convoyService } = {}) {
  if (!convoyService) throw new Error('registerConvoyRoutes requires convoyService');

  app.get('/api/convoys', async (req, res) => {
    try {
      const convoys = await convoyService.list({
        all: req.query.all === 'true',
        status: req.query.status,
        refresh: req.query.refresh === 'true',
      });
      res.json(convoys);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get('/api/convoy/:id', async (req, res) => {
    try {
      const convoy = await convoyService.get(req.params.id);
      res.json(convoy);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get('/api/convoy/:id/integration-branch/status', async (req, res) => {
    try {
      const status = await convoyService.integrationBranchStatus(req.params.id);
      res.json(status);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post('/api/convoy/:id/integration-branch', async (req, res) => {
    try {
      const { branch } = req.body || {};
      const result = await convoyService.createIntegrationBranch(req.params.id, { branch });
      res.json(result);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post('/api/convoy/:id/integration-branch/land', async (req, res) => {
    try {
      const { dryRun } = req.body || {};
      const result = await convoyService.landIntegrationBranch(req.params.id, { dryRun: dryRun === true });
      res.json(result);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post('/api/convoy', async (req, res) => {
    try {
      const { name, issues, notify } = req.body;
      const result = await convoyService.create({ name, issues, notify });
      if (!result.ok) return res.status(500).json({ error: result.error });

      res.json({
        success: true,
        convoy_id: result.convoyId,
        raw: result.raw,
      });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // Feed convoy (sling ready issues)
  app.post('/api/convoy/:id/feed', async (req, res) => {
    try {
      const result = await convoyService.feed(req.params.id);
      res.json(result);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });
}

