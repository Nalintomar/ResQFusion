import { config } from '../config/index.js';
import { REGIONS } from '../data/regions.js';
import { makeRng, clamp } from '../utils/rng.js';
import { intensityMap } from './state.js';

/**
 * Weather source (Objective 1a). Uses the real OpenWeatherMap API when OPENWEATHER_API_KEY is set;
 * otherwise falls back to a seasonally-aware simulator so the pipeline runs end-to-end without keys.
 * Either way the output matches OpenWeatherMap's nested JSON shape, so `normalizeWeather` doesn't care
 * which one produced it.
 */
const rollingRain = new Map(); // regionId -> {h24:[...], h72:[...]}

function pushRain(regionId, mm) {
  const win = rollingRain.get(regionId) ?? { samples: [] };
  win.samples.push({ t: Date.now(), mm });
  win.samples = win.samples.filter((s) => Date.now() - s.t <= 72 * 3600 * 1000);
  rollingRain.set(regionId, win);
  const now = Date.now();
  const rain24 = win.samples.filter((s) => now - s.t <= 24 * 3600 * 1000).reduce((a, s) => a + s.mm, 0);
  const rain72 = win.samples.reduce((a, s) => a + s.mm, 0);
  return { rain24: Number(rain24.toFixed(1)), rain72: Number(rain72.toFixed(1)) };
}

async function fetchReal(region) {
  const url = `https://api.openweathermap.org/data/2.5/weather?lat=${region.lat}&lon=${region.lng}&units=metric&appid=${config.owmKey}`;
  const res = await fetch(url, { signal: AbortSignal.timeout(6000) });
  if (!res.ok) throw new Error(`OpenWeatherMap ${res.status}`);
  const json = await res.json();
  const hourlyRain = json.rain?.['1h'] ?? 0;
  const agg = pushRain(region.id, hourlyRain);
  json._agg = agg;
  return json;
}

/** Simulator: a slow-moving "wet season intensity" per region drives believable rain/humidity/wind. */
const rng = makeRng(config.simSeed + 11);

function simulate(region) {
  let inten = intensityMap.get(region.id);
  inten = clamp(inten + rng.normal(0, 0.06), 0.02, 1.0);
  intensityMap.set(region.id, inten);

  const rainNow = Math.max(0, rng.poisson(inten * 9) * rng.range(0.8, 2.6));
  const agg = pushRain(region.id, rainNow);
  const temp = 24 + 8 * Math.sin(Date.now() / 8.64e7) + rng.normal(0, 1.5);
  const humidity = clamp(55 + inten * 35 + rng.normal(0, 4), 30, 100);
  const windMs = clamp(2 + inten * 9 + rng.normal(0, 1), 0, 30);

  return {
    dt: Math.floor(Date.now() / 1000),
    main: { temp: Number(temp.toFixed(1)), humidity: Math.round(humidity) },
    wind: { speed: Number(windMs.toFixed(1)) },
    rain: { '1h': Number(rainNow.toFixed(1)) },
    weather: [{ description: rainNow > 20 ? 'heavy rain' : rainNow > 4 ? 'moderate rain' : 'light rain or clear' }],
    _agg: agg,
    _simulated: true,
  };
}

export async function fetchWeatherForAllRegions() {
  const results = [];
  for (const region of REGIONS) {
    try {
      const raw = config.owmKey ? await fetchReal(region) : simulate(region);
      results.push({ region, raw });
    } catch {
      results.push({ region, raw: simulate(region) });
    }
  }
  return results;
}

export const usingLiveWeatherApi = () => Boolean(config.owmKey);
