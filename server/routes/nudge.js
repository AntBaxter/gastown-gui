export function registerNudgeRoutes(app, { nudgeService } = {}) {
  if (!nudgeService) throw new Error('registerNudgeRoutes requires nudgeService');

  app.post('/api/nudge', async (req, res) => {
    try {
      const { target, message, autoStart = true } = req.body;
      const result = await nudgeService.nudge({ target, message, autoStart });
      res.json(result);
    } catch (err) {
      const statusCode = err.statusCode || 500;
      res.status(statusCode).json({ error: err.message });
    }
  });

  app.get('/api/mayor/messages', (req, res) => {
    const limit = Math.min(parseInt(req.query.limit) || 50, 100);
    res.json(nudgeService.getMessageHistory(limit));
  });
}
