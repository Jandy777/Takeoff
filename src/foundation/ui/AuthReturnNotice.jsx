import React from "react";

export function AuthReturnNotice({ account }) {
  if (!account.notice) return null;
  return <div className={account.notice.kind === "warning" ? "library-error" : "library-success"} role="status">
    <p style={{ margin: 0 }}>{account.notice.message}</p>
    <button type="button" className="library-button" style={{ marginTop: 10 }} onClick={account.dismissNotice}>Dismiss</button>
  </div>;
}
