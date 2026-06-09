import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { api } from '../api/client.js';

export default function VerifyEmail() {
  const [params] = useSearchParams();
  const [state, setState] = useState('verifying'); // verifying | success | error
  const [message, setMessage] = useState('');

  useEffect(() => {
    const token = params.get('token');
    if (!token) {
      setState('error');
      setMessage('No verification token provided.');
      return;
    }
    api('/auth/verify-email', { method: 'POST', auth: false, body: { token } })
      .then((r) => { setState('success'); setMessage(r.message); })
      .catch((e) => { setState('error'); setMessage(e.message); });
  }, [params]);

  return (
    <div className="auth-wrap">
      <div className="auth-card">
        <div className="brand">e<span>Prescribe</span></div>
        <h2>Email verification</h2>
        {state === 'verifying' && <div className="alert info">Verifying your email…</div>}
        {state === 'success' && <div className="alert success">{message}</div>}
        {state === 'error' && <div className="alert error">{message}</div>}
        <div className="auth-foot"><Link to="/login">Go to sign in</Link></div>
      </div>
    </div>
  );
}
