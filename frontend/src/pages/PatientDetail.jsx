import { useEffect, useState, useCallback } from 'react';
import { useParams, Link } from 'react-router-dom';
import { api } from '../api/client.js';

export default function PatientDetail() {
  const { id } = useParams();
  const [patient, setPatient] = useState(null);
  const [rxs, setRxs] = useState([]);
  const [allergy, setAllergy] = useState({ allergen: '', severity: 'moderate', reaction: '' });
  const [err, setErr] = useState('');

  const [history, setHistory] = useState(null);

  const load = useCallback(async () => {
    const [p, r, h] = await Promise.all([
      api(`/patients/${id}`),
      api(`/prescriptions?patientId=${id}`),
      api(`/patients/${id}/medication-history`).catch(() => ({ data: [], counts: {} })),
    ]);
    setPatient(p);
    setRxs(r.data);
    setHistory(h);
  }, [id]);

  useEffect(() => { load(); }, [load]);

  const addAllergy = async (e) => {
    e.preventDefault();
    setErr('');
    try {
      await api(`/patients/${id}/allergies`, { method: 'POST', body: allergy });
      setAllergy({ allergen: '', severity: 'moderate', reaction: '' });
      load();
    } catch (e2) { setErr(e2.message); }
  };

  const removeAllergy = async (allergyId) => {
    await api(`/patients/${id}/allergies/${allergyId}`, { method: 'DELETE' });
    load();
  };

  if (!patient) return <div className="center-loading">Loading…</div>;

  return (
    <>
      <div className="topbar">
        <h1>{patient.first_name} {patient.last_name}</h1>
        <Link to={`/prescriptions/new?patientId=${id}`}><button className="sm">+ New prescription</button></Link>
      </div>
      <div className="content">
        <div className="grid-2">
          <div className="card">
            <h3>Demographics</h3>
            <dl className="kv">
              <dt>Date of birth</dt><dd>{new Date(patient.date_of_birth).toLocaleDateString()}</dd>
              <dt>Sex</dt><dd style={{ textTransform: 'capitalize' }}>{patient.sex}</dd>
              <dt>MRN</dt><dd>{patient.mrn || '—'}</dd>
              <dt>Phone</dt><dd>{patient.phone || '—'}</dd>
              <dt>Email</dt><dd>{patient.email || '—'}</dd>
            </dl>
          </div>

          <div className="card">
            <h3>Allergies</h3>
            {err && <div className="alert error">{err}</div>}
            {patient.allergies.length === 0 && <p className="muted">No known allergies recorded.</p>}
            {patient.allergies.map((a) => (
              <div key={a.id} className={`alert ${['severe', 'life_threatening'].includes(a.severity) ? 'critical' : 'warning'}`}
                style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span><strong>{a.allergen}</strong> — {a.severity}{a.reaction ? ` (${a.reaction})` : ''}</span>
                <button className="secondary sm" onClick={() => removeAllergy(a.id)}>Remove</button>
              </div>
            ))}
            <form onSubmit={addAllergy} style={{ marginTop: 12 }}>
              <div className="row">
                <input placeholder="Allergen (e.g. penicillin)" value={allergy.allergen}
                  onChange={(e) => setAllergy({ ...allergy, allergen: e.target.value })} required />
                <select value={allergy.severity} onChange={(e) => setAllergy({ ...allergy, severity: e.target.value })}>
                  <option value="mild">Mild</option><option value="moderate">Moderate</option>
                  <option value="severe">Severe</option><option value="life_threatening">Life-threatening</option>
                </select>
              </div>
              <div className="row" style={{ marginTop: 8 }}>
                <input placeholder="Reaction (optional)" value={allergy.reaction}
                  onChange={(e) => setAllergy({ ...allergy, reaction: e.target.value })} />
                <button className="secondary">Add allergy</button>
              </div>
            </form>
          </div>
        </div>

        <div className="card">
          <h3>Prescription history</h3>
          {rxs.length === 0 ? <p className="muted">No prescriptions.</p> : (
            <table>
              <thead><tr><th>Medication</th><th>Sig</th><th>Status</th><th>Date</th></tr></thead>
              <tbody>
                {rxs.map((r) => (
                  <tr key={r.id}>
                    <td><Link to={`/prescriptions/${r.id}`}>{r.drug_name}</Link></td>
                    <td className="muted">{r.sig}</td>
                    <td><span className={`badge ${r.status}`}>{r.status}</span></td>
                    <td>{new Date(r.created_at).toLocaleDateString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        <div className="card">
          <h3>Medication history</h3>
          <p className="muted" style={{ fontSize: 13, marginTop: 0 }}>
            Consolidated view: this practice{history?.counts?.external ? ' plus external pharmacy/PBM fills (simulated)' : ''}.
          </p>
          {!history || history.data.length === 0 ? <p className="muted">No medication history.</p> : (
            <table>
              <thead><tr><th>Medication</th><th>Sig</th><th>Source</th><th>Status</th><th>Date</th></tr></thead>
              <tbody>
                {history.data.map((m, i) => (
                  <tr key={i}>
                    <td>{m.drugName}</td>
                    <td className="muted">{m.sig || '—'}</td>
                    <td><span className={`badge ${m.source === 'internal' ? 'signed' : 'draft'}`}>{m.source === 'internal' ? 'This practice' : 'External'}</span></td>
                    <td>{m.status}</td>
                    <td>{m.date}</td>
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
