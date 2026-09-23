import { Router } from 'express';

export function resourcesRouter(db) {
  const router = Router();

  router.get('/', async (req, res) => {
    const resources = await db.sql.listResources();
    res.json({
      resources: resources.map((r) => ({ ...r, available: Math.max(0, r.quantity - (r.committed ?? 0)) })),
      dbMode: db.sql.mode,
    });
  });

  router.get('/summary', async (req, res) => {
    const resources = await db.sql.listResources();
    const byType = {};
    for (const r of resources) {
      const b = (byType[r.type] ??= { quantity: 0, committed: 0 });
      b.quantity += r.quantity;
      b.committed += r.committed ?? 0;
    }
    res.json({ byType });
  });

  return router;
}
