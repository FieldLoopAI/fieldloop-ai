import { useState } from 'react';
import { ArrowRight, LockKeyhole, ShieldCheck, UserRound } from 'lucide-react';
import { supabase } from '../shared/services/supabaseClient';
import './login.css';

export default function ContractorLoginPage({ signedInButNoTenant, onSignOut }) {
  const [userId, setUserId] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const submit = async (event) => {
    event.preventDefault();
    setSubmitting(true);
    setError('');
    const { error: signInError } = await supabase.auth.signInWithPassword({ email: userId, password });
    setSubmitting(false);
    if (signInError) setError('The username or password is incorrect. Please try again.');
  };

  return <main className="login-page">
    <section className="login-brand-panel"><div className="login-logo">RRDMSS</div><div><span className="login-kicker">CONTRACTOR COMMAND CENTER</span><h1>Every field decision, in one secure place.</h1><p>Manage dispatch, approvals, crews, fleet, customers, billing, and your company’s records.</p></div><div className="login-trust"><ShieldCheck size={21} /><span>Protected contractor workspace<br /><small>MFA-enabled · Session secured</small></span></div></section>
    <section className="login-form-panel"><form onSubmit={submit} className="login-card"><div className="login-lock"><LockKeyhole size={23} /></div><span className="login-kicker">SECURE SIGN IN</span><h2>Welcome back</h2><p>Sign in with the credentials created during contractor registration.</p>{error && <div className="login-error">{error}</div>}{signedInButNoTenant && <div className="login-error">Signed in, but no matching contractor record was found for this account (or it isn't linked yet). Ask FieldLoop staff to confirm this login's <code>contractor_users.auth_user_id</code>. <button type="button" onClick={onSignOut}>Sign out and try another account</button></div>}<label>Email<div className="login-input"><UserRound size={17} /><input autoComplete="username" type="email" value={userId} onChange={e => setUserId(e.target.value)} placeholder="Enter your email" required /></div></label><label>Password<div className="login-input"><LockKeyhole size={17} /><input autoComplete="current-password" type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder="Enter your password" required /></div></label><button className="login-submit" type="submit" disabled={submitting}>{submitting ? 'Signing in…' : <>Sign in to Command Center <ArrowRight size={17} /></>}</button><div className="login-help">Need help signing in? <button type="button" onClick={() => setError('Contact FieldLoop Support to recover access or reset a password.')}>Contact support</button></div></form></section>
  </main>;
}
