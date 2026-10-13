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
      // mm throughout; 0.1 scene unit/mm uniformly on x/y/z. Pin metadata uses
      // the identical grid in backend/app/components.py: x=±22.86/2*0.1,
      // z=(14/2-i)*2.54*0.1. Keep LEFT/RIGHT order; +z is the USB end.
      const SCENE_UNITS_PER_MM = 0.1;
      const MM = {
        pcbWidth: 27.9, // User target; not verified by Wokwi's differing drawing.
        pcbLength: 54, // User target; Wokwi drawing is ~53–54.053, not a CAD source.
        pcbThickness: 1.6, // User nominal target; board stack-up unverified.
        pinCountPerRow: 15, // Pinned Wokwi pinInfo (count, not a dimension).
        pinPitch: 2.54, // Wokwi boards/esp32-devkit-v1/board.json adjacent pin y.
        rowSpacing: 22.86, // User target; Wokwi board.json instead spans 25.53 mm.
        headerWidth: 2.54, // User nominal square position width.
        headerHeight: 8.5, // User nominal above-board height; unverified header part.
        headerPlasticInset: 0.2, // Assumed contact reveal; housing ends below metal to avoid coplanar faces.
        contactWidth: 0.64, // Assumed square contact; no header manufacturer specified.
        moduleWidth: 18, // Espressif ESP32-WROOM-32 datasheet v3.8, §9.
        moduleLength: 25.5, // Same source: entire module, NOT the metal shield alone.
        moduleHeight: 3.1, // Same source: entire module envelope height.
        antennaLength: 6, // Assumed antenna/shield partition; only the overall envelope is verified.
        modulePcbThickness: 0.8, // Same source §9 module PCB thickness.
        antennaOverhang: 1.5, // Assumed placement to meet requested overhang; unverified.
        antennaTraceWidth: 11, // Existing visual motif converted at 10 mm/scene unit; not RF geometry.
        antennaTraceThickness: 0.3, // Existing motif, unverified.
        antennaTraceDepth: 0.35, // Existing motif, unverified.
        antennaTracePitch: 1.5, // Existing motif, unverified.
        usbWidth: 9, // Existing 0.9 scene footprint ×10; connector type unverified.
        usbLength: 6, // Existing 0.6 scene footprint ×10; unverified.
        usbHeight: 3.8, // Existing 0.38 scene footprint ×10; unverified.
        usbZ: 24.5, // Existing +2.45 end/centre ×10; placement unverified.
        usbOpeningWidth: 6.3, // Existing detail ×10; unverified.
        usbOpeningHeight: 1.8, // Existing detail ×10; unverified.
        usbOpeningDepth: 0.4, // Existing detail ×10; unverified.
        usbOpeningZ: 27.6, // Existing +2.76 centre ×10; unverified.
        chipWidth: 4.2, // Existing CP2102-like footprint ×10; package unverified.
        chipLength: 4.5, // Existing footprint ×10; unverified.
        chipHeight: 1.5, // Existing footprint ×10; unverified.
        chipZ: 12.5, // Existing +1.25 centre ×10; unverified.
        buttonWidth: 6, // User approximate target; exact switch unverified.
        buttonHeight: 4.5, // User approximate target; exact switch unverified.
        buttonX: 5.8, // Assumed symmetric placement clear of USB/headers/holes; unverified.
        buttonZ: 18, // Assumed USB-end placement clear of CP2102; unverified.
        holeDiameter: 3.2, // User target; mounting-hole diameter unverified.
        holeX: 10.5, // Assumed centres, clear of rows and PCB edge; unverified.
        holeZ: 23.8, // Assumed centres; unverified.
        highlightRadius: 1.1, // Display annotation, inside a 2.54 mm header position.
        highlightTube: 0.15, // Display annotation, not physical copper geometry.
        labelOffset: 2, // Display annotation above header, not a board dimension.
        labelXMultiplier: 1.75, // Existing annotation offset (dimensionless).
        pinLabelWidth: 13, // Existing sprite width ×10; display annotation only.
        moduleLabelWidth: 14, // Existing sprite width ×10; display annotation only.
      };
      const unit = (mm: number) => mm * SCENE_UNITS_PER_MM;
      const mmBox = (
        w: number,
        h: number,
        d: number,
        x: number,
        y: number,
        z: number,
        mat: THREE.Material,
      ) => box(unit(w), unit(h), unit(d), unit(x), unit(y), unit(z), mat);
      const pcb: THREE.Mesh<THREE.BufferGeometry> = mmBox(
        MM.pcbWidth,
        MM.pcbThickness,
        MM.pcbLength,
        0,
        MM.pcbThickness / 2,
        0,
        material(0x237849),
      );
      // Actual through-holes, not dark cylinders drawn on an intact PCB.
      const outline = new THREE.Shape();
      outline.moveTo(unit(-MM.pcbWidth / 2), unit(-MM.pcbLength / 2));
      outline.lineTo(unit(MM.pcbWidth / 2), unit(-MM.pcbLength / 2));
      outline.lineTo(unit(MM.pcbWidth / 2), unit(MM.pcbLength / 2));
      outline.lineTo(unit(-MM.pcbWidth / 2), unit(MM.pcbLength / 2));
      outline.closePath();
      for (const x of [-MM.holeX, MM.holeX])
        for (const z of [-MM.holeZ, MM.holeZ]) {
          const hole = new THREE.Path();
          hole.absarc(
            unit(x),
            unit(z),
            unit(MM.holeDiameter / 2),
            0,
            Math.PI * 2,
            true,
          );
          outline.holes.push(hole);
        }
      pcb.geometry.dispose();
      pcb.geometry = new THREE.ExtrudeGeometry(outline, {
        depth: unit(MM.pcbThickness),
        bevelEnabled: false,
        curveSegments: 32,
      });
      pcb.geometry.rotateX(-Math.PI / 2);
      pcb.position.set(0, 0, 0); // PCB bottom y=0; top y=1.6 mm.
      pcb.name = "esp32-pcb";
      const moduleZ =
        -MM.pcbLength / 2 - MM.antennaOverhang + MM.moduleLength / 2;
      const shieldLength = MM.moduleLength - MM.antennaLength;
      const shield = mmBox(
        MM.moduleWidth,
        MM.moduleHeight,
        shieldLength,
        0,
        MM.pcbThickness + MM.moduleHeight / 2,
        moduleZ + MM.antennaLength / 2,
        metal,
      );
      shield.name = "esp32-shield";
      const antennaZ = moduleZ - shieldLength / 2;
      mmBox(
        MM.moduleWidth,
        MM.modulePcbThickness,
        MM.antennaLength,
        0,
        MM.pcbThickness + MM.modulePcbThickness / 2,
        antennaZ,
        black,
      );
      for (let i = 0; i < 4; i++)
        mmBox(
          MM.antennaTraceWidth,
          MM.antennaTraceThickness,
          MM.antennaTraceDepth,
          0,
          MM.pcbThickness +
            MM.modulePcbThickness +
            MM.antennaTraceThickness / 2,
          antennaZ + (i - 1.5) * MM.antennaTracePitch,
          gold,
        );
      mmBox(
        MM.usbWidth,
        MM.usbHeight,
        MM.usbLength,
        0,
        MM.pcbThickness + MM.usbHeight / 2,
        MM.usbZ,
        metal,
      );
      mmBox(
        MM.usbOpeningWidth,
        MM.usbOpeningHeight,
        MM.usbOpeningDepth,
        0,
        MM.pcbThickness + MM.usbHeight / 2,
        MM.usbOpeningZ,
        black,
      );
      mmBox(
        MM.chipWidth,
        MM.chipHeight,
        MM.chipLength,
        0,
        MM.pcbThickness + MM.chipHeight / 2,
        MM.chipZ,
        black,
      );
      for (const x of [-MM.buttonX, MM.buttonX])
        mmBox(
          MM.buttonWidth,
          MM.buttonHeight,
          MM.buttonWidth,
          x,
          MM.pcbThickness + MM.buttonHeight / 2,
          MM.buttonZ,
          black,
        );
      const headerTop = MM.pcbThickness + MM.headerHeight;
      const housingHeight = MM.headerHeight - MM.headerPlasticInset;
      for (const x of [-MM.rowSpacing / 2, MM.rowSpacing / 2])
        mmBox(
          MM.headerWidth,
          housingHeight,
          MM.pinCountPerRow * MM.pinPitch,
          x,
          MM.pcbThickness + housingHeight / 2,
          0,
          black,
        );
      // Contacts exist even for a generic preview; pin identity/labels still
      // require a confirmed supported variant supplied by ComponentPanel.
      for (const x of [-MM.rowSpacing / 2, MM.rowSpacing / 2])
        for (let i = 0; i < MM.pinCountPerRow; i++) {
          const z = ((MM.pinCountPerRow - 1) / 2 - i) * MM.pinPitch;
          const pin = variant?.pins.find(
            (p) =>
              Math.abs(p.x - unit(x)) < 1e-9 && Math.abs(p.z - unit(z)) < 1e-9,
          );
          const highlighted = !!pin && pin.id === pinId;
          const contact = mmBox(
            MM.contactWidth,
            MM.headerHeight,
            MM.contactWidth,
            x,
            MM.pcbThickness + MM.headerHeight / 2,
            z,
            highlighted ? material(0x65ffca) : gold,
          );
          contact.name = `esp32-contact-${x < 0 ? "left" : "right"}-${i}`;
          if (highlighted) {
            const ring = new THREE.Mesh(
              new THREE.TorusGeometry(
                unit(MM.highlightRadius),
                unit(MM.highlightTube),
                8,
                32,
              ),
              material(0x65ffca),
            );
            ring.rotation.x = -Math.PI / 2;
            ring.position.set(
              unit(x),
              unit(headerTop - MM.headerPlasticInset),
              unit(z),
            );
            ring.name = "esp32-highlight";
            group.add(ring);
            label(
              pin!.label,
              unit(x * MM.labelXMultiplier),
              unit(headerTop + MM.labelOffset),
              unit(z),
              "#65ffca",
              unit(MM.pinLabelWidth),
            );
          }
        }
      label(
        variant ? "DevKit V1" : "ESP32 · generic",
        0,
        unit(MM.pcbThickness + MM.moduleHeight + MM.labelOffset),
        moduleZ * SCENE_UNITS_PER_MM,
        "#ecf5f7",
        unit(MM.moduleLabelWidth),
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
  const textures = new Set<THREE.Texture>();
  materials.forEach((m) => {
    for (const value of Object.values(m))
      if (value instanceof THREE.Texture) textures.add(value);
    m.dispose();
  });
  textures.forEach((texture) => {
    texture.dispose();
    // GLTFLoader may use ImageBitmap for PBR maps; release decoded images too.
    const image = texture.image as { close?: () => void } | undefined;
    image?.close?.();
  });
}
