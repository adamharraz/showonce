import { expect, it } from "vitest";
import * as THREE from "three";
import { readFileSync } from "node:fs";
import { USDLoader } from "three/addons/loaders/USDLoader.js";
import { prepareImportedEsp32 } from "./imported-esp32";
import { disposeModel } from "./component-models";

it("parses the actual supplied USDZ and preserves its proportions without 30-pin overlays", () => {
  const bytes = readFileSync(
    new URL("./assets/models/ESP32_Wroom.usdz", import.meta.url),
  );
  const source = new USDLoader().parse(
    bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
  );
  const native = new THREE.Box3()
    .setFromObject(source)
    .getSize(new THREE.Vector3());
  const model = prepareImportedEsp32(source);
  const bounds = new THREE.Box3().setFromObject(model);
  const size = bounds.getSize(new THREE.Vector3());
  expect(bounds.min.y).toBeCloseTo(0, 8);
  expect(bounds.getCenter(new THREE.Vector3()).x).toBeCloseTo(0, 8);
  expect(bounds.getCenter(new THREE.Vector3()).z).toBeCloseTo(0, 8);
  expect(size.x).toBeCloseTo(native.z * 100, 6);
  expect(size.z).toBeCloseTo(native.x * 100, 6);
  expect(size.y).toBeCloseTo(native.y * 100, 6);
  expect(source.getObjectByName("Object_16")!.visible).toBe(false);
  expect(model.getObjectByName("esp32-highlight")).toBeUndefined();
  expect(model.name).toBe("esp32-imported-38pin");
  disposeModel(model);
});
