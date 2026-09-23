import { Router } from 'express';
import { randomUUID } from 'node:crypto';
import { normalizePost } from '../fusion/normalize.js';
import { mlClient } from '../services/mlClient.js';
import { appState, pushBounded } from '../services/state.js';
import { requireAuth } from '../middleware/auth.js';

/**
 * Citizen-facing module (Objective 7): submit a geo-tagged incident report, get it analyzed and
 * folded into the live picture immediately (not waiting for the next scheduled pipeline tick), and
 * fetch area-specific alerts.
 */
export function citizenRouter(db) {
  const router = Router();

  router.post('/report', async (req, res) => {
    const { text, lat, lng, category } = req.body || {};
    if (!text || !String(text).trim()) return res.status(400).json({ error: 'text is required' });

    const rec = normalizePost({
      channel: 'citizen',
      text,
      lat: Number.isFinite(lat) ? Number(lat) : undefined,
      lng: Number.isFinite(lng) ? Number(lng) : undefined,
      category,
      author: req.user?.email ?? 'anonymous-citizen',
      ts: Date.now(),
    });
    if (!rec) return res.status(400).json({ error: 'Could not process report text' });

    let analyzed = { ...rec, label: 'unclassified', urgency: 0.3, categories: [] };
    try {
      const { posts } = await mlClient.nlpProcess([{ id: rec.id, text: rec.cleanText, lat: rec.lat, lng: rec.lng }]);
      analyzed = { ...rec, ...(posts[0] ?? {}) };
    } catch (e) {
      req.log?.warn?.(`[citizen] NLP unavailable, storing unclassified: ${e.message}`);
    }

    await db.docs.collection('posts').insertOne({ ...analyzed, createdAt: new Date() });
    pushBounded(appState.posts, [analyzed], 500);

    if (analyzed.label === 'distress' && analyzed.urgency >= 0.5) {
      const alert = {
        id: randomUUID(),
        type: 'citizen_report',
        regionId: rec.regionId,
        regionName: rec.regionId ?? 'Unassigned area',
        severity: analyzed.urgency >= 0.75 ? 'Severe' : 'High',
        message: `Citizen distress report near ${rec.lat?.toFixed(3) ?? '?'}, ${rec.lng?.toFixed(3) ?? '?'}: "${String(text).slice(0, 120)}"`,
        lat: rec.lat,
        lng: rec.lng,
        active: true,
        createdAt: new Date(),
      };
      await db.docs.collection('alerts').insertOne(alert);
      pushBounded(appState.alerts, [alert], 300);
    }

    res.status(201).json({ report: analyzed });
  });

  router.get('/alerts', async (req, res) => {
    const { lat, lng, radiusKm = 60 } = req.query;
    let alerts = appState.alerts.filter((a) => a.active);
    if (Number.isFinite(Number(lat)) && Number.isFinite(Number(lng))) {
      const { haversineKm } = await import('../utils/geo.js');
      alerts = alerts.filter(
        (a) => a.lat != null && a.lng != null && haversineKm(Number(lat), Number(lng), a.lat, a.lng) <= Number(radiusKm),
      );
    }
    res.json({ alerts: [...alerts].reverse() });
  });

  router.get('/my-reports', requireAuth, async (req, res) => {
    const rows = await db.docs.collection('posts').find(
      { author: req.user?.email },
      { sort: { createdAt: -1 }, limit: 50 },
    );
    res.json({ reports: rows });
  });

  return router;
}
