// Thin client for the backend/functions/* Lambdas. Every call attaches the
// signed-in staff member's Supabase Auth JWT so the Lambda's requireRole()
// can identify the caller and look up their fl_users role.
import { supabase } from './supabaseClient';

const BASE_URL = import.meta.env.VITE_API_BASE_URL;

async function authFetch(path, { method = 'POST', body } = {}) {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) throw new Error('Not signed in.');

  let res;
  try {
    res = await fetch(`${BASE_URL}/${path}`, {
      method,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${session.access_token}`,
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  } catch (netErr) {
    const origin = typeof window !== 'undefined' ? window.location.origin : '';
    throw new Error(
      `Network Error (${netErr.message}): Unable to connect to ${path}. ` +
      `Ensure Vite is running on http://localhost:5173 (current: ${origin}) ` +
      `to match API Gateway CORS AllowOrigins.`
    );
  }

  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.error || `Request to ${path} failed (${res.status}).`);
  return json;
}

// Builds the { field: plaintext } payload for secret-backed columns —
// only includes a field when the user actually revealed/edited it (present
// in revealedValues). Never forwards masked display strings like
// "••••••••1212" as if they were real secret values. Keyed by the stable
// *column name* (e.g. 'dob_ref'), not the field's current ref value — a
// brand-new contractor has no ref yet for most of these, and keying by ref
// value would collide every unset field onto the same "undefined" key.
const PRINCIPAL_SECRET_FIELDS = { dob_ref: 'dob', ssn_last4_ref: 'ssn_last4', home_address_ref: 'home_address' };
const FINANCIALS_SECRET_FIELDS = {
  routing_number_ref: 'routing_number',
  account_number_ref: 'account_number',
  stripe_account_id_ref: 'stripe_account_id',
  backup_card_ref: 'backup_card',
};

function revealedOnly(columnToField, revealedValues) {
  const out = {};
  for (const [columnName, fieldName] of Object.entries(columnToField)) {
    if (revealedValues[columnName] !== undefined) {
      out[fieldName] = revealedValues[columnName];
    }
  }
  return out;
}

export const api = {
  createContractor: (payload) => authFetch('contractors', { body: payload }),

  listContractors: (query) =>
    authFetch('contractors/list', { body: { query } }).then((res) => res.contractors),

  getContractor: (contractorId) =>
    authFetch('contractors/get', { body: { contractorId } }),

  saveContractorDraft: (contractorId, contractorData, revealedValues) => {
    const principalSecrets = revealedOnly(PRINCIPAL_SECRET_FIELDS, revealedValues);
    return authFetch('contractors/draft', {
      body: { contractorId, ...contractorData, principalSecrets },
    });
  },

  activateContractor: (contractorId, contractorData, revealedValues) => {
    const principalSecrets = revealedOnly(PRINCIPAL_SECRET_FIELDS, revealedValues);
    return authFetch('contractors/activate', {
      body: { contractorId, ...contractorData, principalSecrets },
    });
  },

  revealField: (contractorId, tableName, columnName, refKey) =>
    authFetch('reveal', { body: { contractorId, tableName, columnName, fieldRef: refKey, fieldName: `${tableName}.${columnName}` } })
      .then((res) => res.value),

  saveContractorFinancials: (contractorId, financials, revealedValues) => {
    const secretFields = revealedOnly(FINANCIALS_SECRET_FIELDS, revealedValues);
    return authFetch('contractors/financials', {
      body: {
        contractor_id: contractorId,
        payout_bank_name: financials.payout_bank_name,
        account_type: financials.account_type,
        account_holder_name: financials.account_holder_name,
        micro_deposit_verified_ts: financials.micro_deposit_verified_ts,
        stripe_connect_model: financials.stripe_connect_model,
        payment_methods_accepted: financials.payment_methods_accepted,
        monthly_floor_amount: financials.monthly_floor_amount,
        volume_discount_tier: financials.volume_discount_tier,
        ach_authorization_signed: financials.ach_authorization_signed,
        ach_authorization_signed_by: financials.ach_authorization_signed_by,
        backup_card_expiration: financials.backup_card_expiration,
        ...secretFields,
      },
    });
  },

  exportContractorPdf: (contractorId) =>
    authFetch('contractors/pdf', { body: { contractorId } }),

  // Terminate + purge: sets contractor_system_meta.status = 'terminated' and
  // permanently deletes every AWS Secrets Manager secret tied to this
  // contractor (EIN, DOB, SSN, home address, bank/Stripe details). Does NOT
  // delete the contractor's database rows or audit history. Irreversible.
  terminateContractor: (contractorId) =>
    authFetch('contractors/terminate', { body: { contractorId } }),

  getSystemSettings: () => authFetch('settings', { method: 'GET' }),

  saveSystemSettings: (settings) =>
    authFetch('settings', { body: settings }),

  listKbEntries: (filters) =>
    authFetch('kb-entries/list', { body: filters || {} }).then((res) => res.entries),

  createKbEntry: (entryData) => authFetch('kb-entries', { body: entryData }),

  reviewKbEntry: (id, decision, editedAnswer) =>
    authFetch('kb-entries/review', { body: { id, decision, edited_answer: editedAnswer } }),

  createContractorPortalUser: (contractorId, userId, password) =>
    authFetch('contractors/portal-user', { body: { contractorId, userId, password } }),

  listTechnicians: () =>
    authFetch('technicians/list', { body: {} }).then((res) => res.technicians),

  addTechnician: (technicianData) =>
    authFetch('technicians', { body: technicianData }),

  updateTechnician: (technicianId, technicianData) =>
    authFetch('technicians/update', { body: { technician_id: technicianId, ...technicianData } }),

  deactivateTechnician: (technicianId) =>
    authFetch('technicians/deactivate', { body: { technician_id: technicianId } }),

  resendTechnicianSetup: (technicianId) =>
    authFetch('technicians/resend-setup', { body: { technician_id: technicianId } }),

  // Unauthenticated — called from the technician setup-link page before any
  // session exists (that's the whole point of the call: it's what lets the
  // technician get a password in the first place). Does not use authFetch,
  // which requires a signed-in session.
  completeTechnicianSetup: async (token, newPassword) => {
    const res = await fetch(`${BASE_URL}/technicians/complete-setup`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token, new_password: newPassword }),
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(json.error || 'Failed to complete setup.');
    return json;
  },

  // Resolves to the full { jobs, customers } object (unlike listTechnicians,
  // which unwraps to just the array) — the dispatch board needs both in one
  // round trip to populate the create-job modal's customer picker.
  listJobs: (range) => authFetch('jobs/list', { body: range || {} }),

  createJob: (jobData) => authFetch('jobs', { body: jobData }),

  assignJob: (jobId, technicianId) =>
    authFetch('jobs/assign', { body: { job_id: jobId, technician_id: technicianId } }),

  getVoiceToken: () => authFetch('jobs/voice-token', { body: {} }),

  extractJobFromVoice: (transcript) =>
    authFetch('jobs/voice-extract', {
      body: {
        transcript,
        client_now_iso: new Date().toISOString(),
        client_timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      },
    }),
};
