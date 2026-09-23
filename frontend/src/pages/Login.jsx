import { useState } from 'react';
import { LogIn, AlertCircle } from 'lucide-react';
import { api, saveSession } from '../api/client.js';

export default function Login({ onLogin }) {
  const [email, setEmail] = useState('admin@resqfusion.in');
  const [password, setPassword] = useState('Admin@123');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(e) {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      const { token, user } = await api.login(email, password);
      saveSession(token, user);
      onLogin(token, user);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={{ minHeight: '80vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
      <form onSubmit={submit} className="card" style={{ width: 380, padding: 32 }}>
        <h2 style={{ fontSize: 22, marginBottom: 6 }}>Control room sign-in</h2>
        <p style={{ color: 'var(--text-dim)', fontSize: 13, marginBottom: 24 }}>
          For district coordinators and relief team leads.
        </p>

        <Field label="Email">
          <input value={email} onChange={(e) => setEmail(e.target.value)} type="email" required style={inputStyle} />
        </Field>
        <Field label="Password">
          <input value={password} onChange={(e) => setPassword(e.target.value)} type="password" required style={inputStyle} />
        </Field>

        {error && (
          <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start', color: 'var(--sev-severe)', fontSize: 13, marginBottom: 16 }}>
            <AlertCircle size={16} style={{ flexShrink: 0, marginTop: 1 }} /> {error}
          </div>
        )}

        <button
          type="submit"
          disabled={busy}
          style={{
            width: '100%',
            padding: '11px 0',
            borderRadius: 8,
            background: 'var(--accent)',
            color: '#1a0f08',
            fontWeight: 700,
            fontSize: 14,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 8,
            opacity: busy ? 0.7 : 1,
          }}
        >
          <LogIn size={16} /> {busy ? 'Signing in…' : 'Sign in'}
        </button>

        <div style={{ marginTop: 20, paddingTop: 16, borderTop: '1px solid var(--panel-border)', fontSize: 12, color: 'var(--text-faint)' }}>
          <p style={{ marginBottom: 4, fontFamily: 'var(--font-mono)' }}>Demo accounts</p>
          <p className="mono">admin@resqfusion.in / Admin@123</p>
          <p className="mono">relief@resqfusion.in / Relief@123</p>
        </div>
      </form>
    </div>
  );
}

function Field({ label, children }) {
  return (
    <label style={{ display: 'block', marginBottom: 16 }}>
      <span style={{ display: 'block', fontSize: 12, color: 'var(--text-dim)', marginBottom: 6 }}>{label}</span>
      {children}
    </label>
  );
}

const inputStyle = {
  width: '100%',
  padding: '10px 12px',
  borderRadius: 8,
  border: '1px solid var(--panel-border)',
  background: 'var(--bg)',
  color: 'var(--text)',
  fontSize: 14,
  outline: 'none',
};
