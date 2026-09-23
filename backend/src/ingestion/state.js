/** Tiny shared-state module so the sensor simulator can read the weather simulator's rain intensity. */
import { REGIONS } from '../data/regions.js';
import { makeRng } from '../utils/rng.js';
import { config } from '../config/index.js';

const rng = makeRng(config.simSeed + 11);
export const intensityMap = new Map(REGIONS.map((r) => [r.id, rng.range(0.15, 0.35)]));
export const intensityOf = (id) => intensityMap.get(id);
