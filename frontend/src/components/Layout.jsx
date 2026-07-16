import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';

export default function Layout() {
  const { user, logout, hasRole } = useAuth();
  const navigate = useNavigate();

  const onLogout = async () => {
    await logout();
    navigate('/login');
  };

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">e<span>Prescribe</span></div>
        <nav>
          <NavLink to="/" end>Dashboard</NavLink>
          <NavLink to="/patients">Patients</NavLink>
          <NavLink to="/prescriptions">Prescriptions</NavLink>
          <NavLink to="/prescriptions/new">+ New Prescription</NavLink>
          <NavLink to="/inbox">Inbox</NavLink>
          <NavLink to="/pharmacies">Pharmacies</NavLink>
          {hasRole('admin') && <NavLink to="/admin">Admin</NavLink>}
        </nav>
        <div className="spacer" />
        <div className="user-box">
          <div>{user.firstName} {user.lastName}</div>
          <div className="role">{user.role}</div>
          <button className="secondary sm block" style={{ marginTop: 10 }} onClick={onLogout}>
            Sign out
          </button>
        </div>
      </aside>
      <div className="main">
        <Outlet />
      </div>
    </div>
  );
}
