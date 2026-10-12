# Relay 3D source audit — 12 October 2026

Repository: https://github.com/faith-ogun/Relay

Read-only source inspection through the GitHub connector. No provider calls, installations, or paid services were used. Current revision inspected: `e432291ea0dea02db71c030f569b1f7e0975aa8b`. Original revision inspected: `ab0eeddc870ff57eef445fdec99fe85b54c1596b`, dated 14 March 2026.

## Finding

The repository contains two distinct 3D implementations. The original competition code loads a predefined, editable circuit into a procedural Three.js sandbox. A later feature, added on 27 June 2026, sends a finished-build photograph to Stability AI to generate a GLB mesh. These should not be described as the same generation pipeline.

## Original March sandbox

- `components/RelayLab.tsx`, lines 3823–3834: the Library's “3D Twin” button selects `SANDBOX_PRESETS[item.title]` and opens the sandbox. Its tour text identifies the Light-Activated Alarm as the supported preset; other projects are marked Mock.
- `components/sandboxPresets.ts`, lines 42–65: fixed component IDs, types, breadboard rows/columns, wire endpoints, rotations, and Arduino code define the Light-Activated Alarm.
- `components/Sandbox.tsx`, lines 291–292: the preset becomes component state and editor code through `setComponents(preset.components)` and `setCode(preset.code)`.
- `components/SandboxScene.tsx`: React Three Fiber renders the scene. Breadboard and components are built from geometric primitives; wires use `CubicBezierCurve3` and `TubeGeometry`, around lines 538–546. Users can place components, move them, edit wire endpoints, and rotate the view.

This inspected path loads a known circuit layout. It does not recover the student's exact component locations or wiring from camera images.

Sources:

- [Original Library action](https://github.com/faith-ogun/Relay/blob/ab0eeddc870ff57eef445fdec99fe85b54c1596b/components/RelayLab.tsx#L3823)
- [Original preset data](https://github.com/faith-ogun/Relay/blob/ab0eeddc870ff57eef445fdec99fe85b54c1596b/components/sandboxPresets.ts#L42)
- [Original sandbox state](https://github.com/faith-ogun/Relay/blob/ab0eeddc870ff57eef445fdec99fe85b54c1596b/components/Sandbox.tsx#L291)
- [Original 3D rendering](https://github.com/faith-ogun/Relay/blob/ab0eeddc870ff57eef445fdec99fe85b54c1596b/components/SandboxScene.tsx#L538)

## Later photograph-to-mesh feature

1. `LiveTutorView.tsx` captures a still with `grabFrame(1024)` and opens `TwinStudio`.
2. `TwinStudio.tsx` calls `generateTwin(imageBase64, metadata)`.
3. `frontend/services/reporter.ts` posts to authenticated `POST /v1/twin`.
4. `backend/reporter/app/main.py` validates the request, checks plan allowance, and calls the configured generation provider.
5. `providers.py` implements a Stability AI adapter. Its default endpoint is `https://api.stability.ai/v2beta/3d/stable-fast-3d`. It sends the image and a default texture resolution of 1024, using a separate backend `STABILITY_API_KEY`.
6. The returned `.glb` is stored privately in Google Cloud Storage, with owner-scoped metadata in Firestore.
7. The frontend fetches the authenticated model endpoint and displays it using Drei `Gltf`, auto-framing, lights, and `OrbitControls`.

The implemented provider is Stability AI. Comments suggest interchangeable providers, but no Meshy or Tripo adapter was found in `get_provider()`. SPAR3D is mentioned as an endpoint alternative; the default inspected URL remains Stable Fast 3D. If no key is configured, generation is disabled and the service returns an unavailable response.

The mesh generation path does not call Gemini. The camera image and texture-resolution setting are submitted to the separate 3D provider; titles and session/build IDs remain application metadata. This produces a visual mesh; the inspected reporter does not produce or validate an electrical netlist.

Sources:

- [Feature added 27 June 2026](https://github.com/faith-ogun/Relay/commit/b2c4715a4352d6165b70dd4dee910027d9061e98)
- [Camera capture](https://github.com/faith-ogun/Relay/blob/e432291ea0dea02db71c030f569b1f7e0975aa8b/frontend/components/ohmlet/views/LiveTutorView.tsx#L164)
- [Generation UI](https://github.com/faith-ogun/Relay/blob/e432291ea0dea02db71c030f569b1f7e0975aa8b/frontend/components/ohmlet/twin/TwinStudio.tsx)
- [Frontend API client](https://github.com/faith-ogun/Relay/blob/e432291ea0dea02db71c030f569b1f7e0975aa8b/frontend/services/reporter.ts#L43)
- [Backend generation endpoint](https://github.com/faith-ogun/Relay/blob/e432291ea0dea02db71c030f569b1f7e0975aa8b/backend/reporter/app/main.py)
- [Actual model/provider adapter](https://github.com/faith-ogun/Relay/blob/e432291ea0dea02db71c030f569b1f7e0975aa8b/backend/reporter/app/providers.py#L57)
- [GLB viewer](https://github.com/faith-ogun/Relay/blob/e432291ea0dea02db71c030f569b1f7e0975aa8b/frontend/components/ohmlet/twin/TwinViewer.tsx)

## Cost and practical meaning for ShowOnce

The procedural renderer does not require a 3D-generation API. Building geometry and loading known scene data run in the browser. Extracting a new scene from an instructor demonstration would be an additional ShowOnce feature, requiring evidence-backed component/connection data and instructor review.

Stability AI currently lists Stable Fast 3D at 10 credits per successful generation and one credit at USD0.01, or USD0.10 per generated mesh. Approximately RM0.41 uses a planning exchange assumption of USD1 = RM4.10, excluding taxes and storage. Its pricing page advertises 25 initial free credits; if available and unused, that covers two such generations, not recurring unlimited generation. No account balance or eligibility was checked. Gemini's free quota does not pay for this separate provider.

Sources: [Stability pricing](https://platform.stability.ai/pricing), [Stable Fast 3D API](https://platform.stability.ai/docs/api-reference#tag/3D/paths/~1v2beta~13d~1stable-fast-3d/post).

For an ESP32 teaching MVP, a reviewed procedural diagram provides controllable parts and connections that can be highlighted by lesson step. A generated photo mesh can be attractive, but it should not be used as proof that small wire endpoints, pin labels, or hidden electrical connections are correct.

## Verification boundary

This audit establishes what the public code implements at two revisions. Relay's deployment, provider credentials, generated models, and actual physical-circuit accuracy were not independently tested. The new mesh-generation code is later than the original March version; it must not be attributed to the original competition demo without separate evidence.
