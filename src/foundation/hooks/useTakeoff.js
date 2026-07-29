import { useMemo } from "react";
import { computeTakeoff } from "../takeoff";

export function useTakeoff(doc) {
  const { walls, pads, windows, areas } = doc;
  return useMemo(() => computeTakeoff({ walls, pads, windows, areas }), [walls, pads, windows, areas]);
}
