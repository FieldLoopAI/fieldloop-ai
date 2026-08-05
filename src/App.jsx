import { Routes, Route, Navigate } from 'react-router-dom';
import ContractorCommandDashboard from './command-dashboard/ContractorCommandDashboard';
import ContractorLoginPage from './command-dashboard/ContractorLoginPage';
import { useContractorAuth } from './command-dashboard/useContractorAuth';
import StaffLoginPage from './registration-dashboard/StaffLoginPage';
import RegistrationDashboard from './registration-dashboard/RegistrationDashboard';
import { useStaffAuth } from './registration-dashboard/useStaffAuth';
import TechnicianSetupPage from './technician-setup/TechnicianSetupPage';

function ContractorSection() {
  const { tenant, session, loading, signOut } = useContractorAuth();
  if (loading) return null;
  return tenant
    ? <ContractorCommandDashboard tenant={tenant} onLogout={signOut} />
    : <ContractorLoginPage signedInButNoTenant={Boolean(session)} onSignOut={signOut} />;
}

function StaffSection() {
  const { user, loading } = useStaffAuth();
  if (loading) return null;
  if (!user) return <Navigate to="/staff/login" replace />;
  return <RegistrationDashboard staffUser={user} />;
}

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<ContractorSection />} />
      <Route path="/dashboard" element={<ContractorSection />} />
      <Route path="/staff/login" element={<StaffLoginPage />} />
      <Route path="/staff" element={<StaffSection />} />
      <Route path="/technician-setup" element={<TechnicianSetupPage />} />
    </Routes>
  );
}
