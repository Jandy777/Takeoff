import React, { useState } from "react";
import { AuthReturnNotice } from "./AuthReturnNotice";
import { EMPLOYEES } from "../library/employeeSignup";

export function TakeoffSignIn({ account }) {
  const [mode, setMode] = useState("signin");
  const [employeeId, setEmployeeId] = useState("");
  const [employeePassword, setEmployeePassword] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const currentMode = account.recovery ? "password" : mode;
  const employee = EMPLOYEES.find((person) => person.id === employeeId);
  const choosingName = currentMode === "employee" && !employee;
  const creating = currentMode === "create" || currentMode === "employee";
  function switchMode(next) {
    setMode(next); setEmployeeId(""); setEmployeePassword(false); setPassword(""); setMessage(""); setError("");
  }
  async function social(provider) {
    setBusy(true); setError(""); setMessage("");
    try { await account.socialSignIn(provider); }
    catch (e) { setError(e.message); } finally { setBusy(false); }
  }
  async function submit(event) {
    event.preventDefault(); setBusy(true); setError(""); setMessage("");
    try {
      if (currentMode === "employee" && !employeePassword) await account.socialSignIn("azure", email.trim(), employeeId);
      else { setMessage(await account.authenticate(currentMode, email.trim(), password, employeeId)); setPassword(""); }
    }
    catch (e) { setError(e.message); } finally { setBusy(false); }
  }
  return <div className="library-auth">
    <div className="library-auth-intro"><span className="library-eyebrow">WEST SUBURBAN CONCRETE</span><h1>Your drawings.<br />Ready for the next step.</h1><p>One place for foundation drawings, plan revisions, and the quantities behind every job.</p><div className="auth-plan-mark" aria-hidden="true"><svg viewBox="0 0 300 210"><path d="M40 40H250V155H200V180H90V155H40Z" /><path d="M52 52H238V143H188V168H102V143H52Z" /><path className="plan-measure" d="M40 20H250M40 13V27M250 13V27M273 40V155M266 40H280M266 155H280" /></svg></div></div>
    <form className="library-auth-card" onSubmit={submit}>
      <span className="library-eyebrow">TAKEOFF</span>
      <AuthReturnNotice account={account} />
      <h2>{choosingName ? "Choose your name" : currentMode === "employee" ? "Set up employee access" : currentMode === "create" ? "Create a viewer account" : currentMode === "reset" ? "Reset your password" : currentMode === "password" ? "Choose a new password" : "Welcome back"}</h2>
      <p className="library-muted">{currentMode === "employee" ? employeePassword ? "Confirm your West Suburban work email to create and edit drawings." : "Continue with your West Suburban Microsoft account to create and edit drawings." : currentMode === "create" ? "Use Google to join the shared drawing library. Personal accounts can view drawings and quantities." : "Sign in to your company drawing library."}</p>
      {["signin", "create"].includes(currentMode) && <>
        <div className="social-signin-options">
          {[{ id: "azure", name: "Microsoft", mark: "M" }, { id: "google", name: "Google", mark: "G" }].map((provider) => <div key={provider.id}>
            <button className="library-button social-signin" type="button" disabled={busy || !account.providers?.[provider.id]} onClick={() => social(provider.id)}><span className={`provider-mark ${provider.id}`} aria-hidden="true">{provider.mark}</span>Continue with {provider.name}</button>
            {account.providers && !account.providers[provider.id] && <small>{provider.name} sign-in is being connected.</small>}
          </div>)}
          {!account.providers && <small>{account.providerError || "Checking sign-in options…"}</small>}
        </div>
        <div className="auth-divider"><span>or use email and password</span></div>
      </>}
      {choosingName ? <div className="employee-name-list" aria-label="West Suburban employees">{EMPLOYEES.map((person) => <button type="button" key={person.id} className="employee-name-option" onClick={() => setEmployeeId(person.id)}><span>{person.name}</span><span aria-hidden="true">→</span></button>)}</div> : <>
        {currentMode === "employee" && <div className="employee-selected"><strong>{employee.name}</strong><button type="button" disabled={busy} onClick={() => setEmployeeId("")}>Change name</button></div>}
        {currentMode !== "password" && <label>{currentMode === "employee" ? "Work email address" : "Email address"}<input type="email" required autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder={currentMode === "employee" ? "name@concretews.com" : undefined} disabled={busy} /></label>}
        {currentMode !== "reset" && (currentMode !== "employee" || employeePassword) && <label>Password<input type="password" required minLength={currentMode === "signin" ? 1 : 12} autoComplete={currentMode === "signin" ? "current-password" : "new-password"} value={password} onChange={(event) => setPassword(event.target.value)} disabled={busy} />{currentMode !== "signin" && <small>At least 12 characters.</small>}</label>}
        <button className="library-button primary" disabled={busy || (currentMode === "employee" && !employeePassword && !account.providers?.azure)}>{busy ? "Please wait…" : currentMode === "employee" && !employeePassword ? "Continue with Microsoft" : creating ? "Create account" : currentMode === "reset" ? "Send reset link" : currentMode === "password" ? "Save new password" : "Sign in"}</button>
        {currentMode === "employee" && !employeePassword && !account.providers?.azure && <small>{account.providerError || (account.providers ? "Microsoft sign-in is being connected." : "Checking Microsoft sign-in…")}</small>}
        {currentMode === "employee" && <div className="auth-links"><button type="button" disabled={busy} onClick={() => { setEmployeePassword(!employeePassword); setPassword(""); setError(""); }}>{employeePassword ? "Use Microsoft instead" : "Use email and password instead"}</button></div>}
      </>}
      {(error || account.error) && <p className="library-error" role="alert">{error || account.error}</p>}
      {message && <p className="library-success" role="status">{message}</p>}
      {!account.recovery && <div className="auth-links">
        {currentMode !== "employee" && <button className="employee-start" type="button" disabled={busy} onClick={() => switchMode("employee")}>Existing West Suburban employee? Click here</button>}
        {currentMode === "signin" ? <><button type="button" disabled={busy} onClick={() => switchMode("create")}>Create a view-only account</button><button type="button" disabled={busy} onClick={() => switchMode("reset")}>Forgot password?</button></> : <button type="button" disabled={busy} onClick={() => switchMode("signin")}>Already have an account? Sign in</button>}
      </div>}
    </form>
  </div>;
}
