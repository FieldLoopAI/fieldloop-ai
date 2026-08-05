import { useEffect, useState, useCallback } from 'react';
import { supabase } from '../shared/services/supabaseClient';

// Real replacement for the sessionStorage/mockDb credential check: resolves
// the signed-in Supabase Auth session to the caller's contractor_users row
// plus their company's legal name, for display in the dashboard header.
// contractor_users has no "full name" column, so the person's display name
// falls back to the local part of their email.
export function useContractorAuth() {
  const [session, setSession] = useState(undefined);
  const [tenant, setTenant] = useState(null);
  const [loading, setLoading] = useState(true);

  const loadTenant = useCallback(async (activeSession) => {
    if (!activeSession) {
      setTenant(null);
      return;
    }
    const { data: contractorUser, error: userError } = await supabase
      .from('contractor_users')
      .select('contractor_id, email, role')
      .eq('auth_user_id', activeSession.user.id)
      .single();
    if (userError || !contractorUser) {
      setTenant(null);
      return;
    }
    const { data: contractor } = await supabase
      .from('contractors')
      .select('legal_name')
      .eq('id', contractorUser.contractor_id)
      .single();
    setTenant({
      name: contractor?.legal_name || '',
      user: contractorUser.email.split('@')[0],
      email: contractorUser.email,
      role: contractorUser.role,
    });
  }, []);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session: current } }) => {
      setSession(current);
      loadTenant(current).finally(() => setLoading(false));
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, next) => {
      setSession(next);
      setLoading(true);
      loadTenant(next).finally(() => setLoading(false));
    });

    return () => subscription.unsubscribe();
  }, [loadTenant]);

  const signOut = useCallback(() => supabase.auth.signOut(), []);

  return { tenant, session, loading, signOut };
}
