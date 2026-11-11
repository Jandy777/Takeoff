import { useCallback, useEffect, useState } from "react";
import { supabase, initialAuthNotice, loadAuthProviders } from "../library/supabase";
import { authReturnUrl } from "../library/authReturn";
import { employeeSignupData } from "../library/employeeSignup";
import { socialSignInRequest } from "../library/socialAuth";
import { accountPermissions } from "../library/permissions";

export function useTakeoffAccount() {
  const [session, setSession] = useState(null);
  const [member, setMember] = useState(null);
  const [loading, setLoading] = useState(Boolean(supabase));
  const [error, setError] = useState("");
  const [recovery, setRecovery] = useState(false);
  const [notice, setNotice] = useState(initialAuthNotice);
  const [providers, setProviders] = useState(null);
  const [providerError, setProviderError] = useState("");

  useEffect(() => {
    if (!supabase) return;
    let live = true;
    loadAuthProviders().then((value) => { if (live) setProviders(value); })
      .catch((e) => { if (live) setProviderError(e.message); });
    return () => { live = false; };
  }, []);

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
      await refreshMember();
    };
    const refresh = () => { refreshUser().catch(() => {}); };
    window.addEventListener("focus", refresh);
    document.addEventListener("visibilitychange", refresh);
    refresh();
    return () => { live = false; window.removeEventListener("focus", refresh); document.removeEventListener("visibilitychange", refresh); };
  }, [session?.user.id, refreshMember]);

  async function socialSignIn(provider) {
    if (!supabase || !providers?.[provider]) throw new Error("Google sign-in is not connected yet.");
    const result = await supabase.auth.signInWithOAuth(socialSignInRequest(provider, authReturnUrl(window.location)));
    if (result.error) throw new Error(result.error.message);
    if (!result.data?.url) throw new Error("Sign-in could not be started. Please try again.");
    window.location.assign(result.data.url);
  }

  async function authenticate(mode, email, password, employeeId) {
    if (!supabase) throw new Error("Cloud storage has not been configured on this copy of Takeoff.");
    const redirectTo = authReturnUrl(window.location);
    let result;
    const signup = mode === "create" || mode === "employee";
    if (signup) result = await supabase.auth.signUp({ email: email.trim().toLowerCase(), password, options: { emailRedirectTo: redirectTo, data: mode === "employee" ? employeeSignupData(email, employeeId) : {} } });
    else if (mode === "reset") result = await supabase.auth.resetPasswordForEmail(email, { redirectTo });
    else if (mode === "password") result = await supabase.auth.updateUser({ password });
    else result = await supabase.auth.signInWithPassword({ email, password });
    if (result.error) {
      const deliveryUnavailable = result.error.code === "email_address_not_authorized" || /email address not authorized/i.test(result.error.message);
      throw new Error(signup && deliveryUnavailable ? "We couldn’t send your confirmation email yet. Please contact your Takeoff administrator to finish email setup." : result.error.message);
    }
    if (mode === "password") setRecovery(false);
    return signup && !result.data.session ? "Check your email to confirm your account. Then return here to sign in." : mode === "reset" ? "If this account exists, a password reset link will be sent to its email address." : "";
  }

  return { session, ...accountPermissions(member, session?.user.id), loading, error, recovery, notice, dismissNotice: () => setNotice(null), authenticate, refreshMember, providers, providerError, socialSignIn,
    changeEmail: async (email) => {
      const result = await supabase.auth.updateUser({ email: email.trim().toLowerCase() }, { emailRedirectTo: authReturnUrl(window.location) });
      if (result.error) throw new Error(result.error.message);
      return "Check both email inboxes for confirmation links. Your sign-in email will change after Supabase confirms the request.";
    },
    signOut: async () => { const { error } = await supabase.auth.signOut(); if (error) throw error; setMember(null); },
  };
}
