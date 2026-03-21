export function registerFormulaRoutes(app, { formulaService } = {}) {
  if (!formulaService) throw new Error('registerFormulaRoutes requires formulaService');

  app.get('/api/formulas', async (req, res) => {
    try {
      const formulas = await formulaService.list({ refresh: req.query.refresh === 'true' });
      res.json(formulas);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get('/api/formulas/search', async (req, res) => {
    try {
      const results = await formulaService.search(req.query.q || '');
      res.json(results);
    } catch {
      res.json([]);
    }
  });

  app.get('/api/formula/:name', async (req, res) => {
    const formula = await formulaService.get(req.params.name);
    if (!formula) return res.status(404).json({ error: 'Formula not found' });
    res.json(formula);
  });

  app.post('/api/formulas', async (req, res) => {
    const { name, description, template } = req.body;
    if (!name) return res.status(400).json({ error: 'Name is required' });

    const result = await formulaService.create({ name, description, template });
    if (!result.ok) return res.status(500).json({ success: false, error: result.error });

    res.json({ success: true, name, raw: result.raw });
  });

  app.post('/api/formula/:name/use', async (req, res) => {
    const { target, args: formulaArgs } = req.body;
    const name = req.params.name;

    const result = await formulaService.use({ name, target, args: formulaArgs });
    if (!result.ok) return res.status(500).json({ success: false, error: result.error });

    res.json({ success: true, name, target, raw: result.raw });
  });

  app.delete('/api/formula/:name', async (req, res) => {
    const { name } = req.params;

    try {
      const result = await formulaService.remove(name);
      if (!result.ok) {
        return res.status(result.status || 500).json({ success: false, error: result.error });
      }
      res.json({ success: true, name });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });
}

