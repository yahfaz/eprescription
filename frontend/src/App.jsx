import { Routes, Route, Navigate } from 'react-router-dom';
import { useAuth } from './context/AuthContext.jsx';
import Layout from './components/Layout.jsx';
import Login from './pages/Login.jsx';
import Register from './pages/Register.jsx';
import VerifyEmail from './pages/VerifyEmail.jsx';
import ForgotPassword from './pages/ForgotPassword.jsx';
import ResetPassword from './pages/ResetPassword.jsx';
import Dashboard from './pages/Dashboard.jsx';
import Patients from './pages/Patients.jsx';
import PatientDetail from './pages/PatientDetail.jsx';
import Prescriptions from './pages/Prescriptions.jsx';
import NewPrescription from './pages/NewPrescription.jsx';
import Inbox from './pages/Inbox.jsx';
import PrescriptionDetail from './pages/PrescriptionDetail.jsx';
import Pharmacies from './pages/Pharmacies.jsx';
import Reports from './pages/Reports.jsx';
import Security from './pages/Security.jsx';
import Admin from './pages/Admin.jsx';

function Protected({ children }) {
  const { user, loading } = useAuth();
  if (loading) return <div className="center-loading">Loading…</div>;
  if (!user) return <Navigate to="/login" replace />;
  return children;
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/register" element={<Register />} />
      <Route path="/verify-email" element={<VerifyEmail />} />
      <Route path="/forgot-password" element={<ForgotPassword />} />
      <Route path="/reset-password" element={<ResetPassword />} />

      <Route
        path="/"
        element={
          <Protected>
            <Layout />
          </Protected>
        }
      >
        <Route index element={<Dashboard />} />
        <Route path="patients" element={<Patients />} />
        <Route path="patients/:id" element={<PatientDetail />} />
        <Route path="prescriptions" element={<Prescriptions />} />
        <Route path="prescriptions/new" element={<NewPrescription />} />
        <Route path="prescriptions/:id" element={<PrescriptionDetail />} />
        <Route path="inbox" element={<Inbox />} />
        <Route path="pharmacies" element={<Pharmacies />} />
        <Route path="reports" element={<Reports />} />
        <Route path="security" element={<Security />} />
        <Route path="admin" element={<Admin />} />
      </Route>

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
