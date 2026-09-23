import { roadKm } from '../utils/geo.js';

/**
 * Resource Allocation Engine (Objective 5).
 *
 * Need score per zone (region-level risk, or an NLP hotspot) blends:
 *   - predicted risk_score from the ML service (likelihood x expected severity)
 *   - people potentially affected (region evac population, or hotspot post count as a proxy)
 *   - live distress signal (hotspot mean_urgency), when available
 *
 * Allocation strategy: GREEDY NEAREST-NEED-FIRST (as named in the synopsis, Section 4.4) —
 *   1. Sort zones by need score, most urgent first.
 *   2. For each resource type, walk resources in order of road-distance to the zone and commit
 *      whatever is available (up to the zone's estimated requirement) before moving to the next
 *      zone. Already-committed stock is not double-booked.
 * This is a heuristic, not globally optimal; `future scope` in the synopsis names linear
 * programming as the natural upgrade, which `lpCompare()` sketches for the evaluation report.
 */

const REQUIREMENT_PER_PERSON = {
  shelter: 1, // seats needed ~ 1 per affected person (household-adjusted upstream)
  relief: 0.28, // one kit covers ~3.5 people
  ambulance: 0.0012, // ~1 unit per ~800 affected people needing medical support
  volunteer: 0.0006, // ~1 team per ~1600 affected people
};

export function buildZones(regionRisks, hotspots = []) {
  const zones = regionRisks.map((r) => ({
    id: r.regionId,
    kind: 'region',
    name: r.name,
    lat: r.lat,
    lng: r.lng,
    riskScore: r.risk?.risk_score ?? 0,
    severityLabel: r.risk?.severity_label ?? 'Low',
    affected: Math.round((r.evacPopulation ?? 0) * (r.risk?.risk_score ?? 0)),
    urgency: r.risk?.likelihood ?? 0,
  }));

  for (const h of hotspots) {
    zones.push({
      id: h.id,
      kind: 'hotspot',
      name: `Distress cluster ${h.id}`,
      lat: h.lat,
      lng: h.lng,
      riskScore: h.hotspot_score,
      severityLabel: h.hotspot_score > 0.7 ? 'Severe' : h.hotspot_score > 0.4 ? 'High' : 'Moderate',
      affected: Math.max(20, h.count * 12), // crude proxy: each distress post implies a small cluster of people
      urgency: h.mean_urgency,
    });
  }

  return zones
    .map((z) => ({ ...z, needScore: Number((0.65 * z.riskScore + 0.35 * z.urgency).toFixed(4)) }))
    .sort((a, b) => b.needScore - a.needScore);
}

export function allocate(zones, resources, { maxDistanceKm = 250 } = {}) {
  const pools = resources.map((r) => ({ ...r, available: Math.max(0, r.quantity - (r.committed ?? 0)) }));
  const plan = [];

  for (const zone of zones) {
    if (zone.needScore <= 0.05) continue;
    const need = {
      shelter: Math.ceil(zone.affected * REQUIREMENT_PER_PERSON.shelter),
      relief: Math.ceil(zone.affected * REQUIREMENT_PER_PERSON.relief),
      ambulance: Math.max(zone.severityLabel === 'Severe' ? 1 : 0, Math.ceil(zone.affected * REQUIREMENT_PER_PERSON.ambulance)),
      volunteer: Math.max(zone.severityLabel === 'Severe' ? 1 : 0, Math.ceil(zone.affected * REQUIREMENT_PER_PERSON.volunteer)),
    };

    for (const type of Object.keys(need)) {
      let remaining = need[type];
      if (remaining <= 0) continue;
      const candidates = pools
        .filter((p) => p.type === type && p.available > 0)
        .map((p) => ({ p, distanceKm: roadKm(zone.lat, zone.lng, p.lat, p.lng) }))
        .filter((c) => c.distanceKm <= maxDistanceKm)
        .sort((a, b) => a.distanceKm - b.distanceKm);

      for (const { p, distanceKm } of candidates) {
        if (remaining <= 0) break;
        const take = Math.min(p.available, remaining);
        if (take <= 0) continue;
        p.available -= take;
        remaining -= take;
        plan.push({
          zoneId: zone.id,
          zoneName: zone.name,
          zoneKind: zone.kind,
          needScore: zone.needScore,
          resourceId: p.id,
          resourceName: p.name,
          type,
          quantity: take,
          distanceKm: Number(distanceKm.toFixed(1)),
        });
      }
      if (remaining > 0) {
        plan.push({
          zoneId: zone.id,
          zoneName: zone.name,
          zoneKind: zone.kind,
          needScore: zone.needScore,
          resourceId: null,
          resourceName: null,
          type,
          quantity: 0,
          shortfall: remaining,
          distanceKm: null,
        });
      }
    }
  }

  const committed = {};
  for (const p of plan) {
    if (p.resourceId) committed[p.resourceId] = (committed[p.resourceId] ?? 0) + p.quantity;
  }
  return { plan, committed, poolsRemaining: pools };
}

/**
 * Sketches the greedy heuristic against a relaxed linear-programming-style bound (max coverage
 * assuming stock could be split fractionally with zero distance penalty), so the evaluation report
 * (Objective 8 / Section 4.4 "future scope") can quote a coverage gap instead of only a plan.
 */
export function lpUpperBoundCoverage(zones, resources) {
  const totalsByType = {};
  for (const r of resources) totalsByType[r.type] = (totalsByType[r.type] ?? 0) + Math.max(0, r.quantity - (r.committed ?? 0));
  let totalNeed = 0;
  let totalSupplyValue = 0;
  for (const zone of zones) {
    if (zone.needScore <= 0.05) continue;
    const need = zone.affected * REQUIREMENT_PER_PERSON.shelter;
    totalNeed += need;
  }
  totalSupplyValue = totalsByType.shelter ?? 0;
  return {
    metric: 'shelter seats',
    totalNeed: Math.round(totalNeed),
    totalSupply: totalSupplyValue,
    lpBoundCoveragePct: totalNeed ? Number((Math.min(1, totalSupplyValue / totalNeed) * 100).toFixed(1)) : 100,
  };
}
