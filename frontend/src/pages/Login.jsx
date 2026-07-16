import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import { api } from '../api/client.js';

export default function Login() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [needsVerification, setNeedsVerification] = useState(false);
  const [resendMsg, setResendMsg] = useState('');
  const [resending, setResending] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    setResendMsg('');
    setNeedsVerification(false);
    setBusy(true);
    try {
      await login(email, password);
      navigate('/');
    } catch (err) {
      setError(err.message);
      // Surface the resend option when the account exists but isn't verified
      if (/verify your email/i.test(err.message)) setNeedsVerification(true);
    } finally {
      setBusy(false);
    }
  };

  const resend = async () => {
    setResending(true);
    setResendMsg('');
    try {
      const r = await api('/auth/resend-verification', { method: 'POST', auth: false, body: { email } });
      setResendMsg(r.message || 'Verification email sent.');
    } catch (err) {
      setResendMsg(err.message);
    } finally {
      setResending(false);
    }
  };

  return (
    <div className="auth-wrap">
      <div className="auth-card">
        <div className="brand">e<span>Prescribe</span></div>
        <div className="auth-sub">Secure e-prescribing for medical practices</div>
        <h2>Sign in</h2>
        {error && <div className="alert error">{error}</div>}
        {needsVerification && (
          <div className="alert warning">
            Your email isn’t verified yet.{' '}
            <button
              type="button"
              className="secondary sm"
              style={{ marginLeft: 6 }}
              onClick={resend}
              disabled={resending || !email}
            >
              {resending ? 'Sending…' : 'Resend verification email'}
            </button>
          </div>
        )}
        {resendMsg && <div className="alert success">{resendMsg}</div>}
        <form onSubmit={submit}>
          <div className="field">
            <label>Email</label>
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoFocus />
          </div>
          <div className="field">
            <label>Password</label>
            <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required />
          </div>
          <button className="block" disabled={busy}>{busy ? 'Signing in…' : 'Sign in'}</button>
        </form>
        <div className="auth-foot">
          <Link to="/forgot-password">Forgot password?</Link> · <Link to="/register">Create account</Link>
        </div>
      </div>
    </div>
  );
}
