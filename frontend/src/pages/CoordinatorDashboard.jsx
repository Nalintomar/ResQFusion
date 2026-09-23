import { useEffect, useState, useCallback } from 'react';
import { LayoutGrid, Map, Siren, MessageSquareWarning, Boxes, RefreshCw } from 'lucide-react';
import { LineChart, Line, XAxis, YAxis, Tooltip as ChartTooltip, ResponsiveContainer, CartesianGrid } from 'recharts';
import { api } from '../api/client.js';
import RiskMap from '../components/RiskMap.jsx';
import SeverityBadge from '../components/SeverityBadge.jsx';

const TABS = [
  { id: 'overview', label: 'Overview', icon: LayoutGrid },
  { id: 'map', label: 'Risk map', icon: Map },
  { id: 'alerts', label: 'Alerts', icon: Siren },
  { id: 'nlp', label: 'Distress & NLP', icon: MessageSquareWarning },
  { id: 'resources', label: 'Resources & allocation', icon: Boxes },
];

export default function CoordinatorDashboard({ session, onUnauthorized }) {
  const [tab, setTab] = useState('overview');
  const [summary, setSummary] = useState(null);
  const [hotspots, setHotspots] = useState([]);
  const [alerts, setAlerts] = useState([]);
  const [posts, setPosts] = useState([]);
  const [allocation, setAllocation] = useState(null);
  const [resources, setResources] = useState(null);
  const [history, setHistory] = useState([]);
  const [err, setErr] = useState('');
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      const [s, h, a, p, al, rs, hist] = await Promise.all([
        api.summary(),
        api.hotspots(),
        api.alerts(),
        api.posts('?limit=40'),
        api.allocation(),
        api.resources(),
        api.history('?limit=40'),
      ]);
      setSummary(s);
      setHotspots(h.hotspots);
      setAlerts(a.alerts);
      setPosts(p.posts);
      setAllocation(al);
      setResources(rs);
      setHistory(hist.series);
      setErr('');
    } catch (e) {
      if (String(e.message).includes('401') || String(e.message).includes('token')) onUnauthorized();
      setErr(e.message);
    }
  }, [onUnauthorized]);

  useEffect(() => {
    load();
    const t = setInterval(load, 8000);
    return () => clearInterval(t);
  }, [load]);

  async function runNow() {
    setRefreshing(true);
    try {
      await api.runPipeline();
      await load();
    } catch (e) {
      setErr(e.message);
    } finally {
      setRefreshing(false);
    }
  }

  return (
    <div style={{ display: 'flex', minHeight: 'calc(100vh - 110px)' }}>
      <nav
        style={{
          width: 220,
          borderRight: '1px solid var(--panel-border)',
          background: 'var(--bg-raised)',
          padding: '20px 12px',
          display: 'flex',
          flexDirection: 'column',
          gap: 4,
        }}
      >
        {TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              padding: '10px 12px',
              borderRadius: 8,
              fontSize: 13,
              fontWeight: 600,
              textAlign: 'left',
              background: tab === t.id ? 'var(--panel)' : 'transparent',
              color: tab === t.id ? 'var(--text)' : 'var(--text-dim)',
            }}
          >
            <t.icon size={16} /> {t.label}
          </button>
        ))}

        <div style={{ flex: 1 }} />

        <div style={{ padding: 12, fontSize: 11, color: 'var(--text-faint)', fontFamily: 'var(--font-mono)' }}>
          <StatusDot ok={summary?.mlOnline} label={summary?.mlOnline ? 'ML service online' : 'ML service offline'} />
          <p style={{ marginTop: 8 }}>
            {summary?.usingLiveWeather ? 'Live weather feed' : 'Simulated weather feed'}
            <br />
            {summary?.usingLiveSocial ? 'Live social feed' : 'Simulated social feed'}
          </p>
          <p style={{ marginTop: 8 }}>Cycle #{summary?.ticks ?? '—'}</p>
        </div>
        <button
          onClick={runNow}
          disabled={refreshing}
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 8,
            padding: '9px 0',
            borderRadius: 8,
            background: 'var(--panel)',
            border: '1px solid var(--panel-border)',
            fontSize: 12,
            color: 'var(--text)',
          }}
        >
          <RefreshCw size={14} className={refreshing ? 'spin' : ''} /> Run pipeline now
        </button>
      </nav>

      <div style={{ flex: 1, padding: 24, overflowY: 'auto' }}>
        {err && <div style={{ color: 'var(--sev-severe)', marginBottom: 16, fontSize: 13 }}>{err}</div>}

        {tab === 'overview' && summary && (
          <Overview summary={summary} alerts={alerts} hotspots={hotspots} history={history} />
        )}
        {tab === 'map' && summary && (
          <div className="card" style={{ height: '75vh', padding: 8 }}>
            <RiskMap regions={summary.regionRisks} hotspots={hotspots} />
          </div>
        )}
        {tab === 'alerts' && <AlertsTab alerts={alerts} />}
        {tab === 'nlp' && <NlpTab hotspots={hotspots} posts={posts} />}
        {tab === 'resources' && <ResourcesTab allocation={allocation} resources={resources} />}
      </div>
    </div>
  );
}

function StatusDot({ ok, label }) {
  return (
    <span style={{ display: 'flex', alignItems: 'center', gap: 6, color: ok ? 'var(--sev-low)' : 'var(--sev-severe)' }}>
      <span style={{ position: 'relative', width: 7, height: 7, borderRadius: 999, background: 'currentColor' }} className="pulse-dot" />
      {label}
    </span>
  );
}

function Overview({ summary, alerts, hotspots, history }) {
  const cards = [
    { label: 'Monitored regions', value: summary.regionCount },
    { label: 'High / Severe regions', value: summary.highOrSevereRegions, tone: summary.highOrSevereRegions > 0 ? 'severe' : 'calm' },
    { label: 'Active alerts', value: summary.activeAlerts, tone: summary.activeAlerts > 0 ? 'accent' : 'calm' },
    { label: 'Distress hotspots', value: summary.hotspotCount, tone: summary.hotspotCount > 0 ? 'accent' : 'calm' },
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16 }}>
        {cards.map((c) => (
          <div key={c.label} className="card" style={{ padding: '18px 20px' }}>
            <p style={{ fontSize: 12, color: 'var(--text-dim)', marginBottom: 8 }}>{c.label}</p>
            <p style={{ fontSize: 30, fontFamily: 'var(--font-display)', fontWeight: 700, color: c.tone === 'severe' ? 'var(--sev-severe)' : c.tone === 'accent' ? 'var(--accent)' : 'var(--text)' }}>
              {c.value}
            </p>
          </div>
        ))}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1.4fr 1fr', gap: 16 }}>
        <div className="card" style={{ padding: 20 }}>
          <h3 style={{ fontSize: 14, marginBottom: 12, color: 'var(--text-dim)' }}>Average risk score, last {history.length} cycles</h3>
          <ResponsiveContainer width="100%" height={220}>
            <LineChart data={history}>
              <CartesianGrid stroke="var(--panel-border)" strokeDasharray="3 3" />
              <XAxis dataKey="lastRun" tick={false} stroke="var(--text-faint)" />
              <YAxis domain={[0, 1]} stroke="var(--text-faint)" tick={{ fontSize: 11 }} />
              <ChartTooltip
                contentStyle={{ background: 'var(--bg-raised)', border: '1px solid var(--panel-border)', borderRadius: 8, fontSize: 12 }}
                formatter={(v) => [v, 'avg risk score']}
                labelFormatter={(l) => new Date(l).toLocaleTimeString()}
              />
              <Line type="monotone" dataKey="avgRiskScore" stroke="var(--accent)" strokeWidth={2} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>

        <div className="card" style={{ padding: 20 }}>
          <h3 style={{ fontSize: 14, marginBottom: 12, color: 'var(--text-dim)' }}>Latest alerts</h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, maxHeight: 220, overflowY: 'auto' }}>
            {alerts.slice(0, 6).map((a) => (
              <div key={a.id} style={{ display: 'flex', gap: 10, fontSize: 12.5 }}>
                <SeverityBadge severity={a.severity} />
                <span style={{ color: 'var(--text-dim)' }}>{a.message}</span>
              </div>
            ))}
            {alerts.length === 0 && <p style={{ fontSize: 12.5, color: 'var(--text-faint)' }}>No active alerts. All monitored regions are calm.</p>}
          </div>
        </div>
      </div>

      <div className="card" style={{ padding: 20 }}>
        <h3 style={{ fontSize: 14, marginBottom: 12, color: 'var(--text-dim)' }}>Region risk snapshot</h3>
        <RiskTable regions={summary.regionRisks} />
      </div>
    </div>
  );
}

function RiskTable({ regions }) {
  return (
    <div style={{ overflowX: 'auto' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
        <thead>
          <tr style={{ textAlign: 'left', color: 'var(--text-faint)', fontSize: 11, textTransform: 'none' }}>
            <th style={th}>Region</th>
            <th style={th}>Severity</th>
            <th style={th}>Risk score</th>
            <th style={th}>Likelihood</th>
            <th style={th}>24h rain</th>
            <th style={th}>River gauge</th>
            <th style={th}>Historical prior</th>
          </tr>
        </thead>
        <tbody>
          {regions.map((r) => (
            <tr key={r.regionId} style={{ borderTop: '1px solid var(--panel-border)' }}>
              <td style={td}>
                <div style={{ fontWeight: 600 }}>{r.name}</div>
                <div style={{ fontSize: 11, color: 'var(--text-faint)' }}>{r.state} &middot; {r.river}</div>
              </td>
              <td style={td}><SeverityBadge severity={r.severity} /></td>
              <td style={td} className="mono">{r.riskScore != null ? `${Math.round(r.riskScore * 100)}%` : '—'}</td>
              <td style={td} className="mono">{r.likelihood != null ? `${Math.round(r.likelihood * 100)}%` : '—'}</td>
              <td style={td} className="mono">{r.rain24h != null ? `${r.rain24h} mm` : '—'}</td>
              <td style={td} className="mono">{r.riverRatio != null ? `${Math.round(r.riverRatio * 100)}%` : '—'}</td>
              <td style={td} className="mono">{r.historicalPrior != null ? `${Math.round(r.historicalPrior * 100)}%` : '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function AlertsTab({ alerts }) {
  return (
    <div className="card" style={{ padding: 20 }}>
      <h3 style={{ fontSize: 14, marginBottom: 14, color: 'var(--text-dim)' }}>Active alerts ({alerts.length})</h3>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {alerts.map((a) => (
          <div key={a.id} style={{ display: 'flex', gap: 14, padding: 14, borderRadius: 10, background: 'var(--bg-raised)', border: '1px solid var(--panel-border)' }}>
            <SeverityBadge severity={a.severity} />
            <div style={{ flex: 1 }}>
              <p style={{ fontSize: 13.5 }}>{a.message}</p>
              <p style={{ fontSize: 11, color: 'var(--text-faint)', marginTop: 4 }}>
                {a.type} &middot; {new Date(a.createdAt).toLocaleString()}
              </p>
            </div>
          </div>
        ))}
        {alerts.length === 0 && <p style={{ color: 'var(--text-faint)', fontSize: 13 }}>No active alerts right now.</p>}
      </div>
    </div>
  );
}

function NlpTab({ hotspots, posts }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.2fr', gap: 16 }}>
      <div className="card" style={{ padding: 20 }}>
        <h3 style={{ fontSize: 14, marginBottom: 14, color: 'var(--text-dim)' }}>Distress hotspots ({hotspots.length})</h3>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {hotspots.map((h) => (
            <div key={h.id} style={{ padding: 12, borderRadius: 10, background: 'var(--bg-raised)', border: '1px solid var(--panel-border)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                <span style={{ fontWeight: 700 }}>{h.id}</span>
                <span className="mono" style={{ fontSize: 12, color: 'var(--accent)' }}>urgency {Math.round(h.mean_urgency * 100)}%</span>
              </div>
              <p style={{ fontSize: 12, color: 'var(--text-dim)' }}>{h.count} reports &middot; {h.top_categories.join(', ') || 'unclassified'}</p>
              <p style={{ fontSize: 12, color: 'var(--text-faint)', marginTop: 6, fontStyle: 'italic' }}>&ldquo;{h.sample}&rdquo;</p>
            </div>
          ))}
          {hotspots.length === 0 && <p style={{ color: 'var(--text-faint)', fontSize: 13 }}>No distress clusters detected yet.</p>}
        </div>
      </div>

      <div className="card" style={{ padding: 20 }}>
        <h3 style={{ fontSize: 14, marginBottom: 14, color: 'var(--text-dim)' }}>Recent social / citizen posts</h3>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, maxHeight: '65vh', overflowY: 'auto' }}>
          {posts.map((p) => (
            <div key={p.id} style={{ display: 'flex', gap: 10, padding: '8px 0', borderBottom: '1px solid var(--panel-border)' }}>
              <span className={`badge sev-${p.label === 'distress' ? 'Severe' : p.label === 'hazard_report' ? 'Moderate' : 'Low'}`} style={{ flexShrink: 0 }}>
                {p.label}
              </span>
              <div>
                <p style={{ fontSize: 12.5 }}>{p.text}</p>
                <p style={{ fontSize: 11, color: 'var(--text-faint)', marginTop: 3 }}>
                  {p.source} &middot; urgency {Math.round((p.urgency ?? 0) * 100)}% &middot; {p.categories?.join(', ')}
                </p>
              </div>
            </div>
          ))}
          {posts.length === 0 && <p style={{ color: 'var(--text-faint)', fontSize: 13 }}>No posts ingested yet.</p>}
        </div>
      </div>
    </div>
  );
}

function ResourcesTab({ allocation, resources }) {
  if (!allocation || !resources) return null;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16 }}>
        {resources.resources
          .reduce((acc, r) => {
            const found = acc.find((a) => a.type === r.type);
            if (found) {
              found.quantity += r.quantity;
              found.available += r.available;
            } else acc.push({ type: r.type, quantity: r.quantity, available: r.available });
            return acc;
          }, [])
          .map((t) => (
            <div key={t.type} className="card" style={{ padding: 16 }}>
              <p style={{ fontSize: 12, color: 'var(--text-dim)', textTransform: 'capitalize' }}>{t.type}</p>
              <p style={{ fontSize: 24, fontFamily: 'var(--font-display)', fontWeight: 700 }}>
                {t.available}
                <span style={{ fontSize: 13, color: 'var(--text-faint)' }}> / {t.quantity}</span>
              </p>
              <p style={{ fontSize: 11, color: 'var(--text-faint)' }}>available / total</p>
            </div>
          ))}
      </div>

      <div className="card" style={{ padding: 20 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 14 }}>
          <h3 style={{ fontSize: 14, color: 'var(--text-dim)' }}>Allocation plan (greedy nearest-need-first)</h3>
          {allocation.lpBound && (
            <span className="mono" style={{ fontSize: 12, color: 'var(--text-faint)' }}>
              LP-bound shelter coverage: {allocation.lpBound.lpBoundCoveragePct}%
            </span>
          )}
        </div>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead>
            <tr style={{ textAlign: 'left', color: 'var(--text-faint)', fontSize: 11 }}>
              <th style={th}>Zone</th>
              <th style={th}>Type</th>
              <th style={th}>Resource</th>
              <th style={th}>Qty</th>
              <th style={th}>Distance</th>
            </tr>
          </thead>
          <tbody>
            {allocation.plan.slice(0, 40).map((p, i) => (
              <tr key={i} style={{ borderTop: '1px solid var(--panel-border)' }}>
                <td style={td}>{p.zoneName}</td>
                <td style={td} className="mono">{p.type}</td>
                <td style={td}>{p.resourceName ?? <span style={{ color: 'var(--sev-severe)' }}>shortfall: {p.shortfall}</span>}</td>
                <td style={td} className="mono">{p.quantity}</td>
                <td style={td} className="mono">{p.distanceKm != null ? `${p.distanceKm} km` : '—'}</td>
              </tr>
            ))}
            {allocation.plan.length === 0 && (
              <tr><td colSpan={5} style={{ ...td, color: 'var(--text-faint)' }}>No allocation needed — all zones currently low risk.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

const th = { padding: '8px 10px', fontWeight: 500 };
const td = { padding: '10px 10px' };
