import { useEffect, useState } from "react";
import { readLibraryNavigation, writeLibraryNavigation } from "../library/navigation";

function tabStorage() {
  try { return window.sessionStorage; } catch { return null; }
}

// The library can unmount while a drawing is open. Keep its location for this
// user's tab, including across a browser reload, without storing drawing data.
export function useLibraryNavigation(userId) {
  const [state, setState] = useState(() => readLibraryNavigation(userId, tabStorage()));
  useEffect(() => { writeLibraryNavigation(userId, state, tabStorage()); }, [userId, state]);
  const set = (field) => (value) => setState((previous) => ({
    ...previous,
    [field]: typeof value === "function" ? value(previous[field]) : value,
  }));
  return {
    ...state, expanded: new Set(state.expanded),
    setSection: set("section"), setPath: set("path"), setQuery: set("query"), setSelectedId: set("selectedId"),
    setExpanded: (value) => setState((previous) => ({ ...previous, expanded: [...(typeof value === "function" ? value(new Set(previous.expanded)) : value)] })),
  };
}
