const R = 6371;
const rad = (d) => (d * Math.PI) / 180;

/** Great-circle distance in km. */
export function haversineKm(lat1, lng1, lat2, lng2) {
  const dLat = rad(lat2 - lat1);
  const dLng = rad(lng2 - lng1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(rad(lat1)) * Math.cos(rad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(a)));
}

/** Approximate road distance: straight line inflated by a typical circuity factor. */
export function roadKm(lat1, lng1, lat2, lng2) {
  return haversineKm(lat1, lng1, lat2, lng2) * 1.35;
}

export function nearest(list, lat, lng, maxKm = Infinity) {
  let best = null;
  let bestD = Infinity;
  for (const item of list) {
    const d = haversineKm(lat, lng, item.lat, item.lng);
    if (d < bestD) {
      best = item;
      bestD = d;
    }
  }
  return best && bestD <= maxKm ? { item: best, distanceKm: bestD } : null;
}
