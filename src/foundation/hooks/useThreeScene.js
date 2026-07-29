import { useEffect, useRef } from "react";
import * as THREE from "three";
import { buildScene } from "../render3d/buildScene";

// Mounts a Three.js renderer/camera/orbit rig into `threeWrap` whenever `view`
// is "3d", and rebuilds the mesh group from the document on every relevant
// change. Returns the ref to attach to the container div.
export function useThreeScene({ view, doc, sel, shown, rowColor }) {
  const threeWrap = useRef(null);
  const threeRef = useRef(null);

  useEffect(() => {
    if (view !== "3d") return;
    const el = threeWrap.current;
    if (!el) return;
    const { walls } = doc;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0xeef0ea);
    const camera = new THREE.PerspectiveCamera(50, el.clientWidth / el.clientHeight, 0.1, 2000);
    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(window.devicePixelRatio || 1);
    renderer.setSize(el.clientWidth, el.clientHeight);
    el.appendChild(renderer.domElement);

    scene.add(new THREE.AmbientLight(0xffffff, 0.65));
    const dir = new THREE.DirectionalLight(0xffffff, 0.7);
    dir.position.set(60, 100, 30);
    scene.add(dir);
    scene.add(new THREE.GridHelper(300, 300, 0xb9c0b6, 0xd8dcd2));
    const group = new THREE.Group();
    scene.add(group);

    let tx = 0, tz = 0, radius = 80;
    if (walls.length) {
      let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
      walls.forEach((w) => {
        minX = Math.min(minX, w.x1, w.x2); maxX = Math.max(maxX, w.x1, w.x2);
        minY = Math.min(minY, w.y1, w.y2); maxY = Math.max(maxY, w.y1, w.y2);
      });
      tx = (minX + maxX) / 2; tz = (minY + maxY) / 2;
      radius = Math.max(30, Math.max(maxX - minX, maxY - minY) * 1.4);
    }
    const cam = { theta: -Math.PI / 4, phi: Math.PI / 3.4, radius, target: new THREE.Vector3(tx, 4, tz) };
    const updateCam = () => {
      camera.position.set(
        cam.target.x + cam.radius * Math.sin(cam.phi) * Math.cos(cam.theta),
        cam.target.y + cam.radius * Math.cos(cam.phi),
        cam.target.z + cam.radius * Math.sin(cam.phi) * Math.sin(cam.theta)
      );
      camera.lookAt(cam.target);
    };
    updateCam();

    let down = null;
    const dom = renderer.domElement;
    const onDown = (e) => { down = { x: e.clientX, y: e.clientY, btn: e.button, shift: e.shiftKey }; e.preventDefault(); };
    const onMove = (e) => {
      if (!down) return;
      const dx = e.clientX - down.x, dy = e.clientY - down.y;
      down.x = e.clientX; down.y = e.clientY;
      if (down.btn === 2 || down.shift) {
        const panScale = cam.radius * 0.0016;
        const fwd = new THREE.Vector3();
        camera.getWorldDirection(fwd);
        const right = new THREE.Vector3().crossVectors(fwd, new THREE.Vector3(0, 1, 0)).normalize();
        cam.target.addScaledVector(right, dx * panScale);
        cam.target.y += dy * panScale;
      } else {
        cam.theta += dx * 0.006;
        cam.phi = Math.min(Math.PI / 2 - 0.03, Math.max(0.08, cam.phi - dy * 0.006));
      }
      updateCam();
    };
    const onUp = () => { down = null; };
    const onWheel3 = (e) => {
      e.preventDefault();
      cam.radius = Math.min(600, Math.max(6, cam.radius * Math.pow(1.0015, e.deltaY)));
      updateCam();
    };
    const onCtx = (e) => e.preventDefault();
    dom.addEventListener("mousedown", onDown);
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    dom.addEventListener("wheel", onWheel3, { passive: false });
    dom.addEventListener("contextmenu", onCtx);

    let raf;
    const loop = () => { renderer.render(scene, camera); raf = requestAnimationFrame(loop); };
    loop();

    const ro = new ResizeObserver(() => {
      camera.aspect = el.clientWidth / el.clientHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(el.clientWidth, el.clientHeight);
    });
    ro.observe(el);

    threeRef.current = { scene, camera, renderer, group };
    buildScene(group, doc, sel, shown, rowColor);

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      dom.removeEventListener("mousedown", onDown);
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
      dom.removeEventListener("wheel", onWheel3);
      dom.removeEventListener("contextmenu", onCtx);
      el.removeChild(dom);
      renderer.dispose();
      threeRef.current = null;
    };
    // Mount/teardown only on view changes — doc/sel/shown/rowColor changes are
    // handled by the rebuild effect below, not by remounting the whole scene.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view]);

  useEffect(() => {
    if (view !== "3d") return;
    const T = threeRef.current;
    if (!T) return;
    buildScene(T.group, doc, sel, shown, rowColor);
  }, [view, doc, sel, shown, rowColor]);

  return { threeWrap };
}
