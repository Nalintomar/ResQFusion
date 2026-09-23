import { config } from '../config/index.js';

async function post(path, body) {
  const res = await fetch(`${config.mlUrl}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(config.mlTimeoutMs),
  });
  if (!res.ok) throw new Error(`ML service ${path} -> ${res.status}`);
  return res.json();
}

export const mlClient = {
  health: () => fetch(`${config.mlUrl}/health`, { signal: AbortSignal.timeout(2500) }).then((r) => r.ok),
  metrics: () => fetch(`${config.mlUrl}/metrics`, { signal: AbortSignal.timeout(4000) }).then((r) => r.json()),
  predictBatch: (items) => post('/predict/batch', { items }),
  nlpProcess: (posts, opts = {}) => post('/nlp/process', { posts, ...opts }),
  retrain: () => post('/train', {}),
};
