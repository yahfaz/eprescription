import { useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api/client.js';

export default function ForgotPassword() {
  const [email, setEmail] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      const r = await api('/auth/forgot-password', { method: 'POST', auth: false, body: { email } });
      setMessage(r.message);
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
        <h2>Reset your password</h2>
        {message && <div className="alert info">{message}</div>}
        <form onSubmit={submit}>
          <div className="field">
            <label>Email</label>
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
          </div>
          <button className="block" disabled={busy}>{busy ? 'Sending…' : 'Send reset link'}</button>
        </form>
        <div className="auth-foot"><Link to="/login">Back to sign in</Link></div>
      </div>
    </div>
  );
}
