import { useMemo } from "react";
import { computeTakeoff } from "../takeoff";

export function useTakeoff(doc) {
  const { walls, pads, windows, areas, drains, ledges, slabs, wings } = doc;
  return useMemo(() => computeTakeoff({ walls, pads, windows, areas, drains, ledges, slabs, wings }), [walls, pads, windows, areas, drains, ledges, slabs, wings]);
}

