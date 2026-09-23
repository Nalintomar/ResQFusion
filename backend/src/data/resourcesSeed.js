/**
 * Seeded inventory (Scope: allocation is demonstrated on sample data, not live government systems).
 * type: shelter (quantity = seats) | ambulance (units) | volunteer (teams) | relief (kits)
 */
const S = (id, name, lat, lng, quantity) => ({ id, type: 'shelter', name, lat, lng, quantity });
const A = (id, name, lat, lng, quantity) => ({ id, type: 'ambulance', name, lat, lng, quantity });
const V = (id, name, lat, lng, quantity) => ({ id, type: 'volunteer', name, lat, lng, quantity });
const R = (id, name, lat, lng, quantity) => ({ id, type: 'relief', name, lat, lng, quantity });

export const RESOURCE_SEED = [
  // Shelters
  S('sh-patna-1', 'Patna Govt. School Complex', 25.6122, 85.1581, 5200),
  S('sh-patna-2', 'Gandhi Maidan Relief Camp', 25.6187, 85.1445, 4200),
  S('sh-muz-1', 'Muzaffarpur Town Hall', 26.1102, 85.3921, 3800),
  S('sh-dar-1', 'Darbhanga Community Hall', 26.1621, 85.9011, 3000),
  S('sh-guw-1', 'Khanapara Indoor Stadium', 26.1298, 91.8021, 4800),
  S('sh-guw-2', 'Dispur Higher Secondary School', 26.1433, 91.7898, 2600),
  S('sh-dib-1', 'Dibrugarh University Hostel', 27.4884, 94.9066, 2400),
  S('sh-gor-1', 'Gorakhpur Polytechnic', 26.7481, 83.3925, 3600),
  S('sh-cut-1', 'Barabati Stadium Shelter', 20.4744, 85.8664, 5000),
  S('sh-gzb-1', 'Ghaziabad Nagar Nigam Hall', 28.6641, 77.4402, 2200),
  S('sh-bhu-1', 'Bhubaneswar Kalinga Stadium', 20.2953, 85.8253, 6000),

  // Ambulances / medical units
  A('am-patna-1', 'Patna PMCH Ambulance Pool', 25.6202, 85.1631, 6),
  A('am-patna-2', 'AIIMS Patna Emergency Unit', 25.5588, 85.0477, 4),
  A('am-muz-1', 'SKMCH Muzaffarpur Unit', 26.1148, 85.3845, 5),
  A('am-dar-1', 'DMCH Darbhanga Unit', 26.1751, 85.9041, 4),
  A('am-guw-1', 'GMCH Guwahati Ambulance Pool', 26.1364, 91.7772, 7),
  A('am-dib-1', 'AMCH Dibrugarh Unit', 27.4762, 94.9231, 3),
  A('am-gor-1', 'BRD Medical College Unit', 26.7328, 83.4361, 5),
  A('am-cut-1', 'SCB Medical Cuttack Unit', 20.4749, 85.8735, 6),
  A('am-gzb-1', 'MMG Hospital Ghaziabad Unit', 28.6702, 77.4383, 3),
  A('am-del-1', 'Delhi 108 Reserve Fleet', 28.6139, 77.209, 6),

  // Volunteer / rescue teams
  V('vo-patna-1', 'NDRF Battalion 9, Patna', 25.5734, 85.0921, 8),
  V('vo-patna-2', 'Red Cross Volunteers, Patna', 25.6012, 85.1444, 5),
  V('vo-muz-1', 'SDRF Muzaffarpur Team', 26.1339, 85.3706, 6),
  V('vo-dar-1', 'NGO Rescue Collective, Darbhanga', 26.1488, 85.8794, 5),
  V('vo-guw-1', 'NDRF Battalion 1, Guwahati', 26.1801, 91.7492, 9),
  V('vo-dib-1', 'SDRF Assam Dibrugarh Camp', 27.4603, 94.9188, 5),
  V('vo-gor-1', 'Civil Defence Gorakhpur', 26.7722, 83.3654, 6),
  V('vo-cut-1', 'ODRAF Unit, Cuttack', 20.4518, 85.8792, 8),
  V('vo-gzb-1', 'NDRF Battalion 8, Ghaziabad', 28.6809, 77.4681, 7),
  V('vo-bhu-1', 'ODRAF Reserve, Bhubaneswar', 20.3012, 85.8189, 6),

  // Relief material depots (kits: dry ration + water + hygiene, one kit per household)
  R('re-patna-1', 'FCI Godown Patna', 25.6455, 85.1021, 3200),
  R('re-muz-1', 'District Relief Depot Muzaffarpur', 26.0932, 85.3411, 2400),
  R('re-dar-1', 'Darbhanga Civil Supplies', 26.1298, 85.9234, 2000),
  R('re-guw-1', 'Guwahati Central Warehouse', 26.1601, 91.7021, 3600),
  R('re-dib-1', 'Dibrugarh Relief Store', 27.4805, 94.9432, 1800),
  R('re-gor-1', 'Gorakhpur FCI Depot', 26.7811, 83.3489, 2600),
  R('re-cut-1', 'Odisha State Relief Store, Cuttack', 20.4392, 85.9082, 3400),
  R('re-gzb-1', 'Ghaziabad Relief Depot', 28.6543, 77.4211, 1800),
  R('re-lko-1', 'Lucknow Regional Reserve', 26.8467, 80.9462, 4000),
];
