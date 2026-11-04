import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { componentModel, disposeModel } from "./component-models";
import type { LabPart } from "./ElectronicsLab";

export default function LabCircuit({
  stage,
  running,
  reset,
  onSelect,
}: {
  stage: number;
  running: boolean;
  reset: number;
  onSelect: (part: LabPart) => void;
}) {
  const host = useRef<HTMLDivElement>(null);
  const state = useRef({ stage, running });
  state.current = { stage, running };
  const select = useRef(onSelect);
  select.current = onSelect;
  const resetView = useRef(() => {});
  const [failed, setFailed] = useState(false);
  useEffect(() => resetView.current(), [reset]);
  useEffect(() => {
    const container = host.current!;
    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true });
    } catch {
      setFailed(true);
      return;
    }
    renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    renderer.setClearColor(0xf0f3ef);
    renderer.domElement.setAttribute("role", "img");
    renderer.domElement.setAttribute(
      "aria-label",
      "Rotatable circuit reference with a development board, series resistor and LED. Use the component buttons for details.",
    );
    container.appendChild(renderer.domElement);
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(40, 1, 0.1, 80);
    camera.position.set(1, 10, 14);
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.target.set(0, 0.5, 0);
    controls.enableDamping = true;
    controls.minDistance = 8;
    controls.maxDistance = 24;
    controls.maxPolarAngle = Math.PI * 0.48;
    controls.update();
    controls.saveState();
    resetView.current = () => controls.reset();
    scene.add(new THREE.HemisphereLight(0xffffff, 0x61736a, 3));
    const light = new THREE.DirectionalLight(0xffffff, 3);
    light.position.set(2, 9, 7);
    scene.add(light);
    const board = componentModel({ asset: "esp32" });
    board.position.set(-4, 0, 0);
    board.userData.part = "board";
    scene.add(board);
    const resistor = componentModel({ asset: "resistor" });
    resistor.scale.setScalar(0.55);
    resistor.position.set(0, 0, -1.5);
    resistor.userData.part = "resistor";
    scene.add(resistor);
    const led = componentModel({ asset: "led" });
    led.scale.setScalar(0.55);
    led.position.set(3, 0, -1.5);
    led.userData.part = "led";
    scene.add(led);
    const output = new THREE.Group(),
      ground = new THREE.Group();
    scene.add(output, ground);
    function wire(parent: THREE.Group, points: number[][], colour: number) {
      const curve = new THREE.CatmullRomCurve3(
        points.map(
          (p) => new THREE.Vector3(...(p as [number, number, number])),
        ),
      );
      parent.add(
        new THREE.Mesh(
          new THREE.TubeGeometry(curve, 40, 0.045, 8, false),
          new THREE.MeshStandardMaterial({ color: colour }),
        ),
      );
    }
    // Detached conceptual endpoints deliberately do not claim a verified GPIO map.
    wire(
      output,
      [
        [-2.3, 0.6, -1.5],
        [-1.5, 0.8, -1.5],
        [-1.2, 0.3, -1.5],
      ],
      0xb55c3d,
    );
    wire(
      output,
      [
        [1.2, 0.3, -1.5],
        [2, 0.6, -1.5],
        [2.8, 0.2, -1.5],
      ],
      0xb55c3d,
    );
    wire(
      ground,
      [
        [3.2, 0.2, -1.5],
        [4.2, 0.5, 0],
        [3, 0.5, 2.5],
        [-1, 0.5, 2.5],
        [-2.3, 0.6, 1.5],
      ],
      0x405951,
    );
    const halo = new THREE.PointLight(0xff4d35, 0, 4);
    halo.position.set(3, 1.4, -1.5);
    scene.add(halo);
    const glow = new THREE.Mesh(
      new THREE.SphereGeometry(0.37, 20, 16),
      new THREE.MeshStandardMaterial({
        color: 0xe66455,
        emissive: 0xff2912,
        emissiveIntensity: 0,
      }),
    );
    glow.position.set(3, 1, -1.5);
    scene.add(glow);
    const observer = new ResizeObserver(() => {
      const { width, height } = container.getBoundingClientRect();
      renderer.setSize(Math.max(width, 1), Math.max(height, 1), false);
      camera.aspect = Math.max(width, 1) / Math.max(height, 1);
      camera.updateProjectionMatrix();
    });
    observer.observe(container);
    const ray = new THREE.Raycaster();
    const pointer = new THREE.Vector2();
    let down = { x: 0, y: 0 };
    const pointerDown = (e: PointerEvent) => {
      down = { x: e.clientX, y: e.clientY };
    };
    const pointerUp = (e: PointerEvent) => {
      if (Math.hypot(e.clientX - down.x, e.clientY - down.y) > 5) return;
      const rect = renderer.domElement.getBoundingClientRect();
      pointer.set(
        ((e.clientX - rect.left) / rect.width) * 2 - 1,
        (-(e.clientY - rect.top) / rect.height) * 2 + 1,
      );
      ray.setFromCamera(pointer, camera);
      let obj: THREE.Object3D | null =
        ray.intersectObjects([board, resistor, led], true)[0]?.object || null;
      while (obj && !obj.userData.part) obj = obj.parent;
      if (obj?.userData.part) select.current(obj.userData.part as LabPart);
    };
    const lost = (e: Event) => {
      e.preventDefault();
      setFailed(true);
      renderer.setAnimationLoop(null);
    };
    renderer.domElement.addEventListener("pointerdown", pointerDown);
    renderer.domElement.addEventListener("pointerup", pointerUp);
    renderer.domElement.addEventListener("webglcontextlost", lost);
    renderer.setAnimationLoop((time) => {
      const { stage, running } = state.current;
      output.visible = stage >= 1;
      ground.visible = stage >= 2;
      const lit = stage === 3 && running && Math.floor(time / 500) % 2 === 0;
      glow.material.emissiveIntensity = lit ? 2 : 0;
      halo.intensity = lit ? 4 : 0;
      controls.update();
      renderer.render(scene, camera);
    });
    return () => {
      observer.disconnect();
      renderer.setAnimationLoop(null);
      controls.dispose();
      renderer.domElement.removeEventListener("pointerdown", pointerDown);
      renderer.domElement.removeEventListener("pointerup", pointerUp);
      renderer.domElement.removeEventListener("webglcontextlost", lost);
      disposeModel(scene);
      renderer.dispose();
      renderer.forceContextLoss();
      renderer.domElement.remove();
      resetView.current = () => {};
    };
  }, []);
  return (
    <div className="lab-scene-wrap">
      <div className="lab-scene" ref={host} />
      {failed && (
        <div className="lab-scene-fallback" role="status">
          <h2>Use the circuit path below</h2>
          <p>
            3D is unavailable in this browser. You can still explore each part
            and follow the guided stages.
          </p>
        </div>
      )}
    </div>
  );
}
