import { useEffect, useState, useCallback } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api } from '../api/client.js';

const STATUSES = ['', 'draft', 'pending_review', 'signed', 'transmitted', 'dispensed', 'cancelled'];

export default function Prescriptions() {
  const navigate = useNavigate();
  const [rxs, setRxs] = useState([]);
  const [status, setStatus] = useState('');

  const load = useCallback(async () => {
    const r = await api(`/prescriptions${status ? `?status=${status}` : ''}`);
    setRxs(r.data);
  }, [status]);

  useEffect(() => { load(); }, [load]);

  return (
    <>
      <div className="topbar"><h1>Prescriptions</h1></div>
      <div className="content">
        <div className="card">
          <div className="toolbar">
            <select value={status} onChange={(e) => setStatus(e.target.value)} style={{ maxWidth: 200 }}>
              {STATUSES.map((s) => <option key={s} value={s}>{s || 'All statuses'}</option>)}
            </select>
            <div className="spacer" />
            <Link to="/prescriptions/new"><button>+ New prescription</button></Link>
          </div>
          {rxs.length === 0 ? <p className="muted">No prescriptions.</p> : (
            <table>
              <thead><tr><th>Patient</th><th>Medication</th><th>Prescriber</th><th>Status</th><th>Date</th></tr></thead>
              <tbody>
                {rxs.map((r) => (
                  <tr key={r.id} style={{ cursor: 'pointer' }} onClick={() => navigate(`/prescriptions/${r.id}`)}>
                    <td>{r.patient_first_name} {r.patient_last_name}</td>
                    <td>{r.drug_name} {r.dea_schedule > 0 && <span className="badge controlled">C-{r.dea_schedule}</span>}</td>
                    <td>{r.prescriber_first_name} {r.prescriber_last_name}</td>
                    <td><span className={`badge ${r.status}`}>{r.status}</span></td>
                    <td>{new Date(r.created_at).toLocaleDateString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </>
  );
}
