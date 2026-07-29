import { useCallback, useMemo, useState } from "react";
import { hashColor } from "../color";

// Per-takeoff-row color overrides + "solo" isolation (click a row to show
// only that item type on the plan/3D view).
export function useRowVisibility() {
  const [rowColors, setRowColors] = useState({});
  const [solo, setSolo] = useState([]); // array of row keys; empty = show all

  const rowColor = useCallback((key) => rowColors[key] || hashColor(key), [rowColors]);
  const soloSet = useMemo(() => new Set(solo), [solo]);
  const shown = useCallback((key) => soloSet.size === 0 || soloSet.has(key), [soloSet]);
  const toggleSolo = useCallback(
    (key) => setSolo((s) => (s.includes(key) ? s.filter((k) => k !== key) : [...s, key])),
    []
  );

  return { rowColors, setRowColors, solo, setSolo, soloSet, rowColor, shown, toggleSolo };
}
