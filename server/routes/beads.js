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
      const { title, description, type, priority, labels, rig, parent } = req.body;
      const result = await beadService.create({ title, description, type, priority, labels, rig, parent });

      if (!result.ok) {
        return res.status(result.statusCode || 500).json({ success: false, error: result.error });
      }

      return res.json({ success: true, bead_id: result.beadId, raw: result.raw });
    } catch (err) {
      return res.status(500).json({ success: false, error: err.message });
    }
  });

  app.get('/api/beads/epics', async (req, res) => {
    try {
      const data = await beadService.listEpics({ rig: req.query.rig });
      res.json(data);
    } catch {
      res.json([]);
    }
  });

  app.get('/api/beads/dependencies', async (req, res) => {
    try {
      const epicId = req.query.epic;
      if (!epicId) return res.status(400).json({ error: 'epic query parameter required' });
      const data = await beadService.getDependencies(epicId);
      res.json(data);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get('/api/beads/blocked', async (req, res) => {
    try {
      const data = await beadService.getBlocked({ rig: req.query.rig });
      res.json(data);
    } catch {
      res.json([]);
    }
  });

  app.get('/api/bead/:beadId/children', async (req, res) => {
    try {
      const { beadId } = req.params;
      const result = await beadService.getChildren(beadId);
      if (!result.ok) return res.status(404).json({ error: 'Epic not found' });
      return res.json({ children: result.children, epic: result.epic });
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  });


  // Dependency management
  app.post('/api/bead/:beadId/dep', async (req, res) => {
    try {
      const { beadId } = req.params;
      const { dependsOn } = req.body;
      if (!dependsOn) return res.status(400).json({ success: false, error: 'dependsOn is required' });
      const result = await beadService.addDependency(beadId, dependsOn);
      if (!result.ok) return res.status(500).json({ success: false, error: result.error });
      return res.json({ success: true, raw: result.raw });
    } catch (err) {
      return res.status(500).json({ success: false, error: err.message });
    }
  });

  app.post('/api/bead/:beadId/dep/remove', async (req, res) => {
    try {
      const { beadId } = req.params;
      const { dependsOn } = req.body;
      if (!dependsOn) return res.status(400).json({ success: false, error: 'dependsOn is required' });
      const result = await beadService.removeDependency(beadId, dependsOn);
      if (!result.ok) return res.status(500).json({ success: false, error: result.error });
      return res.json({ success: true, raw: result.raw });
    } catch (err) {
      return res.status(500).json({ success: false, error: err.message });
    }
  });

  app.get('/api/bead/:beadId/dep/tree', async (req, res) => {
    try {
      const { beadId } = req.params;
      const result = await beadService.getDependencyTree(beadId);
      if (!result.ok) return res.status(500).json({ error: result.error });
      return res.json({ tree: result.raw });
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  });

  app.post('/api/bead/:beadId/parent', async (req, res) => {
    try {
      const { beadId } = req.params;
      const { parentId } = req.body;
      const result = await beadService.setParent(beadId, parentId || '');
      if (!result.ok) return res.status(500).json({ success: false, error: result.error });
      return res.json({ success: true, raw: result.raw });
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
