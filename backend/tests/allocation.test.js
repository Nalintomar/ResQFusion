import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildZones, allocate } from '../src/services/allocation.js';

const regionRisks = [
  { regionId: 'a', name: 'Zone A', lat: 25.6, lng: 85.1, evacPopulation: 10000, risk: { risk_score: 0.9, likelihood: 0.95, severity_label: 'Severe' } },
  { regionId: 'b', name: 'Zone B', lat: 26.6, lng: 91.1, evacPopulation: 8000, risk: { risk_score: 0.1, likelihood: 0.05, severity_label: 'Low' } },
];

const resources = [
  { id: 'sh1', type: 'shelter', name: 'Shelter near A', lat: 25.61, lng: 85.11, quantity: 500, committed: 0 },
  { id: 'sh2', type: 'shelter', name: 'Shelter far away', lat: 30.0, lng: 79.0, quantity: 5000, committed: 0 },
  { id: 'am1', type: 'ambulance', name: 'Ambulance near A', lat: 25.62, lng: 85.12, quantity: 2, committed: 0 },
];

test('buildZones ranks the higher-risk region first', () => {
  const zones = buildZones(regionRisks);
  assert.equal(zones[0].id, 'a');
  assert.ok(zones[0].needScore > zones[1].needScore);
});

test('allocate prefers the nearer resource before a farther one with more stock', () => {
  const zones = buildZones(regionRisks);
  const { plan } = allocate(zones, resources);
  const shelterAllocs = plan.filter((p) => p.zoneId === 'a' && p.type === 'shelter' && p.resourceId);
  assert.equal(shelterAllocs[0].resourceId, 'sh1');
});

test('allocate reports a shortfall when no resource of a type is in range', () => {
  const zones = buildZones([{ regionId: 'c', name: 'Zone C', lat: -1, lng: -1, evacPopulation: 50000, risk: { risk_score: 0.95, likelihood: 0.9, severity_label: 'Severe' } }]);
  const { plan } = allocate(zones, resources, { maxDistanceKm: 5 });
  const shortfall = plan.find((p) => p.type === 'shelter' && p.shortfall > 0);
  assert.ok(shortfall);
});

test('allocate never commits more than a resource has available', () => {
  const zones = buildZones(regionRisks);
  const { plan } = allocate(zones, resources);
  const total = plan.filter((p) => p.resourceId === 'am1').reduce((a, p) => a + p.quantity, 0);
  assert.ok(total <= 2);
});
