import { Router } from 'express';
import { appState } from '../services/state.js';
import { REGIONS } from '../data/regions.js';
import { historicalPriors } from '../data/historical.js';
import { mlClient } from '../services/mlClient.js';

/**
 * Coordinator dashboard API (Objective 6) + citizen alert feed (Objective 7, read side).
 * All routes are read-only snapshots of appState, refreshed every pipeline cycle.
 */
export function dashboardRouter(db) {
  const router = Router();

  router.get('/summary', (req, res) => {
    const priors = historicalPriors();
    res.json({
      lastRun: appState.lastRun,
      ticks: appState.ticks,
      mlOnline: appState.mlOnline,
      usingLiveWeather: appState.usingLiveWeather,
      usingLiveSocial: appState.usingLiveSocial,
      regionCount: REGIONS.length,
      activeAlerts: appState.alerts.filter((a) => a.active).length,
      highOrSevereRegions: appState.regionRisks.filter((r) => ['High', 'Severe'].includes(r.risk?.severity_label)).length,
      hotspotCount: appState.hotspots.length,
      regionRisks: appState.regionRisks.map((r) => ({
        regionId: r.regionId,
        name: r.name,
        state: r.state,
        river: r.river,
        lat: r.lat,
        lng: r.lng,
        severity: r.risk?.severity_label ?? 'Unknown',
        riskScore: r.risk?.risk_score ?? null,
        likelihood: r.risk?.likelihood ?? null,
        rain24h: r.weather?.rain24Mm ?? null,
        riverRatio: r.riverGauge?.riverRatio ?? null,
        historicalPrior: priors[r.regionId]?.prior ?? null,
      })),
    });
  });

  router.get('/hotspots', (req, res) => res.json({ hotspots: appState.hotspots }));

  router.get('/posts', (req, res) => {
    const limit = Math.min(200, Number(req.query.limit) || 50);
    const label = req.query.label;
    let posts = appState.posts;
    if (label) posts = posts.filter((p) => p.label === label);
    res.json({ posts: posts.slice(-limit).reverse() });
  });

  router.get('/alerts', (req, res) => {
    const activeOnly = req.query.active !== 'false';
    const regionId = req.query.regionId;
    let alerts = appState.alerts;
    if (activeOnly) alerts = alerts.filter((a) => a.active);
    if (regionId) alerts = alerts.filter((a) => a.regionId === regionId);
    res.json({ alerts: [...alerts].reverse() });
  });

  router.get('/allocation', (req, res) => res.json(appState.allocation));

  router.get('/history', async (req, res) => {
    const regionId = req.query.regionId;
    const rows = await db.docs.collection('risk_snapshots').find(
      {},
      { sort: { createdAt: -1 }, limit: Math.min(200, Number(req.query.limit) || 50) },
    );
    const series = rows
      .reverse()
      .map((s) => ({
        lastRun: s.lastRun,
        regions: regionId ? s.regionRisks.filter((r) => r.regionId === regionId) : undefined,
        avgRiskScore: s.regionRisks.length
          ? Number((s.regionRisks.reduce((a, r) => a + (r.risk?.risk_score ?? 0), 0) / s.regionRisks.length).toFixed(3))
          : 0,
        activeAlerts: s.newAlertsCount,
      }));
    res.json({ series });
  });

  router.get('/ml-metrics', async (req, res) => {
    try {
      res.json(await mlClient.metrics());
    } catch (e) {
      res.status(502).json({ error: `ML service unreachable: ${e.message}` });
    }
  });

  router.get('/regions', (req, res) => res.json({ regions: REGIONS }));

  return router;
}
