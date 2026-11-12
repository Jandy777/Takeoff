import React from "react";
import { DrawingDetailsCard } from "./DrawingDetailsCard";
import { TakeoffSignIn } from "./TakeoffSignIn";
import { LibraryWorkspace } from "./LibraryWorkspace";
import "./library.css";

export function DrawingLibrary({ library, account, hasUnfiledDrawing }) {
  const closeModal = React.useCallback(() => { library.setModal(null); library.setError(""); }, [library.setModal, library.setError]);
  const gated = !account.session || account.recovery || !account.member || account.loading;
  return <>
    {(library.open || gated) && <div className="drawing-library" role="region" aria-label="Drawing library">
      {account.loading ? <div className="library-loading" role="status">Opening your library…</div> : !account.session || account.recovery ? <TakeoffSignIn account={account} /> : !account.member ? <div className="library-loading"><h2>Your account needs access</h2><p>Ask your Takeoff administrator to add {account.session.user.email} to the team.</p>{account.error && <p className="library-error">{account.error}</p>}<div><button className="library-button" onClick={account.refreshMember}>Check access again</button> <button className="library-button" onClick={library.signOut}>Sign out</button></div></div> : <LibraryWorkspace key={account.session.user.id} library={library} account={account} hasUnfiledDrawing={hasUnfiledDrawing}/>}
    </div>}
    {library.modal && !gated && <DrawingDetailsCard key={library.modal} kind={library.modal} active={library.active} drawings={library.drawings} busy={library.busy} error={library.error} onClose={closeModal} onSubmit={library.submit}/>}
  </>;
}

export function DrawingFileBar({ library, account }) {
  const active = library.active;
  return <div className="drawing-file-bar"><button className="library-button" onClick={library.showLibrary} disabled={library.busy}>← Library</button><div className="file-bar-title"><strong>{active?.project_name || "Unsaved drawing"}</strong><span>{active ? [active.customer_name, active.model_name, active.elevation && `Elevation ${active.elevation}`, active.print_revision].filter(Boolean).join(" · ") : "Save this drawing to your library"}</span></div><span role="status" className={`file-save-status ${library.status}`}>{active?.locked ? "Preserved revision · view only" : !account.canEdit ? "View only" : active ? { saved: "✓ Saved to cloud", saving: "Saving…", unsaved: "Unsaved changes", error: "Could not save" }[library.status] : "Unsaved"}</span>{account.canEdit && <><button className="library-button" onClick={() => library.setModal(active ? "revise" : "capture")} disabled={library.busy}>{active ? "New revision" : "Save drawing"}</button>{active && !active.locked && <><button className="library-button" onClick={() => library.setModal("details")} disabled={library.busy}>Details</button><button className="library-button" onClick={() => library.saveNow().catch(() => {})} disabled={library.busy || library.status === "saving"}>Save</button></>}</>}<button className="library-button" onClick={() => library.exportBackup()}>Export backup</button>{library.error && <span className="file-save-error" role="alert">{library.error}</span>}</div>;
}
