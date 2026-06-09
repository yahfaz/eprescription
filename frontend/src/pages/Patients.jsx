import { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api/client.js';

function NewPatientModal({ onClose, onCreated }) {
  const [form, setForm] = useState({ firstName: '', lastName: '', dateOfBirth: '', sex: 'unknown', mrn: '', phone: '' });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true); setError('');
    try {
      const body = { ...form };
      Object.keys(body).forEach((k) => body[k] === '' && delete body[k]);
      const created = await api('/patients', { method: 'POST', body });
      onCreated(created);
    } catch (err) {
      setError(err.details ? err.details.map((d) => `${d.field}: ${d.message}`).join(', ') : err.message);
    } finally { setBusy(false); }
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h3>New patient</h3>
        {error && <div className="alert error">{error}</div>}
        <form onSubmit={submit}>
          <div className="row">
            <div className="field"><label>First name</label><input value={form.firstName} onChange={set('firstName')} required /></div>
            <div className="field"><label>Last name</label><input value={form.lastName} onChange={set('lastName')} required /></div>
          </div>
          <div className="row">
            <div className="field"><label>Date of birth</label><input type="date" value={form.dateOfBirth} onChange={set('dateOfBirth')} required /></div>
            <div className="field"><label>Sex</label>
              <select value={form.sex} onChange={set('sex')}>
                <option value="unknown">Unknown</option><option value="male">Male</option>
                <option value="female">Female</option><option value="other">Other</option>
              </select>
            </div>
          </div>
          <div className="row">
            <div className="field"><label>MRN</label><input value={form.mrn} onChange={set('mrn')} /></div>
            <div className="field"><label>Phone</label><input value={form.phone} onChange={set('phone')} /></div>
          </div>
          <div className="row">
            <button type="button" className="secondary" onClick={onClose}>Cancel</button>
            <button disabled={busy}>{busy ? 'Saving…' : 'Create patient'}</button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default function Patients() {
  const navigate = useNavigate();
  const [patients, setPatients] = useState([]);
  const [search, setSearch] = useState('');
  const [showModal, setShowModal] = useState(false);

  const load = useCallback(async (q = '') => {
    const r = await api(`/patients?search=${encodeURIComponent(q)}`);
    setPatients(r.data);
  }, []);

  useEffect(() => {
    const t = setTimeout(() => load(search), 250);
    return () => clearTimeout(t);
  }, [search, load]);

  return (
    <>
      <div className="topbar"><h1>Patients</h1></div>
      <div className="content">
        <div className="card">
          <div className="toolbar">
            <input placeholder="Search by name or MRN…" value={search} onChange={(e) => setSearch(e.target.value)} />
            <div className="spacer" />
            <button onClick={() => setShowModal(true)}>+ New patient</button>
          </div>
          {patients.length === 0 ? (
            <p className="muted">No patients found.</p>
          ) : (
            <table>
              <thead><tr><th>Name</th><th>DOB</th><th>Sex</th><th>MRN</th></tr></thead>
              <tbody>
                {patients.map((p) => (
                  <tr key={p.id} style={{ cursor: 'pointer' }} onClick={() => navigate(`/patients/${p.id}`)}>
                    <td>{p.last_name}, {p.first_name}</td>
                    <td>{new Date(p.date_of_birth).toLocaleDateString()}</td>
                    <td style={{ textTransform: 'capitalize' }}>{p.sex}</td>
                    <td>{p.mrn || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
      {showModal && (
        <NewPatientModal
          onClose={() => setShowModal(false)}
          onCreated={(p) => { setShowModal(false); navigate(`/patients/${p.id}`); }}
        />
      )}
    </>
  );
}
