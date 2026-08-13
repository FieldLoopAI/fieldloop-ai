import { Routes, Route, Navigate } from 'react-router-dom';
import ContractorCommandDashboard from './command-dashboard/ContractorCommandDashboard';
import ContractorLoginPage from './command-dashboard/ContractorLoginPage';
import { useContractorAuth } from './command-dashboard/useContractorAuth';
import StaffLoginPage from './registration-dashboard/StaffLoginPage';
import RegistrationDashboard from './registration-dashboard/RegistrationDashboard';
import PlatformAdminDashboard from './registration-dashboard/PlatformAdminDashboard';
import PlatformContractorDetail from './registration-dashboard/PlatformContractorDetail';
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

// Cross-contractor Platform Overview (HANDOFF.md §24) — admin-only, not
// reachable at all for any other fl_users role, not just hidden in the nav.
function PlatformSection() {
  const { user, loading, signOut } = useStaffAuth();
  if (loading) return null;
  if (!user) return <Navigate to="/staff/login" replace />;
  if (user.role !== 'admin') return <Navigate to="/staff" replace />;
  return <PlatformAdminDashboard staffUser={user} onLogout={signOut} />;
}

// Same admin-only gating as PlatformSection — the contractor drill-down
// (HANDOFF.md §25) is just as sensitive as the overview it's reached from.
function PlatformContractorSection() {
  const { user, loading } = useStaffAuth();
  if (loading) return null;
  if (!user) return <Navigate to="/staff/login" replace />;
  if (user.role !== 'admin') return <Navigate to="/staff" replace />;
  return <PlatformContractorDetail />;
}

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<ContractorSection />} />
      <Route path="/dashboard" element={<ContractorSection />} />
      <Route path="/staff/login" element={<StaffLoginPage />} />
      <Route path="/staff" element={<StaffSection />} />
      <Route path="/staff/platform" element={<PlatformSection />} />
      <Route path="/staff/platform/contractors/:id" element={<PlatformContractorSection />} />
      <Route path="/technician-setup" element={<TechnicianSetupPage />} />
    </Routes>
  );
}
