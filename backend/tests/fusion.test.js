import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeWeather, normalizeSensor, normalizePost, validateRange, buildFeatures } from '../src/fusion/normalize.js';
import { REGIONS } from '../src/data/regions.js';

const patna = REGIONS.find((r) => r.id === 'patna');

test('normalizeWeather converts nested OpenWeatherMap JSON into a flat unified record', () => {
  const raw = { dt: 1700000000, main: { temp: 30, humidity: 80 }, wind: { speed: 5 }, rain: { '1h': 12 }, weather: [{ description: 'heavy rain' }], _agg: { rain24: 40, rain72: 90 } };
  const rec = normalizeWeather(raw, patna);
  assert.equal(rec.source, 'weather');
  assert.equal(rec.regionId, 'patna');
  assert.equal(rec.values.windKmh, 18); // 5 m/s * 3.6
  assert.equal(rec.values.rain24Mm, 40);
});

test('normalizeSensor clips out-of-range river levels and flags them', () => {
  const rec = normalizeSensor({ station: 'x', metric: 'water_level_m', value: 9999, ts: Date.now() }, patna);
  assert.ok(rec.values.levelM < 9999);
  assert.ok(rec.flags.includes('clipped:levelM'));
  assert.ok(rec.quality < 0.9);
});

test('normalizePost geo-tags from explicit coordinates and cleans text', () => {
  const rec = normalizePost({ channel: 'social', text: 'Help!! water rising http://t.co/x @user #flood', lat: patna.lat, lng: patna.lng });
  assert.equal(rec.regionId, 'patna');
  assert.equal(rec.geo, 'exact');
  assert.ok(!rec.cleanText.includes('http'));
  assert.ok(!rec.cleanText.includes('@user'));
});

test('normalizePost falls back to inferring region from text when no coordinates given', () => {
  const rec = normalizePost({ channel: 'citizen', text: `Flooding reported near ${patna.name}` });
  assert.equal(rec.regionId, 'patna');
  assert.equal(rec.geo, 'inferred');
});

test('normalizePost returns null for empty text', () => {
  assert.equal(normalizePost({ channel: 'social', text: '   ' }), null);
});

test('validateRange rejects non-numeric input', () => {
  assert.equal(validateRange('not-a-number', 'tempC'), null);
});

test('buildFeatures derives a full ML feature vector from fused weather + river records', () => {
  const weather = { values: { rain24Mm: 50, rain72Mm: 120, humidityPct: 80, windKmh: 20 } };
  const river = { values: { riverRatio: 0.9 } };
  const feats = buildFeatures(patna, weather, river);
  assert.equal(feats.rain_24h_mm, 50);
  assert.equal(feats.river_ratio, 0.9);
  assert.equal(feats.elevation_m, patna.elevationM);
});
