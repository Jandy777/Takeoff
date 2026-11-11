import { useCallback, useEffect, useState } from "react";
import { supabase, initialAuthNotice } from "../library/supabase";
import { authReturnUrl } from "../library/authReturn";

export function useTakeoffAccount() {
  const [session, setSession] = useState(null);
  const [member, setMember] = useState(null);
  const [loading, setLoading] = useState(Boolean(supabase));
  const [error, setError] = useState("");
  const [recovery, setRecovery] = useState(false);
  const [notice, setNotice] = useState(initialAuthNotice);

  useEffect(() => {
    if (!supabase) return;
    let live = true;
    const { data } = supabase.auth.onAuthStateChange((event, next) => {
      if (!live) return;
      setSession(next);
      if (event === "PASSWORD_RECOVERY") setRecovery(true);
    });
    supabase.auth.getSession().then(({ data, error }) => {
      if (!live) return;
      if (error && !initialAuthNotice) setError(error.message);
      setSession(data.session);
      setLoading(false);
    }).catch((e) => { if (live) { setError(e.message); setLoading(false); } });
    return () => { live = false; data.subscription.unsubscribe(); };
  }, []);

  const refreshMember = useCallback(async () => {
    if (!session?.user.id) { setMember(null); return; }
    setLoading(true);
    try {
      const result = await supabase.from("team_members").select("*").eq("user_id", session.user.id).maybeSingle();
      if (result.error) throw result.error;
      setMember(result.data);
      setError("");
    } catch (e) { setError(e.message); } finally { setLoading(false); }
  }, [session?.user.id, session?.user.email]);
  useEffect(() => { refreshMember(); }, [refreshMember]);

  useEffect(() => {
    if (!session?.user.id || !supabase) return;
    let live = true;
    const refreshUser = async () => {
      if (document.visibilityState === "hidden") return;
      const { data, error } = await supabase.auth.getUser();
      if (!live || error || !data.user) return;
      setSession((previous) => previous?.user.id === data.user.id ? { ...previous, user: data.user } : previous);
    };
    const refresh = () => { refreshUser().catch(() => {}); };
    window.addEventListener("focus", refresh);
    document.addEventListener("visibilitychange", refresh);
    refresh();
    return () => { live = false; window.removeEventListener("focus", refresh); document.removeEventListener("visibilitychange", refresh); };
  }, [session?.user.id]);

  async function authenticate(mode, email, password) {
    if (!supabase) throw new Error("Cloud storage has not been configured on this copy of Takeoff.");
    const redirectTo = authReturnUrl(window.location);
    let result;
    if (mode === "create") result = await supabase.auth.signUp({ email, password, options: { emailRedirectTo: redirectTo } });
    else if (mode === "reset") result = await supabase.auth.resetPasswordForEmail(email, { redirectTo });
    else if (mode === "password") result = await supabase.auth.updateUser({ password });
    else result = await supabase.auth.signInWithPassword({ email, password });
    if (result.error) throw new Error(result.error.message);
    if (mode === "password") setRecovery(false);
    return mode === "create" && !result.data.session ? "Check your email to confirm your account. Then return here to sign in." : mode === "reset" ? "If this account exists, a password reset link will be sent to its email address." : "";
  }

  const currentMember = member?.user_id === session?.user.id ? member : null;
  return { session, member: currentMember, loading, error, recovery, notice, dismissNotice: () => setNotice(null), authenticate, refreshMember,
    changeEmail: async (email) => {
      const result = await supabase.auth.updateUser({ email: email.trim().toLowerCase() }, { emailRedirectTo: authReturnUrl(window.location) });
      if (result.error) throw new Error(result.error.message);
      return "Check both email inboxes for confirmation links. Your sign-in email will change after Supabase confirms the request.";
    },
    canEdit: ["admin", "estimator"].includes(currentMember?.role),
    isAdmin: currentMember?.role === "admin",
    signOut: async () => { const { error } = await supabase.auth.signOut(); if (error) throw error; setMember(null); },
  };
}
