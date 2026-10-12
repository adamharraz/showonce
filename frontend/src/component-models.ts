import * as THREE from "three";
import type { CatalogPart, PartVariant } from "./components-api";

// Original procedural assets. Dimensions and colours are illustrative references.
// No topology, physical pose, resistance or connected endpoints are inferred here.
export function componentModel(
  part: CatalogPart,
  variant?: PartVariant,
  pinId?: string | null,
) {
  const group = new THREE.Group();
  const material = (colour: number, metalness = 0) =>
    new THREE.MeshStandardMaterial({
      color: colour,
      roughness: 0.48,
      metalness,
    });
  const metal = material(0xc1c9d1, 0.75),
    black = material(0x20292d),
    gold = material(0xdcb968, 0.65);
  function box(
    w: number,
    h: number,
    d: number,
    x: number,
    y: number,
    z: number,
    mat: THREE.Material,
  ) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
    mesh.position.set(x, y, z);
    group.add(mesh);
    return mesh;
  }
  function cylinder(
    radius: number,
    length: number,
    x: number,
    y: number,
    z: number,
    mat: THREE.Material,
    horizontal = false,
  ) {
    const mesh = new THREE.Mesh(
      new THREE.CylinderGeometry(radius, radius, length, 20),
      mat,
    );
    if (horizontal) mesh.rotation.z = Math.PI / 2;
    mesh.position.set(x, y, z);
    group.add(mesh);
    return mesh;
  }
  function label(
    text: string,
    x: number,
    y: number,
    z: number,
    colour = "#e2e8f0",
    scale = 1,
  ) {
    const canvas = document.createElement("canvas");
    canvas.width = 256;
    canvas.height = 64;
    const ctx = canvas.getContext("2d")!;
    ctx.fillStyle = "#18252e";
    ctx.fillRect(0, 0, 256, 64);
    ctx.font = "bold 32px sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillStyle = colour;
    ctx.fillText(text, 128, 32);
    const texture = new THREE.CanvasTexture(canvas);
    const sprite = new THREE.Sprite(
      new THREE.SpriteMaterial({ map: texture, depthTest: false }),
    );
    sprite.scale.set(scale, 0.25 * scale, 1);
    sprite.position.set(x, y, z);
    group.add(sprite);
  }
  switch (part.asset) {
    case "esp32": {
      box(2.6, 0.14, 5.5, 0, 0.12, 0, material(0x125351));
      box(1.7, 0.35, 2.4, 0, 0.38, -0.8, metal);
      box(1.6, 0.08, 0.85, 0, 0.24, -2.35, black);
      for (let i = 0; i < 4; i++)
        box(1.1, 0.03, 0.035, 0, 0.3, -2.62 + i * 0.15, gold);
      box(0.9, 0.38, 0.6, 0, 0.36, 2.45, metal);
      box(0.63, 0.18, 0.04, 0, 0.37, 2.76, black);
      box(0.42, 0.15, 0.45, 0, 0.29, 1.25, black);
      for (const x of [-1.05, 1.05]) box(0.3, 0.3, 4.5, x, 0.3, 0, black);
      if (variant)
        for (const pin of variant.pins) {
          const highlighted = pin.id === pinId;
          box(
            0.12,
            0.18,
            0.12,
            pin.x,
            0.5,
            pin.z,
            highlighted ? material(0x65ffca) : gold,
          );
          if (highlighted) {
            const ring = new THREE.Mesh(
              new THREE.TorusGeometry(0.21, 0.03, 8, 32),
              material(0x65ffca),
            );
            ring.rotation.x = -Math.PI / 2;
            ring.position.set(pin.x, 0.62, pin.z);
            group.add(ring);
            label(pin.label, pin.x * 1.75, 0.95, pin.z, "#65ffca", 1.3);
          }
        }
      label(
        variant ? "DevKit V1" : "ESP32 · generic",
        0,
        0.63,
        -0.8,
        "#ecf5f7",
        1.4,
      );
      break;
    }
    case "breadboard": {
      box(3.8, 0.35, 6.7, 0, 0.2, 0, material(0xe4e5df));
      box(0.26, 0.04, 6.45, 0, 0.39, 0, material(0x6f8283));
      const holes = new THREE.InstancedMesh(
        new THREE.BoxGeometry(0.08, 0.012, 0.08),
        black,
        310,
      );
      const matrix = new THREE.Matrix4();
      let index = 0;
      for (let row = 0; row < 31; row++)
        for (let col = 0; col < 10; col++) {
          const x = col < 5 ? -1.2 + col * 0.2 : 0.4 + (col - 5) * 0.2;
          matrix.makeTranslation(x, 0.384, -3 + row * 0.2);
          holes.setMatrixAt(index++, matrix);
        }
      group.add(holes);
      for (const x of [-1.6, 1.6]) {
        box(0.025, 0.025, 6.1, x, 0.4, 0, material(0xc65e63));
        box(0.025, 0.025, 6.1, x + 0.15, 0.4, 0, material(0x528bb8));
      }
      break;
    }
    case "led": {
      cylinder(0.55, 0.9, 0, 1.35, 0, material(0xea6467));
      const dome = new THREE.Mesh(
        new THREE.SphereGeometry(0.55, 24, 16, 0, Math.PI * 2, 0, Math.PI / 2),
        material(0xea6467),
      );
      dome.position.set(0, 1.8, 0);
      group.add(dome);
      cylinder(0.62, 0.12, 0, 0.88, 0, material(0xd9515c));
      for (const x of [-0.23, 0.23]) cylinder(0.045, 0.9, x, 0.38, 0, metal);
      group.scale.setScalar(1.5);
      break;
    }
    case "resistor": {
      cylinder(0.4, 1.8, 0, 0.55, 0, material(0xd7c9a7), true);
      for (const x of [-1.55, 1.55])
        cylinder(0.04, 1.3, x, 0.55, 0, metal, true);
      // Unknown resistance deliberately has no invented colour bands.
      label("Axial resistor", 0, 1.3, 0, "#f8e6be", 2);
      break;
    }
    case "wire": {
      const curve = new THREE.CubicBezierCurve3(
        new THREE.Vector3(-2, 0.35, 1.2),
        new THREE.Vector3(-1, 1.5, -1.8),
        new THREE.Vector3(1, 1.2, 1.5),
        new THREE.Vector3(2, 0.35, -1.2),
      );
      group.add(
        new THREE.Mesh(
          new THREE.TubeGeometry(curve, 40, 0.07, 10, false),
          material(0x6dc0ae),
        ),
      );
      for (const [x, z] of [
        [-2, 1.2],
        [2, -1.2],
      ]) {
        box(0.22, 0.22, 0.5, x, 0.35, z, black);
        cylinder(0.035, 0.4, x, 0.04, z, metal);
      }
      break;
    }
    default: {
      box(1.8, 1.8, 1.8, 0, 1, 0, material(0x536675));
      label("?", 0, 2.2, 0, "#ffffff", 1.5);
    }
  }
  group.traverse((object) => {
    if (object instanceof THREE.Mesh) object.castShadow = true;
  });
  return group;
}

export function disposeModel(root: THREE.Object3D) {
  const materials = new Set<THREE.Material>();
  const geometries = new Set<THREE.BufferGeometry>();
  root.traverse((object) => {
    if (object instanceof THREE.Mesh) geometries.add(object.geometry);
    if (object instanceof THREE.Mesh || object instanceof THREE.Sprite)
      (Array.isArray(object.material)
        ? object.material
        : [object.material]
      ).forEach((m) => materials.add(m));
  });
  geometries.forEach((g) => g.dispose());
  materials.forEach((m) => {
    if ("map" in m && m.map instanceof THREE.Texture) m.map.dispose();
    m.dispose();
  });
}
