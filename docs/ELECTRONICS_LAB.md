# Electronics lab

`/lab/electronics` now offers two reference views:

- **Arduino course:** the user-supplied compiled Learn Arduino deployment, with its 16 lesson entries, procedural 3D scenes, component panels and preset simulator UI.
- **Circuit basics:** ShowOnce's original conceptual LED module using its original procedural ESP32, resistor and LED models. It is an illustration, not an electrical/firmware simulator or a physical pin map.

Published electronics-related lessons offer `Explore in 3D`. The lab returns to that lesson. These reference activities never approve ShowOnce checkpoints or become learner evidence. Arduino Uno references must not be treated as an ESP32 pin/layout guide.

## Snapshot provenance and adaptation

The uploaded archive SHA-256 is `70d6de0ef714def3b43c8c4bddddc3285831bc3df2f98a5178fd4ecbfabc881d`.
All 70 files match the supplied manifest sizes and SHA-256 hashes. Originals are preserved under `frontend/vendor/learn-arduino`; original attribution and bundled notices remain there. The snapshot is a compiled public deployment captured 23 October 2026, not the development repository. It contains no project-wide reuse licence, and its upload does not establish distribution rights.

`frontend/scripts/prepare-arduino.mjs` verifies originals and generates the adapted `/arduino-reference/` files during `npm run dev` and `npm run build`. Generated files are ignored in Git. The existing Docker frontend stage copies the vendor files and script with the frontend directory, so the same build path applies there.

Changes to the runtime copy:

- Root-relative assets and language navigation are scoped under `/arduino-reference/`.
- Sidebar credits are visually hidden and the renderer's `floorCredit` option is disabled. The author and source are credited in the accessible host **About this reference** section. No author ownership claim is made by ShowOnce.
- A readiness-only message lets ShowOnce stop displaying its loading indicator.
- The actual Arduino scenes/lesson text/preset simulator logic remain supplied third-party code; they have not been rewritten as ShowOnce's own AI functionality.

## Isolation

The iframe permits scripts but not same-origin access, popups, camera or microphone. FastAPI and Vite serve the reference modules with anonymous CORS, while the reference document's CSP blocks network connections and form submission and also enforces the sandbox. No tokens, media, assessments or progress are passed into the frame. Its own original local-storage calls fail safely in the opaque origin, so progress does not survive reloading the reference. This limitation is visible in the interface.

## Verification

The production build and frontend tests passed. Browser fixtures exercise the real static reference but replace ShowOnce API responses; they do not establish AI or physical circuit accuracy. Checks cover lesson-to-lab navigation, all 16 lesson entries appearing, sample blink run/stop, pinout, reset, desktop/mobile layout, denial of parent-document/session-token access, the original Circuit basics interactions, return navigation and WebGL fallback. Backend tests cover reference response policies and missing assets.

Run the production app or Vite, then `BASE_URL=http://127.0.0.1:8000 PLAYWRIGHT_MODULE=/path/to/playwright CHROME_PATH=/path/to/chrome node scripts/browser-lab.cjs`. Screenshots go to ignored `artifacts/ui`.

No hosting/deployment or validated electrical simulation claim is made. Do not represent the third-party course as AI-generated lessons or as evidence that learner assessment works.
