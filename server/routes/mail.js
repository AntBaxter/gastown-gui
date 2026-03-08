export function registerMailRoutes(app, { mailService } = {}) {
  if (!mailService) throw new Error('registerMailRoutes requires mailService');

  app.get('/api/mail', async (req, res) => {
    try {
      const data = await mailService.inbox({ refresh: req.query.refresh === 'true' });
      res.json(data);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post('/api/mail', async (req, res) => {
    try {
      const { to, subject, message, priority } = req.body;
      const result = await mailService.send({ to, subject, message, priority });
      res.json(result);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get('/api/mail/all', async (req, res) => {
    try {
      const page = Math.max(1, parseInt(req.query.page, 10) || 1);
      const limit = Math.min(200, Math.max(1, parseInt(req.query.limit, 10) || 50));
      const result = await mailService.allFromFeed({ page, limit });
      res.json(result);
    } catch (err) {
      res.status(500).json({ error: 'Failed to read mail feed' });
    }
  });

  app.get('/api/mail/:id', async (req, res) => {
    try {
      const mail = await mailService.read(req.params.id);
      if (!mail) return res.status(404).json({ error: 'Mail not found' });
      res.json(mail);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post('/api/mail/:id/read', async (req, res) => {
    try {
      const result = await mailService.markRead(req.params.id);
      res.json(result);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post('/api/mail/:id/unread', async (req, res) => {
    try {
      const result = await mailService.markUnread(req.params.id);
      res.json(result);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  app.delete('/api/mail/:id', async (req, res) => {
    try {
      const result = await mailService.delete(req.params.id);
      res.json(result);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });
}
