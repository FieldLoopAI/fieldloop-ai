// src/technician-setup/TechnicianSetupPage.jsx
//
// Unauthenticated web fallback for the technician setup-link flow (see the
// technician-onboarding plan). A technician taps the link from their setup
// SMS/email — https://<domain>/technician-setup?token=... — lands here
// before the Flutter mobile app exists (or if it isn't installed yet), and
// chooses their own password. No session exists at this point; this page
// never touches Supabase directly, it only calls the unauthenticated
// complete-technician-setup Lambda via api.completeTechnicianSetup().
//
// This exact URL is designed to double as the future mobile deep link once
// the Flutter app registers Associated Domains / App Links on the real
// production domain — no backend change needed at that point, see
// backend/functions/shared/technicianSetupTokens.js's SETUP_BASE_URL.
import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { LockKeyhole, ShieldCheck, Check } from 'lucide-react';
import { api } from '../shared/services/api';
import '../command-dashboard/login.css';

// Mirrors complete-technician-setup's own rule server-side — 8+ characters,
// no complexity requirement (agreed policy: technicians are field workers
// typing on a phone, friction matters more here than staff-grade
// complexity). Client-side check is just a fast-fail; the Lambda enforces
// this for real regardless of what this page does.
const MIN_PASSWORD_LENGTH = 8;

export default function TechnicianSetupPage() {
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token');

  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);

  const submit = async (event) => {
    event.preventDefault();
    setError('');

    if (password.length < MIN_PASSWORD_LENGTH) {
      setError(`Password must be at least ${MIN_PASSWORD_LENGTH} characters.`);
      return;
    }
    if (password !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }

    setSubmitting(true);
    try {
      await api.completeTechnicianSetup(token, password);
      setDone(true);
    } catch (err) {
      // Shown exactly as returned — complete-technician-setup deliberately
      // uses one generic message for invalid/expired/already-used tokens,
      // never distinguishing which, so this page doesn't try to either.
      setError(err.message || 'Failed to complete setup.');
    } finally {
      setSubmitting(false);
    }
  };

  if (!token) {
    return <main className="login-page">
      <section className="login-form-panel"><div className="login-card">
        <div className="login-lock"><LockKeyhole size={23} /></div>
        <span className="login-kicker">TECHNICIAN SETUP</span>
        <h2>Missing setup link</h2>
        <p>This page needs a valid setup link to continue. Check the SMS or email you received and tap the link directly, or ask your company admin to resend it.</p>
      </div></section>
    </main>;
  }

  if (done) {
    return <main className="login-page">
      <section className="login-form-panel"><div className="login-card">
        <div className="login-lock"><Check size={23} /></div>
        <span className="login-kicker">TECHNICIAN SETUP</span>
        <h2>Your password is set</h2>
        <p>Open the FieldLoop mobile app and sign in with your phone number and the password you just chose.</p>
      </div></section>
    </main>;
  }

  return <main className="login-page">
    <section className="login-brand-panel">
      <div className="login-logo">FIELDLOOP</div>
      <div>
        <span className="login-kicker">TECHNICIAN ACCOUNT SETUP</span>
        <h1>One step left — set your password.</h1>
        <p>This link is single-use and expires 48 hours after it was sent.</p>
      </div>
      <div className="login-trust"><ShieldCheck size={21} /><span>Your setup link<br /><small>Never shared, never reused after setup</small></span></div>
    </section>
    <section className="login-form-panel">
      <form onSubmit={submit} className="login-card">
        <div className="login-lock"><LockKeyhole size={23} /></div>
        <span className="login-kicker">SET YOUR PASSWORD</span>
        <h2>Choose a password</h2>
        <p>You'll use your phone number and this password to sign in on the FieldLoop mobile app.</p>
        {error && <div className="login-error">⚠ {error}</div>}
        <label>New password<div className="login-input"><LockKeyhole size={17} /><input autoComplete="new-password" type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder={`At least ${MIN_PASSWORD_LENGTH} characters`} required minLength={MIN_PASSWORD_LENGTH} /></div></label>
        <label>Confirm password<div className="login-input"><LockKeyhole size={17} /><input autoComplete="new-password" type="password" value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)} placeholder="Re-enter your password" required minLength={MIN_PASSWORD_LENGTH} /></div></label>
        <button className="login-submit" type="submit" disabled={submitting}>{submitting ? 'Setting password…' : 'Set Password & Finish Setup'}</button>
      </form>
    </section>
  </main>;
}
