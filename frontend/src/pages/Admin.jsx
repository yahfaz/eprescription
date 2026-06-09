import { useEffect, useState, useCallback } from 'react';
import { api } from '../api/client.js';

const ROLES = ['admin', 'prescriber', 'nurse', 'staff', 'pharmacist'];

export default function Admin() {
  const [tab, setTab] = useState('users');
  const [users, setUsers] = useState([]);
  const [logs, setLogs] = useState([]);

  const loadUsers = useCallback(async () => setUsers((await api('/users')).data), []);
  const loadLogs = useCallback(async () => setLogs((await api('/users/audit-logs?limit=100')).data), []);

  useEffect(() => { tab === 'users' ? loadUsers() : loadLogs(); }, [tab, loadUsers, loadLogs]);

  const updateUser = async (id, changes) => {
    await api(`/users/${id}`, { method: 'PATCH', body: changes });
    loadUsers();
  };

  return (
    <>
      <div className="topbar"><h1>Administration</h1></div>
      <div className="content">
        <div className="toolbar">
          <button className={tab === 'users' ? '' : 'secondary'} onClick={() => setTab('users')}>Users</button>
          <button className={tab === 'audit' ? '' : 'secondary'} onClick={() => setTab('audit')}>Audit log</button>
        </div>

        {tab === 'users' && (
          <div className="card">
            <h3>Practice users</h3>
            <table>
              <thead><tr><th>Name</th><th>Email</th><th>Role</th><th>Verified</th><th>Active</th></tr></thead>
              <tbody>
                {users.map((u) => (
                  <tr key={u.id}>
                    <td>{u.first_name} {u.last_name}</td>
                    <td>{u.email}</td>
                    <td>
                      <select value={u.role} onChange={(e) => updateUser(u.id, { role: e.target.value })}>
                        {ROLES.map((r) => <option key={r} value={r}>{r}</option>)}
                      </select>
                    </td>
                    <td>{u.email_verified ? '✓' : '—'}</td>
                    <td>
                      <button className="secondary sm" onClick={() => updateUser(u.id, { isActive: !u.is_active })}>
                        {u.is_active ? 'Deactivate' : 'Activate'}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {tab === 'audit' && (
          <div className="card">
            <h3>Audit log</h3>
            <table>
              <thead><tr><th>When</th><th>User</th><th>Action</th><th>Entity</th></tr></thead>
              <tbody>
                {logs.map((l) => (
                  <tr key={l.id}>
                    <td>{new Date(l.created_at).toLocaleString()}</td>
                    <td>{l.first_name ? `${l.first_name} ${l.last_name}` : '—'}</td>
                    <td><code>{l.action}</code></td>
                    <td className="muted">{l.entity_type} {l.entity_id ? l.entity_id.slice(0, 8) : ''}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </>
  );
}
