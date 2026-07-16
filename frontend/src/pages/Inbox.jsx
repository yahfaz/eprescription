import { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api/client.js';
import { useAuth } from '../context/AuthContext.jsx';

export default function Inbox() {
  const navigate = useNavigate();
  const { hasRole } = useAuth();
  const [items, setItems] = useState([]);
  const [status, setStatus] = useState('pending');
  const [msg, setMsg] = useState('');

  const load = useCallback(async () => {
    const r = await api(`/renewals?status=${status}`);
    setItems(r.data);
  }, [status]);

  useEffect(() => { load(); }, [load]);

  const respond = async (id, action) => {
    setMsg('');
    try {
      const r = await api(`/renewals/${id}/respond`, { method: 'POST', body: { action } });
      setMsg(action === 'approve' ? 'Renewal approved — a draft prescription was created.' : 'Renewal denied.');
      load();
      if (action === 'approve' && r.resultingRxId) navigate(`/prescriptions/${r.resultingRxId}`);
    } catch (e) { setMsg(e.message); }
  };

  return (
    <>
      <div className="topbar"><h1>Inbox — renewal requests</h1></div>
      <div className="content">
        {msg && <div className="alert info">{msg}</div>}
        <div className="card">
          <div className="toolbar">
            <select value={status} onChange={(e) => setStatus(e.target.value)} style={{ maxWidth: 200 }}>
              <option value="pending">Pending</option>
              <option value="approved">Approved</option>
              <option value="denied">Denied</option>
            </select>
          </div>
          {items.length === 0 ? <p className="muted">No {status} renewal requests.</p> : (
            <table>
              <thead><tr><th>Patient</th><th>Medication</th><th>Sig</th><th>From</th><th>Received</th><th></th></tr></thead>
              <tbody>
                {items.map((r) => (
                  <tr key={r.id}>
                    <td>{r.patient_first_name} {r.patient_last_name}</td>
                    <td>{r.drug_name}</td>
                    <td className="muted">{r.sig || '—'}</td>
                    <td>{r.requested_by || '—'}</td>
                    <td>{new Date(r.created_at).toLocaleDateString()}</td>
                    <td>
                      {r.status === 'pending' && hasRole('admin', 'prescriber') ? (
                        <div style={{ display: 'flex', gap: 6 }}>
                          <button className="sm" onClick={() => respond(r.id, 'approve')}>Approve</button>
                          <button className="secondary sm" onClick={() => respond(r.id, 'deny')}>Deny</button>
                        </div>
                      ) : <span className={`badge ${r.status === 'approved' ? 'transmitted' : 'cancelled'}`}>{r.status}</span>}
                    </td>
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
