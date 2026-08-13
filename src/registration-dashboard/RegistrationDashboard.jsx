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
  { step: 6, match: /primary trade|technician count/i },
  { step: 7, match: /payout bank|stripe connect|ach platform fee/i },
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
  const [successBanner, setSuccessBanner] = useState(null);

  // Flash indicator
  const [flashAudit, setFlashAudit] = useState(false);
  const flashTimeoutRef = useRef(null);
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
    try {
      setErrorBanner(null);
      setValidationErrors([]);
      const data = await api.getContractor(targetId);
      if (loadRequestIdRef.current !== requestId) return; // superseded by a newer navigation
      setActiveContractorId(targetId);
      setContractorData(data);
      setRevealedValues({});
    } catch (e) {
      if (loadRequestIdRef.current !== requestId) return;
      setErrorBanner(e.message);
      setContractorData(null);
      setRevealedValues({});
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
    loadRequestIdRef.current++; // invalidate any load still in flight
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
    setRevealedValues({});
    setValidationErrors([]);
  };

  const triggerAuditLoggedIndicator = () => {
    setFlashAudit(true);
    if (flashTimeoutRef.current) clearTimeout(flashTimeoutRef.current);
    flashTimeoutRef.current = setTimeout(() => setFlashAudit(false), 2500);
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
      triggerAuditLoggedIndicator();
    } catch (e) {
      setErrorBanner(e.message);
    }
  };

  const handleLocalChange = (section, updatedSectionData) => {
    setContractorData(prev => ({
      ...prev,
      [section]: updatedSectionData
    }));
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

  const handleSaveDraft = async () => {
    if (sessionExpired) {
      setErrorBanner("Session expired. Cannot save changes.");
      return;
    }
    try {
      setErrorBanner(null);
      setValidationErrors([]);
      await saveCurrentData();
      setSuccessBanner("Draft saved successfully.");
      triggerAuditLoggedIndicator();
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
    try {
      setErrorBanner(null);
      setValidationErrors([]);
      await saveCurrentData();
      triggerAuditLoggedIndicator();

      if (activeStep < 8) {
        setSuccessBanner(`Step ${activeStep} saved successfully. Proceeding to Step ${activeStep + 1}...`);
        setActiveStep(prev => prev + 1);
        setRevealedValues({});
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
      setRevealedValues({});
    }
  };

  const handleActivateContractor = async () => {
    if (sessionExpired) {
      setErrorBanner("Session expired. Cannot activate record.");
      return;
    }
    try {
      setErrorBanner(null);
      setValidationErrors([]);

      const res = await api.activateContractor(activeContractorId, contractorData, revealedValues);
      if (res.success) {
        setSuccessBanner(null);
        setErrorBanner(null);
        await loadContractor();
        triggerAuditLoggedIndicator();
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
      triggerAuditLoggedIndicator();
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
      triggerAuditLoggedIndicator();
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
      triggerAuditLoggedIndicator();
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
            writeAllowed={writeAllowed}
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
            writeAllowed={writeAllowed}
          />
        );
      case 4:
        return (
          <Step4KeyContacts
            data={contractorData}
            onChange={handleLocalChange}
            activeUser={activeUser}
            writeAllowed={writeAllowed}
          />
        );
      case 5:
        return (
          <Step5ComplianceLicensing
            data={contractorData}
            onChange={handleLocalChange}
            activeUser={activeUser}
            writeAllowed={writeAllowed}
          />
        );
      case 6:
        return (
          <Step6OperationsWorkforce
            data={contractorData}
            onChange={handleLocalChange}
            writeAllowed={writeAllowed}
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
            writeAllowed={writeAllowed}
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
