export function registerRigRoutes(app, { rigService } = {}) {
  if (!rigService) throw new Error('registerRigRoutes requires rigService');

  app.get('/api/setup/status', async (req, res) => {
    try {
      const status = await rigService.getSetupStatus();
      res.json(status);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get('/api/rigs', async (req, res) => {
    try {
      const rigs = await rigService.list({ refresh: req.query.refresh === 'true' });
      res.json(rigs);
    } catch {
      res.json([]);
    }
  });

  app.post('/api/rigs', async (req, res) => {
    try {
      const { name, url } = req.body;
      const result = await rigService.add({ name, url });
      res.json(result);
    } catch (err) {
      const statusCode = err.message === 'Name and URL are required' ? 400 : 500;
      res.status(statusCode).json({ success: false, error: err.message });
    }
  });

  app.post('/api/rigs/:name/dock', async (req, res) => {
    try {
      const result = await rigService.dock(req.params.name);
      res.json(result);
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  app.post('/api/rigs/:name/undock', async (req, res) => {
    try {
      const result = await rigService.undock(req.params.name);
      res.json(result);
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  app.delete('/api/rigs/:name', async (req, res) => {
    try {
      const result = await rigService.remove(req.params.name);
      res.json(result);
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });
}
