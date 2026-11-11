import React, { useEffect, useState } from "react";
import { supabase } from "../library/supabase";

export function TakeoffTeam() {
  const [members, setMembers] = useState([]);
  const [email, setEmail] = useState("");
  const [role, setRole] = useState("estimator");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  async function load() {
    const result = await supabase.from("team_access").select("email,role").order("email");
    if (result.error) throw result.error;
    setMembers(result.data);
  }
  useEffect(() => { load().catch((e) => setError(e.message)); }, []);
  async function change(action) {
    setBusy(true); setError(""); setMessage("");
    try { const result = await action(); if (result.error) throw result.error; await load(); return true; }
    catch (e) { setError(e.message); return false; } finally { setBusy(false); }
  }
  return <section className="team-panel"><h2>Team access</h2><p className="library-muted">Estimators can create and edit drawings. Viewers can open drawings and quantities. Administrators manage the team.</p>
    <form className="team-add" onSubmit={async (event) => { event.preventDefault(); if (await change(() => supabase.from("team_access").insert({ email: email.trim().toLowerCase(), role }))) { setMessage("Access added. Ask this person to create a Takeoff account using that email address."); setEmail(""); } }}>
      <label>Email address<input type="email" required value={email} onChange={(event) => setEmail(event.target.value)} disabled={busy} /></label>
      <label>Access<select value={role} onChange={(event) => setRole(event.target.value)} disabled={busy}><option value="estimator">Estimator</option><option value="viewer">Viewer</option><option value="admin">Administrator</option></select></label>
      <button className="library-button primary" disabled={busy}>Add person</button>
    </form>
    {error && <p className="library-error" role="alert">{error}</p>}{message && <p className="library-success" role="status">{message}</p>}
    <div className="team-list">{members.map((member) => <div className="team-row" key={member.email}><strong>{member.email}</strong><select aria-label={`Access for ${member.email}`} value={member.role} disabled={busy} onChange={(event) => change(() => supabase.from("team_access").update({ role: event.target.value }).eq("email", member.email))}><option value="admin">Administrator</option><option value="estimator">Estimator</option><option value="viewer">Viewer</option></select><button className="library-button" disabled={busy} onClick={() => change(() => supabase.from("team_access").delete().eq("email", member.email))}>Remove access</button></div>)}</div>
  </section>;
}
