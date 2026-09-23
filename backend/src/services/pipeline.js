import { randomUUID } from 'node:crypto';
import { REGIONS, getRegion } from '../data/regions.js';
import { fetchWeatherForAllRegions, usingLiveWeatherApi } from '../ingestion/weather.js';
import { readSensorsForAllRegions } from '../ingestion/sensors.js';
import { fetchSocialAndCitizenPosts, usingLiveSocialApi } from '../ingestion/socialFeed.js';
import { normalizeWeather, normalizeSensor, normalizePost, buildFeatures } from '../fusion/normalize.js';
import { mlClient } from './mlClient.js';
import { allocate, buildZones, lpUpperBoundCoverage } from './allocation.js';
import { appState, pushBounded } from './state.js';

const ALERT_THRESHOLDS = { High: 2, Severe: 3 };

/**
 * One full pipeline cycle: Ingestion -> Fusion -> Prediction (risk + NLP) -> Allocation -> Alerts.
 * Runs on a timer (config.ingestIntervalMs) and can also be triggered on demand via POST /api/pipeline/run.
 */
export async function runPipelineCycle({ db, rawStore, log = console }) {
  const startedAt = Date.now();

  // 1. INGESTION -------------------------------------------------------------------------------
  const [weatherBatch, sensorBatch, socialBatch] = await Promise.all([
    fetchWeatherForAllRegions(),
    Promise.resolve(readSensorsForAllRegions()),
    fetchSocialAndCitizenPosts(),
  ]);
  await Promise.all([
    rawStore.save('weather', weatherBatch.map((w) => ({ regionId: w.region.id, raw: w.raw }))),
    rawStore.save('sensor', sensorBatch.map((s) => ({ regionId: s.region.id, raw: s.raw }))),
    rawStore.save('social', socialBatch.flatMap((s) => s.posts.map((p) => ({ regionId: s.region.id, ...p })))),
  ]);

  // 2. FUSION / PREPROCESSING -------------------------------------------------------------------
  const weatherByRegion = new Map();
  const observations = [];
  for (const { region, raw } of weatherBatch) {
    const rec = normalizeWeather(raw, region);
    weatherByRegion.set(region.id, rec);
    observations.push(rec);
  }

  const riverByRegion = new Map();
  for (const { region, raw } of sensorBatch) {
    const rec = normalizeSensor(raw, region);
    if (!rec) continue;
    observations.push(rec);
    if (rec.kind === 'river_level') riverByRegion.set(region.id, rec);
  }

  const posts = [];
  for (const { posts: rawPosts } of socialBatch) {
    for (const raw of rawPosts) {
      const rec = normalizePost(raw);
      if (rec) posts.push(rec);
    }
  }
  await db.docs.collection('observations').insertMany(observations.map((o) => ({ ...o, createdAt: new Date() })));

  // 3a. PREDICTIVE INTELLIGENCE - risk model -----------------------------------------------------
  let mlOnline = true;
  let riskResults;
  try {
    const items = REGIONS.map((region) => ({
      id: region.id,
      features: buildFeatures(region, weatherByRegion.get(region.id), riverByRegion.get(region.id)),
    }));
    const { results } = await mlClient.predictBatch(items);
    riskResults = new Map(results.map((r) => [r.id, r]));
  } catch (e) {
    mlOnline = false;
    log.warn?.(`[pipeline] ML risk service unreachable: ${e.message}`);
    riskResults = new Map();
  }

  const regionRisks = REGIONS.map((region) => ({
    regionId: region.id,
    name: region.name,
    state: region.state,
    river: region.river,
    lat: region.lat,
    lng: region.lng,
    evacPopulation: region.evacPopulation,
    weather: weatherByRegion.get(region.id)?.values ?? {},
    riverGauge: riverByRegion.get(region.id)?.values ?? {},
    risk: riskResults.get(region.id) ?? null,
  }));

  // 3b. PREDICTIVE INTELLIGENCE - NLP + geographic clustering -----------------------------------
  let hotspots = [];
  let analyzedPosts = posts;
  if (posts.length) {
    try {
      const { posts: analyzed, clusters } = await mlClient.nlpProcess(
        posts.map((p) => ({ id: p.id, text: p.cleanText || p.text, lat: p.lat, lng: p.lng, regionId: p.regionId })),
      );
      const byId = new Map(analyzed.map((a) => [a.id, a]));
      analyzedPosts = posts.map((p) => ({ ...p, ...(byId.get(p.id) ?? {}) }));
      hotspots = clusters;
    } catch (e) {
      mlOnline = false;
      log.warn?.(`[pipeline] ML NLP service unreachable: ${e.message}`);
    }
  }
  await db.docs.collection('posts').insertMany(analyzedPosts.map((p) => ({ ...p, createdAt: new Date() })));

  // 4. RESOURCE ALLOCATION -----------------------------------------------------------------------
  await db.sql.resetCommitted();
  const resources = await db.sql.listResources();
  const zones = buildZones(regionRisks, hotspots);
  const { plan, committed, poolsRemaining } = allocate(zones, resources);
  for (const [id, qty] of Object.entries(committed)) await db.sql.setCommitted(id, qty);
  const lpBound = lpUpperBoundCoverage(zones, resources);

  // 5. ALERTS ---------------------------------------------------------------------------------
  const now = new Date();
  const newAlerts = [];
  for (const r of regionRisks) {
    const sevLabel = r.risk?.severity_label;
    if (sevLabel && ALERT_THRESHOLDS[sevLabel]) {
      newAlerts.push({
        id: randomUUID(),
        type: 'risk',
        regionId: r.regionId,
        regionName: r.name,
        severity: sevLabel,
        message: `${sevLabel} flood risk predicted for ${r.name} (river ${((r.riverGauge.riverRatio ?? 0) * 100).toFixed(0)}% of danger mark, ${r.weather.rain24Mm ?? 0} mm rain in 24h).`,
        lat: r.lat,
        lng: r.lng,
        active: true,
        createdAt: now,
      });
    }
  }
  for (const h of hotspots) {
    if (h.hotspot_score >= 0.45) {
      newAlerts.push({
        id: randomUUID(),
        type: 'distress_cluster',
        regionId: null,
        regionName: h.top_categories?.join(', ') || 'Distress cluster',
        severity: h.hotspot_score > 0.7 ? 'Severe' : 'High',
        message: `${h.count} distress reports clustered near ${h.lat.toFixed(3)}, ${h.lng.toFixed(3)} (${h.top_categories.join(', ') || 'unclassified'}).`,
        lat: h.lat,
        lng: h.lng,
        active: true,
        createdAt: now,
      });
    }
  }
  if (newAlerts.length) await db.docs.collection('alerts').insertMany(newAlerts);

  const snapshot = {
    lastRun: now.toISOString(),
    durationMs: Date.now() - startedAt,
    regionRisks,
    hotspots,
    allocation: { plan, committed, poolsRemaining, lpBound },
    newAlertsCount: newAlerts.length,
    mlOnline,
    usingLiveWeather: usingLiveWeatherApi(),
    usingLiveSocial: usingLiveSocialApi(),
  };
  await db.docs.collection('risk_snapshots').insertOne({ ...snapshot, createdAt: now });

  appState.lastRun = snapshot.lastRun;
  appState.regionRisks = regionRisks;
  appState.hotspots = hotspots;
  pushBounded(appState.posts, analyzedPosts, 500);
  pushBounded(appState.alerts, newAlerts, 300);
  appState.allocation = { plan, committed, poolsRemaining, lpBound };
  appState.mlOnline = mlOnline;
  appState.usingLiveWeather = usingLiveWeatherApi();
  appState.usingLiveSocial = usingLiveSocialApi();
  appState.ticks += 1;

  log.info?.(`[pipeline] cycle ${appState.ticks} done in ${snapshot.durationMs}ms, ${newAlerts.length} new alert(s), ML ${mlOnline ? 'online' : 'OFFLINE'}`);
  return snapshot;
}

export function startPipeline({ db, rawStore, intervalMs, log = console }) {
  let stopped = false;
  let timer = null;
  const tick = async () => {
    if (stopped) return;
    try {
      await runPipelineCycle({ db, rawStore, log });
    } catch (e) {
      log.error?.(`[pipeline] cycle failed: ${e.stack || e.message}`);
    } finally {
      if (!stopped) timer = setTimeout(tick, intervalMs);
    }
  };
  tick();
  return () => {
    stopped = true;
    if (timer) clearTimeout(timer);
  };
}
