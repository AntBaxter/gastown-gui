export function registerBeadRoutes(app, { beadService } = {}) {
  if (!beadService) throw new Error('registerBeadRoutes requires beadService');

  app.get('/api/beads', async (req, res) => {
    try {
      const data = await beadService.list({ status: req.query.status, rig: req.query.rig });
      res.json(data);
    } catch {
      res.json([]);
    }
  });

  app.get('/api/beads/search', async (req, res) => {
    try {
      const query = req.query.q || '';
      const rig = req.query.rig;
      const data = await beadService.search(query, { rig });
      res.json(data);
    } catch {
      res.json([]);
    }
  });

  app.post('/api/beads', async (req, res) => {
    try {
      const { title, description, priority, labels, rig } = req.body;
      const result = await beadService.create({ title, description, priority, labels, rig });

      if (!result.ok) {
        return res.status(result.statusCode || 500).json({ success: false, error: result.error });
      }

      return res.json({ success: true, bead_id: result.beadId, raw: result.raw });
    } catch (err) {
      return res.status(500).json({ success: false, error: err.message });
    }
  });

  app.get('/api/bead/:beadId', async (req, res) => {
    try {
      const { beadId } = req.params;
      const result = await beadService.get(beadId);
      if (!result.ok) return res.status(404).json({ error: 'Bead not found' });
      return res.json(result.bead);
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  });
}
