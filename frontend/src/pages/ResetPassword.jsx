import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { api } from '../api/client.js';

export default function ResetPassword() {
  const [params] = useSearchParams();
  const [password, setPassword] = useState('');
  const [message, setMessage] = useState('');
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);
  const token = params.get('token');

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setMessage('');
    try {
      const r = await api('/auth/reset-password', { method: 'POST', auth: false, body: { token, password } });
      setMessage(r.message);
      setDone(true);
    } catch (err) {
      setMessage(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="auth-wrap">
      <div className="auth-card">
        <div className="brand">e<span>Prescribe</span></div>
        <h2>Choose a new password</h2>
        {message && <div className={`alert ${done ? 'success' : 'error'}`}>{message}</div>}
        {!done && (
          <form onSubmit={submit}>
            <div className="field">
              <label>New password</label>
              <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={8} />
            </div>
            <button className="block" disabled={busy || !token}>{busy ? 'Updating…' : 'Update password'}</button>
            {!token && <p className="muted">Missing reset token.</p>}
          </form>
        )}
        <div className="auth-foot"><Link to="/login">Back to sign in</Link></div>
      </div>
    </div>
  );
}
