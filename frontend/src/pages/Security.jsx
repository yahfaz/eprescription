import { useState } from 'react';
import { api } from '../api/client.js';
import { useAuth } from '../context/AuthContext.jsx';

export default function Security() {
  const { user, refreshUser } = useAuth();
  const [setup, setSetup] = useState(null); // { secret, otpauthUri }
  const [code, setCode] = useState('');
  const [msg, setMsg] = useState(null);
  const [busy, setBusy] = useState(false);

  const startSetup = async () => {
    setMsg(null); setBusy(true);
    try { setSetup(await api('/auth/2fa/setup', { method: 'POST' })); }
    catch (e) { setMsg({ type: 'error', text: e.message }); } finally { setBusy(false); }
  };

  const enable = async () => {
    setMsg(null); setBusy(true);
    try {
      await api('/auth/2fa/enable', { method: 'POST', body: { token: code } });
      setSetup(null); setCode(''); await refreshUser();
      setMsg({ type: 'success', text: 'Two-factor authentication enabled.' });
    } catch (e) { setMsg({ type: 'error', text: e.message }); } finally { setBusy(false); }
  };

  const disable = async () => {
    setMsg(null); setBusy(true);
    try {
      await api('/auth/2fa/disable', { method: 'POST', body: { token: code } });
      setCode(''); await refreshUser();
      setMsg({ type: 'success', text: 'Two-factor authentication disabled.' });
    } catch (e) { setMsg({ type: 'error', text: e.message }); } finally { setBusy(false); }
  };

  return (
    <>
      <div className="topbar"><h1>Security</h1></div>
      <div className="content">
        <div className="card" style={{ maxWidth: 620 }}>
          <h3>Two-factor authentication (EPCS)</h3>
          <p className="muted" style={{ fontSize: 14 }}>
            Required to electronically sign controlled substances (DEA Schedule II–V). Use any
            authenticator app (Google Authenticator, Authy, 1Password, …).
          </p>
          {msg && <div className={`alert ${msg.type}`}>{msg.text}</div>}

          <div className="alert info">
            Status: <strong>{user.twoFactorEnabled ? 'Enabled ✓' : 'Not enabled'}</strong>
          </div>

          {!user.twoFactorEnabled && !setup && (
            <button onClick={startSetup} disabled={busy}>{busy ? 'Starting…' : 'Set up two-factor'}</button>
          )}

          {!user.twoFactorEnabled && setup && (
            <div>
              <p style={{ fontSize: 14 }}>Add this account to your authenticator app:</p>
              <div className="field">
                <label>Secret key (manual entry)</label>
                <input readOnly value={setup.secret} onFocus={(e) => e.target.select()} />
              </div>
              <div className="field">
                <label>otpauth URI (for QR-code import)</label>
                <textarea readOnly rows={2} value={setup.otpauthUri} onFocus={(e) => e.target.select()} />
              </div>
              <div className="field">
                <label>Enter the 6-digit code from your app to confirm</label>
                <input value={code} onChange={(e) => setCode(e.target.value)} placeholder="123456" maxLength={6} />
              </div>
              <button onClick={enable} disabled={busy || code.length !== 6}>Enable</button>
            </div>
          )}

          {user.twoFactorEnabled && (
            <div>
              <div className="field">
                <label>Enter a current code to disable</label>
                <input value={code} onChange={(e) => setCode(e.target.value)} placeholder="123456" maxLength={6} />
              </div>
              <button className="danger" onClick={disable} disabled={busy || code.length !== 6}>Disable two-factor</button>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
