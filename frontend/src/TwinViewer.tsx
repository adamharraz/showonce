import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { disposeModel } from "./component-models";

export default function TwinViewer({ src }: { src: string }) {
  const container = useRef<HTMLDivElement>(null);
  const reset = useRef<() => void>(() => {});
  const [error, setError] = useState("");
  const [loaded, setLoaded] = useState(false);
  useEffect(() => {
    const host = container.current!;
    let alive = true;
    let renderer: THREE.WebGLRenderer;
    setError("");
    setLoaded(false);
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true });
    } catch {
      setError(
        "This browser cannot display 3D. You can still download your GLB.",
      );
      return;
    }
    renderer.setClearColor(0x102128);
    renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.domElement.setAttribute("role", "img");
    renderer.domElement.setAttribute(
      "aria-label",
      "Generated 3D model of your captured build",
    );
    host.appendChild(renderer.domElement);
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(45, 1, 0.01, 100);
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.enablePan = false;
    scene.add(new THREE.HemisphereLight(0xffffff, 0x284b4b, 2));
    const light = new THREE.DirectionalLight(0xffffff, 3);
    light.position.set(4, 6, 5);
    scene.add(light);
    const rim = new THREE.DirectionalLight(0xa6dbe4, 1.6);
    rim.position.set(-4, 2, -5);
    scene.add(rim);
    const manager = new THREE.LoadingManager();
    // GLB resources were validated on the server; this also blocks runtime URL lookups.
    manager.setURLModifier((url) => {
      if (url === src || url.startsWith("blob:") || url.startsWith("data:"))
        return url;
      throw new Error("External model resources are blocked");
    });
    const loader = new GLTFLoader(manager);
    loader.load(
      src,
      (gltf) => {
        if (!alive) {
          disposeModel(gltf.scene);
          return;
        }
        const model = gltf.scene;
        const bounds = new THREE.Box3().setFromObject(model);
        if (bounds.isEmpty()) {
          disposeModel(model);
          setError("This model has no visible geometry.");
          return;
        }
        const centre = bounds.getCenter(new THREE.Vector3());
        const size = bounds.getSize(new THREE.Vector3());
        const longest = Math.max(size.x, size.y, size.z);
        if (!Number.isFinite(longest) || longest <= 0) {
          disposeModel(model);
          setError("Invalid model dimensions.");
          return;
        }
        model.position.sub(centre);
        model.scale.multiplyScalar(2 / longest);
        model.position.multiplyScalar(2 / longest);
        scene.add(model);
        camera.position.set(2.6, 1.9, 2.6);
        controls.target.set(0, 0, 0);
        controls.minDistance = 0.8;
        controls.maxDistance = 9;
        controls.update();
        controls.saveState();
        reset.current = () => controls.reset();
        setLoaded(true);
      },
      undefined,
      () => {
        if (alive)
          setError(
            "The generated model could not be displayed. Download it or reopen it.",
          );
      },
    );
    const resize = new ResizeObserver(() => {
      if (!alive) return;
      const { width, height } = host.getBoundingClientRect();
      renderer.setSize(Math.max(1, width), Math.max(1, height), false);
      camera.aspect = Math.max(1, width) / Math.max(1, height);
      camera.updateProjectionMatrix();
    });
    resize.observe(host);
    const lost = (event: Event) => {
      event.preventDefault();
      setError(
        "3D graphics were interrupted. Download the model or reload the page.",
      );
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
      controls.dispose();
      renderer.setAnimationLoop(null);
      disposeModel(scene);
      renderer.domElement.removeEventListener("webglcontextlost", lost);
      renderer.dispose();
      renderer.forceContextLoss();
      renderer.domElement.remove();
      reset.current = () => {};
    };
  }, [src]);
  return (
    <div className="component-viewer-wrap">
      <div ref={container} className="component-viewer twin-viewer" />
      {(!loaded || error) && (
        <div className="component-viewer-fallback" role="status">
          {error || "Loading your generated model…"}
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
