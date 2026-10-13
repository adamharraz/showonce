import * as THREE from "three";

// ESP32 Wroom by TER1Z, CC BY 4.0. See docs/THIRD_PARTY_NOTICES.md.
// The supplied mesh has 19 contacts per side. It is NOT the supported 30-pin variant.
export function prepareImportedEsp32(source: THREE.Group) {
  const model = new THREE.Group();
  model.name = "esp32-imported-38pin";
  model.add(source);
  // Hide the imported silk-screen/text meshes: a generic preview must not expose
  // assumed pin labels. These names are specific to the bundled, unchanged USDZ.
  for (const name of ["Object_1", "Object_3", "Object_6", "Object_16"]) {
    const text = source.getObjectByName(name);
    if (text) text.visible = false;
  }
  // Native geometry uses metres (25.5 mm WROOM module spans 0.0255).
  // One uniform scale: metres -> mm -> the viewer's 0.1 scene unit/mm.
  source.scale.multiplyScalar(1000 * 0.1);
  source.rotation.y += Math.PI / 2; // USB at +z, antenna at -z.
  model.updateMatrixWorld(true);
  const bounds = new THREE.Box3().setFromObject(model);
  const center = bounds.getCenter(new THREE.Vector3());
  // Preserve mesh proportions, remove the export's large y offset; bottom y=0.
  source.position.sub(new THREE.Vector3(center.x, bounds.min.y, center.z));
  model.updateMatrixWorld(true);
  model.userData.source = "TER1Z / Sketchfab / CC BY 4.0";
  return model;
}
