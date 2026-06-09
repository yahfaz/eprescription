import { useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api/client.js';

export default function Register() {
  const [form, setForm] = useState({
    firstName: '', lastName: '', email: '', password: '',
    role: 'prescriber', practiceName: '', npi: '', deaNumber: '',
  });
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);

  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      const body = { ...form };
      Object.keys(body).forEach((k) => body[k] === '' && delete body[k]);
      await api('/auth/register', { method: 'POST', auth: false, body });
      setDone(true);
    } catch (err) {
      setError(err.details ? `${err.message}: ${err.details.map((d) => d.message).join(', ')}` : err.message);
    } finally {
      setBusy(false);
    }
  };

  if (done) {
    return (
      <div className="auth-wrap">
        <div className="auth-card">
          <div className="brand">e<span>Prescribe</span></div>
          <h2>Check your email</h2>
          <div className="alert success">
            Your account was created. We sent a verification link to <strong>{form.email}</strong>.
            Verify your email, then sign in.
          </div>
          <p className="muted" style={{ fontSize: 13 }}>
            In local/dev mode the verification link is printed to the backend server console.
          </p>
          <div className="auth-foot"><Link to="/login">Back to sign in</Link></div>
        </div>
      </div>
    );
  }

  return (
    <div className="auth-wrap">
      <div className="auth-card">
        <div className="brand">e<span>Prescribe</span></div>
        <h2>Create your account</h2>
        {error && <div className="alert error">{error}</div>}
        <form onSubmit={submit}>
          <div className="row">
            <div className="field"><label>First name</label><input value={form.firstName} onChange={set('firstName')} required /></div>
            <div className="field"><label>Last name</label><input value={form.lastName} onChange={set('lastName')} required /></div>
          </div>
          <div className="field"><label>Email</label><input type="email" value={form.email} onChange={set('email')} required /></div>
          <div className="field"><label>Password</label><input type="password" value={form.password} onChange={set('password')} required minLength={8} /></div>
          <div className="field"><label>Practice name (creates a new practice)</label><input value={form.practiceName} onChange={set('practiceName')} placeholder="e.g. Riverbend Family Medicine" /></div>
          <div className="field">
            <label>Role</label>
            <select value={form.role} onChange={set('role')}>
              <option value="prescriber">Prescriber (physician)</option>
              <option value="nurse">Nurse</option>
              <option value="staff">Staff</option>
              <option value="admin">Administrator</option>
              <option value="pharmacist">Pharmacist</option>
            </select>
          </div>
          {form.role === 'prescriber' && (
            <div className="row">
              <div className="field"><label>NPI</label><input value={form.npi} onChange={set('npi')} /></div>
              <div className="field"><label>DEA # (controlled Rx)</label><input value={form.deaNumber} onChange={set('deaNumber')} /></div>
            </div>
          )}
          <button className="block" disabled={busy}>{busy ? 'Creating…' : 'Create account'}</button>
        </form>
        <div className="auth-foot">Already have an account? <Link to="/login">Sign in</Link></div>
      </div>
    </div>
  );
}
