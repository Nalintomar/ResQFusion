import { useEffect, useState } from 'react';
import { Radio, Users, LogOut, ShieldAlert } from 'lucide-react';
import { loadSession, clearSession } from './api/client.js';
import Login from './pages/Login.jsx';
import CoordinatorDashboard from './pages/CoordinatorDashboard.jsx';
import CitizenPortal from './pages/CitizenPortal.jsx';

export default function App() {
  const [mode, setMode] = useState('citizen'); // 'citizen' | 'coordinator'
  const [session, setSession] = useState(() => loadSession());
  const [clock, setClock] = useState(new Date());

  useEffect(() => {
    const t = setInterval(() => setClock(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  const logout = () => {
    clearSession();
    setSession(null);
  };

  return (
    <div style={{ minHeight: '100%', display: 'flex', flexDirection: 'column' }}>
      <header
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '14px 28px',
          borderBottom: '1px solid var(--panel-border)',
          background: 'var(--bg-raised)',
          position: 'sticky',
          top: 0,
          zIndex: 20,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div
            style={{
              width: 34,
              height: 34,
              borderRadius: 9,
              background: 'linear-gradient(135deg, var(--accent), var(--calm))',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontFamily: 'var(--font-display)',
              fontWeight: 700,
              color: '#0b1220',
            }}
          >
            R
          </div>
          <div>
            <h1 style={{ fontSize: 17 }}>ResQFusion</h1>
            <p style={{ fontSize: 11, color: 'var(--text-faint)', fontFamily: 'var(--font-mono)' }}>
              Multi-source disaster response coordination
            </p>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 18 }}>
          <span className="mono" style={{ fontSize: 12, color: 'var(--text-dim)' }}>
            {clock.toLocaleTimeString()} &middot; {clock.toLocaleDateString(undefined, { day: '2-digit', month: 'short', year: 'numeric' })}
          </span>

          <div style={{ display: 'flex', background: 'var(--panel)', border: '1px solid var(--panel-border)', borderRadius: 999, padding: 3 }}>
            <ModeButton icon={Users} label="Citizen" active={mode === 'citizen'} onClick={() => setMode('citizen')} />
            <ModeButton icon={ShieldAlert} label="Coordinator" active={mode === 'coordinator'} onClick={() => setMode('coordinator')} />
          </div>

          {mode === 'coordinator' && session && (
            <button
              onClick={logout}
              style={{ display: 'flex', alignItems: 'center', gap: 6, color: 'var(--text-dim)', fontSize: 13 }}
              title="Log out"
            >
              <LogOut size={15} /> {session.user.name}
            </button>
          )}
        </div>
      </header>

      <main style={{ flex: 1, background: 'var(--bg)' }}>
        {mode === 'citizen' && <CitizenPortal session={session} />}
        {mode === 'coordinator' &&
          (session ? (
            <CoordinatorDashboard session={session} onUnauthorized={logout} />
          ) : (
            <Login onLogin={(token, user) => setSession({ token, user })} />
          ))}
      </main>

      <footer
        style={{
          padding: '10px 28px',
          borderTop: '1px solid var(--panel-border)',
          color: 'var(--text-faint)',
          fontSize: 11,
          fontFamily: 'var(--font-mono)',
          display: 'flex',
          justifyContent: 'space-between',
        }}
      >
        <span>ABESEC Ghaziabad &middot; CSE &middot; Session 2026-27</span>
        <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <Radio size={12} /> decision-support tool — not a substitute for official emergency dispatch
        </span>
      </footer>
    </div>
  );
}

function ModeButton({ icon: Icon, label, active, onClick }) {
  return (
    <button
      onClick={onClick}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 6,
        padding: '6px 14px',
        borderRadius: 999,
        fontSize: 13,
        fontWeight: 600,
        background: active ? 'var(--accent)' : 'transparent',
        color: active ? '#1a0f08' : 'var(--text-dim)',
        transition: 'background 0.15s ease',
      }}
    >
      <Icon size={14} /> {label}
    </button>
  );
}
