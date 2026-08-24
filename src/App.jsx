import { Routes, Route, Navigate } from 'react-router-dom';
import ContractorCommandDashboard from './command-dashboard/ContractorCommandDashboard';
import { useContractorAuth } from './command-dashboard/useContractorAuth';
import LoginPage from './shared/LoginPage';
import RegistrationDashboard from './registration-dashboard/RegistrationDashboard';
import PlatformAdminDashboard from './registration-dashboard/PlatformAdminDashboard';
import PlatformContractorDetail from './registration-dashboard/PlatformContractorDetail';
import { useStaffAuth } from './registration-dashboard/useStaffAuth';
import TechnicianSetupPage from './technician-setup/TechnicianSetupPage';
import TeamSetupPage from './team-setup/TeamSetupPage';

// Where a signed-in fl_users role lands: admin gets the cross-contractor
// Platform Overview, every other staff role gets the Registration wizard
// (HANDOFF.md §24 — Platform Overview is deliberately admin-only).
function staffHomePath(role) {
  return role === 'admin' ? '/staff/platform' : '/staff/registration';
}

// Single login entry point (app.fieldloopai.com root) for both contractor
// and staff logins. Which dashboard a session lands on isn't known until
// after auth — both auth hooks run, and whichever table resolves a row wins.
function RootSection() {
  const contractorAuth = useContractorAuth();
  const staffAuth = useStaffAuth();
  if (contractorAuth.loading || staffAuth.loading) return null;

  if (contractorAuth.tenant) {
    return <ContractorCommandDashboard tenant={contractorAuth.tenant} onLogout={contractorAuth.signOut} />;
  }
  if (staffAuth.user) {
    return <Navigate to={staffHomePath(staffAuth.user.role)} replace />;
  }

  const session = contractorAuth.session || staffAuth.session;
  if (!session) return <LoginPage />;
  // Signed in to Supabase Auth, but neither contractor_users nor fl_users
  // has a matching (linked) row for this identity.
  return <LoginPage noAccountFound onSignOut={contractorAuth.signOut} />;
}

// Role dispatcher, not a page — bounces a signed-in staff user to their
// home screen. Direct navigation/bookmarks to /staff still work.
function StaffSection() {
  const { user, loading } = useStaffAuth();
  if (loading) return null;
  if (!user) return <Navigate to="/" replace />;
  return <Navigate to={staffHomePath(user.role)} replace />;
}

function StaffRegistrationSection() {
  const { user, loading } = useStaffAuth();
  if (loading) return null;
  if (!user) return <Navigate to="/" replace />;
  return <RegistrationDashboard staffUser={user} />;
}

// Cross-contractor Platform Overview (HANDOFF.md §24) — admin-only, not
// reachable at all for any other fl_users role, not just hidden in the nav.
function PlatformSection() {
  const { user, loading, signOut } = useStaffAuth();
  if (loading) return null;
  if (!user) return <Navigate to="/" replace />;
  if (user.role !== 'admin') return <Navigate to="/staff" replace />;
  return <PlatformAdminDashboard staffUser={user} onLogout={signOut} />;
}

// Same admin-only gating as PlatformSection — the contractor drill-down
// (HANDOFF.md §25) is just as sensitive as the overview it's reached from.
function PlatformContractorSection() {
  const { user, loading } = useStaffAuth();
  if (loading) return null;
  if (!user) return <Navigate to="/" replace />;
  if (user.role !== 'admin') return <Navigate to="/staff" replace />;
  return <PlatformContractorDetail />;
}

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<RootSection />} />
      <Route path="/dashboard" element={<RootSection />} />
      <Route path="/staff/login" element={<Navigate to="/" replace />} />
      <Route path="/staff" element={<StaffSection />} />
      <Route path="/staff/registration" element={<StaffRegistrationSection />} />
      <Route path="/staff/platform" element={<PlatformSection />} />
      <Route path="/staff/platform/contractors/:id" element={<PlatformContractorSection />} />
      <Route path="/technician-setup" element={<TechnicianSetupPage />} />
      <Route path="/team-setup" element={<TeamSetupPage />} />
    </Routes>
  );
}
