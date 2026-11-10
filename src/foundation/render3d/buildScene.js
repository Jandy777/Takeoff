import * as THREE from "three";
import { wallLen, wallPolygon, wallSubPoly, openingHFor, windowPose, pointSegDist } from "../geometry";
import { footOf, wallKey, padKey, winKey, areaKey } from "../model";
import { shade } from "../color";

const SELECTED_COLOR = "#ff8a3d";

function mkGeo(poly, h) {
  const shape = new THREE.Shape();
  shape.moveTo(poly[0].x, -poly[0].y);
  for (let i = 1; i < poly.length; i++) shape.lineTo(poly[i].x, -poly[i].y);
  shape.closePath();
  return new THREE.ExtrudeGeometry(shape, { depth: h, bevelEnabled: false });
}
const cInt = (hex) => parseInt(hex.slice(1), 16);

// Tears down and rebuilds every mesh in `group` from the current document.
// Pure with respect to React: only reads doc/sel/shown/rowColor, only writes
// into the THREE.Group handed to it.
export function buildScene(group, { walls, pads, windows, areas, drains = [] }, sel, shown, rowColor) {
  while (group.children.length) {
    const c = group.children[0];
    group.remove(c);
    c.geometry && c.geometry.dispose();
    c.material && c.material.dispose();
  }

  // All walls share a common top-of-wall elevation (level, per real foundations).
  // Height differences show up at the bottom instead of the top.
  const topY = walls.reduce((m, w) => {
    const len = wallLen(w);
    if (len < 0.01) return m;
    if (!shown(wallKey(w))) return m;
    return Math.max(m, footOf(w).h / 12 + w.depth);
  }, 0);

  walls.forEach((w) => {
    const len = wallLen(w);
    if (len < 0.01) return;
    const key = wallKey(w);
    if (!shown(key)) return;
    const f = footOf(w);
    const fhFt = f.h / 12;
    const baseY = topY - w.depth; // bottom of wall / top of footing, varies per wall
    const selMat = sel && sel.type === "wall" && sel.id === w.id;
    const col = selMat ? SELECTED_COLOR : rowColor(key);
    const widthOfWall = (q) => q.thickness / 12;
    const mat = () => new THREE.MeshLambertMaterial({ color: cInt(col) });
    const addPiece = (poly, h) => {
      if (!poly || h < 0.05) return;
      const geo = mkGeo(poly, h);
      const mesh = new THREE.Mesh(geo, mat());
      mesh.rotation.x = -Math.PI / 2;
      mesh.position.y = baseY;
      group.add(mesh);
      const edges = new THREE.LineSegments(new THREE.EdgesGeometry(geo), new THREE.LineBasicMaterial({ color: cInt(shade(col, 0.55)) }));
      edges.rotation.copy(mesh.rotation);
      edges.position.copy(mesh.position);
      group.add(edges);
    };

    // window cutouts along this wall
    const cuts = windows
      .filter((v) => v.wallId === w.id)
      .map((v) => {
        const c = v.t * len, half = v.width / 24;
        return { s0: Math.max(0.02, c - half), s1: Math.min(len - 0.02, c + half), oh: openingHFor(v, w.depth) };
      })
      .filter((c) => c.s1 - c.s0 > 0.05)
      .sort((a, b) => a.s0 - b.s0);

    if (!cuts.length) {
      addPiece(wallPolygon(w, walls, widthOfWall), w.depth);
    } else {
      let cursor = 0;
      cuts.forEach((c) => {
        if (c.s0 - cursor > 0.02) addPiece(wallSubPoly(w, walls, widthOfWall, cursor, c.s0), w.depth);
        const bandH = w.depth - c.oh;
        if (bandH > 0.05) addPiece(wallSubPoly(w, walls, widthOfWall, c.s0, c.s1), bandH);
        cursor = Math.max(cursor, c.s1);
      });
      if (len - cursor > 0.02) addPiece(wallSubPoly(w, walls, widthOfWall, cursor, len), w.depth);
    }

    const fPoly = wallPolygon(w, walls, (q) => footOf(q).w / 12);
    if (fPoly) {
      const footGeo = mkGeo(fPoly, fhFt);
      const footMesh = new THREE.Mesh(footGeo, new THREE.MeshLambertMaterial({ color: cInt(shade(col, 0.65)) }));
      footMesh.rotation.x = -Math.PI / 2;
      footMesh.position.y = baseY - fhFt;
      group.add(footMesh);
    }
  });

  // Drain elevations are illustrative: position each traced segment at the
  // nearest wall's footing level, since the document stores no pipe elevation.
  drains.forEach((drain) => {
    const color = sel?.type === "drain" && sel.id === drain.id ? SELECTED_COLOR : drain.kind === "exterior" ? "#1572a1" : "#9a42aa";
    for (let i = 1; i < drain.pts.length; i++) {
      const a = drain.pts[i - 1], b = drain.pts[i];
      const length = Math.hypot(b.x - a.x, b.y - a.y);
      if (length < 0.001) continue;
      const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
      let nearest = null, distance = Infinity;
      for (const wall of walls) {
        const d = pointSegDist(mx, my, wall.x1, wall.y1, wall.x2, wall.y2);
        if (d < distance) { distance = d; nearest = wall; }
      }
      const elevation = nearest ? topY - nearest.depth + 0.18 : 0.18;
      const geometry = new THREE.CylinderGeometry(0.16, 0.16, length, 12);
      const mesh = new THREE.Mesh(geometry, new THREE.MeshLambertMaterial({ color: cInt(color) }));
      mesh.position.set(mx, elevation, my);
      mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), new THREE.Vector3((b.x - a.x) / length, 0, (b.y - a.y) / length));
      group.add(mesh);
    }
  });

  pads.forEach((p) => {
    const key = padKey(p);
    if (!shown(key)) return;
    const selMat = sel && sel.type === "pad" && sel.id === p.id;
    const col = cInt(selMat ? SELECTED_COLOR : rowColor(key));
    const geo = new THREE.BoxGeometry(p.w / 12, p.d / 12, p.l / 12);
    const mesh = new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ color: col }));
    mesh.position.set(p.x, p.d / 24, p.y);
    group.add(mesh);
  });

  windows.forEach((win) => {
    const key = winKey(win);
    if (!shown(key)) return;
    const pose = windowPose(win, walls);
    if (!pose) return;
    const selMat = sel && sel.type === "window" && sel.id === win.id;
    const col = cInt(selMat ? SELECTED_COLOR : rowColor(key));
    const tFt = pose.thickness / 12;
    const wFt = win.width / 12;
    const oh = openingHFor(win, pose.depth);
    // translucent pane sitting in the opening (color-coded), hung from the shared top-of-wall line
    const paneGeo = new THREE.BoxGeometry(wFt, oh, 0.08);
    const pane = new THREE.Mesh(paneGeo, new THREE.MeshLambertMaterial({ color: col, transparent: true, opacity: 0.55 }));
    pane.position.set(pose.x, topY - oh / 2, pose.y);
    pane.rotation.y = -pose.ang;
    group.add(pane);

    if (win.kind === "well") {
      // open half-cylinder hugging the outside face, bulging away from the wall
      const shellH = oh + 0.8;
      const wellGeo = new THREE.CylinderGeometry(wFt / 2, wFt / 2, shellH, 20, 1, true, 0, Math.PI);
      const wellMesh = new THREE.Mesh(wellGeo, new THREE.MeshLambertMaterial({ color: col, side: THREE.DoubleSide, transparent: true, opacity: 0.85 }));
      // outward normal in plan for this side, mapped to world x/z
      const ox = -win.side * Math.sin(pose.ang);
      const oz = win.side * Math.cos(pose.ang);
      const d0 = tFt / 2 + 0.03;
      wellMesh.position.set(pose.x + ox * d0, topY - oh / 2 + 0.4, pose.y + oz * d0);
      // 2D bump direction in plan is (-side·sin θ, side·cos θ); the half-shell
      // bulges toward local +X, so rotate local +X onto that same direction.
      wellMesh.rotation.y = -pose.ang - win.side * (Math.PI / 2);
      group.add(wellMesh);
    }
  });

  areas.forEach((a) => {
    const key = areaKey(a);
    if (!shown(key)) return;
    const selMat = sel && sel.type === "area" && sel.id === a.id;
    const col = cInt(selMat ? SELECTED_COLOR : rowColor(key));
    const shape = new THREE.Shape();
    shape.moveTo(a.pts[0].x, -a.pts[0].y);
    for (let i = 1; i < a.pts.length; i++) shape.lineTo(a.pts[i].x, -a.pts[i].y);
    shape.closePath();
    const geo = new THREE.ShapeGeometry(shape);
    const mesh = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: 0.35, side: THREE.DoubleSide }));
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.y = 0.04;
    group.add(mesh);
  });
}

