export function registerDoctorRoutes(app, { doctorService } = {}) {
  if (!doctorService) throw new Error('registerDoctorRoutes requires doctorService');

  app.get('/api/doctor', async (req, res) => {
    try {
      const data = await doctorService.check({ refresh: req.query.refresh === 'true' });
      res.json(data);
    } catch (err) {
      res.json({ checks: [], error: err.message });
    }
  });

  app.post('/api/doctor/fix', async (req, res) => {
    try {
      const result = await doctorService.fix();
      res.json(result);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });
}
