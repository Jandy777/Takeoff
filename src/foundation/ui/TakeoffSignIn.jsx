import React, { useState } from "react";
import { AuthReturnNotice } from "./AuthReturnNotice";

export function TakeoffSignIn({ account }) {
  const [mode, setMode] = useState("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const currentMode = account.recovery ? "password" : mode;
  async function submit(event) {
    event.preventDefault(); setBusy(true); setError(""); setMessage("");
    try { setMessage(await account.authenticate(currentMode, email.trim(), password)); setPassword(""); }
    catch (e) { setError(e.message); } finally { setBusy(false); }
  }
  return <div className="library-auth">
    <div className="library-auth-intro"><span className="library-eyebrow">WEST SUBURBAN CONCRETE</span><h1>Your drawings.<br />Ready for the next step.</h1><p>One place for foundation drawings, plan revisions, and the quantities behind every job.</p><div className="auth-plan-mark" aria-hidden="true"><svg viewBox="0 0 300 210"><path d="M40 40H250V155H200V180H90V155H40Z" /><path d="M52 52H238V143H188V168H102V143H52Z" /><path className="plan-measure" d="M40 20H250M40 13V27M250 13V27M273 40V155M266 40H280M266 155H280" /></svg></div></div>
    <form className="library-auth-card" onSubmit={submit}>
      <span className="library-eyebrow">TAKEOFF</span>
      <AuthReturnNotice account={account} />
      <h2>{currentMode === "create" ? "Create your account" : currentMode === "reset" ? "Reset your password" : currentMode === "password" ? "Choose a new password" : "Welcome back"}</h2>
      <p className="library-muted">{currentMode === "create" ? "Use the email address approved by your Takeoff administrator." : "Sign in to your company drawing library."}</p>
      {currentMode !== "password" && <label>Email address<input type="email" required autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} disabled={busy} /></label>}
      {currentMode !== "reset" && <label>Password<input type="password" required minLength={currentMode === "signin" ? 1 : 12} autoComplete={currentMode === "signin" ? "current-password" : "new-password"} value={password} onChange={(event) => setPassword(event.target.value)} disabled={busy} />{currentMode !== "signin" && <small>At least 12 characters.</small>}</label>}
      {(error || account.error) && <p className="library-error" role="alert">{error || account.error}</p>}
      {message && <p className="library-success" role="status">{message}</p>}
      <button className="library-button primary" disabled={busy}>{busy ? "Please wait…" : currentMode === "create" ? "Create account" : currentMode === "reset" ? "Send reset link" : currentMode === "password" ? "Save new password" : "Sign in"}</button>
      {!account.recovery && <div className="auth-links"><button type="button" onClick={() => { setMode(mode === "create" ? "signin" : "create"); setMessage(""); setError(""); }}>{mode === "create" ? "Already have an account? Sign in" : "First time here? Create account"}</button>{mode === "signin" && <button type="button" onClick={() => { setMode("reset"); setMessage(""); setError(""); }}>Forgot password?</button>}</div>}
    </form>
  </div>;
}
