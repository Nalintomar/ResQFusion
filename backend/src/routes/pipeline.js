import { Router } from 'express';
import { runPipelineCycle } from '../services/pipeline.js';

export function pipelineRouter(db, rawStore) {
  const router = Router();

  router.post('/run', async (req, res) => {
    try {
      const snapshot = await runPipelineCycle({ db, rawStore, log: console });
      res.json({ ok: true, snapshot });
    } catch (e) {
      res.status(502).json({ ok: false, error: e.message });
    }
  });

  return router;
}
