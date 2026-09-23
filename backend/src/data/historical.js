import { makeRng } from '../utils/rng.js';
import { REGIONS } from './regions.js';

/**
 * Historical disaster records (source #4 - open government datasets such as data.gov.in / IMD).
 *
 * The real datasets have inconsistent layouts, so the prototype ships a deterministic SAMPLE that
 * follows the same shape: one row per region-year with peak flood severity. Swap `loadHistorical()`
 * for a CSV/JSON loader over the real files when they are available.
 */
const TENDENCY = {
  patna: 0.55, muzaffarpur: 0.6, darbhanga: 0.7, guwahati: 0.5,
  dibrugarh: 0.55, gorakhpur: 0.45, cuttack: 0.5, ghaziabad: 0.15,
};

export function loadHistorical(fromYear = 2012, toYear = 2025) {
  const rng = makeRng(99);
  const rows = [];
  for (const r of REGIONS) {
    for (let y = fromYear; y <= toYear; y += 1) {
      const p = TENDENCY[r.id] ?? 0.3;
      const roll = rng.next();
      const severity = roll > 1 - p * 0.28 ? 3 : roll > 1 - p * 0.55 ? 2 : roll > 1 - p ? 1 : 0;
      rows.push({
        regionId: r.id,
        year: y,
        severity,
        peakRiverRatio: Number((0.6 + severity * 0.22 + rng.range(-0.05, 0.08)).toFixed(2)),
        affectedPeople: severity === 0 ? 0 : Math.round(r.evacPopulation * [0, 0.25, 0.9, 2.2][severity] * rng.range(0.7, 1.3)),
        source: 'sample (replace with data.gov.in / IMD records)',
      });
    }
  }
  return rows;
}

/** Share of historical years with a High/Severe event -> a 0..1 prior for the region. */
export function historicalPriors(rows = loadHistorical()) {
  const out = {};
  for (const r of REGIONS) {
    const mine = rows.filter((x) => x.regionId === r.id);
    const bad = mine.filter((x) => x.severity >= 2).length;
    out[r.id] = {
      years: mine.length,
      highOrSevereYears: bad,
      prior: mine.length ? Number((bad / mine.length).toFixed(3)) : 0,
      worstYear: mine.reduce((w, x) => (x.severity > (w?.severity ?? -1) ? x : w), null)?.year ?? null,
    };
  }
  return out;
}
