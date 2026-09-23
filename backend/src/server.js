
import express from 'express';
import cors from 'cors';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { config } from './config/index.js';
import { initDb } from './db/index.js';
import { createRawStore } from './db/rawStore.js';
import { startPipeline } from './services/pipeline.js';
import { authRouter } from './routes/auth.js';
import { dashboardRouter } from './routes/dashboard.js';
import { citizenRouter } from './routes/citizen.js';
import { resourcesRouter } from './routes/resources.js';
import { pipelineRouter } from './routes/pipeline.js';
import { requireAuth, requireRole, optionalAuth } from './middleware/auth.js';
import { mlClient } from './services/mlClient.js';
import { appState } from './services/state.js';

export async function createApp() {
  const db = await initDb();
  const rawStore = createRawStore();

  const app = express();
  app.use(cors({ origin: config.corsOrigin }));
  app.use(express.json({ limit: '1mb' }));

  app.get('/api/health', async (req, res) => {
    let mlAlive = false;
    try {
      mlAlive = await mlClient.health();
    } catch { /* ml service down */ }
    res.json({
      status: 'ok',
      dbMode: { docs: db.docs.mode, sql: db.sql.mode },
      mlOnline: mlAlive,
      pipelineTicks: appState.ticks,
      lastRun: appState.lastRun,
    });
  });

  app.use('/api/auth', authRouter(db));
  app.use('/api/dashboard', requireAuth, requireRole('admin', 'relief'), dashboardRouter(db));

  // Citizen module (Objective 7) is mostly public — reporting an incident and viewing area alerts
  // must not require an account — but /my-reports needs identity, enforced inside the router itself.
  app.use('/api/citizen', optionalAuth, citizenRouter(db));

  app.use('/api/resources', requireAuth, requireRole('admin', 'relief'), resourcesRouter(db));
  app.use('/api/pipeline', requireAuth, requireRole('admin'), pipelineRouter(db, rawStore));

  app.use((req, res) => res.status(404).json({ error: 'Not found' }));
  // eslint-disable-next-line no-unused-vars
  app.use((err, req, res, next) => {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  });

  let stopPipeline = () => {};
  if (config.autoStart) {
    stopPipeline = startPipeline({ db, rawStore, intervalMs: config.ingestIntervalMs, log: console });
  }

  return { app, db, rawStore, stopPipeline };
}

async function main() {
  const { app } = await createApp();
  app.listen(config.port, () => {
    console.log(`[server] ResQFusion API listening on :${config.port}`);
    console.log(`[server] ML service expected at ${config.mlUrl}`);
    console.log('[server] Demo users: admin@resqfusion.in / Admin@123, relief@resqfusion.in / Relief@123, citizen@resqfusion.in / Citizen@123');
  });
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  main();
}
