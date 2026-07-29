// Shared plan-view -> screen helpers used by the 2D glyph components.
export function ptsStr(poly, toScreen) {
  return poly.map((p) => toScreen(p.x, p.y).join(",")).join(" ");
}
