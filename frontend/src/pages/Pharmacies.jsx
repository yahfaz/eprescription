import { useEffect, useState, useCallback } from 'react';
import { api } from '../api/client.js';
import { useAuth } from '../context/AuthContext.jsx';

export default function Pharmacies() {
  const { hasRole } = useAuth();
  const [pharmacies, setPharmacies] = useState([]);
  const [search, setSearch] = useState('');
  const [form, setForm] = useState({ name: '', city: '', state: '', postalCode: '', phone: '', acceptsControlled: false });
  const [showForm, setShowForm] = useState(false);
  const [err, setErr] = useState('');

  const load = useCallback(async (q = '') => {
    setPharmacies((await api(`/pharmacies?search=${encodeURIComponent(q)}`)).data);
  }, []);

  useEffect(() => { const t = setTimeout(() => load(search), 250); return () => clearTimeout(t); }, [search, load]);

  const create = async (e) => {
    e.preventDefault(); setErr('');
    try {
      const body = { ...form };
      Object.keys(body).forEach((k) => body[k] === '' && delete body[k]);
      await api('/pharmacies', { method: 'POST', body });
      setForm({ name: '', city: '', state: '', postalCode: '', phone: '', acceptsControlled: false });
      setShowForm(false); load(search);
    } catch (e2) { setErr(e2.message); }
  };

  return (
    <>
      <div className="topbar"><h1>Pharmacies</h1></div>
      <div className="content">
        <div className="card">
          <div className="toolbar">
            <input placeholder="Search pharmacies…" value={search} onChange={(e) => setSearch(e.target.value)} />
            <div className="spacer" />
            {hasRole('admin') && <button onClick={() => setShowForm(!showForm)}>{showForm ? 'Close' : '+ Add pharmacy'}</button>}
          </div>
          {err && <div className="alert error">{err}</div>}
          {showForm && (
            <form onSubmit={create} style={{ marginBottom: 16 }}>
              <div className="row">
                <input placeholder="Name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
                <input placeholder="Phone" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
              </div>
              <div className="row" style={{ marginTop: 8 }}>
                <input placeholder="City" value={form.city} onChange={(e) => setForm({ ...form, city: e.target.value })} />
                <input placeholder="State" value={form.state} onChange={(e) => setForm({ ...form, state: e.target.value })} />
                <input placeholder="ZIP" value={form.postalCode} onChange={(e) => setForm({ ...form, postalCode: e.target.value })} />
                <button>Save</button>
              </div>
            </form>
          )}
          {pharmacies.length === 0 ? <p className="muted">No pharmacies found.</p> : (
            <table>
              <thead><tr><th>Name</th><th>Location</th><th>Phone</th><th>Controlled Rx</th></tr></thead>
              <tbody>
                {pharmacies.map((p) => (
                  <tr key={p.id}>
                    <td>{p.name}</td>
                    <td>{[p.city, p.state, p.postal_code].filter(Boolean).join(', ') || '—'}</td>
                    <td>{p.phone || '—'}</td>
                    <td>{p.accepts_controlled ? 'Yes' : 'No'}</td>
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
