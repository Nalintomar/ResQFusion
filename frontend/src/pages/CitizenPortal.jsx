import { useEffect, useState } from 'react';
import { Send, MapPin, Siren, CheckCircle2, Loader2 } from 'lucide-react';
import { api } from '../api/client.js';
import SeverityBadge from '../components/SeverityBadge.jsx';

export default function CitizenPortal() {
  const [text, setText] = useState('');
  const [coords, setCoords] = useState(null);
  const [locating, setLocating] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');
  const [alerts, setAlerts] = useState([]);

  useEffect(() => {
    refreshAlerts();
    const t = setInterval(refreshAlerts, 10000);
    return () => clearInterval(t);
  }, [coords]);

  async function refreshAlerts() {
    try {
      const params = coords ? `?lat=${coords.lat}&lng=${coords.lng}&radiusKm=80` : '';
      const { alerts } = await api.citizenAlerts(params);
      setAlerts(alerts);
    } catch {
      /* best-effort */
    }
  }

  function useMyLocation() {
    if (!navigator.geolocation) return setError('Location is not available in this browser.');
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setCoords({ lat: pos.coords.latitude, lng: pos.coords.longitude });
        setLocating(false);
      },
      () => {
        setError('Could not get your location. You can still submit a text-only report.');
        setLocating(false);
      },
      { timeout: 8000 },
    );
  }

  async function submit(e) {
    e.preventDefault();
    if (!text.trim()) return;
    setSubmitting(true);
    setError('');
    setResult(null);
    try {
      const { report } = await api.citizenReport({ text, lat: coords?.lat, lng: coords?.lng });
      setResult(report);
      setText('');
      refreshAlerts();
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div style={{ maxWidth: 880, margin: '0 auto', padding: '32px 20px', display: 'flex', flexDirection: 'column', gap: 24 }}>
      <div>
        <h2 style={{ fontSize: 24, marginBottom: 6 }}>Report what you're seeing</h2>
        <p style={{ color: 'var(--text-dim)', fontSize: 14, maxWidth: 560 }}>
          A short description and, if you can, your location — this reaches relief coordinators
          within seconds and helps route rescue teams and supplies to where they're needed most.
        </p>
      </div>

      <form onSubmit={submit} className="card" style={{ padding: 24 }}>
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="e.g. Water has entered our lane near the old market, two families with young children are on the first floor"
          rows={4}
          required
          style={{
            width: '100%',
            padding: 14,
            borderRadius: 10,
            border: '1px solid var(--panel-border)',
            background: 'var(--bg)',
            color: 'var(--text)',
            fontSize: 14,
            resize: 'vertical',
            fontFamily: 'var(--font-body)',
          }}
        />

        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 14 }}>
          <button
            type="button"
            onClick={useMyLocation}
            style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, color: coords ? 'var(--sev-low)' : 'var(--text-dim)' }}
          >
            {locating ? <Loader2 size={15} className="spin" /> : <MapPin size={15} />}
            {coords ? `Location attached (${coords.lat.toFixed(3)}, ${coords.lng.toFixed(3)})` : 'Attach my location'}
          </button>

          <button
            type="submit"
            disabled={submitting}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              padding: '10px 20px',
              borderRadius: 8,
              background: 'var(--accent)',
              color: '#1a0f08',
              fontWeight: 700,
              fontSize: 14,
              opacity: submitting ? 0.7 : 1,
            }}
          >
            <Send size={15} /> {submitting ? 'Sending…' : 'Send report'}
          </button>
        </div>

        {error && <p style={{ color: 'var(--sev-severe)', fontSize: 13, marginTop: 12 }}>{error}</p>}

        {result && (
          <div style={{ marginTop: 16, padding: 14, borderRadius: 10, background: 'var(--bg-raised)', border: '1px solid var(--panel-border)', display: 'flex', gap: 10 }}>
            <CheckCircle2 size={18} color="var(--sev-low)" style={{ flexShrink: 0, marginTop: 1 }} />
            <div>
              <p style={{ fontSize: 13 }}>
                Report received{result.label ? `, classified as ${result.label.replace('_', ' ')}` : ''}
                {result.urgency != null ? ` (urgency ${Math.round(result.urgency * 100)}%)` : ''}.
              </p>
              <p style={{ fontSize: 12, color: 'var(--text-faint)', marginTop: 4 }}>
                Coordinators can see this immediately on the district dashboard.
              </p>
            </div>
          </div>
        )}
      </form>

      <div className="card" style={{ padding: 24 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
          <Siren size={17} color="var(--accent)" />
          <h3 style={{ fontSize: 15 }}>Alerts near you</h3>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {alerts.map((a) => (
            <div key={a.id} style={{ display: 'flex', gap: 12, fontSize: 13.5 }}>
              <SeverityBadge severity={a.severity} />
              <div>
                <p>{a.message}</p>
                <p style={{ fontSize: 11, color: 'var(--text-faint)', marginTop: 3 }}>{new Date(a.createdAt).toLocaleString()}</p>
              </div>
            </div>
          ))}
          {alerts.length === 0 && (
            <p style={{ fontSize: 13, color: 'var(--text-faint)' }}>
              No active alerts {coords ? 'in your area' : 'right now'}. Attach your location for area-specific alerts.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
