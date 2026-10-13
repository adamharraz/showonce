# Component references — 13 October 2026

**Historical workflow:** the main 3D interface was subsequently replaced with the Modal photo-to-3D flow documented in `PHOTO_TO_3D.md`. The original catalogue source and owner-only metadata endpoints remain for historical records; this page describes the earlier interface.

Open `/coach`. Before starting, browse the ESP32, breadboard, LED, axial resistor and jumper-wire reference models. Rotate/zoom with the mouse or touch. Model rendering runs locally in the browser with Three.js; it requires no GPU hosting, mesh-generation API or additional cash spending.

During a live session, show the components clearly and choose **Identify visible parts**. One current snapshot is attached to an ordered turn on the existing `gemini-3.8-live` connection. The model selects supported catalogue IDs through `show_components`. The server validates the IDs, evidence source, requested frame ID, freshness and scene revision before replacing the inventory. Unsupported objects can use an explicit unknown placeholder. The model can ask clarification questions; it cannot confirm an exact board variant or mark lesson checkpoints passed.

Realtime image preprocessing can lag behind text. The first real test sent those inputs separately and the model replied that no snapshot was available. The implementation now binds image and request in one ordered turn. Audio/video forwarding is held during that inspection turn; the browser still shows a live camera preview. Microphone sharing resumes after the reply completes. Inspect when the assistant is idle. This keeps the snapshot and question together, using the same Live model without a second model or connection.

Use **Correct or confirm this part** to correct the family, confirm a supported exact board variant, supply a checked value/label and record how it was established. Corrections are owner-only and reject stale revisions. User-confirmed values retain their provenance. Blank values stay unknown. A new camera inspection replaces the inventory and requires new confirmation.

Only the explicitly confirmed **ESP32 DevKit V1 30-pin** variant exposes its reference pin selector. Choose a pin to highlight it on the model. ESP32/WROOM family recognition alone does not reveal a pinout. Other boards remain generic. Pin metadata comes from the pinned Wokwi Elements source linked in the interface; see `THIRD_PARTY_NOTICES.md` for the MIT notice. All five meshes are original procedural reference assets, not downloaded/generated meshes.

Models are illustrative: their colour, dimensions, lead lengths, hole count, wire curve and pose do not measure the real object. The panel does not reconstruct a circuit, simulate electricity, verify continuity or infer hidden endpoints. Required assembly instructions and checkpoints still come from the instructor's demonstrated/reviewed lesson; the catalogue contains no target circuit checklist.

The component inventory is saved privately with the conversation for seven days. Snapshot pixels stay in memory, so historical frame IDs/timestamps are metadata rather than retained image evidence. Opening saved references or browsing models makes no Gemini request. An explicit inspection consumes Live quota; the free-tier account guard, ten-minute session limit, 40-reply cap and daily application guard remain. The removed 200,000-token cap does not apply. There is no paid fallback.

## Validation

Automated tests cover invalid catalogue IDs, prohibited model variant confirmation, stale frame references, absent camera evidence, unreadable values, owner-only corrections, stale edit rejection, saved history and no changes to formal checkpoint assessments. Browser tests use a synthetic camera and explicitly isolated model fixture to check reference rendering, manual variant confirmation, pin highlighting, pause/resume, history and desktop/mobile layout. WebGL failure keeps text metadata available.

One real `gemini-3.8-live` test used an unlabelled synthetic drawing of an LED and axial component. The corrected transport produced a valid tool call in about **2.42 seconds**, selected LED plus an uncertain resistor, left values unknown and requested a clearer resistor view. One completed reply reported **2,100 tokens**. These are individual synthetic integration results, not a physical recognition accuracy or end-to-end latency benchmark. The initial failed attempt reported 1,844 tokens. Both tests used the owner's existing confirmed Free-tier project; billing and paid fallbacks were not enabled.

Actual ESP32/breadboard photos, different board variants, occlusions, component counts and physical teaching accuracy still require labelled validation. No TRL4 claim follows from these tests.

Ignored local reports: `artifacts/components/real-gate-report.json` and `artifacts/ui/live-coach-fixture-report.json`. Screenshots and test inputs remain local; they are not committed as user data.
