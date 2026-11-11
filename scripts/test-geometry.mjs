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
  centerlineOpenWallRun,
  detectClearRegion,
  shoelace,
  resizeWallToMeasuredLength,
  wallFaceLengths,
  wallPolygon,
  wallMeasuredLen,
  snapToWallFace,
  resolveDrainRuns,
  ledgeOnWallFace,
  resolveLedges,
  parseLength,
  formatFtIn,
  slabCorners,
  referenceFaceAt,
  referencePointAtDistance,
  wallTopologySegments,
} = await server.ssrLoadModule("/src/foundation/geometry.js");
const { computeTakeoff } = await server.ssrLoadModule("/src/foundation/takeoff.js");
const { wallKey, wallColorKey, footingKey, footingColorKey } = await server.ssrLoadModule("/src/foundation/model.js");
const { hashColor } = await server.ssrLoadModule("/src/foundation/color.js");
const { selectInBox, selectionDocument, moveSelection, deleteSelection, toggleSelection } = await server.ssrLoadModule("/src/foundation/selection.js");
const THREE = await import("three");
const { buildScene } = await server.ssrLoadModule("/src/foundation/render3d/buildScene.js");
const { filletWalls, wallEndNear } = await server.ssrLoadModule("/src/foundation/fillet.js");

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
  for (const thickness of [8, 10]) for (const side of [1, -1]) {
    const xs = 5 + 8 / 12, jog = [
      { id: 901, x1: 0, y1: 0, x2: xs, y2: 0 },
      { id: 902, x1: xs, y1: 0, x2: xs, y2: 1 },
      { id: 903, x1: xs, y1: 1, x2: xs + 12, y2: 1 },
      { id: 904, x1: xs + 12, y1: 1, x2: xs + 12, y2: 0 },
      { id: 905, x1: xs + 12, y1: 0, x2: xs * 2 + 12, y2: 0 },
    ].map((w) => ({ ...w, thickness, depth: 8, pendingFace: true, traceSide: side, lengthBasis: "outside" }));
    const centered = centerlineOpenWallRun(jog, side);
    assert.ok(centered, "open face-drawn jog converts to centerlines");
    const expectedLengths = [xs, 1, 12, 1, xs];
    for (let index = 0; index < centered.length; index++) closeTo(wallFaceLengths(centered[index], centered, (w) => w.thickness / 12).outside, expectedLengths[index], "open jog shows entered face dimension");
    const firstFace = wallPolygonForTest(centered[0], centered, side, 0);
    const lastFace = wallPolygonForTest(centered[4], centered, side, 1);
    closeTo(lastFace.x - firstFace.x, 23 + 4 / 12, "open jog outside overall width remains 23 feet 4 inches");
  }
  closeTo(parseLength(`15'7.5"`), 15 + 7.5 / 12, "direct feet and half-inch entry");
  closeTo(parseLength(`15'-7.5"`), 15 + 7.5 / 12, "displayed feet and half-inch entry");
  closeTo(parseLength('7.5"'), 7.5 / 12, "inches-only entry");
  closeTo(parseLength("15.5833"), 15.5833, "decimal feet entry");
  assert.equal(parseLength("15'-bad"), null, "invalid dimensions are not silently treated as feet");
  assert.equal(formatFtIn(15 + 7.5 / 12), `15'-7.5"`, "half inches remain visible");
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
  const tenFoot = centerlineClosedWallRun(makeRun([{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }, { x: 0, y: 10 }]), "outside");
  const pending = makeRun([{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }, { x: 0, y: 10 }]).map((w) => ({ ...w, pendingFace: true }));
  pending[3].y2 = 2;
  const filletDoc = { walls: pending, windows: [], wings: [], ledges: [], drains: [] };
  assert.equal(wallEndNear(pending[3], 0, 2.2), 2, "fillet chooses clicked wall end");
  const closed = filletWalls(filletDoc, { id: pending[3].id, end: 2 }, { id: pending[0].id, end: 1 });
  assert.ok(closed.closedFaceLoop, "fillet closes pending face-drawn box");
  for (const w of closed.walls) closeTo(wallFaceLengths(w, closed.walls, (q) => q.thickness / 12).outside, 10, "filleted box outside dimension");
  closeTo(Math.abs(shoelace(detectClearRegion(closed.walls, 5, 5))), (10 - 16 / 12) ** 2, "filleted box interior area");
  assert.ok(closed.walls.every((w) => !w.pendingFace), "closed footprint no longer awaits conversion");
  const faceDraft = pending.map((w) => ({ ...w, traceSide: 1 }));
  const alreadyCentered = centerlineOpenWallRun(faceDraft, 1);
  const closedCentered = filletWalls({ ...filletDoc, walls: alreadyCentered }, { id: pending[3].id, end: 2 }, { id: pending[0].id, end: 1 });
  assert.ok(closedCentered.closedFaceLoop, "fillet recognizes an already offset face-drawn run");
  for (const w of closedCentered.walls) closeTo(wallFaceLengths(w, closedCentered.walls, (q) => q.thickness / 12).outside, 10, "fillet does not offset a face-drawn wall twice");
  const trimDoc = { walls: [{ id: 11, x1: 0, y1: 0, x2: 12, y2: 0 }, { id: 12, x1: 10, y1: -2, x2: 10, y2: 5 }], windows: [], wings: [], ledges: [], drains: [] };
  const trim = filletWalls(trimDoc, { id: 11, end: 2 }, { id: 12, end: 1 });
  closeTo(trim.walls[0].x2, 10, "fillet trims past intersection");
  closeTo(trim.walls[1].y1, 0, "fillet trims second wall to same corner");
  assert.ok(filletWalls({ ...trimDoc, walls: [{ ...trimDoc.walls[0] }, { ...trimDoc.walls[1], x1: 0, y1: 1, x2: 12, y2: 1 }] }, { id: 11, end: 2 }, { id: 12, end: 1 }).error, "parallel walls are rejected");
  assert.ok(filletWalls({ ...trimDoc, windows: [{ wallId: 11 }] }, { id: 11, end: 2 }, { id: 12, end: 1 }).error, "fillet protects wall attachments");
  const face = referenceFaceAt({ x: 0, y: 0 }, 4, 0.02, tenFoot, 0.2);
  assert.ok(face, "reference direction finds the selected outside face");
  const midpoint = referencePointAtDistance(face, 5);
  closeTo(midpoint.x, 5, "reference start is 5 feet from outside corner");
  closeTo(midpoint.y, 0, "reference start remains on outside face");
  const halfInch = referencePointAtDistance(face, parseLength(`5'6.5"`));
  closeTo(halfInch.x, 5 + 6.5 / 12, "reference offset accepts feet and half-inches");
  const reverseFace = referenceFaceAt({ x: 10, y: 0 }, 6, 0.02, tenFoot, 0.2);
  closeTo(referencePointAtDistance(reverseFace, 3).x, 7, "reference works from the opposite corner");
  assert.equal(referencePointAtDistance(face, 11), null, "offset beyond selected face is rejected");
  assert.equal(referenceFaceAt({ x: 0, y: 0 }, 5, 5, tenFoot, 0.1), null, "direction must follow an incident face");
  const garageWalls = [
    { id: 200, x1: 5, y1: 0, x2: 5, y2: -8, thickness: 8, depth: 8 },
    { id: 201, x1: 5, y1: -8, x2: 9, y2: -8, thickness: 8, depth: 8 },
    { id: 202, x1: 9, y1: -8, x2: 9, y2: 0, thickness: 8, depth: 8 },
  ];
  const sharedFoundation = [...tenFoot, ...garageWalls];
  const topology = wallTopologySegments(sharedFoundation);
  assert.equal(topology.filter((s) => s.wallId === tenFoot[0].id).length, 3, "shared host is divided virtually at both garage junctions");
  closeTo(garageWalls[0].y1, 0, "branch retains its physical wall-face start");
  const garageClear = detectClearRegion(sharedFoundation, 7, -4);
  assert.ok(garageClear, "garage enclosed area recognizes face-contact T junctions");
  closeTo(Math.abs(shoelace(garageClear)), (4 - 8 / 12) * (8 - 4 / 12), "garage area measures to actual inside wall faces");
  const basementClear = detectClearRegion(sharedFoundation, 5, 5);
  assert.ok(basementClear, "existing basement remains an enclosed area");
  closeTo(Math.abs(shoelace(basementClear)), (10 - 16 / 12) ** 2, "garage junctions do not change basement inside area");
  const detachedGarage = garageWalls.map((wall) => ({ ...wall }));
  detachedGarage[0].y1 = -0.1;
  assert.equal(detectClearRegion([...tenFoot, ...detachedGarage], 7, -4), null, "visible gap does not become a connected garage area");
  const newItems = {
    walls: square, pads: [], windows: [], areas: [], dims: [], drains: [], ledges: [],
    slabs: [{ id: 101, x: 4, y: 4, w: 24, l: 120, d: 12 }, { id: 102, x: 8, y: 8, w: 24, l: 120, d: 12 }],
    texts: [{ id: 103, x: 5, y: 5, text: "Plan note", size: 6 }],
    wings: [{ id: 104, wallId: square[0].id, t: 0.5, side: 1 }],
  };
  const newTakeoff = computeTakeoff(newItems);
  assert.equal(newTakeoff.slabRows[0].count, 2, "equal thickened slabs group together");
  closeTo(newTakeoff.slabRows[0].cy, 2 * 24 * 120 * 12 / 46656, "gross thickened slab volume");
  assert.equal(newTakeoff.wingCount, 1, "wing arm is counted");
  const newHits = selectInBox(newItems, { x: -1, y: -1 }, { x: 16, y: 16 });
  assert.ok(newHits.some((s) => s.type === "slab") && newHits.some((s) => s.type === "text") && newHits.some((s) => s.type === "wing"), "new items participate in group selection");
  const newMoved = moveSelection(newItems, newHits, 2, 3);
  assert.ok(newMoved.doc, "new items move with a complete selected foundation");
  closeTo(newMoved.doc.slabs[0].x, 6, "selected slab moves");
  closeTo(newMoved.doc.texts[0].y, 8, "selected text moves");
  assert.equal(newMoved.doc.wings[0].t, 0.5, "wing remains attached to selected wall");
  const newDeleted = deleteSelection(newItems, newHits);
  assert.equal(newDeleted.slabs.length + newDeleted.texts.length + newDeleted.wings.length, 0, "new items delete with selection");
  const newScene = new THREE.Group();
  buildScene(newScene, newItems, null, () => true, () => "#777777");
  assert.equal(newScene.children.filter((obj) => obj.geometry?.type === "BoxGeometry").length, 2, "thickened slabs appear as 3D solids");
  const wingMesh = newScene.children.find((obj) => obj.userData.kind === "wing");
  assert.ok(wingMesh && wingMesh.geometry.type === "ExtrudeGeometry", "wing is a tapered wall-shaped return");
  wingMesh.geometry.computeBoundingBox();
  closeTo(wingMesh.geometry.boundingBox.max.x, 2, "illustrative wing return length");
  closeTo(wingMesh.geometry.boundingBox.min.y, -2, "illustrative wing depth at wall");
  closeTo(wingMesh.geometry.boundingBox.max.y, 0, "wing top remains level");
  assert.notEqual(wingMesh.material.color.getHex(), new THREE.Color("#777777").getHex(), "wing color differs from host wall");
  const rotated = { id: 300, x: 0, y: 0, w: 24, l: 120, d: 12, rotation: 90 };
  const corners = slabCorners(rotated);
  closeTo(Math.max(...corners.map((p) => p.x)) - Math.min(...corners.map((p) => p.x)), 10, "90-degree slab width span");
  closeTo(Math.max(...corners.map((p) => p.y)) - Math.min(...corners.map((p) => p.y)), 2, "90-degree slab length span");
  const rotatedDoc = { walls: [], pads: [], windows: [], areas: [], slabs: [rotated] };
  assert.ok(selectInBox(rotatedDoc, { x: 4.5, y: -0.2 }, { x: 4.9, y: 0.2 }).some((s) => s.type === "slab"), "selection uses rotated slab shape");
  assert.ok(!selectInBox(rotatedDoc, { x: -0.2, y: 4.5 }, { x: 0.2, y: 4.9 }).some((s) => s.type === "slab"), "selection excludes prior unrotated extent");
  const rotatedScene = new THREE.Group();
  buildScene(rotatedScene, rotatedDoc, null, () => true, () => "#777777");
  closeTo(rotatedScene.children[0].rotation.y, -Math.PI / 2, "3D slab rotation matches plan");
  const differentFooting = { ...square[1], footing: { w: 20, h: 8 } };
  assert.equal(wallKey(square[0]), wallKey(differentFooting), "footing size does not split wall row");
  assert.equal(wallColorKey(square[0]), wallColorKey(differentFooting), "same wall uses same color");
  assert.notEqual(footingKey(square[0]), footingKey(differentFooting), "different footings have separate rows");
  assert.notEqual(hashColor(footingColorKey(square[0])), hashColor(footingColorKey(differentFooting)), "typical different footing sizes get distinct colors");
  const splitFootings = computeTakeoff({ walls: [square[0], differentFooting], wallGeometry: square, pads: [], windows: [], areas: [] });
  assert.equal(splitFootings.wallRows.length, 1, "same wall sizes roll up together");
  assert.equal(splitFootings.footingRows.length, 2, "different footing sizes roll up independently");
  const isolated = new THREE.Group();
  buildScene(isolated, { walls: [square[0]], pads: [], windows: [], areas: [] }, null, (key) => key === footingKey(square[0]), hashColor);
  assert.equal(isolated.children.filter((child) => child.isMesh).length, 1, "footing row isolates only the footing in 3D");
  buildScene(isolated, { walls: [square[0]], pads: [], windows: [], areas: [] }, null, (key) => key === wallKey(square[0]), hashColor);
  assert.equal(isolated.children.filter((child) => child.isMesh).length, 1, "wall row isolates only the wall in 3D");
  const selectionDoc = { walls: square, pads: [{ id: 50, x: 5, y: 5, w: 24, l: 24, d: 12 }], windows: [{ id: 51, wallId: square[0].id, t: 0.5, width: 32, kind: "peek" }], areas: [], dims: [], drains: [], ledges: [] };
  const hits = selectInBox(selectionDoc, { x: -2, y: -2 }, { x: 17, y: 17 });
  assert.equal(hits.length, 6, "box selects walls, pad, and attached window");
  const crossing = selectInBox(selectionDoc, { x: 2, y: -0.1 }, { x: 3, y: 1 });
  assert.ok(crossing.some((item) => item.type === "wall" && item.id === square[0].id), "box selects part of a wall without its endpoints");
  const insidePad = selectInBox(selectionDoc, { x: 4.9, y: 4.9 }, { x: 5.1, y: 5.1 });
  assert.ok(insidePad.some((item) => item.type === "pad" && item.id === 50), "box contained inside pad selects it");
  const reversed = selectInBox(selectionDoc, { x: 3, y: 1 }, { x: 2, y: -0.1 });
  assert.deepEqual(reversed, crossing, "selection works in either drag direction");
  const twoClicks = toggleSelection([{ type: "wall", id: 1 }], { type: "pad", id: 50 });
  assert.equal(twoClicks.length, 2, "shift-click adds an item");
  assert.deepEqual(toggleSelection(twoClicks, { type: "wall", id: 1 }), [{ type: "pad", id: 50 }], "shift-click removes an item");
  assert.equal(selectionDocument(selectionDoc, hits).walls.length, 4, "group BOM uses selected walls");
  const movedGroup = moveSelection(selectionDoc, hits, 3, 4);
  assert.ok(movedGroup.doc, "complete foundation group can move");
  closeTo(movedGroup.doc.walls[0].x1, square[0].x1 + 3, "group wall moves once");
  closeTo(movedGroup.doc.pads[0].y, 9, "group pad moves");
  assert.equal(movedGroup.doc.windows[0].t, 0.5, "attached window stays on wall");
  assert.ok(moveSelection(selectionDoc, [hits.find((h) => h.type === "wall")], 1, 1).error, "partial connected wall move is blocked");
  const deletedGroup = deleteSelection(selectionDoc, hits);
  assert.equal(deletedGroup.walls.length + deletedGroup.pads.length + deletedGroup.windows.length, 0, "group deletion removes selected entities");
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
function wallPolygonForTest(wall, walls, side, end) {
  const face = wallPolygon(wall, walls, (w) => w.thickness / 12);
  return face[side === 1 ? (end ? 2 : 3) : (end ? 1 : 0)];
}
