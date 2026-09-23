/**
 * Monitored districts (representative flood-prone regions, as per the project scope).
 *
 * dangerLevelM     official danger mark of the gauge station (metres)
 * baseLevelM       typical dry-season gauge reading
 * evacPopulation   people living in the low-lying zone that would need to be moved at "Severe"
 * hotspots         offsets (km-ish, expressed in degrees) around which citizen distress clusters form
 */
export const REGIONS = [
  { id: 'patna', name: 'Patna', state: 'Bihar', river: 'Ganga', lat: 25.5941, lng: 85.1376, elevationM: 53, dangerLevelM: 50.45, baseLevelM: 46.0, evacPopulation: 38000 },
  { id: 'muzaffarpur', name: 'Muzaffarpur', state: 'Bihar', river: 'Burhi Gandak', lat: 26.1209, lng: 85.3647, elevationM: 52, dangerLevelM: 52.5, baseLevelM: 48.2, evacPopulation: 26000 },
  { id: 'darbhanga', name: 'Darbhanga', state: 'Bihar', river: 'Kamla Balan', lat: 26.1542, lng: 85.8918, elevationM: 50, dangerLevelM: 48.9, baseLevelM: 44.5, evacPopulation: 22000 },
  { id: 'guwahati', name: 'Guwahati (Kamrup Metro)', state: 'Assam', river: 'Brahmaputra', lat: 26.1445, lng: 91.7362, elevationM: 55, dangerLevelM: 49.68, baseLevelM: 45.0, evacPopulation: 30000 },
  { id: 'dibrugarh', name: 'Dibrugarh', state: 'Assam', river: 'Brahmaputra', lat: 27.4728, lng: 94.912, elevationM: 104, dangerLevelM: 104.7, baseLevelM: 100.2, evacPopulation: 18000 },
  { id: 'gorakhpur', name: 'Gorakhpur', state: 'Uttar Pradesh', river: 'Rapti', lat: 26.7606, lng: 83.3732, elevationM: 84, dangerLevelM: 77.0, baseLevelM: 72.6, evacPopulation: 24000 },
  { id: 'cuttack', name: 'Cuttack', state: 'Odisha', river: 'Mahanadi', lat: 20.4625, lng: 85.883, elevationM: 27, dangerLevelM: 26.2, baseLevelM: 22.0, evacPopulation: 27000 },
  { id: 'ghaziabad', name: 'Ghaziabad', state: 'Uttar Pradesh', river: 'Hindon', lat: 28.6692, lng: 77.4538, elevationM: 214, dangerLevelM: 204.5, baseLevelM: 200.2, evacPopulation: 14000 },
];

/** Neighbourhood-scale hotspot centres used by the simulated citizen/social feed. */
export const HOTSPOT_OFFSETS = [
  { dLat: 0.022, dLng: -0.018 },
  { dLat: -0.03, dLng: 0.025 },
  { dLat: 0.005, dLng: 0.04 },
];

export const getRegion = (id) => REGIONS.find((r) => r.id === id);
