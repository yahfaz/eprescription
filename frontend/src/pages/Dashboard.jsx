import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api/client.js';
import { useAuth } from '../context/AuthContext.jsx';

export default function Dashboard() {
  const { user } = useAuth();
  const [stats, setStats] = useState({ patients: 0, prescriptions: 0, drafts: 0, transmitted: 0 });
  const [recent, setRecent] = useState([]);

  useEffect(() => {
    (async () => {
      try {
        const [patients, all, drafts, transmitted] = await Promise.all([
          api('/patients?limit=1'),
          api('/prescriptions?limit=5'),
          api('/prescriptions?status=draft&limit=1'),
          api('/prescriptions?status=transmitted&limit=1'),
        ]);
        setStats({
          patients: patients.pagination.total,
          prescriptions: all.data.length,
          drafts: drafts.data.length,
          transmitted: transmitted.data.length,
        });
        setRecent(all.data);
      } catch { /* ignore */ }
    })();
  }, []);

  return (
    <>
      <div className="topbar"><h1>Dashboard</h1></div>
      <div className="content">
        <p className="muted">Welcome back, {user.firstName}.</p>
        <div className="stat-grid">
          <div className="stat"><div className="n">{stats.patients}</div><div className="l">Active patients</div></div>
          <div className="stat"><div className="n">{stats.drafts}</div><div className="l">Draft prescriptions</div></div>
          <div className="stat"><div className="n">{stats.transmitted}</div><div className="l">Transmitted</div></div>
          <div className="stat"><div className="n">{stats.prescriptions}</div><div className="l">Recent activity</div></div>
        </div>

        <div className="card">
          <div className="toolbar">
            <h3 style={{ margin: 0 }}>Recent prescriptions</h3>
            <div className="spacer" />
            <Link to="/prescriptions/new"><button className="sm">+ New prescription</button></Link>
          </div>
          {recent.length === 0 ? (
            <p className="muted">No prescriptions yet. Create one to get started.</p>
          ) : (
            <table>
              <thead><tr><th>Patient</th><th>Medication</th><th>Status</th><th>Date</th></tr></thead>
              <tbody>
                {recent.map((r) => (
                  <tr key={r.id}>
                    <td><Link to={`/prescriptions/${r.id}`}>{r.patient_first_name} {r.patient_last_name}</Link></td>
                    <td>{r.drug_name}</td>
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
