import { useCallback, useEffect, useRef, useState } from "react";
import { EMPTY_DOC } from "../model";
import { cleanDetails, drawingPayload, readDocument } from "../library/documents";
import { drawingRepository as repository } from "../library/supabase";

function readRecoveryDrafts(key) {
  if (!key) return {};
  const value = JSON.parse(localStorage.getItem(key) || "{}");
  return value?.id ? { [value.id]: value } : value || {};
}
function newestRecovery(drafts) {
  return Object.values(drafts).sort((a, b) => String(b.recoveredAt).localeCompare(String(a.recoveredAt)))[0] || null;
}

export function useDrawingLibrary({ account, document, rowColors, onLoad }) {
  const [drawings, setDrawings] = useState([]);
  const [active, setActive] = useState(null);
  const [open, setOpen] = useState(true);
  const [modal, setModal] = useState(null);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("saved");
  const [error, setError] = useState("");
  const [recovery, setRecovery] = useState(null);
  const activeRef = useRef(null);
  const saved = useRef("");
  const pending = useRef(Promise.resolve());
  const latest = useRef({ document, rowColors, onLoad, account });
  latest.current = { document, rowColors, onLoad, account };
  const recoveryKey = account.session?.user.id ? `takeoff.recovery.v1.${account.session.user.id}` : null;
  const recoveryKeyRef = useRef(recoveryKey);
  recoveryKeyRef.current = recoveryKey;
  const userRef = useRef(account.session?.user.id);
  useEffect(() => {
    const next = account.session?.user.id;
    if (userRef.current && userRef.current !== next) {
      activeRef.current = null; setActive(null); setDrawings([]); setOpen(true); setStatus("saved");
      latest.current.onLoad({ ...EMPTY_DOC }, {});
    }
    userRef.current = next;
  }, [account.session?.user.id]);

  const refresh = useCallback(async () => {
    if (!account.member) return;
    setBusy(true); setError("");
    try { setDrawings(await repository.list()); } catch (e) { setError(e.message); }
    finally { setBusy(false); }
  }, [account.member]);
  useEffect(() => { refresh(); }, [refresh]);
  useEffect(() => {
    if (!recoveryKey) { setRecovery(null); return; }
    try { setRecovery(newestRecovery(readRecoveryDrafts(recoveryKey))); }
    catch { setError("A recovery copy on this device could not be read. It has been left in place."); }
  }, [recoveryKey]);

  function setCurrent(record) {
    const doc = readDocument(record.document);
    const colors = record.settings?.rowColors || {};
    saved.current = JSON.stringify(drawingPayload(doc, colors));
    activeRef.current = record;
    setActive(record); setOpen(false); setStatus("saved"); setError("");
    latest.current.onLoad(doc, colors);
  }

  const saveNow = useCallback(() => {
    // Serialize requests so a slow autosave cannot race the next edit/save.
    const operation = pending.current.catch(() => {}).then(async () => {
      const current = activeRef.current;
      const context = latest.current;
      const userId = context.account.session?.user.id;
      const deviceKey = recoveryKeyRef.current;
      if (!current || current.locked || !context.account.canEdit) return current;
      const payload = drawingPayload(context.document, context.rowColors);
      const signature = JSON.stringify(payload);
      if (signature === saved.current) return current;
      setStatus("saving");
      try {
        const result = await repository.save(current.id, current.version, payload);
        const updated = { ...current, ...result, ...payload };
        if (latest.current.account.session?.user.id !== userId) return updated;
        activeRef.current = updated;
        saved.current = signature;
        setActive(updated);
        setDrawings((items) => [result, ...items.filter((item) => item.id !== result.id)]);
        const stillCurrent = JSON.stringify(drawingPayload(latest.current.document, latest.current.rowColors)) === signature;
        setStatus(stillCurrent ? "saved" : "unsaved"); setError("");
        if (stillCurrent && deviceKey) {
          try { const drafts = readRecoveryDrafts(deviceKey); delete drafts[current.id]; localStorage.setItem(deviceKey, JSON.stringify(drafts)); setRecovery(newestRecovery(drafts)); } catch { /* Cloud copy is already saved. */ }
        }
        return updated;
      } catch (e) { setStatus("error"); setError(e.message); throw e; }
    });
    pending.current = operation;
    return operation;
  }, []);

  useEffect(() => {
    if (!activeRef.current || activeRef.current.locked || !account.canEdit) return;
    const payload = drawingPayload(document, rowColors);
    if (JSON.stringify(payload) === saved.current) return;
    setStatus("unsaved");
    // Keep one recovery draft, not a saved revision for every mouse movement.
    if (recoveryKey) {
      try {
        const draft = { ...activeRef.current, ...payload, recoveredAt: new Date().toISOString() };
        const drafts = readRecoveryDrafts(recoveryKey);
        drafts[draft.id] = draft;
        localStorage.setItem(recoveryKey, JSON.stringify(drafts));
        setRecovery(newestRecovery(drafts));
      } catch { setError("Device recovery storage is full or unavailable. Keep this page open until the cloud save completes, or export a backup."); }
    }
    const timer = setTimeout(() => { saveNow().catch(() => {}); }, 900);
    return () => clearTimeout(timer);
  }, [document, rowColors, active?.id, account.canEdit, recoveryKey, saveNow]);

  useEffect(() => {
    const unload = (event) => { if (["unsaved", "saving", "error"].includes(status)) { event.preventDefault(); event.returnValue = ""; } };
    const key = (event) => { if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "s") { event.preventDefault(); saveNow().catch(() => {}); } };
    const reconnect = () => { saveNow().catch(() => {}); };
    window.addEventListener("beforeunload", unload); window.addEventListener("keydown", key); window.addEventListener("online", reconnect);
    return () => { window.removeEventListener("beforeunload", unload); window.removeEventListener("keydown", key); window.removeEventListener("online", reconnect); };
  }, [status, saveNow]);

  async function run(action) {
    setBusy(true); setError("");
    try { return await action(); } catch (e) { setError(e.message); return false; } finally { setBusy(false); }
  }
  function openDrawing(id) { return run(async () => { await saveNow(); setCurrent(await repository.open(id)); }); }
  function showLibrary() { return run(async () => { await saveNow(); setOpen(true); await refresh(); }); }
  function submit(details) {
    return run(async () => {
      const values = cleanDetails(details);
      await saveNow();
      if (modal === "details") {
        const current = activeRef.current;
        const updated = await repository.save(current.id, current.version, values);
        activeRef.current = { ...current, ...updated };
        setActive(activeRef.current); setModal(null); await refresh(); return true;
      }
      const record = modal === "revise"
        ? await repository.revise(activeRef.current.id, activeRef.current.version, values)
        : await repository.create(values, drawingPayload(modal === "capture" ? latest.current.document : EMPTY_DOC, modal === "capture" ? latest.current.rowColors : {}));
      setCurrent(record); setModal(null); await refresh(); return true;
    });
  }
  function restoreRecovery() {
    return run(async () => {
      if (!recovery) return;
      await saveNow();
      const remote = await repository.open(recovery.id);
      if (remote.version === recovery.version && !remote.locked) {
        setCurrent(remote);
        latest.current.onLoad(readDocument(recovery.document), recovery.settings?.rowColors || {});
      } else {
        const details = cleanDetails({ ...recovery, print_revision: `${recovery.print_revision} (recovered)`.slice(0, 160) });
        const record = await repository.create(details, drawingPayload(recovery.document, recovery.settings?.rowColors || {}));
        setCurrent(record);
      }
      if (recoveryKey) { const drafts = readRecoveryDrafts(recoveryKey); delete drafts[recovery.id]; localStorage.setItem(recoveryKey, JSON.stringify(drafts)); setRecovery(newestRecovery(drafts)); }
    });
  }
  function exportBackup(record) {
    const current = record || { ...activeRef.current, ...drawingPayload(latest.current.document, latest.current.rowColors) };
    const url = URL.createObjectURL(new Blob([JSON.stringify(current)], { type: "application/json" }));
    const link = window.document.createElement("a"); link.href = url;
    link.download = `${(current.project_name || "Takeoff").replace(/[^a-z0-9 -]/gi, "_")}-${current.print_revision || "backup"}.takeoff.json`;
    link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  async function signOut() {
    return run(async () => {
      await saveNow(); await account.signOut();
      activeRef.current = null; setActive(null); setDrawings([]); setOpen(true); setStatus("saved");
      latest.current.onLoad({ ...EMPTY_DOC }, {});
    });
  }

  return { drawings, active, open, setOpen, modal, setModal, busy, status, error, setError, recovery,
    refresh, saveNow, openDrawing, showLibrary, submit, restoreRecovery, exportBackup, signOut };
}
