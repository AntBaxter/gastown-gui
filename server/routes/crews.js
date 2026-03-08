export function registerCrewRoutes(app, { crewService } = {}) {
  if (!crewService) throw new Error('registerCrewRoutes requires crewService');

  app.get('/api/crews', async (req, res) => {
    try {
      const data = await crewService.list({ refresh: req.query.refresh === 'true' });
      res.json(data);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get('/api/crew/:name/status', async (req, res) => {
    try {
      const data = await crewService.status(req.params.name);
      res.json(data);
    } catch (err) {
      const statusCode = err.statusCode || 500;
      res.status(statusCode).json({ error: err.message });
    }
  });

  app.post('/api/crews', async (req, res) => {
    try {
      const { name, rig } = req.body;
      const result = await crewService.add({ name, rig });
      res.status(201).json(result);
    } catch (err) {
      const statusCode = err.message === 'Crew name is required' ? 400 : 500;
      res.status(statusCode).json({ success: false, error: err.message });
    }
  });

  app.delete('/api/crew/:name', async (req, res) => {
    try {
      const result = await crewService.remove(req.params.name);
      res.json(result);
    } catch (err) {
      const statusCode = err.message === 'Crew name is required' ? 400 : 500;
      res.status(statusCode).json({ success: false, error: err.message });
    }
  });
}
