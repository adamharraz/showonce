# ShowOnce Electronics lab

## Learning flow

The Arduino course is a supplemental reference inside ShowOnce's normal workspace, not a separate learning platform or evidence of completing a real build.

- Open Electronics lab from navigation, or use `Explore in 3D` on an electronics-related published lesson.
- Select one of the 16 reference topics. Topic changes inside the course and in ShowOnce's selector synchronize without reloading the frame. Selections made during loading are retained.
- Choose a real published ShowOnce lesson as context, then return to it for guided practice and actual-work feedback. Instructors also get `Teach this task`.
- `Circuit basics` provides ShowOnce's original conceptual LED reference. It is not an electrical simulator or a physical pin map.

The reference uses Arduino Uno. A suggested topic does not establish compatibility with an ESP32 or with an instructor's approved wiring. No reference interaction approves a ShowOnce checkpoint or becomes learner evidence.

## Source and adaptation

The uploaded archive SHA-256 is `70d6de0ef714def3b43c8c4bddddc3285831bc3df2f98a5178fd4ecbfabc881d`. All 70 original files match their supplied manifest. They remain unmodified in `frontend/vendor/learn-arduino`.

This is the compiled public deployment captured 23 October 2026, including 16 lesson definitions and 12 language pages. It is not the author's original development repository. No project-wide reuse licence was included; uploading the snapshot does not establish distribution permission. Author credits and bundled notices are retained, and About identifies Dilum Sanjaya and the original site.

`frontend/scripts/prepare-arduino.mjs` verifies the source, scopes paths under `/arduino-reference/`, disables the renderer's floor-credit option, and moves visible designer credit to the host About section. It then bundles scripts and fonts into self-contained HTML pages so opaque-origin previews do not need separate module requests. Generated public files are ignored in Git and rebuilt by frontend prebuild/predev scripts. This includes the normal Docker frontend build.

## Isolation and consent

The iframe permits scripts but not same-origin access, popups, camera or microphone. CSP blocks connections and form submission. The reference receives no tokens, media or assessment data. Its narrow message protocol accepts only allowlisted topic IDs and boolean readiness/WebGL state; messages must come from the exact frame with its opaque origin. Reference progress does not persist when the isolated frame reloads.

Browsing references or saved lessons does not capture media, so it no longer asks for media-processing consent. The consent gate still precedes Teach, Practice and Live Coach, alongside the capture controls' existing consent requirements.

## Running the actual app

Build with `npm run build --prefix frontend`, then run the usual FastAPI command or root `npm run dev`. The root preview launcher starts the real FastAPI backend and serves the built React app. It selects `SHOWONCE_PYTHON`, a managed `.preview-runtime`, a local `.venv`, or installed Python.

The current managed preview host supports Node but has no Python installation. An ignored local dependency contains the provided standalone CPython runtime and pinned backend packages. `scripts/prepare-preview-runtime.py` records its preparation. It is not committed or included in source patches.

The preview uses the existing anonymous demo-role sign-in, with separate `.data-preview` storage and developer sign-in disabled. It does not seed fake lessons or return fabricated AI results. AI requires a configured key and free-tier guard; it is currently offline. WebGL is disabled in the current cloud browser, so the reference displays its real text-only fallback. No 3D simulation accuracy claim is made.

## Verification

- Production build and inline module syntax validation passed.
- 15 frontend tests passed, including rejection of malformed/unrecognized reference messages.
- 107 backend tests passed, including ownership, publication, and reference response policies.
- Browser checks used the actual backend: learner demo-role sign-in, real library navigation, embedded 16-topic course, topic selection during loading, two-way topic synchronization and capture-consent gating.
- The frame retained `sandbox="allow-scripts"`; browser verification confirmed it could not read the parent document.

These checks do not establish real-task AI accuracy or validate WebGL simulation in this cloud browser. The optional `scripts/browser-lab.cjs` uses test-only API fixtures and requires a WebGL-capable browser; it is separate from the actual preview described above.
