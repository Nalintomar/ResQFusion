import { MapContainer, TileLayer, CircleMarker, Tooltip, Circle } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';

const SEV_COLOR = { Low: '#35d0c4', Moderate: '#e8c14e', High: '#ff9a4d', Severe: '#ff5470', Unknown: '#5f7099' };

export default function RiskMap({ regions, hotspots }) {
  return (
    <MapContainer
      center={[24.8, 87.5]}
      zoom={5}
      style={{ height: '100%', width: '100%', borderRadius: 'var(--radius-lg)' }}
      scrollWheelZoom
    >
      <TileLayer
        attribution="&copy; OpenStreetMap contributors"
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />
      {regions.map((r) => (
        <CircleMarker
          key={r.regionId}
          center={[r.lat, r.lng]}
          radius={10 + (r.riskScore ?? 0) * 22}
          pathOptions={{ color: SEV_COLOR[r.severity] ?? SEV_COLOR.Unknown, fillColor: SEV_COLOR[r.severity] ?? SEV_COLOR.Unknown, fillOpacity: 0.45, weight: 2 }}
        >
          <Tooltip direction="top">
            <div style={{ fontFamily: 'sans-serif', fontSize: 12 }}>
              <strong>{r.name}</strong> ({r.state})
              <br />
              Severity: {r.severity} &middot; risk {Math.round((r.riskScore ?? 0) * 100)}%
              <br />
              River gauge: {r.riverRatio != null ? `${Math.round(r.riverRatio * 100)}% of danger mark` : 'n/a'}
              <br />
              24h rain: {r.rain24h ?? '—'} mm
            </div>
          </Tooltip>
        </CircleMarker>
      ))}
      {hotspots.map((h) => (
        <Circle
          key={h.id}
          center={[h.lat, h.lng]}
          radius={Math.max(400, h.radius_km * 1000)}
          pathOptions={{ color: '#ff5470', fillColor: '#ff5470', fillOpacity: 0.25, dashArray: '4 4', weight: 1.5 }}
        >
          <Tooltip direction="top">
            <div style={{ fontFamily: 'sans-serif', fontSize: 12 }}>
              <strong>Distress cluster {h.id}</strong>
              <br />
              {h.count} report(s) &middot; urgency {Math.round(h.mean_urgency * 100)}%
              <br />
              {h.top_categories.join(', ') || 'unclassified'}
            </div>
          </Tooltip>
        </Circle>
      ))}
    </MapContainer>
  );
}
