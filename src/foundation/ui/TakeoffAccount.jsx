import React, { useState } from "react";

export function TakeoffAccount({ account }) {
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  return <section className="team-panel"><h2>Your account</h2><p className="library-muted">Signed in as {account.session.user.email}</p>
    <form className="team-add" onSubmit={async (event) => { event.preventDefault(); setBusy(true); setError(""); setMessage(""); try { setMessage(await account.changeEmail(email)); setEmail(""); } catch (e) { setError(e.message); } finally { setBusy(false); } }}>
      <label>New sign-in email<input type="email" required value={email} onChange={(event) => setEmail(event.target.value)} placeholder="Your work email" autoComplete="email" disabled={busy} /></label>
      <button className="library-button primary" disabled={busy}>{busy ? "Sending…" : "Change sign-in email"}</button>
    </form>
    <p className="library-muted">Your drawings and permissions stay with your account. Follow the confirmation links sent by Supabase before using your new email to sign in.</p>
    {error && <p className="library-error" role="alert">{error}</p>}{message && <p className="library-success" role="status">{message}</p>}
  </section>;
}
