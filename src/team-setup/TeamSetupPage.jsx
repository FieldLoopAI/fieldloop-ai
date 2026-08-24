// src/team-setup/TeamSetupPage.jsx
//
// Unauthenticated web page for the Contractor Command Dashboard's
// team-member invite flow (see backend/functions/invite-team-member and
// complete-team-setup) — near-identical to
// src/technician-setup/TechnicianSetupPage.jsx, adapted for a dashboard
// login (email-based) rather than a mobile login (phone-based). No session
// exists at this point; only calls the unauthenticated
// complete-team-setup Lambda via api.completeTeamSetup().
import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { LockKeyhole, ShieldCheck, Check } from 'lucide-react';
import { api } from '../shared/services/api';
import '../command-dashboard/login.css';

const MIN_PASSWORD_LENGTH = 8;

export default function TeamSetupPage() {
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
      await api.completeTeamSetup(token, password);
      setDone(true);
    } catch (err) {
      // complete-team-setup deliberately uses one generic message for
      // invalid/expired/already-used tokens, never distinguishing which —
      // this page doesn't try to either.
      setError(err.message || 'Failed to complete setup.');
    } finally {
      setSubmitting(false);
    }
  };

  if (!token) {
    return <main className="login-page">
      <section className="login-form-panel"><div className="login-card">
        <div className="login-lock"><LockKeyhole size={23} /></div>
        <span className="login-kicker">TEAM SETUP</span>
        <h2>Missing setup link</h2>
        <p>This page needs a valid setup link to continue. Check the email you received and tap the link directly, or ask your company's Owner/Admin to resend it.</p>
      </div></section>
    </main>;
  }

  if (done) {
    return <main className="login-page">
      <section className="login-form-panel"><div className="login-card">
        <div className="login-lock"><Check size={23} /></div>
        <span className="login-kicker">TEAM SETUP</span>
        <h2>Your password is set</h2>
        <p>Go to the FieldLoop login page and sign in with your email and the password you just chose.</p>
      </div></section>
    </main>;
  }

  return <main className="login-page">
    <section className="login-brand-panel">
      <div className="login-logo">FIELDLOOP</div>
      <div>
        <span className="login-kicker">TEAM ACCOUNT SETUP</span>
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
        <p>You'll use your email and this password to sign in to the FieldLoop dashboard.</p>
        {error && <div className="login-error">⚠ {error}</div>}
        <label>New password<div className="login-input"><LockKeyhole size={17} /><input autoComplete="new-password" type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder={`At least ${MIN_PASSWORD_LENGTH} characters`} required minLength={MIN_PASSWORD_LENGTH} /></div></label>
        <label>Confirm password<div className="login-input"><LockKeyhole size={17} /><input autoComplete="new-password" type="password" value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)} placeholder="Re-enter your password" required minLength={MIN_PASSWORD_LENGTH} /></div></label>
        <button className="login-submit" type="submit" disabled={submitting}>{submitting ? 'Setting password…' : 'Set Password & Finish Setup'}</button>
      </form>
    </section>
  </main>;
}
