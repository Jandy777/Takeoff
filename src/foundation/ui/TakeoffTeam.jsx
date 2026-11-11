import React, { useEffect, useState } from "react";
import { supabase } from "../library/supabase";
import { isWorkEmail } from "../library/employeeSignup";

export function TakeoffTeam({ account }) {
  const [members, setMembers] = useState([]);
  const [allowed, setAllowed] = useState([]);
  const [email, setEmail] = useState("");
  const [role, setRole] = useState("estimator");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  async function load() {
    const [access, people] = await Promise.all([
      supabase.from("team_access").select("email,role").order("email"),
      supabase.from("team_members").select("user_id,email,role,display_name,access_enabled,registration_complete").order("email"),
    ]);
    if (access.error || people.error) throw access.error || people.error;
    setAllowed(access.data); setMembers(people.data);
  }
  useEffect(() => { load().catch((e) => setError(e.message)); }, []);
  async function change(action) {
    setBusy(true); setError(""); setMessage("");
    try { const result = await action(); if (result?.error) throw result.error; await load(); return true; }
    catch (e) { setError(e.message); return false; } finally { setBusy(false); }
  }
  async function setPermission(address, nextRole) {
    return change(() => allowed.some((person) => person.email === address)
      ? supabase.from("team_access").update({ role: nextRole }).eq("email", address)
      : supabase.from("team_access").insert({ email: address, role: nextRole }));
  }
  const waiting = allowed.filter((person) => !members.some((member) => member.email === person.email));
  return <section className="team-panel">
    <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}><h2>Team access</h2><button type="button" className="library-button" disabled={busy} onClick={() => change(load)}>Refresh accounts</button></div>
    <p className="library-muted">Listed employees receive editing access after confirming their work email. Other verified signups can view drawings. You can adjust company accounts or disable access here.</p>
    <form className="team-add" onSubmit={async (event) => { event.preventDefault(); const address = email.trim().toLowerCase(); if (await setPermission(address, isWorkEmail(address) ? role : "viewer")) { setMessage("Access saved. This person can create an account using that email address."); setEmail(""); } }}>
      <label>Email address<input type="email" required value={email} onChange={(event) => setEmail(event.target.value)} disabled={busy} /></label>
      <label>Access<select value={isWorkEmail(email) ? role : "viewer"} onChange={(event) => setRole(event.target.value)} disabled={busy}><option value="estimator" disabled={!isWorkEmail(email)}>Estimator</option><option value="viewer">Viewer</option><option value="admin" disabled={!isWorkEmail(email)}>Administrator</option></select></label>
      <button className="library-button primary" disabled={busy}>Add or update</button>
    </form>
    {error && <p className="library-error" role="alert">{error}</p>}{message && <p className="library-success" role="status">{message}</p>}
    <h3 className="team-section-title">Registered accounts</h3>
    <div className="team-list">{members.map((member) => <div className={member.access_enabled ? "team-row" : "team-row disabled"} key={member.user_id}>
      <div className="team-row-name"><strong>{member.display_name || member.email}</strong>{member.display_name && <small>{member.email}</small>}<small>{!member.access_enabled ? "Access disabled" : !member.registration_complete ? "Email confirmation pending" : isWorkEmail(member.email) ? "Company account" : "View-only account"}</small></div>
      <select aria-label={"Access for " + member.email} value={member.role} disabled={busy || !member.access_enabled || !isWorkEmail(member.email)} onChange={(event) => setPermission(member.email, event.target.value)}><option value="admin">Administrator</option><option value="estimator">Estimator</option><option value="viewer">Viewer</option></select>
      <button className="library-button" disabled={busy || member.user_id === account.session.user.id} onClick={() => change(() => supabase.from("team_members").update({ access_enabled: !member.access_enabled }).eq("user_id", member.user_id))}>{member.access_enabled ? "Disable access" : "Enable access"}</button>
    </div>)}</div>
    {waiting.length > 0 && <><h3 className="team-section-title">Ready to register</h3><div className="team-list">{waiting.map((person) => <div className="team-row" key={person.email}><div className="team-row-name"><strong>{person.email}</strong><small>{person.role}</small></div><button className="library-button" disabled={busy} onClick={() => change(() => supabase.from("team_access").delete().eq("email", person.email))}>Remove access</button></div>)}</div></>}
  </section>;
}
