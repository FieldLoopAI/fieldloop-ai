import { useState } from 'react';
import { Navigate } from 'react-router-dom';
import { ArrowRight, LockKeyhole, ShieldCheck, UserRound } from 'lucide-react';
import { supabase } from '../shared/services/supabaseClient';
import { useStaffAuth } from './useStaffAuth';
import '../command-dashboard/login.css';

export default function StaffLoginPage() {
  const { user, session, loading, signOut } = useStaffAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  if (!loading && user) return <Navigate to="/staff" replace />;

  // Sign-in against Supabase Auth can succeed while there's still no
  // matching fl_users row (or its auth_user_id isn't linked yet) — without
  // this, that case looked like the button silently doing nothing.
  const signedInButNoStaffRecord = !loading && session && !user;

  const submit = async (event) => {
    event.preventDefault();
    setSubmitting(true);
    setError('');
    const { error: signInError } = await supabase.auth.signInWithPassword({ email, password });
    setSubmitting(false);
    if (signInError) setError('The email or password is incorrect. Please try again.');
  };

  return <main className="login-page">
    <section className="login-brand-panel"><div className="login-logo">FIELDLOOP</div><div><span className="login-kicker">STAFF REGISTRATION WORKSPACE</span><h1>Onboard and manage contractor records.</h1><p>Access is role-gated and every field reveal is audit-logged.</p></div><div className="login-trust"><ShieldCheck size={21} /><span>Internal staff workspace<br /><small>MFA-enabled · Session secured</small></span></div></section>
    <section className="login-form-panel"><form onSubmit={submit} className="login-card"><div className="login-lock"><LockKeyhole size={23} /></div><span className="login-kicker">STAFF SIGN IN</span><h2>Welcome back</h2><p>Sign in with your FieldLoop staff account.</p>{error && <div className="login-error">{error}</div>}{signedInButNoStaffRecord && <div className="login-error">Signed in, but no matching staff record was found for this account (or it isn't linked yet). Ask an administrator to set <code>fl_users.auth_user_id</code> for this login. <button type="button" onClick={() => signOut()}>Sign out and try another account</button></div>}<label>Email<div className="login-input"><UserRound size={17} /><input autoComplete="username" type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="you@fieldloop.ai" required /></div></label><label>Password<div className="login-input"><LockKeyhole size={17} /><input autoComplete="current-password" type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder="Enter your password" required /></div></label><button className="login-submit" type="submit" disabled={submitting}>{submitting ? 'Signing in…' : <>Sign in to Staff Workspace <ArrowRight size={17} /></>}</button></form></section>
  </main>;
}
