import { randomUUID } from 'node:crypto';
import { REGIONS } from '../data/regions.js';
import { haversineKm } from '../utils/geo.js';
import { clamp } from '../utils/rng.js';

/**
 * Data fusion / preprocessing (Objective 2).
 * Every source - nested weather JSON, flat numeric sensor readings, free-text posts - is converted
 * into ONE unified record:
 *
 *   { id, source, kind, ts, regionId, lat, lng, geo, values{}, text?, cleanText?, quality 0..1, flags[] }
 *
 * quality starts at the source's reliability and is reduced by validation problems (clipped values,
 * spikes, approximate geo-tagging), so downstream consumers can weight evidence.
 */

export const SOURCE_RELIABILITY = { weather: 0.95, sensor: 0.9, citizen: 0.85, social: 0.6 };
const INDIA_BOUNDS = { latMin: 6, latMax: 38, lngMin: 68, lngMax: 98 };
const GEO_MATCH_KM = 90;

const RANGES = {
  tempC: [-10, 55],
  humidityPct: [0, 100],
  windKmh: [0, 250],
  rain1hMm: [0, 150],
  rain24Mm: [0, 500],
  rain72Mm: [0, 900],
  seismicMag: [0, 9.5],
  aqi: [0, 999],
};

/** Clamp a value into its plausible range. Returns {value, clipped} or null if not numeric. */
export function validateRange(value, key, [lo, hi] = RANGES[key] ?? [-Infinity, Infinity]) {
  const n = typeof value === 'string' ? Number(value) : value;
  if (typeof n !== 'number' || !Number.isFinite(n)) return null;
  const v = clamp(n, lo, hi);
  return { value: v, clipped: v !== n };
}

export function cleanText(text = '') {
  return String(text)
    .replace(/https?:\/\/\S+|www\.\S+/gi, ' ')
    .replace(/@\w+/g, ' ')
    .replace(/#/g, ' ')
    .replace(/[^\p{L}\p{N}\s.,!?'-]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function inIndia(lat, lng) {
  return (
    Number.isFinite(lat) && Number.isFinite(lng) &&
    lat >= INDIA_BOUNDS.latMin && lat <= INDIA_BOUNDS.latMax &&
    lng >= INDIA_BOUNDS.lngMin && lng <= INDIA_BOUNDS.lngMax
  );
}

/** Nearest monitored region to a coordinate, within GEO_MATCH_KM. */
export function assignRegion(lat, lng) {
  if (!inIndia(lat, lng)) return null;
  let best = null;
  let bestD = Infinity;
  for (const r of REGIONS) {
    const d = haversineKm(lat, lng, r.lat, r.lng);
    if (d < bestD) {
      best = r;
      bestD = d;
    }
  }
  return bestD <= GEO_MATCH_KM ? best : null;
}

/** Fallback geo-tagging for posts with no coordinates: look for a region name in the text. */
export function regionFromText(text = '') {
  const t = text.toLowerCase();
  return (
    REGIONS.find((r) => t.includes(r.name.toLowerCase().split(' (')[0])) ??
    REGIONS.find((r) => t.includes(r.state.toLowerCase())) ??
    null
  );
}

const base = (source, kind, ts, region, extra) => ({
  id: randomUUID(),
  source,
  kind,
  ts: new Date(ts ?? Date.now()).toISOString(),
  regionId: region?.id ?? null,
  lat: region?.lat ?? null,
  lng: region?.lng ?? null,
  geo: 'region',
  values: {},
  quality: SOURCE_RELIABILITY[source] ?? 0.5,
  flags: [],
  ...extra,
});

function applyValue(rec, key, raw) {
  const v = validateRange(raw, key);
  if (!v) {
    rec.flags.push(`invalid:${key}`);
    rec.quality = Math.min(rec.quality, 0.3);
    return;
  }
  rec.values[key] = v.value;
  if (v.clipped) {
    rec.flags.push(`clipped:${key}`);
    rec.quality = Math.min(rec.quality, 0.5);
  }
}

/**
 * Weather payload (OpenWeatherMap-style nested JSON):
 *   { main:{temp,humidity}, wind:{speed m/s}, rain:{'1h'}, weather:[{description}], _agg:{rain24,rain72} }
 * `_agg` carries rolling rainfall totals (computed by the weather adapter).
 */
export function normalizeWeather(raw, region, ts) {
  const rec = base('weather', 'weather', ts ?? raw?.dt * 1000, region);
  applyValue(rec, 'tempC', raw?.main?.temp);
  applyValue(rec, 'humidityPct', raw?.main?.humidity);
  applyValue(rec, 'windKmh', raw?.wind?.speed != null ? raw.wind.speed * 3.6 : undefined);
  applyValue(rec, 'rain1hMm', raw?.rain?.['1h'] ?? 0);
  applyValue(rec, 'rain24Mm', raw?._agg?.rain24 ?? 0);
  applyValue(rec, 'rain72Mm', raw?._agg?.rain72 ?? raw?._agg?.rain24 ?? 0);
  rec.text = raw?.weather?.[0]?.description ?? '';
  return rec;
}

/**
 * Sensor reading (flat numeric stream): { station, regionId, metric, value, unit, ts }
 * metric: water_level_m | seismic_mag | aqi
 * Water level is converted to a ratio against the station's danger mark (1.0 == danger level).
 */
export function normalizeSensor(raw, region) {
  const kindMap = { water_level_m: 'river_level', seismic_mag: 'seismic', aqi: 'air_quality' };
  const kind = kindMap[raw?.metric];
  if (!kind || !region) return null;
  const rec = base('sensor', kind, raw.ts, region, { station: raw.station });

  if (kind === 'river_level') {
    const level = Number(raw.value);
    if (!Number.isFinite(level)) return null;
    const lo = region.baseLevelM - 5;
    const hi = region.dangerLevelM + 15;
    const v = clamp(level, lo, hi);
    if (v !== level) {
      rec.flags.push('clipped:levelM');
      rec.quality = Math.min(rec.quality, 0.5);
    }
    rec.values.levelM = Number(v.toFixed(2));
    rec.values.dangerLevelM = region.dangerLevelM;
    rec.values.riverRatio = Number(((v - region.baseLevelM) / (region.dangerLevelM - region.baseLevelM)).toFixed(3));
  } else if (kind === 'seismic') {
    applyValue(rec, 'seismicMag', raw.value);
  } else {
    applyValue(rec, 'aqi', raw.value);
  }
  if (Object.keys(rec.values).length === 0) return null;
  return rec;
}

/**
 * Social / citizen post. Accepts our internal shape
 *   { externalId, author, text, lat?, lng?, ts, channel: 'social'|'citizen' }
 * Geo-tagging order: explicit coordinates -> region name mentioned in text -> unassigned.
 */
export function normalizePost(raw) {
  const source = raw.channel === 'citizen' ? 'citizen' : 'social';
  const text = String(raw.text ?? '').slice(0, 500);
  if (!text.trim()) return null;

  let region = null;
  let geo = 'none';
  let lat = null;
  let lng = null;
  const flags = [];

  if (Number.isFinite(raw.lat) && Number.isFinite(raw.lng) && inIndia(raw.lat, raw.lng)) {
    lat = raw.lat;
    lng = raw.lng;
    geo = 'exact';
    region = assignRegion(lat, lng);
  }
  if (!region) {
    const guess = regionFromText(text);
    if (guess) {
      region = guess;
      if (geo === 'none') {
        lat = guess.lat;
        lng = guess.lng;
        geo = 'inferred';
        flags.push('geo:inferred-from-text');
      }
    }
  }
  if (!region) flags.push('geo:unassigned');

  const rec = base(source, 'post', raw.ts, region, {
    lat,
    lng,
    geo,
    text,
    cleanText: cleanText(text),
    author: raw.author ?? 'anonymous',
    externalId: raw.externalId ?? null,
    category: raw.category ?? null,
  });
  rec.flags.push(...flags);
  if (geo === 'inferred') rec.quality = Math.min(rec.quality, 0.45);
  if (geo === 'none') rec.quality = Math.min(rec.quality, 0.25);
  return rec;
}

/** Build the ML feature vector for a region from its latest fused weather + river-gauge records. */
export function buildFeatures(region, weather, river) {
  const rain24 = weather?.values?.rain24Mm ?? 0;
  const rain72 = Math.max(weather?.values?.rain72Mm ?? rain24, rain24);
  return {
    rain_24h_mm: rain24,
    rain_72h_mm: rain72,
    river_ratio: river?.values?.riverRatio ?? 0.4,
    // Soil saturation proxy: same relationship used when the training set was built.
    soil_saturation: Number(clamp(0.18 + rain72 / 260, 0, 1).toFixed(3)),
    humidity_pct: weather?.values?.humidityPct ?? 60,
    wind_kmh: weather?.values?.windKmh ?? 10,
    elevation_m: region.elevationM,
  };
}
