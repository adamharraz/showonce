import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { componentModel, disposeModel } from "./component-models";
import type { CatalogPart, PartVariant } from "./components-api";

export default function ComponentViewer({
  part,
  variant,
  pinId,
}: {
  part: CatalogPart;
  variant?: PartVariant;
  pinId?: string | null;
}) {
  const container = useRef<HTMLDivElement>(null);
  const reset = useRef<() => void>(() => {});
  const [unavailable, setUnavailable] = useState(false);
  useEffect(() => {
    const host = container.current!;
    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
    } catch {
      setUnavailable(true);
      return;
    }
    setUnavailable(false);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setClearColor(0x13212a);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.domElement.setAttribute(
      "aria-label",
      `Interactive 3D reference: ${part.name}`,
    );
    renderer.domElement.setAttribute("role", "img");
    host.appendChild(renderer.domElement);
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(38, 1, 0.1, 80);
    camera.position.set(5, 6, 7);
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.target.set(0, 0.5, 0);
    controls.enableDamping = true;
    controls.enablePan = false;
    controls.minDistance = 5;
    controls.maxDistance = 22;
    controls.maxPolarAngle = Math.PI * 0.47;
    controls.update();
    controls.saveState();
    reset.current = () => controls.reset();
    scene.add(new THREE.HemisphereLight(0xffffff, 0x23443e, 2.6));
    const light = new THREE.DirectionalLight(0xffffff, 3);
    light.position.set(4, 8, 6);
    scene.add(light);
    const rim = new THREE.DirectionalLight(0x75b4ce, 2);
    rim.position.set(-5, 3, -5);
    scene.add(rim);
    const grid = new THREE.GridHelper(12, 24, 0x39525e, 0x233a44);
    grid.position.y = -0.03;
    scene.add(grid);
    const model = componentModel(part, variant, pinId);
    scene.add(model);
    let alive = true;
    const resize = new ResizeObserver(() => {
      if (!alive) return;
      const { width, height } = host.getBoundingClientRect();
      // CSS controls the canvas size. A fixed inline width would feed its old
      // desktop size back into the layout's minimum width on mobile.
      renderer.setSize(Math.max(1, width), Math.max(1, height), false);
      camera.aspect = Math.max(1, width) / Math.max(1, height);
      camera.updateProjectionMatrix();
    });
    resize.observe(host);
    const lost = (event: Event) => {
      event.preventDefault();
      setUnavailable(true);
      renderer.setAnimationLoop(null);
    };
    renderer.domElement.addEventListener("webglcontextlost", lost);
    renderer.setAnimationLoop(() => {
      controls.update();
      renderer.render(scene, camera);
    });
    return () => {
      alive = false;
      resize.disconnect();
      renderer.setAnimationLoop(null);
      controls.dispose();
      disposeModel(scene);
      grid.geometry.dispose();
      const mats = Array.isArray(grid.material)
        ? grid.material
        : [grid.material];
      mats.forEach((m) => m.dispose());
      renderer.domElement.removeEventListener("webglcontextlost", lost);
      renderer.dispose();
      renderer.forceContextLoss();
      renderer.domElement.remove();
      reset.current = () => {};
    };
  }, [part, variant, pinId]);
  return (
    <div className="component-viewer-wrap">
      <div ref={container} className="component-viewer" />
      {unavailable && (
        <div className="component-viewer-fallback">
          <strong>{part.name}</strong>
          <p>
            3D is unavailable on this browser. Component details and pin labels
            remain available below.
          </p>
        </div>
      )}
      <div className="component-viewer-controls">
        <span>Drag to rotate · scroll to zoom</span>
        <button type="button" onClick={() => reset.current()}>
          Reset view
        </button>
      </div>
    </div>
  );
}
