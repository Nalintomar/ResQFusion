import { REGIONS } from '../data/regions.js';
import { makeRng, clamp } from '../utils/rng.js';
import { intensityOf } from './state.js';

/**
 * Simulated IoT sensor emulator (Scope: "sensor data will be simulated... as physical IoT hardware
 * deployment is outside the scope of this academic project"). River level responds to the same
 * rain-intensity signal the weather simulator uses, so a wet spell in a region plausibly raises its
 * gauge reading over the following ticks - exactly the lagged relationship a real gauge would show.
 */
const rng = makeRng(7331);
const gaugeState = new Map(REGIONS.map((r) => [r.id, r.baseLevelM]));

function stepGauge(region) {
  const inten = intensityOf(region.id) ?? 0.2;
  let level = gaugeState.get(region.id);
  const drift = (inten - 0.22) * 0.35 + rng.normal(0, 0.05);
  level = clamp(level + drift, region.baseLevelM - 3, region.dangerLevelM + 12);
  gaugeState.set(region.id, level);
  return Number(level.toFixed(2));
}

export function readSensorsForAllRegions() {
  const out = [];
  const now = Date.now();
  for (const region of REGIONS) {
    out.push({ region, raw: { station: `${region.id}-river-01`, metric: 'water_level_m', value: stepGauge(region), ts: now } });

    const seismic = Math.max(0, rng.normal(1.1, 0.5));
    out.push({ region, raw: { station: `${region.id}-seismo-01`, metric: 'seismic_mag', value: Number(seismic.toFixed(1)), ts: now } });

    const aqi = clamp(60 + rng.normal(0, 20) + (intensityOf(region.id) > 0.5 ? -15 : 0), 15, 400);
    out.push({ region, raw: { station: `${region.id}-aqi-01`, metric: 'aqi', value: Math.round(aqi), ts: now } });
  }
  return out;
}
