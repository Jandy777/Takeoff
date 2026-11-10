import * as THREE from "three";
import { buildScene } from "./buildScene";

// Build a fresh, fitted 3D view so printing works from either editor tab.
export function capturePrintView(doc, rowColor) {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0xffffff);
  scene.add(new THREE.AmbientLight(0xffffff, 0.7));
  const light = new THREE.DirectionalLight(0xffffff, 0.8); light.position.set(40, 80, 30); scene.add(light);
  const group = new THREE.Group(); scene.add(group);
  let renderer;
  try {
    buildScene(group, doc, null, () => true, rowColor);
    const bounds = new THREE.Box3().setFromObject(group);
    const center = new THREE.Vector3(), size = new THREE.Vector3();
    if (!bounds.isEmpty()) { bounds.getCenter(center); bounds.getSize(size); }
    const radius = Math.max(15, size.length() * 1.25);
    const camera = new THREE.PerspectiveCamera(38, 1.5, 0.1, radius * 10 + 100);
    camera.position.set(center.x + radius * 0.65, center.y + radius * 0.65, center.z + radius * 0.65);
    camera.lookAt(center);
    renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
    renderer.setSize(1200, 800); renderer.setPixelRatio(1); renderer.render(scene, camera);
    return renderer.domElement.toDataURL("image/png");
  } finally {
    group.traverse((obj) => { obj.geometry?.dispose(); if (Array.isArray(obj.material)) obj.material.forEach((m) => m.dispose()); else obj.material?.dispose(); });
    renderer?.dispose();
  }
}
