import { useMemo } from "react";
import { computeTakeoff } from "../takeoff";

export function useTakeoff(doc) {
  const { walls, pads, windows, areas, drains } = doc;
  return useMemo(() => computeTakeoff({ walls, pads, windows, areas, drains }), [walls, pads, windows, areas, drains]);
}

