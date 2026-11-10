import * as THREE from "three";
import { wallLen, wallPolygon, wallSubPoly, openingHFor, windowPose, pointSegDist } from "../geometry";
import { footOf, wallKey, wallColorKey, footingKey, footingColorKey, padKey, winKey, areaKey, slabKey } from "../model";
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
export function buildScene(group, { walls, pads, windows, areas, drains = [], ledges = [], slabs = [], wings = [] }, sel, shown, rowColor) {
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
    return Math.max(m, footOf(w).h / 12 + w.depth);
  }, 0);

  walls.forEach((w) => {
    const len = wallLen(w);
    if (len < 0.01) return;
    const key = wallKey(w);
    const wallVisible = shown(key), footingVisible = shown(footingKey(w));
    if (!wallVisible && !footingVisible) return;
    const f = footOf(w);
    const fhFt = f.h / 12;
    const baseY = topY - w.depth; // bottom of wall / top of footing, varies per wall
    const selMat = sel && sel.type === "wall" && sel.id === w.id;
    const col = selMat ? SELECTED_COLOR : rowColor(wallColorKey(w));
    const footingCol = rowColor(footingColorKey(w));
    const widthOfWall = (q) => q.thickness / 12;
    const mat = () => new THREE.MeshLambertMaterial({ color: cInt(col) });
    const addPiece = (poly, h, bottom = baseY) => {
      if (!wallVisible || !poly || h < 0.05) return;
      const geo = mkGeo(poly, h);
      const mesh = new THREE.Mesh(geo, mat());
      mesh.rotation.x = -Math.PI / 2;
      mesh.position.y = bottom;
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

    const wallLedges = ledges.filter((l) => l.wallId === w.id).map((l) => {
      const [drop, width] = l.size.split("x").map(Number);
      const station = (t) => {
        if (t <= 1e-6) return 0;
        if (t >= 1 - 1e-6) return len;
        const face = wallPolygon(w, walls, widthOfWall);
        const a = face[l.start], b = face[l.end];
        const x = a.x + t * (b.x - a.x), y = a.y + t * (b.y - a.y);
        return Math.max(0, Math.min(len, ((x - w.x1) * (w.x2 - w.x1) + (y - w.y1) * (w.y2 - w.y1)) / len));
      };
      const first = station(l.t0), last = station(l.t1);
      return { ...l, s0: Math.min(first, last), s1: Math.max(first, last), drop: drop / 12, width: width / 12 };
    });
    if (!cuts.length && !wallLedges.length) {
      addPiece(wallPolygon(w, walls, widthOfWall), w.depth);
    } else if (!wallLedges.length) {
      let cursor = 0;
      cuts.forEach((c) => {
        if (c.s0 - cursor > 0.02) addPiece(wallSubPoly(w, walls, widthOfWall, cursor, c.s0), w.depth);
        const bandH = w.depth - c.oh;
        if (bandH > 0.05) addPiece(wallSubPoly(w, walls, widthOfWall, c.s0, c.s1), bandH);
        cursor = Math.max(cursor, c.s1);
      });
      if (len - cursor > 0.02) addPiece(wallSubPoly(w, walls, widthOfWall, cursor, len), w.depth);
    } else {
      // Break at every opening and ledge boundary, then build horizontal
      // layers. The upper layer omits the selected wall-face strip.
      const stations = [0, len, ...cuts.flatMap((c) => [c.s0, c.s1]), ...wallLedges.flatMap((l) => [l.s0, l.s1])].sort((a, b) => a - b).filter((v, i, a) => !i || v - a[i - 1] > 1e-7);
      for (let i = 1; i < stations.length; i++) {
        const s0 = stations[i - 1], s1 = stations[i], mid = (s0 + s1) / 2;
        const poly = wallSubPoly(w, walls, widthOfWall, s0, s1);
        if (!poly) continue;
        const opening = cuts.filter((c) => mid > c.s0 && mid < c.s1).reduce((v, c) => Math.max(v, c.oh), 0);
        const wallHeight = Math.max(0, w.depth - opening);
        const active = opening ? [] : wallLedges.filter((l) => mid > l.s0 && mid < l.s1);
        const levels = [0, wallHeight, ...active.map((l) => Math.max(0, w.depth - l.drop))].filter((v) => v >= 0 && v <= wallHeight).sort((a, b) => a - b).filter((v, j, a) => !j || v - a[j - 1] > 1e-7);
        const lerp = (a, b, t) => ({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });
        for (let j = 1; j < levels.length; j++) {
          const lo = levels[j - 1], hi = levels[j];
          const cutting = active.filter((l) => (lo + hi) / 2 >= w.depth - l.drop);
          const plus = Math.max(0, ...cutting.filter((l) => l.start === 0).map((l) => l.width));
          const minus = Math.max(0, ...cutting.filter((l) => l.start === 3).map((l) => l.width));
          const thickness = w.thickness / 12;
          if (plus + minus >= thickness) continue;
          const p = [lerp(poly[0], poly[3], plus / thickness), lerp(poly[1], poly[2], plus / thickness), lerp(poly[2], poly[1], minus / thickness), lerp(poly[3], poly[0], minus / thickness)];
          addPiece(p, hi - lo, baseY + lo);
        }
      }
    }

    const fPoly = wallPolygon(w, walls, (q) => footOf(q).w / 12);
    if (fPoly && footingVisible) {
      const footGeo = mkGeo(fPoly, fhFt);
      const footMesh = new THREE.Mesh(footGeo, new THREE.MeshLambertMaterial({ color: cInt(footingCol) }));
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

  slabs.forEach((s) => {
    if (!shown(slabKey(s))) return;
    const geometry = new THREE.BoxGeometry(s.w / 12, s.d / 12, s.l / 12);
    const mesh = new THREE.Mesh(geometry, new THREE.MeshLambertMaterial({ color: cInt(sel?.type === "slab" && sel.id === s.id ? SELECTED_COLOR : rowColor(slabKey(s))) }));
    mesh.position.set(s.x, s.d / 24, s.y);
    mesh.rotation.y = -(s.rotation || 0) * Math.PI / 180;
    group.add(mesh);
  });

  // Illustrative wing: a 2-foot return with a level top and an underside
  // rising from the host wall to the outer tip. Dimensions are not takeoff data.
  wings.forEach((wing) => {
    const pose = windowPose(wing, walls); if (!pose) return;
    const wall = walls.find((w) => w.id === wing.wallId);
    const thickness = (wall?.thickness || 8) / 12, height = wall?.depth || 1, length = 2;
    const drop = Math.min(2, height);
    const shape = new THREE.Shape();
    shape.moveTo(0, 0); shape.lineTo(0, -drop); shape.lineTo(length, 0); shape.closePath();
    const geometry = new THREE.ExtrudeGeometry(shape, { depth: thickness, bevelEnabled: false });
    geometry.translate(0, 0, -thickness / 2);
    const wallColor = new THREE.Color(wall ? rowColor(wallColorKey(wall)) : "#888888");
    const choices = ["#5d43c7", "#007f9e", "#cd443e", "#258351"];
    const color = choices.reduce((best, candidate) => {
      const distance = (s) => { const c = new THREE.Color(s); return (c.r - wallColor.r) ** 2 + (c.g - wallColor.g) ** 2 + (c.b - wallColor.b) ** 2; };
      return distance(candidate) > distance(best) ? candidate : best;
    });
    const mesh = new THREE.Mesh(geometry, new THREE.MeshLambertMaterial({ color: cInt(sel?.type === "wing" && sel.id === wing.id ? SELECTED_COLOR : color) }));
    const side = wing.side || 1, offset = thickness / 2;
    mesh.position.set(pose.x - Math.sin(pose.ang) * side * offset, wall ? topY : height, pose.y + Math.cos(pose.ang) * side * offset);
    mesh.rotation.y = -pose.ang - side * Math.PI / 2;
    mesh.userData.kind = "wing";
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

