import React, { useEffect, useRef, useState } from "react";
import { BLANK_DETAILS } from "../library/documents";

export function DrawingDetailsCard({ kind, initialDetails, active, drawings, busy, error, onClose, onSubmit }) {
  const [details, setDetails] = useState(() => kind === "details" ? { ...BLANK_DETAILS, ...active } : kind === "revise" ? { ...BLANK_DETAILS, ...active, print_revision: "" } : { ...BLANK_DETAILS, ...initialDetails });
  const card = useRef(null);
  const first = useRef(null);
  useEffect(() => {
    const previous = document.activeElement;
    first.current?.focus();
    const key = (event) => {
      if (event.key === "Escape" && !busy) { event.preventDefault(); onClose(); }
      if (event.key !== "Tab") return;
      const items = [...card.current.querySelectorAll('button:not(:disabled),input:not(:disabled),select:not(:disabled),[tabindex="0"]')];
      const target = event.shiftKey ? items[items.length - 1] : items[0];
      if (document.activeElement === (event.shiftKey ? items[0] : items[items.length - 1])) { event.preventDefault(); target?.focus(); }
    };
    document.addEventListener("keydown", key);
    return () => { document.removeEventListener("keydown", key); previous?.focus(); };
  }, [busy, onClose]);
  const update = (key) => (event) => setDetails((value) => ({ ...value, [key]: event.target.value }));
  const title = kind === "revise" ? "Create a new revision" : kind === "details" ? "Drawing details" : kind === "capture" ? "Save this drawing" : kind === "import" ? "Create drawing from CAD" : "Create a drawing";
  const customers = [...new Set(drawings.map((drawing) => drawing.customer_name))];
  const projects = [...new Set(drawings.filter((drawing) => !details.customer_name || drawing.customer_name.toLowerCase() === details.customer_name.toLowerCase()).map((drawing) => drawing.project_name))];
  return <div className="library-scrim" onMouseDown={(event) => { if (event.target === event.currentTarget && !busy) onClose(); }}>
    <form className="drawing-card" ref={card} role="dialog" aria-modal="true" aria-labelledby="drawing-card-title" onSubmit={(event) => { event.preventDefault(); onSubmit(details); }}>
      <div className="card-heading"><span className="library-eyebrow">{kind === "import" ? "DRAWING DETAILS · STEP 2 OF 2" : "DRAWING DETAILS"}</span><button type="button" className="library-icon-button" aria-label="Close drawing details" onClick={onClose} disabled={busy}>×</button></div>
      <h2 id="drawing-card-title">{title}</h2>
      <p className="library-muted">{kind === "revise" ? "The previous revision will be preserved. Your new revision starts with a copy of its drawing." : "Give this drawing a home. Models and elevations can share the same project."}</p>
      <fieldset className="job-type-choice"><legend>Job type</legend>{[["custom", "Custom job"], ["tract", "Tract home"]].map(([value, label]) => <label key={value} className={details.job_type === value ? "chosen" : ""}><input type="radio" name="job_type" value={value} checked={details.job_type === value} onChange={update("job_type")} disabled={busy} />{label}</label>)}</fieldset>
      <div className="drawing-form-grid">
        <label className="full">Customer name <span>*</span><input ref={first} required maxLength={160} value={details.customer_name} onChange={update("customer_name")} list="drawing-customers" autoComplete="off" placeholder="Builder or homeowner" disabled={busy} /></label>
        <label className="full">Project name <span>*</span><input required maxLength={160} value={details.project_name} onChange={update("project_name")} list="drawing-projects" autoComplete="off" placeholder={details.job_type === "tract" ? "Subdivision or development" : "Job name or address"} disabled={busy} /></label>
        <label>City <small>optional</small><input maxLength={160} value={details.city} onChange={update("city")} placeholder="e.g. Naperville" autoComplete="address-level2" disabled={busy} /></label>
        <label>Estimator name <small>optional</small><input maxLength={160} value={details.estimator_name} onChange={update("estimator_name")} placeholder="Estimator’s name" disabled={busy} /></label>
        <label className="full">Print date / revision <span>*</span><input required maxLength={160} value={details.print_revision} onChange={update("print_revision")} placeholder="e.g. 11/11/2026 · Rev 2" disabled={busy} /></label>
        <label>Model name <small>optional</small><input maxLength={160} value={details.model_name} onChange={update("model_name")} placeholder={details.job_type === "tract" ? "e.g. The Aspen" : "Model, if applicable"} disabled={busy} /></label>
        <label>Elevation <small>optional</small><input maxLength={160} value={details.elevation} onChange={update("elevation")} placeholder="e.g. A, B, or Craftsman" disabled={busy} /></label>
      </div>
      <datalist id="drawing-customers">{customers.map((name) => <option key={name} value={name} />)}</datalist>
      <datalist id="drawing-projects">{projects.map((name) => <option key={name} value={name} />)}</datalist>
      {error && <p className="library-error" role="alert">{error}</p>}
      <div className="drawing-card-footer"><button type="button" className="library-button" onClick={onClose} disabled={busy}>Cancel</button><button className="library-button primary" disabled={busy}>{busy ? "Saving…" : kind === "details" ? "Save details" : kind === "revise" ? "Create revision" : kind === "capture" ? "Save drawing" : "Create drawing"}<span aria-hidden="true"> →</span></button></div>
    </form>
  </div>;
}
