const express = require('express');
const cors = require('cors');
const config = require('./config');
const db = require('./db');
const errorHandler = require('./middleware/errorHandler');
const authRoutes = require('./routes/auth');
const fileRoutes = require('./routes/files');
const reviewRoutes = require('./routes/reviews');
const reportRoutes = require('./routes/reports');
const configRoutes = require('./routes/config');

async function startServer() {
  await db.initSchema();
  console.log('[DB] Schema initialized');

  const app = express();

  app.use(cors());
  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));

  app.use((req, _res, next) => {
    console.log(`[${new Date().toISOString()}] ${req.method} ${req.path}`);
    next();
  });

  app.use('/api/auth', authRoutes);
  app.use('/api/files', fileRoutes);
  app.use('/api/reviews', reviewRoutes);
  app.use('/api/reviews', reportRoutes);
  app.use('/api/config', configRoutes);

  app.get('/api/health', (_req, res) => {
    res.json({ code: 0, message: 'ok', timestamp: new Date().toISOString() });
  });

  app.use((_req, res) => {
    res.status(404).json({ code: 404, message: '接口不存在' });
  });

  app.use(errorHandler);

  app.listen(config.port, () => {
    console.log(`[Server] Bid Review Platform API running on port ${config.port}`);
  });
}

startServer().catch((err) => {
  console.error('[Server] Failed to start:', err);
  process.exit(1);
});
