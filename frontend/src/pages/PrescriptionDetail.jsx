import { useEffect, useState, useCallback } from 'react';
import { useParams, Link } from 'react-router-dom';
import { api } from '../api/client.js';
import { useAuth } from '../context/AuthContext.jsx';

export default function PrescriptionDetail() {
  const { id } = useParams();
  const { hasRole } = useAuth();
  const [rx, setRx] = useState(null);
  const [alerts, setAlerts] = useState([]);
  const [overrides, setOverrides] = useState({}); // checkType -> reason
  const [msg, setMsg] = useState(null); // {type, text}
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const data = await api(`/prescriptions/${id}`);
    setRx(data);
    if (['draft', 'pending_review'].includes(data.status)) {
      try {
        const s = await api(`/prescriptions/${id}/safety-check`);
        setAlerts(s.alerts);
      } catch { /* ignore */ }
    }
  }, [id]);

  useEffect(() => { load(); }, [load]);

  const act = async (fn) => {
    setBusy(true); setMsg(null);
    try { await fn(); await load(); }
    catch (err) {
      setMsg({ type: 'error', text: err.message });
      if (err.details?.alerts) setAlerts(err.details.alerts);
    } finally { setBusy(false); }
  };

  const sign = () => act(async () => {
    const critical = alerts.filter((a) => a.severity === 'critical');
    const body = { overrides: critical.map((a) => ({ checkType: a.checkType, reason: overrides[a.checkType] || '' })) };
    if (critical.some((a) => !overrides[a.checkType] || overrides[a.checkType].length < 3)) {
      throw new Error('Provide an override reason (min 3 chars) for each critical alert before signing.');
    }
    await api(`/prescriptions/${id}/sign`, { method: 'POST', body });
    setMsg({ type: 'success', text: 'Prescription signed.' });
  });

  const transmit = () => act(async () => {
    await api(`/prescriptions/${id}/transmit`, { method: 'POST' });
    setMsg({ type: 'success', text: 'Prescription transmitted to pharmacy.' });
  });

  const cancel = () => {
    const reason = window.prompt('Reason for cancellation?');
    if (!reason) return;
    act(async () => {
      await api(`/prescriptions/${id}/cancel`, { method: 'POST', body: { reason } });
      setMsg({ type: 'success', text: 'Prescription cancelled.' });
    });
  };

  const setPA = (status) => act(async () => {
    await api(`/prescriptions/${id}/prior-auth`, { method: 'POST', body: { status } });
    setMsg({ type: 'success', text: `Prior authorization: ${status.replace('_', ' ')}.` });
  });

  const requestRenewal = () => act(async () => {
    await api('/renewals', { method: 'POST', body: { prescriptionId: id } });
    setMsg({ type: 'success', text: 'Renewal request added to the Inbox.' });
  });

  if (!rx) return <div className="center-loading">Loading…</div>;
  const canPrescribe = hasRole('admin', 'prescriber');
  const isDraft = ['draft', 'pending_review'].includes(rx.status);

  return (
    <>
      <div className="topbar">
        <h1>Prescription <span className={`badge ${rx.status}`}>{rx.status}</span></h1>
        <Link to="/prescriptions"><button className="secondary sm">Back to list</button></Link>
      </div>
      <div className="content">
        {msg && <div className={`alert ${msg.type}`}>{msg.text}</div>}

        <div className="grid-2">
          <div className="card">
            <h3>Details</h3>
            <dl className="kv">
              <dt>Patient</dt><dd><Link to={`/patients/${rx.patient_id}`}>{rx.patient_first_name} {rx.patient_last_name}</Link></dd>
              <dt>Medication</dt><dd>{rx.drug_name} {rx.dea_schedule > 0 && <span className="badge controlled">C-{rx.dea_schedule}</span>}</dd>
              <dt>Sig</dt><dd>{rx.sig}</dd>
              <dt>Quantity</dt><dd>{rx.quantity} {rx.quantity_unit}</dd>
              <dt>Days supply</dt><dd>{rx.days_supply || '—'}</dd>
              <dt>Refills</dt><dd>{rx.refills}</dd>
              <dt>Substitution</dt><dd>{rx.substitution_allowed ? 'Allowed' : 'Dispense as written'}</dd>
              <dt>Diagnosis</dt><dd>{rx.diagnosis_code || '—'}</dd>
              <dt>Prescriber</dt><dd>{rx.prescriber_first_name} {rx.prescriber_last_name}</dd>
              <dt>Pharmacy</dt><dd>{rx.pharmacy_name || '— (none selected)'}</dd>
              <dt>Prior auth</dt><dd>{(rx.prior_auth_status || 'not_required').replace('_', ' ')}{rx.prior_auth_number ? ` (${rx.prior_auth_number})` : ''}</dd>
              {rx.network_message_id && <><dt>Network ID</dt><dd>{rx.network_message_id}</dd></>}
            </dl>
            {canPrescribe && (
              <div style={{ marginTop: 12, borderTop: '1px solid var(--border)', paddingTop: 12 }}>
                <div className="muted" style={{ fontSize: 12, marginBottom: 6 }}>Electronic prior authorization (ePA)</div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                  <button className="secondary sm" disabled={busy} onClick={() => setPA('initiated')}>Start PA</button>
                  <button className="secondary sm" disabled={busy} onClick={() => setPA('approved')}>Mark approved</button>
                  <button className="secondary sm" disabled={busy} onClick={() => setPA('denied')}>Mark denied</button>
                  <button className="secondary sm" disabled={busy} onClick={requestRenewal}>Request renewal</button>
                </div>
              </div>
            )}
          </div>

          <div className="card">
            <h3>Clinical safety checks</h3>
            {isDraft && alerts.length === 0 && <div className="alert success">No safety alerts detected.</div>}
            {!isDraft && rx.safetyChecks.length === 0 && <p className="muted">No alerts were recorded at signing.</p>}
            {(isDraft ? alerts : rx.safetyChecks).map((a, i) => (
              <div key={i} className={`alert ${a.severity === 'critical' ? 'critical' : a.severity === 'warning' ? 'warning' : 'info'}`}>
                <strong>{(a.checkType || a.check_type).replace('_', ' ')}:</strong> {a.message}
                {a.overridden && <div className="muted" style={{ fontSize: 12 }}>Overridden: {a.override_reason}</div>}
                {isDraft && a.severity === 'critical' && (
                  <input style={{ marginTop: 8 }} placeholder="Override reason (required to sign)"
                    value={overrides[a.checkType] || ''}
                    onChange={(e) => setOverrides({ ...overrides, [a.checkType]: e.target.value })} />
                )}
              </div>
            ))}

            {canPrescribe && (
              <div className="row" style={{ marginTop: 16 }}>
                {isDraft && <button disabled={busy} onClick={sign}>Sign prescription</button>}
                {rx.status === 'signed' && <button disabled={busy} onClick={transmit}>Transmit to pharmacy</button>}
                {!['cancelled', 'dispensed', 'expired'].includes(rx.status) &&
                  <button className="danger" disabled={busy} onClick={cancel}>Cancel</button>}
              </div>
            )}
          </div>
        </div>

        <div className="card">
          <h3>Audit trail</h3>
          <table>
            <thead><tr><th>When</th><th>From</th><th>To</th><th>Detail</th></tr></thead>
            <tbody>
              {rx.events.map((e) => (
                <tr key={e.id}>
                  <td>{new Date(e.created_at).toLocaleString()}</td>
                  <td>{e.from_status || '—'}</td>
                  <td><span className={`badge ${e.to_status}`}>{e.to_status}</span></td>
                  <td className="muted">{e.detail || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}
