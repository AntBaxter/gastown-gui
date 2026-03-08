export function registerServiceRoutes(app, { serviceControlService } = {}) {
  if (!serviceControlService) throw new Error('registerServiceRoutes requires serviceControlService');

  app.post('/api/service/:name/up', async (req, res) => {
    try {
      const { rig } = req.body || {};
      const result = await serviceControlService.start(req.params.name, rig);
      res.json(result);
    } catch (err) {
      const statusCode = err.statusCode || 500;
      res.status(statusCode).json({ success: false, error: err.message });
    }
  });

  app.post('/api/service/:name/down', async (req, res) => {
    try {
      const { rig } = req.body || {};
      const result = await serviceControlService.stop(req.params.name, rig);
      res.json(result);
    } catch (err) {
      const statusCode = err.statusCode || 500;
      res.status(statusCode).json({ success: false, error: err.message });
    }
  });

  app.post('/api/service/:name/restart', async (req, res) => {
    try {
      const { rig } = req.body || {};
      const result = await serviceControlService.restart(req.params.name, rig);
      res.json(result);
    } catch (err) {
      const statusCode = err.statusCode || 500;
      res.status(statusCode).json({ success: false, error: err.message });
    }
  });

  app.get('/api/service/:name/status', async (req, res) => {
    try {
      const data = await serviceControlService.getStatus(req.params.name);
      res.json(data);
    } catch (err) {
      res.json({ service: req.params.name, running: false, error: err.message });
    }
  });
}
