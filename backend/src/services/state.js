/** Latest-snapshot cache the dashboard reads from (kept alongside the durable Mongo history). */
export const appState = {
  lastRun: null,
  regionRisks: [], // [{regionId,name,lat,lng,risk:{...},weather,river,evacPopulation}]
  hotspots: [],
  posts: [], // most recent analyzed batch (bounded)
  alerts: [], // active + recent
  allocation: { plan: [], committed: {}, poolsRemaining: [] },
  mlOnline: false,
  ticks: 0,
  usingLiveWeather: false,
  usingLiveSocial: false,
};

export function pushBounded(arr, items, cap) {
  arr.push(...items);
  if (arr.length > cap) arr.splice(0, arr.length - cap);
  return arr;
}
