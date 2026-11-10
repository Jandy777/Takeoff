import assert from "node:assert/strict";
import { createServer } from "vite";

const server = await createServer({
  configFile: false,
  root: process.cwd(),
  cacheDir: ".tools/vite-test-cache",
  logLevel: "silent",
  appType: "custom",
  resolve: { preserveSymlinks: true },
  server: { middlewareMode: true },
});

const {
  centerlineClosedWallRun,
  detectClearRegion,
  shoelace,
  resizeWallToMeasuredLength,
  wallFaceLengths,
  wallMeasuredLen,
  snapToWallFace,
  resolveDrainRuns,
  ledgeOnWallFace,
  resolveLedges,
} = await server.ssrLoadModule("/src/foundation/geometry.js");
const { computeTakeoff } = await server.ssrLoadModule("/src/foundation/takeoff.js");
const THREE = await import("three");
const { buildScene } = await server.ssrLoadModule("/src/foundation/render3d/buildScene.js");

const closeTo = (actual, expected, label) => {
  assert.ok(Math.abs(actual - expected) < 1e-6, `${label}: expected ${expected}, received ${actual}`);
};

const makeRun = (vertices, basis = "outside") => vertices.map((a, i) => {
  const b = vertices[(i + 1) % vertices.length];
  return {
    id: i + 1,
    x1: a.x,
    y1: a.y,
    x2: b.x,
    y2: b.y,
    thickness: 8,
    depth: 8,
    footing: null,
    lengthBasis: basis,
  };
});

try {
  for (const [name, vertices] of [
    ["clockwise", [{ x: 0, y: 0 }, { x: 0, y: 15 }, { x: 15, y: 15 }, { x: 15, y: 0 }]],
    ["counterclockwise", [{ x: 0, y: 0 }, { x: 15, y: 0 }, { x: 15, y: 15 }, { x: 0, y: 15 }]],
  ]) {
    const walls = centerlineClosedWallRun(makeRun(vertices), "outside");
    const clear = detectClearRegion(walls, 7.5, 7.5);
    assert.ok(clear, `${name} clear area is detected`);
    closeTo(Math.abs(shoelace(clear)), (13 + 8 / 12) ** 2, `${name} clear square footage`);
    for (const wall of walls) {
      const lengths = wallFaceLengths(wall, walls, (q) => q.thickness / 12);
      assert.equal(lengths.resolved, true, `${name} loop should resolve its wall faces`);
      const dx = wall.x2 - wall.x1, dy = wall.y2 - wall.y1;
      const normalLength = Math.hypot(dx, dy);
      const mid = { x: (wall.x1 + wall.x2) / 2, y: (wall.y1 + wall.y2) / 2 };
      const interiorProbe = {
        x: mid.x - dy / normalLength * lengths.interiorSide,
        y: mid.y + dx / normalLength * lengths.interiorSide,
      };
      assert.ok(interiorProbe.x > 0 && interiorProbe.x < 15 && interiorProbe.y > 0 && interiorProbe.y < 15, `${name} label side points inward`);
      closeTo(lengths.outside, 15, `${name} outside`);
      closeTo(lengths.centerline, 14 + 4 / 12, `${name} centerline`);
      closeTo(lengths.inside, 13 + 8 / 12, `${name} inside`);
    }
  }

  const square = centerlineClosedWallRun(makeRun([
    { x: 0, y: 0 }, { x: 15, y: 0 }, { x: 15, y: 15 }, { x: 0, y: 15 },
  ]), "outside");
  const resized = resizeWallToMeasuredLength(1, square, 16, "outside");
  const faceSnap = snapToWallFace(7.5, 0.05, square, 0.2);
  assert.ok(faceSnap, "drain anchor snaps to wall face");
  closeTo(faceSnap.y, 0, "outside face snap");
  const cornerSnap = snapToWallFace(0.05, 0.05, square, 0.2);
  assert.equal(cornerSnap.type, "wall corner");
  closeTo(cornerSnap.x, 0, "corner snap x");
  closeTo(cornerSnap.y, 0, "corner snap y");
  const innerCorner = snapToWallFace(8 / 12, 8 / 12, square, 0.2);
  assert.equal(innerCorner.type, "wall corner");
  const anchors = [{ id: 20, kind: "exterior", pts: [cornerSnap, faceSnap, { x: 25, y: 25 }] }, { id: 21, kind: "interior", pts: [innerCorner] }];
  const changedWalls = square.map((w) => ({ ...w, thickness: 10 }));
  const moved = resolveDrainRuns(anchors, changedWalls);
  closeTo(moved[0].pts[0].x, -1 / 12, "outer corner follows thicker wall x");
  closeTo(moved[0].pts[0].y, -1 / 12, "outer corner follows thicker wall y");
  closeTo(moved[1].pts[0].x, 9 / 12, "inner corner follows thicker wall x");
  closeTo(moved[1].pts[0].y, 9 / 12, "inner corner follows thicker wall y");
  closeTo(moved[0].pts[1].y, -1 / 12, "face anchor follows thicker wall");
  closeTo(moved[0].pts[2].x, 25, "free anchor remains fixed");
  const restored = resolveDrainRuns(anchors, square);
  closeTo(restored[0].pts[0].x, 0, "anchor follows undo geometry");
  const totals = computeTakeoff({ walls: [], pads: [], windows: [], areas: [], drains: [
    { kind: "exterior", pts: [{ x: 0, y: 0 }, { x: 15, y: 0 }, { x: 15, y: 15 }] },
    { kind: "exterior", pts: [{ x: 0, y: 0 }, { x: 3, y: 4 }] },
    { kind: "interior", pts: [{ x: 0, y: 0 }, { x: 10, y: 0 }] },
  ] });
  closeTo(totals.drainRows.find((r) => r.kind === "exterior").len, 35, "exterior run total");
  closeTo(totals.drainRows.find((r) => r.kind === "interior").len, 10, "interior run total");
  const group = new THREE.Group();
  buildScene(group, { walls: [], pads: [], windows: [], areas: [], drains: [
    { id: 1, kind: "exterior", pts: [{ x: 0, y: 0 }, { x: 15, y: 0 }] },
    { id: 2, kind: "interior", pts: [{ x: 0, y: 0 }, { x: 0, y: 10 }] },
  ] }, null, () => true, () => "#777777");
  assert.equal(group.children.length, 2, "one 3D pipe per traced segment");
  assert.notEqual(group.children[0].material.color.getHex(), group.children[1].material.color.getHex(), "interior and exterior pipes have different colors");
  buildScene(group, { walls: [], pads: [], windows: [], areas: [], drains: [] }, null, () => true, () => "#777777");
  assert.equal(group.children.length, 0, "scene rebuild removes old pipes");
  closeTo(wallMeasuredLen(resized[0], resized, "outside"), 16, "resized outside wall");

  const insideRun = centerlineClosedWallRun(makeRun([
    { x: 0, y: 0 }, { x: 15, y: 0 }, { x: 15, y: 15 }, { x: 0, y: 15 },
  ], "inside"), "inside");
  closeTo(wallMeasuredLen(insideRun[0], insideRun, "inside"), 15, "inside-face run");

  const mixed = makeRun([{ x: 0, y: 0 }, { x: 15, y: 0 }, { x: 15, y: 15 }, { x: 0, y: 15 }]);
  mixed[0].thickness = 10;
  mixed[2].thickness = 10;
  const mixedWalls = centerlineClosedWallRun(mixed, "outside");
  const mixedArea = detectClearRegion(mixedWalls, 7.5, 7.5);
  assert.ok(mixedArea, "mixed wall thickness area is detected");
  closeTo(Math.abs(shoelace(mixedArea)), (15 - 16 / 12) * (15 - 20 / 12), "mixed thickness clear area");

  const ledgeSpan = ledgeOnWallFace({ x: 0, y: 0 }, { x: 15, y: 0 }, square, 0.01);
  assert.ok(ledgeSpan, "finds the wall face between two outside corners");
  const ledge = { id: 30, kind: "brick", size: "2x4", ...ledgeSpan };
  const resolvedLedge = resolveLedges([ledge], square);
  closeTo(distForTest(resolvedLedge[0].pts), 15, "ledge BOM face length");
  const ledgeTotals = computeTakeoff({ walls: square, pads: [], windows: [], areas: [], ledges: resolvedLedge });
  closeTo(ledgeTotals.ledgeRows[0].len, 15, "ledge rollup");
  const changedLedge = resolveLedges([ledge], square.map((w) => ({ ...w, thickness: 10 })));
  closeTo(changedLedge[0].pts[0].y, -1 / 12, "ledge follows wall thickness change");
  const ledgeGroup = new THREE.Group();
  buildScene(ledgeGroup, { walls: square, pads: [], windows: [], areas: [], ledges: resolvedLedge }, null, () => true, () => "#777777");
  const upperWall = ledgeGroup.children.find((obj) => obj.isMesh && obj.position.y > 1 && obj.geometry.type === "ExtrudeGeometry");
  assert.ok(upperWall, "recessed ledge creates an upper wall layer");
  closeTo(upperWall.geometry.parameters.options.depth, 2 / 12, "ledge drop in 3D");

  console.log("Geometry tests passed: outside, centerline, inside, direction, and resize.");
} finally {
  await server.close();
}

function distForTest(points) { return Math.hypot(points[1].x - points[0].x, points[1].y - points[0].y); }
