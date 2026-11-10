import { useMemo } from "react";
import { computeTakeoff } from "../takeoff";

export function useTakeoff(doc) {
  const { walls, pads, windows, areas, drains, ledges } = doc;
  return useMemo(() => computeTakeoff({ walls, pads, windows, areas, drains, ledges }), [walls, pads, windows, areas, drains, ledges]);
}

