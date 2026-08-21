import { useState } from 'react';
import { ArrowRight, LockKeyhole, ShieldCheck, UserRound } from 'lucide-react';
import { supabase } from './services/supabaseClient';
import '../command-dashboard/login.css';

// Single entry point for both contractor and staff logins — which dashboard
// a session lands on is resolved after sign-in (App.jsx), not here, since we
// don't know which population a login belongs to until fl_users/contractor_users
// resolves.
export default function LoginPage({ noAccountFound, onSignOut }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const submit = async (event) => {
    event.preventDefault();
    setSubmitting(true);
    setError('');
    const { error: signInError } = await supabase.auth.signInWithPassword({ email, password });
    setSubmitting(false);
    if (signInError) setError('The email or password is incorrect. Please try again.');
  };

  return <main className="login-page">
    <section className="login-brand-panel"><div className="login-logo">FIELDLOOP</div><div><span className="login-kicker">FIELDLOOP</span><h1>Every field decision, in one secure place.</h1><p>Sign in to manage dispatch, crews, and billing, or to onboard and support contractors.</p></div><div className="login-trust"><ShieldCheck size={21} /><span>Protected workspace<br /><small>MFA-enabled · Session secured</small></span></div></section>
    <section className="login-form-panel"><form onSubmit={submit} className="login-card"><div className="login-lock"><LockKeyhole size={23} /></div><span className="login-kicker">SECURE SIGN IN</span><h2>Welcome back</h2><p>Sign in with your FieldLoop account.</p>{error && <div className="login-error">{error}</div>}{noAccountFound && <div className="login-error">Signed in, but no account was found for this login. Ask FieldLoop staff to confirm this login is linked to a contractor or staff record. <button type="button" onClick={onSignOut}>Sign out and try another account</button></div>}<label>Email<div className="login-input"><UserRound size={17} /><input autoComplete="username" type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="you@fieldloop.ai" required /></div></label><label>Password<div className="login-input"><LockKeyhole size={17} /><input autoComplete="current-password" type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder="Enter your password" required /></div></label><button className="login-submit" type="submit" disabled={submitting}>{submitting ? 'Signing in…' : <>Sign in <ArrowRight size={17} /></>}</button></form></section>
  </main>;
}
