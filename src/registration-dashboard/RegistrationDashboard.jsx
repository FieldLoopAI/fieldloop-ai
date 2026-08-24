// Registration dashboard feature
import React, { useState, useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../shared/services/api';
import { supabase } from '../shared/services/supabaseClient';

import Step1AccessSecurity from './steps/Step1AccessSecurity';
import Step2BusinessIdentity from './steps/Step2BusinessIdentity';
import Step3OwnershipPrincipal from './steps/Step3OwnershipPrincipal';
import Step4KeyContacts from './steps/Step4KeyContacts';
import Step5ComplianceLicensing from './steps/Step5ComplianceLicensing';
import Step6OperationsWorkforce from './steps/Step6OperationsWorkforce';
import Step7SecureFinancials from './steps/Step7SecureFinancials';
import Step8InternalSystemSettings from './steps/Step8InternalSystemSettings';

import {
  Lock,
  Settings2,
  Printer,
  Save,
  X,
  FileCheck,
  Check,
  ArrowRight,
  ArrowLeft,
  UserPlus,
  Eye,
  EyeOff,
  Copy,
  ShieldCheck,
  ExternalLink,
  LogOut,
  Search
} from 'lucide-react';

// Persists only navigation state (which contractor/step/tab), never any
// secret value or in-flight credentials — sessionStorage survives a browser
// tab discard/reload (e.g. Chrome/Edge "memory saver" unloading a
// backgrounded tab), which otherwise resets the whole in-memory React state
// and makes it look like the app "forgot" where you were.
const NAV_STORAGE_KEY = 'fieldloop_staff_nav';

function readPersistedNav() {
  try {
    return JSON.parse(sessionStorage.getItem(NAV_STORAGE_KEY)) || {};
  } catch {
    return {};
  }
}

// Maps activate-contractor's plain-English validation messages (see
// backend/functions/activate-contractor/index.js's validate()) to the
// wizard step that can fix them, so the error list can jump you straight
// there instead of leaving you to hunt across all 8 steps.
const VALIDATION_ERROR_STEPS = [
  { step: 2, match: /business legal name|business structure|business tax ein|business phone|business email|physical address/i },
  { step: 3, match: /owner\/principal|owner date of birth|owner ssn|owner personal|owner home address/i },
  { step: 4, match: /primary contact/i },
  { step: 5, match: /license|insurance|compensation|surety bond|w-9/i },
  { step: 6, match: /primary trade|technician count|service offered/i },
  { step: 7, match: /payout bank|account type|stripe connect|ach platform fee/i },
];

function stepForValidationError(message) {
  const found = VALIDATION_ERROR_STEPS.find(({ match }) => match.test(message));
  return found ? found.step : null;
}

export default function RegistrationDashboard({ staffUser }) {
  // Main states
  const activeUser = staffUser;
  const canCreateContractor = ['admin', 'onboarding'].includes(activeUser.role);
  const persistedNav = readPersistedNav();
  const [activeContractorId, setActiveContractorId] = useState(persistedNav.activeContractorId || '');
  const [activeStep, setActiveStep] = useState(persistedNav.activeStep || 1);
  const [contractorData, setContractorData] = useState(null);
  const [revealedValues, setRevealedValues] = useState({});
  const [dbInspectorOpen, setDbInspectorOpen] = useState(false);

  // Landing mode: which panel to show when no contractor is loaded yet.
  const [mode, setMode] = useState(persistedNav.mode || (canCreateContractor ? 'new' : 'existing'));

  // New Contractor creation state
  const [newContractorName, setNewContractorName] = useState('');
  const [newContractorEin, setNewContractorEin] = useState('');
  const [creatingContractor, setCreatingContractor] = useState(false);

  // Existing Contractor search state
  const [existingSearchQuery, setExistingSearchQuery] = useState('');
  const [existingSearchResults, setExistingSearchResults] = useState([]);
  const [searchingContractors, setSearchingContractors] = useState(false);

  // Activation Credentials Page State
  const [showCredentialsPage, setShowCredentialsPage] = useState(false);
  const [credentialsData, setCredentialsData] = useState({
    userId: '',
    password: '',
    confirmPassword: ''
  });
  const [showPassword, setShowPassword] = useState(false);
  const [credentialsSaved, setCredentialsSaved] = useState(false);
  const [credentialErrors, setCredentialErrors] = useState([]);

  // Notifications
  const [errorBanner, setErrorBanner] = useState(null);
  const [validationErrors, setValidationErrors] = useState([]);
  const [validationErrorsByField, setValidationErrorsByField] = useState({});
  const [successBanner, setSuccessBanner] = useState(null);

  // Flash indicator
  const loadRequestIdRef = useRef(0);

  // Session timer (client-side idle-out UX; actual auth enforcement is the
  // Supabase JWT's own expiry, checked server-side by every Lambda)
  const [sysSettings, setSysSettings] = useState(null);
  const [sessionTimeoutSeconds, setSessionTimeoutSeconds] = useState(900);
  const [sessionExpired, setSessionExpired] = useState(false);

  // Keep sessionStorage in sync with navigation state so a tab
  // discard/reload can restore it (see readPersistedNav above).
  useEffect(() => {
    sessionStorage.setItem(NAV_STORAGE_KEY, JSON.stringify({ mode, activeContractorId, activeStep }));
  }, [mode, activeContractorId, activeStep]);

  // Persist the unsaved contractor draft and revealed values to sessionStorage.
  useEffect(() => {
    if (activeContractorId && contractorData) {
      sessionStorage.setItem(
        `fieldloop_draft_${activeContractorId}`,
        JSON.stringify({ contractorData, revealedValues })
      );
    }
  }, [activeContractorId, contractorData, revealedValues]);

  // On mount, if we restored a contractor id from a prior session in this
  // tab, re-fetch it fresh from the server rather than trusting any stale
  // client state (there isn't any to trust — only the id was persisted).
  useEffect(() => {
    if (persistedNav.activeContractorId) {
      loadContractor(persistedNav.activeContractorId);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    api.getSystemSettings()
      .then((settings) => {
        setSysSettings(settings);
        setSessionTimeoutSeconds(settings.session_timeout_minutes * 60);
      })
      .catch((e) => setErrorBanner(e.message));
  }, []);

  // Debounced search for the "Existing Contractors" tab — fires on mode
  // switch too (empty query returns a browsable default list).
  useEffect(() => {
    if (mode !== 'existing' || contractorData) return;
    setSearchingContractors(true);
    const handle = setTimeout(() => {
      api.listContractors(existingSearchQuery)
        .then(setExistingSearchResults)
        .catch((e) => setErrorBanner(e.message))
        .finally(() => setSearchingContractors(false));
    }, 300);
    return () => clearTimeout(handle);
  }, [existingSearchQuery, mode, contractorData]);

  useEffect(() => {
    const timer = setInterval(() => {
      setSessionTimeoutSeconds(prev => {
        if (prev <= 1) {
          clearInterval(timer);
          setSessionExpired(true);
          setErrorBanner("Security Session Expired: Idle for >15 minutes. Re-authenticate to make changes.");
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  // Step2/Step7's <select> fields display a fallback (e.g. "LLC",
  // "Business Checking") whenever the underlying value is missing, so a
  // brand-new contractor's dropdown never looks unset — but that fallback
  // was display-only and never got written into contractorData, so
  // validateStep would flag it as missing even though the field looked
  // filled in on screen. Backfilling the same default into the actual data
  // as soon as it loads keeps what's shown and what's saved in sync.
  const withFieldDefaults = (data) => {
    if (!data) return data;
    const contractor = data.contractor ? { ...data.contractor } : data.contractor;
    if (contractor && !contractor.business_structure) contractor.business_structure = 'llc';
    const financials = data.financials ? { ...data.financials } : data.financials;
    if (financials && !financials.account_type) financials.account_type = 'business_checking';
    return { ...data, contractor, financials };
  };

  // Explicit load, no longer auto-fired on every keystroke in the ID field
  // — call with an id (from a search result) or with none to (re)load
  // whatever's currently in activeContractorId (manual paste / refresh).
  // loadContractor is sometimes fired without being awaited (e.g.
  // handleBackToDashboard), so a slow response can still be in flight after
  // the user has already navigated elsewhere (back to search, a different
  // contractor). loadRequestIdRef guards against that response landing late
  // and silently overwriting whatever the user navigated to in the meantime.
  const loadContractor = async (contractorId) => {
    const targetId = contractorId || activeContractorId;
    if (!targetId) return;
    const requestId = ++loadRequestIdRef.current;

    // Check if there is a local session draft first!
    const cached = sessionStorage.getItem(`fieldloop_draft_${targetId}`);
    if (cached) {
      try {
        const { contractorData: cachedData, revealedValues: cachedRevealed } = JSON.parse(cached);
        if (cachedData) {
          setActiveContractorId(targetId);
          setContractorData(withFieldDefaults(cachedData));
          setRevealedValues(cachedRevealed || {});
          setErrorBanner(null);
          setValidationErrors([]);
          setValidationErrorsByField({});
          return;
        }
      } catch (e) {
        console.error("Error reading cached draft", e);
      }
    }

    try {
      setErrorBanner(null);
      setValidationErrors([]);
      setValidationErrorsByField({});
      const data = await api.getContractor(targetId);
      if (loadRequestIdRef.current !== requestId) return; // superseded by a newer navigation
      setActiveContractorId(targetId);
      setContractorData(withFieldDefaults(data));
      setRevealedValues({});
    } catch (e) {
      if (loadRequestIdRef.current !== requestId) return;
      setErrorBanner(e.message);
      setContractorData(null);
      setRevealedValues({});
    }
  };

  const loadContractorFromServer = async (targetId) => {
    const requestId = ++loadRequestIdRef.current;
    try {
      setErrorBanner(null);
      const data = await api.getContractor(targetId);
      if (loadRequestIdRef.current !== requestId) return;
      setActiveContractorId(targetId);
      setContractorData(withFieldDefaults(data));
      // Remove cache since the server is now successfully updated with this data
      sessionStorage.removeItem(`fieldloop_draft_${targetId}`);
    } catch (e) {
      if (loadRequestIdRef.current !== requestId) return;
      setErrorBanner(e.message);
      setContractorData(null);
    }
  };

  const handleCreateNewContractor = async () => {
    if (!newContractorName.trim() || !newContractorEin.trim()) {
      setErrorBanner('Legal Business Name and EIN are required to create a new contractor.');
      return;
    }
    try {
      setCreatingContractor(true);
      setErrorBanner(null);
      const res = await api.createContractor({ legal_name: newContractorName.trim(), ein: newContractorEin.trim() });
      setNewContractorName('');
      setNewContractorEin('');
      setActiveStep(2);
      await loadContractor(res.contractorId);
      setSuccessBanner(`New contractor created (${res.publicId}). Continue filling out the remaining steps.`);
      setTimeout(() => setSuccessBanner(null), 4000);
    } catch (e) {
      setErrorBanner(e.message);
    } finally {
      setCreatingContractor(false);
    }
  };

  const handleBackToSearch = () => {
    loadRequestIdRef.current++; // ininvalidate any load still  flight
    setContractorData(null);
    setActiveContractorId('');
    setActiveStep(1);
    setRevealedValues({});
    setMode(canCreateContractor ? 'new' : 'existing');
  };

  const handleResetTimer = () => {
    if (sysSettings) setSessionTimeoutSeconds(sysSettings.session_timeout_minutes * 60);
    setSessionExpired(false);
    if (sessionExpired) loadContractor();
  };

  const handleStepSelect = (step) => {
    setActiveStep(step);
    setValidationErrors([]);
    setValidationErrorsByField({});
  };

  // revealedValues is keyed by the stable *column name* (e.g. 'dob_ref'),
  // not by the field's current ref value — a brand-new contractor has no
  // ref yet for most secret fields (undefined until first save), and keying
  // by ref value would collide every unset field onto the same "undefined"
  // key. Column-name keying also lets Step2/3/7 treat "no ref yet" as its
  // own valid, freely-editable state instead of a permanently read-only one.
  const handleRevealField = async (tableName, columnName, refKey) => {
    if (sessionExpired) {
      setErrorBanner("Security Exception: Session expired.");
      return;
    }

    // Toggle: If currently revealed, unmask / hide back
    if (revealedValues[columnName] !== undefined) {
      setRevealedValues(prev => {
        const next = { ...prev };
        delete next[columnName];
        return next;
      });
      return;
    }

    try {
      setErrorBanner(null);
      const decValue = await api.revealField(activeContractorId, tableName, columnName, refKey);
      setRevealedValues(prev => ({ ...prev, [columnName]: decValue }));
    } catch (e) {
      setErrorBanner(e.message);
    }
  };

  // Setter for editing an already-revealed/editable masked value (EIN in
  // Step2, DOB/SSN/home address in Step3, routing/account/Stripe/card in
  // Step7) — replaces the object rather than mutating it in place, so the
  // sessionStorage draft-persist effect below (which depends on
  // revealedValues by reference) actually detects the change and saves it.
  const handleRevealedValueChange = (columnName, val) => {
    setRevealedValues(prev => ({ ...prev, [columnName]: val }));
  };

  const handleLocalChange = (section, updatedSectionData) => {
    setContractorData(prev => ({
      ...prev,
      [section]: updatedSectionData
    }));
    // Clear validation errors when user changes input
    setValidationErrorsByField({});
    setValidationErrors([]);
  };

  // Only Step 7 ever touches financials data — calling saveContractorFinancials
  // on every other step was a wasted extra Lambda round-trip every time (it
  // would just re-save the same already-current values). On Step 7 itself,
  // the two calls write to entirely separate tables with no dependency on
  // each other, so they run concurrently instead of back-to-back.
  const saveCurrentData = async () => {
    const calls = [api.saveContractorDraft(activeContractorId, contractorData, revealedValues)];
    if (activeStep === 7) {
      calls.push(api.saveContractorFinancials(activeContractorId, contractorData.financials || {}, revealedValues));
    }
    await Promise.all(calls);
  };

  const validateStep = (stepNum) => {
    const errors = {};
    if (!contractorData) return errors;

    const c = contractorData.contractor || {};
    const p = contractorData.principal || {};
    const contacts = contractorData.contacts || [];
    const comp = contractorData.compliance || {};
    const ops = contractorData.operations || {};
    const financials = contractorData.financials || {};
    const m = contractorData.meta || {};

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    const phoneRegex = /^\(?([0-9]{3})\)?[-. ]?([0-9]{3})[-. ]?([0-9]{4})$/;

    if (stepNum === 2) {
      if (!c.legal_name?.trim()) errors.legal_name = "Legal Business Name is required.";
      if (!c.business_structure) errors.business_structure = "Business Structure selection is required.";
      
      const einVal = revealedValues['ein_ref'] ?? c.ein_val;
      if (!einVal?.trim() && !c.ein_ref) {
        errors.ein_val = "Business Tax EIN is required.";
      } else if (einVal && !/^\d{2}-?\d{7}$/.test(einVal.trim())) {
        errors.ein_val = "EIN must be a 9-digit number in the format XX-XXXXXXX or XXXXXXXXX.";
      }

      if (!c.business_phone?.trim()) {
        errors.business_phone = "Business Phone Number is required.";
      } else if (!phoneRegex.test(c.business_phone.trim())) {
        errors.business_phone = "Please enter a valid 10-digit phone number.";
      }

      if (c.business_sms?.trim() && !phoneRegex.test(c.business_sms.trim())) {
        errors.business_sms = "Please enter a valid 10-digit SMS number.";
      }

      if (!c.business_email?.trim()) {
        errors.business_email = "Business Email Address is required.";
      } else if (!emailRegex.test(c.business_email.trim())) {
        errors.business_email = "Please enter a valid email address.";
      }

      if (c.website?.trim() && !/^(https?:\/\/)?([\da-z.-]+)\.([a-z.]{2,6})([\/\w .-]*)*\/?$/.test(c.website.trim())) {
        errors.website = "Please enter a valid URL (e.g. https://company.com).";
      }

      if (!c.physical_street?.trim()) errors.physical_street = "Physical Street Address is required.";
      if (!c.physical_city?.trim()) errors.physical_city = "Physical City is required.";
      if (!c.physical_state?.trim()) errors.physical_state = "Physical State is required.";
      if (!c.physical_zip?.trim()) {
        errors.physical_zip = "Physical ZIP Code is required.";
      } else if (!/^\d{5}(-\d{4})?$/.test(c.physical_zip.trim())) {
        errors.physical_zip = "ZIP code must be 5 digits (e.g., 12345) or ZIP+4 (e.g., 12345-6789).";
      }

      if (c.mailing_street?.trim()) {
        if (!c.mailing_city?.trim()) errors.mailing_city = "Mailing City is required.";
        if (!c.mailing_state?.trim()) errors.mailing_state = "Mailing State is required.";
        if (!c.mailing_zip?.trim()) {
          errors.mailing_zip = "Mailing ZIP Code is required.";
        } else if (!/^\d{5}(-\d{4})?$/.test(c.mailing_zip.trim())) {
          errors.mailing_zip = "ZIP code must be 5 digits or ZIP+4.";
        }
      }
    }

    if (stepNum === 3) {
      if (!p.full_name?.trim()) errors.full_name = "Owner/Principal name is required.";
      if (!p.title?.trim()) errors.title = "Owner/Principal job title is required.";
      
      if (p.ownership_pct !== undefined && p.ownership_pct !== null && p.ownership_pct !== '') {
        const pct = parseFloat(p.ownership_pct);
        if (isNaN(pct) || pct < 0 || pct > 100) {
          errors.ownership_pct = "Ownership % must be a number between 0 and 100.";
        }
      }

      const dobVal = revealedValues['dob_ref'] ?? p.dob_val;
      if (!dobVal && !p.dob_ref) {
        errors.dob_val = "Owner Date of Birth is required for Stripe KYC.";
      } else if (dobVal) {
        const dobDate = new Date(dobVal);
        if (isNaN(dobDate.getTime())) {
          errors.dob_val = "Please enter a valid Date of Birth.";
        } else {
          const today = new Date();
          let age = today.getFullYear() - dobDate.getFullYear();
          const m = today.getMonth() - dobDate.getMonth();
          if (m < 0 || (m === 0 && today.getDate() < dobDate.getDate())) {
            age--;
          }
          if (age < 18) {
            errors.dob_val = "Principal must be at least 18 years old.";
          }
        }
      }

      const ssnVal = revealedValues['ssn_last4_ref'] ?? p.ssn_last4_val;
      if (!ssnVal && !p.ssn_last4_ref) {
        errors.ssn_last4_val = "Owner SSN Last 4 digits is required for Stripe KYC.";
      } else if (ssnVal && !/^\d{4}$/.test(ssnVal.trim())) {
        errors.ssn_last4_val = "SSN Last 4 must be exactly 4 digits.";
      }

      if (!p.personal_mobile?.trim()) {
        errors.personal_mobile = "Owner Personal Mobile Number is required.";
      } else if (!phoneRegex.test(p.personal_mobile.trim())) {
        errors.personal_mobile = "Please enter a valid 10-digit phone number.";
      }

      if (!p.personal_email?.trim()) {
        errors.personal_email = "Owner Personal Email Address is required.";
      } else if (!emailRegex.test(p.personal_email.trim())) {
        errors.personal_email = "Please enter a valid email address.";
      }

      const addressVal = revealedValues['home_address_ref'] ?? p.home_address_val;
      if (!addressVal && !p.home_address_ref) {
        errors.home_address_val = "Owner Home Address is required.";
      }
    }

    if (stepNum === 4) {
      if (!contacts.some((c) => c.contact_type === 'primary')) {
        errors.contacts = "At least one Primary Contact must be specified.";
      }
      contacts.forEach((contact, idx) => {
        if (!contact.full_name?.trim()) {
          errors[`contact_${idx}_full_name`] = "Full name is required.";
        }
        if (contact.email?.trim() && !emailRegex.test(contact.email.trim())) {
          errors[`contact_${idx}_email`] = "Please enter a valid email address.";
        }
        if (contact.direct_phone?.trim() && !phoneRegex.test(contact.direct_phone.trim())) {
          errors[`contact_${idx}_direct_phone`] = "Please enter a valid 10-digit phone number.";
        }
        if (contact.sms_phone?.trim() && !phoneRegex.test(contact.sms_phone.trim())) {
          errors[`contact_${idx}_sms_phone`] = "Please enter a valid 10-digit phone number.";
        }
      });
    }

    if (stepNum === 5) {
      if (!comp.primary_license_number?.trim()) errors.primary_license_number = "Primary State Trade License Number is required.";
      if (!comp.license_state?.trim()) errors.license_state = "License State is required.";
      if (!comp.license_issuing_authority?.trim()) errors.license_issuing_authority = "License Issuing Authority is required.";
      if (!comp.license_expiration_date) {
        errors.license_expiration_date = "License Expiration Date is required.";
      } else {
        const expDate = new Date(comp.license_expiration_date);
        if (isNaN(expDate.getTime())) {
          errors.license_expiration_date = "Please enter a valid expiration date.";
        } else if (expDate < new Date()) {
          errors.license_expiration_date = "License expiration date must be in the future.";
        }
      }

      if (!comp.gl_insurance_provider?.trim()) errors.gl_insurance_provider = "General Liability Insurance Carrier is required.";
      if (!comp.gl_policy_number?.trim()) errors.gl_policy_number = "Policy Number is required.";
      if (!comp.gl_expiration) {
        errors.gl_expiration = "Expiration Date is required.";
      } else {
        const expDate = new Date(comp.gl_expiration);
        if (isNaN(expDate.getTime())) {
          errors.gl_expiration = "Please enter a valid date.";
        } else if (expDate < new Date()) {
          errors.gl_expiration = "GL expiration date must be in the future.";
        }
      }

      if (!comp.wc_carrier?.trim()) errors.wc_carrier = "Workers' Compensation Carrier is required.";
      if (!comp.wc_policy_number?.trim()) errors.wc_policy_number = "Policy Number is required.";
      if (!comp.wc_expiration) {
        errors.wc_expiration = "Expiration Date is required.";
      } else {
        const expDate = new Date(comp.wc_expiration);
        if (isNaN(expDate.getTime())) {
          errors.wc_expiration = "Please enter a valid date.";
        } else if (expDate < new Date()) {
          errors.wc_expiration = "WC expiration date must be in the future.";
        }
      }

      if (comp.is_bonded === undefined || comp.is_bonded === null || comp.is_bonded === "") {
        errors.is_bonded = "Surety Bond status is required.";
      }

      if (!comp.w9_on_file) {
        errors.w9_on_file = "W-9 Tax Documentation must be marked as On File.";
      }
    }

    if (stepNum === 6) {
      if (!ops.primary_trade?.trim()) errors.primary_trade = "Primary Trade setting is required.";
      if (!ops.services_offered || ops.services_offered.length === 0) {
        errors.services_offered = "At least one Service Offered must be listed.";
      }
      if (!ops.technician_count || parseInt(ops.technician_count) <= 0) {
        errors.technician_count = "Active Technician count must be greater than zero.";
      }
      if (ops.service_radius_miles !== undefined && ops.service_radius_miles !== null && ops.service_radius_miles !== '') {
        const rad = parseInt(ops.service_radius_miles);
        if (isNaN(rad) || rad <= 0) {
          errors.service_radius_miles = "Service radius must be greater than zero.";
        }
      }
    }

    if (stepNum === 7) {
      if (!financials.payout_bank_name?.trim()) errors.payout_bank_name = "Payout Bank Name is required.";
      if (!financials.account_type) errors.account_type = "Account type selection is required.";

      const routingVal = revealedValues['routing_number_ref'] ?? financials.routing_number_val;
      if (!routingVal && !financials.routing_number_ref) {
        errors.routing_number_val = "Payout Bank Routing number is required.";
      } else if (routingVal && !/^\d{9}$/.test(routingVal.trim())) {
        errors.routing_number_val = "Routing number must be exactly 9 digits.";
      }

      const accountVal = revealedValues['account_number_ref'] ?? financials.account_number_val;
      if (!accountVal && !financials.account_number_ref) {
        errors.account_number_val = "Payout Bank Account number is required.";
      } else if (accountVal && !/^\d{4,17}$/.test(accountVal.trim())) {
        errors.account_number_val = "Account number must be between 4 and 17 digits.";
      }

      const stripeVal = revealedValues['stripe_account_id_ref'] ?? financials.stripe_account_id_val;
      if (!stripeVal && !financials.stripe_account_id_ref) {
        errors.stripe_account_id_val = "Stripe Connect Account ID is required.";
      } else if (stripeVal && !/^acct_[a-zA-Z0-9]+$/.test(stripeVal.trim())) {
        errors.stripe_account_id_val = "Stripe Account ID must start with 'acct_'.";
      }

      if (!financials.ach_authorization_signed) {
        errors.ach_authorization_signed = "Contractor must authorize ACH weekly platform fee pull.";
      }
    }

    if (stepNum === 8) {
      if (!m.status) errors.status = "Status is required.";
      if (m.risk_score !== undefined && m.risk_score !== null && m.risk_score !== '') {
        const score = parseInt(m.risk_score);
        if (isNaN(score) || score < 0 || score > 100) {
          errors.risk_score = "Risk score must be between 0 and 100.";
        }
      }
    }

    return errors;
  };

  const handleSaveDraft = async () => {
    if (sessionExpired) {
      setErrorBanner("Session expired. Cannot save changes.");
      return;
    }
    const errors = validateStep(activeStep);
    setValidationErrorsByField(errors);
    try {
      setErrorBanner(null);
      setValidationErrors([]);
      await saveCurrentData();
      await loadContractorFromServer(activeContractorId);
      setSuccessBanner("Draft saved successfully.");
      setTimeout(() => setSuccessBanner(null), 3000);
    } catch (e) {
      setErrorBanner(e.message);
    }
  };

  // Save & Continue to Next Step
  const handleSaveAndContinue = async () => {
    if (sessionExpired) {
      setErrorBanner("Session expired. Cannot save changes.");
      return;
    }
    const errors = validateStep(activeStep);
    if (Object.keys(errors).length > 0) {
      setValidationErrorsByField(errors);
      setValidationErrors(Object.values(errors));
      setErrorBanner("Please correct the validation errors in the current step.");
      return;
    }

    try {
      setErrorBanner(null);
      setValidationErrors([]);
      setValidationErrorsByField({});
      await saveCurrentData();

      if (activeStep < 8) {
        setSuccessBanner(`Step ${activeStep} saved successfully. Proceeding to Step ${activeStep + 1}...`);
        const nextStep = activeStep + 1;
        setActiveStep(nextStep);
        await loadContractorFromServer(activeContractorId);
        setTimeout(() => setSuccessBanner(null), 3000);
      } else {
        handleActivateContractor();
      }
    } catch (e) {
      setErrorBanner(e.message);
    }
  };

  const handleBackStep = () => {
    if (activeStep > 1) {
      setActiveStep(prev => prev - 1);
    }
  };

  const handleActivateContractor = async () => {
    if (sessionExpired) {
      setErrorBanner("Session expired. Cannot activate record.");
      return;
    }
    const errors = validateStep(8);
    if (Object.keys(errors).length > 0) {
      setValidationErrorsByField(errors);
      setValidationErrors(Object.values(errors));
      setErrorBanner("Please correct the validation errors in the current step.");
      return;
    }

    try {
      setErrorBanner(null);
      setValidationErrors([]);
      setValidationErrorsByField({});

      const res = await api.activateContractor(activeContractorId, contractorData, revealedValues);
      if (res.success) {
        setSuccessBanner(null);
        setErrorBanner(null);
        sessionStorage.removeItem(`fieldloop_draft_${activeContractorId}`);
        await loadContractorFromServer(activeContractorId);
        const suggestedId = contractorData.contractor?.business_email || contractorData.principal?.personal_email || '';
        setCredentialsData({ userId: suggestedId, password: '', confirmPassword: '' });
        setCredentialsSaved(false);
        setCredentialErrors([]);
        setShowCredentialsPage(true);
      } else {
        setValidationErrors(res.errors || ["Validation checks failed."]);
        setErrorBanner("Validation Error: Please complete all required fields before activating.");
      }
    } catch (e) {
      setErrorBanner(e.message);
    }
  };

  const handleSaveCredentials = async () => {
    const errors = [];
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(credentialsData.userId.trim())) {
      errors.push('Enter a valid email address for the contractor login.');
    }
    if (!credentialsData.password || credentialsData.password.length < 8) {
      errors.push('Password must be at least 8 characters.');
    }
    if (!/[A-Z]/.test(credentialsData.password)) {
      errors.push('Password must contain at least one uppercase letter.');
    }
    if (!/[0-9]/.test(credentialsData.password)) {
      errors.push('Password must contain at least one number.');
    }
    if (!/[!@#$%^&*()_+\-=[\]{};':"\\|,.<>/?]/.test(credentialsData.password)) {
      errors.push('Password must contain at least one special character.');
    }
    if (credentialsData.password !== credentialsData.confirmPassword) {
      errors.push('Passwords do not match.');
    }
    if (errors.length > 0) {
      setCredentialErrors(errors);
      return;
    }

    try {
      await api.createContractorPortalUser(activeContractorId, credentialsData.userId.trim(), credentialsData.password);
      setCredentialErrors([]);
      setCredentialsSaved(true);
    } catch (e) {
      setCredentialErrors([e.message]);
    }
  };

  const handleBackToDashboard = async () => {
    setShowCredentialsPage(false);
    setCredentialsSaved(false);
    setCredentialsData({ userId: '', password: '', confirmPassword: '' });
    setActiveStep(8);
    await loadContractor();
    setSuccessBanner('Contractor activated and dashboard credentials configured.');
    setTimeout(() => setSuccessBanner(null), 5000);
  };

  const handleExportPdf = async () => {
    try {
      setErrorBanner(null);
      const res = await api.exportContractorPdf(activeContractorId);
      const byteChars = atob(res.pdfBase64);
      const bytes = new Uint8Array(byteChars.length);
      for (let i = 0; i < byteChars.length; i++) bytes[i] = byteChars.charCodeAt(i);
      const blob = new Blob([bytes], { type: 'application/pdf' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${contractorData?.contractor?.contractor_id_public || activeContractorId}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      setErrorBanner(e.message);
    }
  };

  const handleTerminateContractor = async () => {
    const legalName = contractorData?.contractor?.legal_name || activeContractorId;
    const confirmed = window.confirm(
      `Terminate ${legalName}?\n\n` +
      `This will set the contractor's status to "terminated" and PERMANENTLY delete all of their ` +
      `encrypted secrets (EIN, SSN, DOB, home address, bank/Stripe details) from AWS Secrets Manager. ` +
      `The contractor record and audit history are kept, but the secrets cannot be recovered once deleted.\n\n` +
      `This cannot be undone. Continue?`
    );
    if (!confirmed) return;

    try {
      setErrorBanner(null);
      const res = await api.terminateContractor(activeContractorId);
      await loadContractor();
      setSuccessBanner(
        `Contractor terminated. ${res.secretsPurged}/${res.secretsTotal} secrets purged.` +
        (res.failedRefs?.length ? ` ${res.failedRefs.length} secret(s) failed to delete — retry or check IAM permissions.` : '')
      );
      setTimeout(() => setSuccessBanner(null), 8000);
    } catch (e) {
      setErrorBanner(e.message);
    }
  };

  const handleSettingsChange = async (newSettings) => {
    try {
      const saved = await api.saveSystemSettings(newSettings);
      setSysSettings(saved);
      setSuccessBanner("Session policies updated.");
      setTimeout(() => setSuccessBanner(null), 3000);
    } catch (e) {
      setErrorBanner(e.message);
    }
  };

  const formatTime = (secs) => {
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    return `${m}:${s < 10 ? '0' : ''}${s}`;
  };

  const writeAllowed = contractorData && ['admin', 'onboarding'].includes(activeUser.role);

  // Only ever called from inside the {contractorData && (...)} block below,
  // so contractorData is always populated here.
  const renderStepComponent = () => {
    switch (activeStep) {
      case 1:
        return (
          <Step1AccessSecurity
            data={contractorData}
            activeUser={activeUser}
            auditLog={contractorData.auditLog || []}
            settings={sysSettings}
            onSettingsChange={handleSettingsChange}
          />
        );
      case 2:
        return (
          <Step2BusinessIdentity
            data={contractorData}
            onChange={handleLocalChange}
            activeUser={activeUser}
            revealedValues={revealedValues}
            onReveal={handleRevealField}
            onRevealedValueChange={handleRevealedValueChange}
            writeAllowed={writeAllowed}
            errors={validationErrorsByField}
          />
        );
      case 3:
        return (
          <Step3OwnershipPrincipal
            data={contractorData}
            onChange={handleLocalChange}
            activeUser={activeUser}
            revealedValues={revealedValues}
            onReveal={handleRevealField}
            onRevealedValueChange={handleRevealedValueChange}
            writeAllowed={writeAllowed}
            errors={validationErrorsByField}
          />
        );
      case 4:
        return (
          <Step4KeyContacts
            data={contractorData}
            onChange={handleLocalChange}
            activeUser={activeUser}
            writeAllowed={writeAllowed}
            errors={validationErrorsByField}
          />
        );
      case 5:
        return (
          <Step5ComplianceLicensing
            data={contractorData}
            onChange={handleLocalChange}
            activeUser={activeUser}
            writeAllowed={writeAllowed}
            errors={validationErrorsByField}
          />
        );
      case 6:
        return (
          <Step6OperationsWorkforce
            data={contractorData}
            onChange={handleLocalChange}
            writeAllowed={writeAllowed}
            errors={validationErrorsByField}
          />
        );
      case 7:
        return (
          <Step7SecureFinancials
            data={contractorData}
            onChange={handleLocalChange}
            activeUser={activeUser}
            revealedValues={revealedValues}
            onReveal={handleRevealField}
            onRevealedValueChange={handleRevealedValueChange}
            writeAllowed={writeAllowed}
            errors={validationErrorsByField}
          />
        );
      case 8:
        return (
          <Step8InternalSystemSettings
            data={contractorData}
            onChange={handleLocalChange}
            activeUser={activeUser}
            writeAllowed={writeAllowed}
            onTerminate={handleTerminateContractor}
            errors={validationErrorsByField}
          />
        );
      default:
        return <div>Unknown Step</div>;
    }
  };

  return (
    <div>
      {/* Top Header Bar */}
      <header className="command-center-header">
        <div className="brand-title-group">
          <span className="brand-logo">FIELDLOOP</span>
          <span className="brand-sub">Contractor Registration Dashboard</span>
        </div>

        <div className="command-header-status">
          <span className="mfa-status-pill">
            <span className="dot"></span>
            session {formatTime(sessionTimeoutSeconds)}
          </span>
          <span className="admin-user-info">
            User: {activeUser.email.split('@')[0]} ({activeUser.role})
          </span>
          <div className="header-controls">
            {activeUser.role === 'admin' && (
              <Link to="/staff/platform" className="drawer-toggle-btn">
                <Search size={14} /> Platform Overview
              </Link>
            )}
            <button
              type="button"
              className="drawer-toggle-btn"
              onClick={() => setDbInspectorOpen(true)}
            >
              <Settings2 size={14} /> Staff Controls
            </button>
            <button
              type="button"
              className="drawer-toggle-btn"
              onClick={() => { sessionStorage.removeItem(NAV_STORAGE_KEY); supabase.auth.signOut(); }}
            >
              <LogOut size={14} /> Sign out
            </button>
          </div>
        </div>
      </header>

      {/* Main Dashboard Workspace */}
      <div className="main-dashboard-container">

        {/* User Auth Status Light Card */}
        <div className="user-status-card">
          <div className="lock-avatar">
            <Lock size={20} />
          </div>
          <div className="status-metric">
            <label>VIEWING AS</label>
            <div className="value">{activeUser.email.split('@')[0]} · {activeUser.role}</div>
          </div>
          <div className="status-metric">
            <label>AUTH LEVEL</label>
            <div className="value highlight">{writeAllowed ? 'Full read/write' : 'Read-Only'}</div>
          </div>
          <div className="status-metric">
            <label>ACCESS LOGGED</label>
            <div className="value">Every field reveal</div>
          </div>
        </div>

        {/* Landing mode tabs — only shown when no contractor is active */}
        {!contractorData && (
          <>
            <div style={{ display: 'flex', gap: '8px', marginBottom: '1.25rem' }}>
              <button
                type="button"
                className={mode === 'new' ? 'btn-spec-primary' : 'btn-spec-outline'}
                onClick={() => setMode('new')}
              >
                <UserPlus size={16} /> New Registration
              </button>
              <button
                type="button"
                className={mode === 'existing' ? 'btn-spec-primary' : 'btn-spec-outline'}
                onClick={() => setMode('existing')}
              >
                <Search size={16} /> Existing Contractors
              </button>
            </div>

            {mode === 'new' && (
              canCreateContractor ? (
                <div className="spec-step-card" style={{ maxWidth: '480px' }}>
                  <div className="spec-step-header">
                    <div className="spec-step-title-group">
                      <h2>Register a new contractor</h2>
                    </div>
                  </div>
                  <div className="form-grid">
                    <div className="col-12 form-group">
                      <label>LEGAL BUSINESS NAME *</label>
                      <input
                        type="text"
                        className="form-input"
                        value={newContractorName}
                        onChange={(e) => setNewContractorName(e.target.value)}
                        placeholder="e.g. Luxe Renovation SRQ, LLC"
                      />
                    </div>
                    <div className="col-12 form-group">
                      <label>EIN / TAX ID *</label>
                      <input
                        type="text"
                        className="form-input"
                        value={newContractorEin}
                        onChange={(e) => setNewContractorEin(e.target.value)}
                        placeholder="12-3456789"
                      />
                    </div>
                  </div>
                  <button
                    type="button"
                    className="btn-spec-primary"
                    onClick={handleCreateNewContractor}
                    disabled={creatingContractor}
                  >
                    {creatingContractor ? 'Creating…' : <><UserPlus size={16} /> Create Contractor & Continue</>}
                  </button>
                </div>
              ) : (
                <div className="spec-callout pink">
                  <h4>Read-only role</h4>
                  <p>Your role ({activeUser.role}) can't create new contractor records. Use "Existing Contractors" to look one up.</p>
                </div>
              )
            )}

            {mode === 'existing' && (
              <div className="spec-step-card" style={{ maxWidth: '520px' }}>
                <div className="spec-step-header">
                  <div className="spec-step-title-group">
                    <h2>Find an existing contractor</h2>
                  </div>
                </div>
                <div className="form-group">
                  <label>SEARCH BY NAME</label>
                  <input
                    type="text"
                    className="form-input"
                    value={existingSearchQuery}
                    onChange={(e) => setExistingSearchQuery(e.target.value)}
                    placeholder="Start typing a business name…"
                  />
                </div>
                <div style={{ marginTop: '0.75rem' }}>
                  {searchingContractors ? (
                    <div style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>Searching…</div>
                  ) : existingSearchResults.length === 0 ? (
                    <div style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>No contractors found.</div>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                      {existingSearchResults.map((c) => (
                        <button
                          key={c.id}
                          type="button"
                          className="btn-spec-outline"
                          style={{ display: 'flex', justifyContent: 'space-between', textAlign: 'left' }}
                          onClick={() => loadContractor(c.id)}
                        >
                          <span>{c.legal_name}</span>
                          <span style={{ color: 'var(--text-muted)', fontSize: '0.78rem' }}>
                            {c.contractor_id_public}{c.is_sandbox ? ' · SANDBOX' : ''}
                          </span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                <div className="form-group" style={{ marginTop: '1.25rem', paddingTop: '1rem', borderTop: '1px solid var(--border-light)' }}>
                  <label>OR PASTE A CONTRACTOR ID DIRECTLY</label>
                  <div style={{ display: 'flex', gap: '8px' }}>
                    <input
                      type="text"
                      className="form-input"
                      value={activeContractorId}
                      onChange={(e) => setActiveContractorId(e.target.value)}
                      placeholder="Contractor UUID"
                    />
                    <button type="button" className="btn-spec-outline" onClick={() => loadContractor(activeContractorId)}>
                      Load
                    </button>
                  </div>
                </div>
              </div>
            )}
          </>
        )}

        {/* Notification Banners — unconditional: creation/search errors need
            to show even before any contractor is loaded, not just once a
            record's stepper/step-content is showing. */}
        {errorBanner && (
          <div className="spec-callout pink">
            <h4>{validationErrors.length > 0 ? 'Please fix the following before activating' : 'Access or Security Restriction'}</h4>
            <p>{errorBanner}</p>
            {validationErrors.length > 0 && (
              <ul style={{ marginTop: '6px', paddingLeft: '16px' }}>
                {validationErrors.map((err, i) => {
                  const step = stepForValidationError(err);
                  return (
                    <li key={i}>
                      {step ? (
                        <button
                          type="button"
                          className="link-button"
                          onClick={() => handleStepSelect(step)}
                        >
                          {err} (Step {step} — click to fix)
                        </button>
                      ) : err}
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        )}

        {successBanner && (
          <div className="spec-callout teal">
            <h4>Action Completed</h4>
            <p>{successBanner}</p>
          </div>
        )}

        {/* Contractor Details Header */}
        {contractorData && (
          <div className="contractor-header-area">
            <div className="breadcrumbs">
              Contractor Registration › {contractorData.contractor.legal_name}
              {' · '}
              <button type="button" className="link-button" onClick={handleBackToSearch}>← Back to search</button>
            </div>
            <div className="contractor-title-row">
              <h1>{contractorData.contractor.legal_name}</h1>
              <span className="step-status-badge">
                • Onboarding — Step {activeStep} of 8
              </span>
            </div>
            <div className="contractor-subtitle">
              {contractorData.contractor.physical_city ? `${contractorData.contractor.physical_city}, ${contractorData.contractor.physical_state}` : ''} · {contractorData.operations.primary_trade || 'Trade Services'} · {contractorData.operations.technician_count || 0} technicians
            </div>
          </div>
        )}

        {/* Stepper + step content only make sense once a contractor is
            actually loaded — the landing tabs above already communicate
            "nothing loaded yet", so don't also show this section's own
            empty-state fallback underneath them. */}
        {contractorData && (
        <>
        {/* Horizontal Stepper Navigation Bar */}
        <div className="horizontal-stepper">
          {[
            { num: 1, label: 'Access & security' },
            { num: 2, label: 'Business identity' },
            { num: 3, label: 'Ownership' },
            { num: 4, label: 'Contacts' },
            { num: 5, label: 'Compliance' },
            { num: 6, label: 'Operations' },
            { num: 7, label: 'Financials' },
            { num: 8, label: 'Activate' }
          ].map(({ num, label }) => {
            const active = activeStep === num;
            return (
              <button
                key={num}
                className={`stepper-item ${active ? 'active' : ''} ${num < activeStep ? 'complete' : ''}`}
                onClick={() => handleStepSelect(num)}
              >
                {num < activeStep && <Check size={14} />}
                <span>{num < activeStep ? `✓ ${label}` : label}</span>
              </button>
            );
          })}
        </div>

        {/* Active Step Content OR Credentials Page */}
        {showCredentialsPage ? (
          <div className="credentials-page">
            <div className="credentials-card">
              {!credentialsSaved ? (
                <>
                  <div className="credentials-header">
                    <div className="credentials-icon">
                      <UserPlus size={40} />
                    </div>
                    <h2>Contractor Activated Successfully</h2>
                    <p className="credentials-subtitle">
                      Set up dashboard login credentials for <strong>{contractorData?.contractor?.legal_name}</strong>.
                      These credentials will be used by the contractor to access their FieldLoop dashboard.
                    </p>
                  </div>

                  {credentialErrors.length > 0 && (
                    <div className="spec-callout pink" style={{ marginBottom: '1.5rem' }}>
                      <h4>Please fix the following</h4>
                      <ul style={{ paddingLeft: '16px', marginTop: '6px' }}>
                        {credentialErrors.map((err, i) => <li key={i}>{err}</li>)}
                      </ul>
                    </div>
                  )}

                  <div className="credentials-form">
                    <div className="form-group">
                      <label>LOGIN EMAIL *</label>
                      <input
                        type="email"
                        className="form-input credentials-input"
                        value={credentialsData.userId}
                        onChange={(e) => setCredentialsData(prev => ({ ...prev, userId: e.target.value }))}
                        placeholder="e.g. marcus@luxerenovationsrq.com"
                        autoComplete="off"
                      />
                      <span className="field-hint">This will be the contractor's login email for the FieldLoop dashboard.</span>
                    </div>

                    <div className="form-group">
                      <label>PASSWORD *</label>
                      <div className="password-input-group">
                        <input
                          type={showPassword ? 'text' : 'password'}
                          className="form-input credentials-input"
                          value={credentialsData.password}
                          onChange={(e) => setCredentialsData(prev => ({ ...prev, password: e.target.value }))}
                          placeholder="Min 8 chars, 1 uppercase, 1 number, 1 special"
                          autoComplete="new-password"
                        />
                        <button
                          type="button"
                          className="password-toggle-btn"
                          onClick={() => setShowPassword(!showPassword)}
                        >
                          {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                        </button>
                      </div>
                    </div>

                    <div className="form-group">
                      <label>CONFIRM PASSWORD *</label>
                      <div className="password-input-group">
                        <input
                          type={showPassword ? 'text' : 'password'}
                          className="form-input credentials-input"
                          value={credentialsData.confirmPassword}
                          onChange={(e) => setCredentialsData(prev => ({ ...prev, confirmPassword: e.target.value }))}
                          placeholder="Re-enter password"
                          autoComplete="new-password"
                        />
                      </div>
                      {credentialsData.password && credentialsData.confirmPassword && credentialsData.password !== credentialsData.confirmPassword && (
                        <span className="field-error">Passwords do not match</span>
                      )}
                      {credentialsData.password && credentialsData.confirmPassword && credentialsData.password === credentialsData.confirmPassword && credentialsData.confirmPassword.length > 0 && (
                        <span className="field-success">✓ Passwords match</span>
                      )}
                    </div>
                  </div>

                  <div className="credentials-actions">
                    <button
                      type="button"
                      className="btn-spec-outline"
                      onClick={handleBackToDashboard}
                    >
                      Skip for Now
                    </button>
                    <button
                      type="button"
                      className="btn-spec-primary"
                      onClick={handleSaveCredentials}
                    >
                      <ShieldCheck size={16} /> Save Credentials & Finish
                    </button>
                  </div>
                </>
              ) : (
                <>
                  <div className="credentials-header success">
                    <div className="credentials-icon success">
                      <ShieldCheck size={48} />
                    </div>
                    <h2>Dashboard Credentials Created</h2>
                    <p className="credentials-subtitle">
                      The following credentials have been saved for <strong>{contractorData?.contractor?.legal_name}</strong>'s dashboard access.
                    </p>
                  </div>

                  <div className="credentials-summary-card">
                    <div className="credential-row">
                      <span className="credential-label">LOGIN EMAIL</span>
                      <div className="credential-value-group">
                        <code className="credential-value">{credentialsData.userId}</code>
                        <button
                          type="button"
                          className="copy-btn"
                          onClick={() => { navigator.clipboard.writeText(credentialsData.userId); }}
                          title="Copy Login Email"
                        >
                          <Copy size={14} />
                        </button>
                      </div>
                    </div>
                    <div className="credential-row">
                      <span className="credential-label">PASSWORD</span>
                      <div className="credential-value-group">
                        <code className="credential-value">{showPassword ? credentialsData.password : '••••••••••••'}</code>
                        <button
                          type="button"
                          className="copy-btn"
                          onClick={() => { navigator.clipboard.writeText(credentialsData.password); }}
                          title="Copy Password"
                        >
                          <Copy size={14} />
                        </button>
                        <button
                          type="button"
                          className="copy-btn"
                          onClick={() => setShowPassword(!showPassword)}
                          title={showPassword ? 'Hide' : 'Show'}
                        >
                          {showPassword ? <EyeOff size={14} /> : <Eye size={14} />}
                        </button>
                      </div>
                    </div>
                    <div className="credential-row">
                      <span className="credential-label">CONTRACTOR</span>
                      <span className="credential-value-text">{contractorData?.contractor?.legal_name}</span>
                    </div>
                    <div className="credential-row">
                      <span className="credential-label">CREATED BY</span>
                      <span className="credential-value-text">{activeUser.email} · {new Date().toLocaleString()}</span>
                    </div>
                  </div>

                  <div className="credentials-actions">
                    <button
                      type="button"
                      className="btn-spec-primary"
                      onClick={handleBackToDashboard}
                    >
                      <ExternalLink size={16} /> Return to Dashboard
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        ) : (
          <>
            {renderStepComponent()}

            {/* Action Buttons Footer */}
            {contractorData && (
              <div className="actions-footer-bar">
                {activeStep > 1 && (
                  <button
                    type="button"
                    className="btn-spec-outline"
                    onClick={handleBackStep}
                  >
                    <ArrowLeft size={16} /> Back
                  </button>
                )}

                <button
                  type="button"
                  className="btn-spec-outline"
                  onClick={handleExportPdf}
                  disabled={activeUser.role !== 'admin'}
                >
                  <Printer size={16} /> Export PDF
                </button>

                {writeAllowed && (
                  <button
                    type="button"
                    className="btn-spec-outline"
                    onClick={handleSaveDraft}
                  >
                    <Save size={16} /> Save Draft
                  </button>
                )}

                {activeStep < 8 ? (
                  <button
                    type="button"
                    className="btn-spec-primary"
                    onClick={handleSaveAndContinue}
                    disabled={!writeAllowed}
                  >
                    Save & Continue <ArrowRight size={16} />
                  </button>
                ) : (
                  <button
                    type="button"
                    className="btn-spec-primary btn-activate"
                    onClick={handleActivateContractor}
                    disabled={!writeAllowed}
                  >
                    <FileCheck size={16} /> Save & Activate Contractor
                  </button>
                )}
              </div>
            )}
          </>
        )}
        </>
        )}

      </div>

      {/* Operator Drawer Overlay */}
      {dbInspectorOpen && (
        <div className="operator-drawer-overlay" onClick={() => setDbInspectorOpen(false)}>
          <div className="operator-drawer-content" onClick={(e) => e.stopPropagation()}>
            <div className="operator-drawer-header">
              <h3>Operator & Staff Controls</h3>
              <button
                type="button"
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#64748b' }}
                onClick={() => setDbInspectorOpen(false)}
              >
                <X size={20} />
              </button>
            </div>

            <div style={{ display: 'flex', gap: '8px' }}>
              <button
                type="button"
                className="btn-spec-outline"
                style={{ flex: 1, fontSize: '0.78rem' }}
                onClick={handleResetTimer}
              >
                Reset Idle Timer
              </button>
            </div>

            <div className="schema-section-card" style={{ marginTop: 0 }}>
              <div className="schema-header" style={{ fontSize: '0.9rem' }}>
                Currently loaded record
              </div>
              <pre style={{ background: '#f8fafc', padding: '10px', borderRadius: '6px', fontSize: '0.72rem', overflowX: 'auto', maxHeight: '250px' }}>
                {JSON.stringify(contractorData, null, 2)}
              </pre>
            </div>

          </div>
        </div>
      )}
    </div>
  );
}
