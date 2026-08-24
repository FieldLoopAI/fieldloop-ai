import { useEffect, useState, useCallback } from 'react';
import { supabase } from '../shared/services/supabaseClient';

// Replaces mockDb.currentUser: resolves the signed-in Supabase Auth session
// to the caller's fl_users row (id + role), which is what every Lambda's
// requireRole() also keys off of.
export function useStaffAuth() {
  const [session, setSession] = useState(undefined); // undefined = not yet checked
  const [flUser, setFlUser] = useState(null);
  const [loading, setLoading] = useState(true);

  const loadFlUser = useCallback(async (activeSession) => {
    if (!activeSession) {
      setFlUser(null);
      return;
    }
    const { data, error } = await supabase
      .from('fl_users')
      .select('id, email, role')
      .eq('auth_user_id', activeSession.user.id)
      .single();
    setFlUser(error ? null : data);
  }, []);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session: current } }) => {
      setSession(current);
      loadFlUser(current).finally(() => setLoading(false));
    });

    // Supabase re-validates/refreshes the session on tab refocus (it
    // listens for the browser's own visibilitychange event), firing this
    // callback again even when nothing meaningful changed. Only the very
    // first check should gate rendering with `loading` — flipping it back
    // to true on every subsequent event unmounts the whole staff dashboard
    // tree on every tab switch, losing scroll position and in-memory state.
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, next) => {
      setSession(next);
      loadFlUser(next);
    });

    return () => subscription.unsubscribe();
  }, [loadFlUser]);

  const signOut = useCallback(() => supabase.auth.signOut(), []);

  return { user: flUser, session, loading, signOut };
}
