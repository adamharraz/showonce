import { afterEach, expect, it, vi } from "vitest";
import * as THREE from "three";
import { readFileSync } from "node:fs";
import { componentModel, disposeModel } from "./component-models";
import type { CatalogPart, PartVariant } from "./components-api";

afterEach(() => vi.unstubAllGlobals());
it("renders the nominal ESP32 grid in mm and keeps backend coordinates aligned", () => {
  vi.stubGlobal("document", {
    createElement: () => ({
      width: 0,
      height: 0,
      getContext: () => ({ fillRect() {}, fillText() {} }),
    }),
  });
  const backend = readFileSync(
    new URL("../../backend/app/components.py", import.meta.url),
    "utf8",
  );
  const scalar = (name: string) =>
    Number(backend.match(new RegExp(`${name} = ([\\d.]+)`))![1]);
  const scale = scalar("DEVKIT_SCENE_UNITS_PER_MM");
  const pitch = scalar("DEVKIT_PIN_PITCH_MM");
  const spacing = scalar("DEVKIT_ROW_SPACING_MM");
  const count = scalar("DEVKIT_PINS_PER_ROW");
  expect([scale, pitch, spacing, count]).toEqual([0.1, 2.54, 22.86, 15]);
  const pins = [-spacing / 2, spacing / 2].flatMap((x, side) =>
    Array.from({ length: count }, (_, i) => ({
      id: `${side}-${i}`,
      label: `Pin ${i}`,
      x: x * scale,
      z: ((count - 1) / 2 - i) * pitch * scale,
    })),
  );
  const part = { asset: "esp32" } as CatalogPart;
  const variant = { id: "devkit-v1-30", pins } as PartVariant;
  const model = componentModel(part, variant, pins[0].id);
  const contacts = model.children.filter((o) =>
    o.name.startsWith("esp32-contact"),
  ) as THREE.Mesh[];
  expect(contacts).toHaveLength(30);
  contacts.forEach((contact, i) => {
    expect(contact.position.x).toBeCloseTo(pins[i].x, 12);
    expect(contact.position.z).toBeCloseTo(pins[i].z, 12);
    contact.geometry.computeBoundingBox();
    const bounds = contact.geometry.boundingBox!;
    expect(bounds.min.y + contact.position.y).toBeCloseTo(1.6 * scale, 6);
    expect(bounds.max.y + contact.position.y).toBeCloseTo(
      (1.6 + 8.5) * scale,
      6,
    );
  });
  const pcb = model.getObjectByName("esp32-pcb") as THREE.Mesh;
  pcb.geometry.computeBoundingBox();
  const size = pcb.geometry.boundingBox!.getSize(new THREE.Vector3());
  expect(size.x).toBeCloseTo(27.9 * scale, 6);
  expect(size.y).toBeCloseTo(1.6 * scale, 6);
  expect(size.z).toBeCloseTo(54 * scale, 6);
  // A ray through a nominal mounting-hole centre must not hit the PCB.
  const ray = new THREE.Raycaster(
    new THREE.Vector3(10.5 * scale, 2, 23.8 * scale),
    new THREE.Vector3(0, -1, 0),
  );
  pcb.updateMatrixWorld();
  expect(ray.intersectObject(pcb)).toHaveLength(0);
  const marker = model.getObjectByName("esp32-highlight")!;
  expect(marker.position.x).toBe(pins[0].x);
  expect(marker.position.z).toBe(pins[0].z);
  expect(marker.position.y).toBeCloseTo((1.6 + 8.5 - 0.2) * scale, 12);
  disposeModel(model);
  const generic = componentModel(part);
  expect(
    generic.children.filter((o) => o.name.startsWith("esp32-contact")),
  ).toHaveLength(30);
  expect(generic.getObjectByName("esp32-highlight")).toBeUndefined();
  expect(
    generic.children.filter((o) => o instanceof THREE.Sprite),
  ).toHaveLength(1);
  disposeModel(generic);
});
