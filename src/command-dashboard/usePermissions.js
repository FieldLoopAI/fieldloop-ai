// src/command-dashboard/usePermissions.js
//
// Real capability gating for the Contractor Command Dashboard's multi-role
// system (HANDOFF.md §28.4a's deferred build). Reconciled against the
// original spec's matrix (FieldLoop_Contractor_Command_Dashboard_SPEC.md
// §13b) and what's actually a real action in this app today — several of
// the spec's cells (e.g. "Send only" for estimates) don't correspond to any
// real action here, so they collapse to the closest real capability (view)
// rather than being implemented literally. Every boolean here has a matching
// role-allowlist on the Lambda it gates — this hook only controls what's
// shown, the backend is the actual enforcement (never trust this alone).
export function permissionsFor(role) {
  const is = (...roles) => roles.includes(role);
  return {
    // Jobs & Dispatch
    canScheduleJobs: is('owner_admin', 'dispatcher'),
    canAssignTechnicians: is('owner_admin', 'dispatcher', 'field_lead'),
    // Estimates & Approvals — approval is a financial gate, owner_admin only
    // regardless of role (see HANDOFF.md §33.2's reasoning).
    canApproveEstimates: is('owner_admin'),
    // Customer PII
    canManageCustomers: is('owner_admin', 'dispatcher'),
    // Data Archive
    canRequestExport: is('owner_admin', 'dispatcher', 'bookkeeper'),
    // Fleet, technician roster, retention, and KB submission have no
    // corresponding column in the spec's matrix — left owner_admin-only,
    // unchanged from before this pass, rather than guessing new scope for
    // them the same way this project's own history warns against.
    canManageFleet: is('owner_admin'),
    canManageTechnicians: is('owner_admin'),
    canManageRetention: is('owner_admin'),
    canSubmitKb: is('owner_admin'),
    // Team & Access — spec §13's explicit "only Owner/Admin can add,
    // remove, or change roles for other team members."
    canManageTeam: is('owner_admin'),
  };
}
