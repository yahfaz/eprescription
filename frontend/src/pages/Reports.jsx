import { useEffect, useState } from 'react';
import { api } from '../api/client.js';

export default function Reports() {
  const [data, setData] = useState(null);
  const [err, setErr] = useState('');

  useEffect(() => {
    api('/reports/summary').then(setData).catch((e) => setErr(e.message));
  }, []);

  if (err) return (<><div className="topbar"><h1>Reports</h1></div><div className="content"><div className="alert error">{err}</div></div></>);
  if (!data) return <div className="center-loading">Loading…</div>;

  return (
    <>
      <div className="topbar"><h1>Reports &amp; analytics</h1></div>
      <div className="content">
        <div className="stat-grid">
          <div className="stat"><div className="n">{data.totals.active_patients}</div><div className="l">Active patients</div></div>
          <div className="stat"><div className="n">{data.totals.total_prescriptions}</div><div className="l">Total prescriptions</div></div>
          <div className="stat"><div className="n">{data.totals.transmitted_30d}</div><div className="l">Transmitted (30d)</div></div>
          <div className="stat"><div className="n">{data.pending.pending_renewals}</div><div className="l">Pending renewals</div></div>
        </div>

        <div className="grid-2">
          <div className="card">
            <h3>Prescriptions by status</h3>
            <table>
              <thead><tr><th>Status</th><th>Count</th></tr></thead>
              <tbody>
                {data.byStatus.map((r) => (
                  <tr key={r.status}><td><span className={`badge ${r.status}`}>{r.status}</span></td><td>{r.count}</td></tr>
                ))}
              </tbody>
            </table>
            <div style={{ marginTop: 10 }} className="muted">
              Open prior authorizations: <strong>{data.pending.open_prior_auths}</strong>
            </div>
          </div>

          <div className="card">
            <h3>Controlled vs non-controlled</h3>
            <table>
              <tbody>
                {data.controlled.map((r) => (
                  <tr key={r.kind}><td>{r.kind === 'controlled' ? 'Controlled (CII–CV)' : 'Non-controlled'}</td><td>{r.count}</td></tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="grid-2">
          <div className="card">
            <h3>Top medications</h3>
            {data.topMedications.length === 0 ? <p className="muted">No data.</p> : (
              <table>
                <thead><tr><th>Medication</th><th>Count</th></tr></thead>
                <tbody>{data.topMedications.map((m) => <tr key={m.drug_name}><td>{m.drug_name}</td><td>{m.count}</td></tr>)}</tbody>
              </table>
            )}
          </div>
          <div className="card">
            <h3>By prescriber</h3>
            {data.byPrescriber.length === 0 ? <p className="muted">No data.</p> : (
              <table>
                <thead><tr><th>Prescriber</th><th>Count</th></tr></thead>
                <tbody>{data.byPrescriber.map((p, i) => <tr key={i}><td>{p.first_name} {p.last_name}</td><td>{p.count}</td></tr>)}</tbody>
              </table>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
