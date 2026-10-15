# ShowOnce

One live demonstration becomes a reviewed, reusable lesson. Students then practice against its approved visible checkpoints.

## Current delivery

Local demo: **http://localhost:8000**. The Render service is suspended and automatic deployment is off at the owner's request. The hosted configuration supports public instructor/student role selection and temporary local storage, with no demo access code. The redesigned interface, lesson previews/filters, entry consent and attributed ESP32 reference are merged into `main`. Export anything you need before a free hosted service sleeps, restarts or redeploys. No Supabase project is required for this demo.

14 October lesson workflow fix: **Finish & review stops recording immediately**, freezes its duration and releases the laptop camera/microphone. Final window analysis and tutorial generation continue separately; the paired phone stops when the server acknowledges capture ending. Refreshing the session or retrying finalization preserves its original end time. The observation → ledger → tutorial → instructor review workflow now uses the requested Gemini 3.1 Flash-Lite exclusively. If a live request fails before producing observations, finalization can recover the session's saved, unprocessed screenshots in windows of up to ten images. Failed recovery leaves images available for another explicit retry. Audio is not persisted, so capture gaps and missing narration still require instructor confirmation. Provider overload can still delay or fail a request; there are no model substitutions or hidden SDK retries.

Latest 13 October update: the main 3D workflow uses **Gemini 3.8 Live recognition → prepared component references → user confirmation**. ESP32, breadboard, LED, resistor and wire models render locally in the browser. Browsing requires no AI request or GPU generation; an explicit camera inspection uses the existing Live connection. Exact pin labels require confirmation of the supported ESP32 DevKit V1 30-pin variant; other boards remain generic. See [component library and validation](docs/COMPONENT_LIBRARY.md). Live microphone backlog is paced, and delivery bursts report a gap instead of closing the session.

Earlier 13 October implementation: Stable Fast 3D was deployed on Modal and passed an official chair-sample generation test, but a subsequent real ESP32 photo produced hands/people while omitting the board. It has been replaced in the main interface by the component catalogue, and local mesh generation is disabled. Its original source and private saved outputs remain available for historical records; [photo-to-3D notes](docs/PHOTO_TO_3D.md) describe that experiment. The 200,000-token coaching cap remains removed; usage is still logged.

Implemented: React/TypeScript capture and review app, FastAPI backend, webcam/screen/phone capture, temporary narration, windowed Gemini 3.1 Flash-Lite analysis, live camera/voice coaching with a side-by-side assistant, persistent observation ledger, clarification and editing, immutable published versions, practice feedback guards, private evidence, exports, failure recovery, free-tier controls, deployment configuration and evaluation tools.

**Historical: real ER2 streaming, standard ER2 and Gemini 3.5 Flash-Lite requests passed the local access gate on 8 October 2026.** A real Flash Lite pipeline extracted a tutorial from synthetic before/after screenshots and identified a missing circle in a synthetic student image. This verifies API integration, not ESP32/Sheets accuracy, narration, real-device capture or TRL4. Actual account quotas and beginner pilots remain unverified. The app never substitutes canned responses for live AI; fake model results exist only in tests.

The local app works without cloud credentials. This workspace has a private Gemini key and its Free-tier guard enabled following the owner's confirmation that paid billing is absent. Clones need their own key and Free-tier confirmation. The latest 12 October request adds an explicit Live Coach using `gemini-3.8-live` for real-time camera/voice conversation. Existing lesson processing stays pinned to `gemini-3.1-flash-lite`. Both identifiers are fixed, and no model fallback is enabled. Earlier ER2 access-gate results above are historical. See `docs/LIVE_COACH.md` for live setup, cost assumptions, limits and validation.

## Run locally on Windows

Use Python 3.12+ and Node 24. The deployment image pins Python 3.12. Commands run from the project root:

```powershell
python -m venv .venv
python -m pip --python .venv install -r backend/requirements-lock.txt
npm ci --prefix frontend
npm run build --prefix frontend
Copy-Item backend/.env.example backend/.env
powershell -ExecutionPolicy Bypass -File scripts/start.ps1
```

Open <http://localhost:8000>. Local instructor/student sign-in is enabled only on the developer computer. Local lessons and screenshots persist in `.data`; this is the durable local backup. Do not use local sign-in on a hosted deployment.

After installing and building, double-click `Start ShowOnce.cmd` to launch the local app in the background and open your browser. `Stop ShowOnce.cmd` stops that launcher-managed server and preserves saved lessons. The launcher uses port 8000, detects an existing managed instance, and keeps logs under `.data/logs`. It refuses to replace another application using that port.

For frontend development, run the backend and `npm run dev --prefix frontend` in separate terminals. Vite proxies `/api`, including WebSockets, to port 8000. The production build is served by FastAPI on one origin.

Dependencies are already installed in this workspace. Its host Python is 3.13; automated checks have run on that host. The Python 3.12 Docker image still needs a build and integration check on the deployment host.

## Enable real AI, spending RM0

1. Create/use a **Free-tier** Google AI Studio project. Check its billing state and actual model quotas in the dashboard. Do not attach paid billing or enable upgrades.
2. Put `GEMINI_API_KEY` in `backend/.env`, never the frontend or chat. Apply the Gemini API key restrictions required by AI Studio. Set `FREE_TIER_CONFIRMED=true` only after checking the account. This flag is a manual budget guard; the application cannot inspect Google's billing state.
3. Run `.\.venv\Scripts\python.exe scripts\probe_models.py`. It performs one small real Flash-Lite request and saves access, errors, usage and latency. It does not verify daily quotas. API calls share the application's persistent daily call guard.
4. Run one narrated five-minute session in the app. Export its evidence before publication discards unselected frames. Check lost narration, readability, ordering, updates, context and quota use against `docs/VALIDATION.md`.
5. If Flash-Lite fails the gate, preserve the captured evidence and report the failure. Resolve quota, capacity or accuracy issues with this same model; do not substitute another endpoint. Retry explicitly when the service becomes available. Quota exhaustion stops calls.

Fixed model responsibilities:

| Operation | Model |
|---|---|
| Camera, phone and screen instructor observation | `gemini-3.1-flash-lite` |
| Whole-recording final tutorial | `gemini-3.8-flash` |
| Legacy screenshot tutorial and instructor clarification | `gemini-3.1-flash-lite` |
| Physical and software learner checking | `gemini-3.1-flash-lite` |
| Access probes and checkpoint evaluation | `gemini-3.1-flash-lite` |
| Explicit Live Coach camera, conversation and speech | `gemini-3.8-live` |

This restriction applies to local and hosted installations; `/api/config` reports the model. The screenshot adapter permits only 3.1 Flash-Lite; the dedicated whole-video adapter permits only 3.8 Flash. Neither automatically substitutes another model. The separate Live Coach bridge connects only to its fixed Live model. Google GenAI SDK 2.29.0 is pinned for the current Interactions schema and `steps` responses. Structured requests use a compact JSON schema; full Pydantic validation still rejects invalid types, oversized fields and unknown properties. SDK automatic retries are disabled so quota and capacity failures remain explicit.

Validate Flash-Lite physical assessment on real labelled examples and narrow automatic checks to supported classes. Neither robotics actions nor generated code are executed.

Model-unavailable errors, invalid outputs and connection failures pause analysis and preserve affected frames. Quota errors lock the session's checking. Resume or retry explicitly using the assigned operation model. New complete recordings use 3.8 Flash for final analysis. Retry finalization explicitly after a failed job or backend restart. If Flash-Lite cannot produce a usable lesson within free quotas, record the gate as failed.

The daily analysis-operation limit defaults to 120 and allows one active session. It is an extra application limit, **not the account's actual quota and not a token/cost guarantee**. Each structured operation makes at most one request, including failed attempts. Live coaching counts connections and replies against the same application guard; this does not equal Google's streaming quota accounting. The Free-tier account restriction is what keeps API cash spending at zero. A quota error blocks subsequent requests for the current UTC day, including after a restart; the next day's guard reset does not guarantee that Google's quota has reset.

## Using the MVP

- Live Coach: open `/coach`, share a webcam or screen, and talk or type. Native spoken replies and a transcript appear beside the video. Pause/finish stop upstream sharing. From a published lesson, select **Practice with live voice**. Coaching stays advisory; the existing guided practice supplies formal checkpoint outcomes.

- Instructor: choose webcam, phone or screen; consent; start; demonstrate once with natural narration. Provisional observations appear as windows finish. Pause stops media transmission. Finish flushes received evidence and requests a structured tutorial.
- Review: edit title, materials, steps, ordering, references, checkpoints and clarification answers. Optionally apply those clarifications with AI, then review the revised draft. Required unanswered questions block publication and cannot be removed by AI revision. Hidden/functional properties stay manual. Publish only after review.
- Student: open a published version, choose a capture source, then practice. Select/continue steps explicitly. Feedback can establish only visible criteria. Manual criteria are shown as unverified. Late feedback for earlier steps is discarded.
- Library: reopen a draft, published lesson or recent session. Published versions never change when their drafts are edited.
- Export: published lessons offer JSON, Markdown and screenshot ZIPs. Session evidence export is owner-only at `/api/sessions/{id}/evidence/export` and includes observations, accepted assessments, metrics and retained screenshots. It never contains raw audio.

Instructor sessions last at most five minutes from creation; practice lasts ten minutes, including pauses. Capture is 1 FPS, JPEG up to 1600px; optional mono 16kHz PCM stays in memory. Analysis is requested about every ten seconds after the preceding request. **10–15 seconds is a target, not a measured promise.** Slow inference, cold starts or quotas can exceed it. A backlog pauses capture with an explicit gap.

Phone pairing uses a single-use ticket expiring in two minutes. Camera access needs hosted HTTPS; a phone cannot use the laptop's localhost URL. No tunnelling dependency is assumed. Use laptop webcam/screen capture for the local backup. A capture disconnect terminates the recording, stops the camera and freezes the timer. There is no automatic reconnect or recording resume: start a new session. Received screenshots remain available for explicit partial-lesson finalization, with the interruption flagged for review. The phone ticket grants capture only, not lesson access or session control.

## Deploy the competition demo to Render Free

`render.yaml` defaults to a temporary demo that needs no Supabase project or external database. Deploy the Docker service on **Free**, with one worker. Set `STORAGE_MODE=local`, `DEMO_MODE=true`, `ALLOW_LOCAL_LOGIN=false`, `GEMINI_API_KEY` and verified `FREE_TIER_CONFIRMED=true`. Keep `TWIN_ENABLED=false`. The backend uses Render's assigned `RENDER_EXTERNAL_URL` automatically; set `APP_ORIGIN` only to override it for a custom domain.

`python scripts/prepare_demo_env.py` prepares `.data/render-demo.env` for importing into Render. It is ignored by Git and Docker and contains the private Gemini key: never commit it or share it publicly. The script copies the already configured key and requires local free-tier confirmation. An optional HTTPS origin argument overrides Render's assigned URL.

Confirm entry consent, then choose **Enter as instructor** or **Enter as student**. No password or access code is required. Each role shares one workspace, and anyone with the link can choose either role, view that role's demo data and use the shared AI quota. Use demonstration data rather than private participant records. API operations still require server-issued role tokens, and student-role requests cannot create instructor lessons or read instructor drafts. This is a public demo, not separate participant accounts. Developer sign-in remains limited to localhost; demo entry is explicitly enabled by `DEMO_MODE=true`. Demo tokens last eight hours and become invalid when the temporary signing file is lost. Gemini keys and free-tier guards remain exclusively on the backend.

Lessons and screenshots use the existing local SQLite/file adapter inside the service. **Render Free erases local changes when it sleeps, restarts or redeploys.** Export published lessons and validation evidence before leaving the demo. It can sleep after 15 idle minutes and take about a minute to wake. The app displays the temporary-storage limitation. This configuration demonstrates capture, AI, review, publication and practice during a running session; it does not provide durable cloud lesson reuse.

Run `python scripts/check_hosted.py https://your-service.onrender.com` to verify public configuration, frontend pages and anonymous-access restrictions without spending AI quota. Test sign-in, capture and actual AI separately. Keep the local laptop app as the demonstration backup.

## Optional durable hosting with Supabase Free

Supabase deployment has **not** been performed; the active hosted demo uses temporary local storage.

1. Create a Supabase Free project. Run `supabase/schema.sql` in its SQL editor. It creates backend-only records with RLS and a private `showonce` screenshot bucket.
2. In Supabase Auth, disable **Allow new users to sign up**. This dashboard setting is required; SQL does not disable registration. Use team-provisioned adult accounts only.
3. Set Supabase URL, anon/publishable key and service-role key in a private local `backend/.env`, with `STORAGE_MODE=supabase` and `ALLOW_LOCAL_LOGIN=false`. The service-role key bypasses RLS and must stay on the backend.
4. Provision each approved account with `scripts/provision_account.py --email person@example.com --role instructor` (or student). It prompts securely for the password. Roles come from backend-managed profile records, not editable user metadata. Provide credentials to participants yourself.
5. Put the project in your repository and create a Render **Free** Docker web service using `render.yaml`/`Dockerfile`. Keep one worker. Set all required secret environment values, `APP_ORIGIN=https://your-service.onrender.com`, and only then the verified free-tier flag. Do not configure paid disks, paid plans or automatic upgrades.
6. Verify health, account sign-in, permission isolation, private images, phone HTTPS capture and persistence across a restart. Test the actual Python 3.12 image. The same-origin frontend is built in Docker.

Set `DEMO_MODE=false` when enabling Supabase. Hosted mode rejects developer login and requires either Supabase or explicit demo mode. Supabase stores lessons, observations, assessments, jobs and screenshots durably. Sessions interrupted by a restart are flagged; interrupted jobs require an explicit retry. Pairing tickets are deliberately memory-only and expire on restart. Free hosting cold starts and capacity limits are material demo risks.

Practice screenshots are removed after seven days, checked at startup and hourly. Publishing removes unselected instructor frames, retaining every screenshot referenced by any published version. Unpublished evidence remains available for recovery. Export validation inputs before publishing. Supabase quota management and removal of abandoned drafts remain team responsibilities for this small MVP.

## Tests and evidence

```powershell
powershell -ExecutionPolicy Bypass -File scripts/validate.ps1
# While the local backend is running:
node scripts/browser-smoke.cjs
```

The optional browser script uses the installed Chrome and bundled Playwright paths on this computer. Override `CHROME_PATH` and `PLAYWRIGHT_MODULE` elsewhere. It uses a synthetic camera solely to verify capture transport and UI. Reports/screenshots go in ignored `artifacts/ui`.

An additional UI lesson-flow test is available using `backend/tests/ui_server.py` on port 8001, explicitly enabled with `SHOWONCE_UI_FIXTURE=true`, and `node scripts/browser-lesson-test.cjs`. Its model is a test fixture and its output is labelled accordingly; never use this server or its screenshots as evidence of live AI. The production Docker image excludes backend test fixtures.

Tests cover live transport through finalization using a test-only model, publication blocking, immutable versions and evidence exports, private ownership, student roles, phone tickets, assessment guards, restart recovery and installed SDK configuration. Frontend tests cover clarification and step ordering; the production build type-checks the generated contracts.

Real evaluation instructions, deadlines, responsibilities, checkpoint dataset format and pilot forms are in `docs/VALIDATION.md`. The checkpoint evaluation tool never puts labels into prompts. `docs/BUILD_STATUS.md` separates implementation evidence from uncompleted validation. Do not call this TRL4 until the integrated prototype is validated in the lab and its evidence is reviewed.

## Architecture

`frontend/src` contains capture, instructor review, library, practice and phone screens. `backend/app` contains strict schemas, authenticated APIs/WebSockets, a storage adapter, serialized runtime processing and real model adapters. `scripts` contains account setup, access gates and evaluation. `supabase` and the Docker/Render configuration contain hosted setup.

New teaching sessions: continuous MediaRecorder video/audio → browser IndexedDB and ordered private server chunks → FFmpeg integrity and track-coverage checks → Gemini 3.8 Flash whole-video request → timestamped screenshot extraction → instructor review → immutable version. Gemini 3.1 Flash-Lite preview observations are optional and may lag without stopping the recording. Existing screenshot-only sessions retain their legacy path. There is no ESP32 or Sheets checklist in generation prompts. Human evaluation checklists are separate documents. Captured screen text and narration are evidence, not commands to the app/model tools.

The API is documented at `/docs`. Run `backend/export_schema.py` and `npm run types --prefix frontend` after schema changes. The records table stores typed payloads as JSONB to keep this prototype small; this is not intended for large multi-school workloads.

## Competition and operating limits

Use consenting participants aged 18+, English instructions and text feedback. The planned track is AI for Education & Society. Submission preparation targets 15 October 2026 and an English video at most eight minutes. Hardware assembly and power-up require the supervisor's review. The software does not establish electrical safety or continuity.

No hardware has been purchased, no billing enabled and no cloud service provisioned during this implementation. Software development expenditure: **RM0**. Reserve at most RM10 for missing physical supplies. Universal activity understanding, automatic power/robot control, reliable unreadable-label recognition and children-directed use are outside the validated scope.

The preloaded blink sketch is in `hardware/esp32_blink/esp32_blink.ino`. It has not been compiled/flashed on the user's board. Task-specific firmware constants are kept outside the AI prompts. Phone narration uses short PCM chunks; leave a brief pause after the final sentence and check end-of-capture losses during the real-device gate.

Official integration references: [Flash-Lite](https://ai.google.dev/gemini-api/docs/models/gemini-3.1-flash-lite), [pricing](https://ai.google.dev/gemini-api/docs/pricing), [actual quotas](https://ai.google.dev/gemini-api/docs/rate-limits), [API terms](https://ai.google.dev/gemini-api/terms), [Render Free](https://render.com/docs/free), [Supabase Free](https://supabase.com/pricing), [browser capture](https://developer.mozilla.org/en-US/docs/Web/API/MediaDevices/getUserMedia).



### Full-session recording (15 October)

New teaching sessions retain video and the selected microphone track for seven days on the backend. Successfully uploaded browser copies are removed after verification; failed uploads remain locally for retry. FFmpeg and ffprobe must be on PATH (the Docker image installs them). The recording cap is five minutes and 300 MB. Camera and microphone loss terminate recording; model delays do not. Pause is disabled for continuous teaching recordings; use Finish instead.

Finish stops media immediately, verifies ordered chunks, decodes audio/video, checks track coverage, and submits the entire file to `gemini-3.8-flash`. Selected screenshots are extracted at validated model timestamps. A complete-input status is not a guarantee of semantic understanding. No automatic model fallback or paid billing is enabled. Provisional observations and legacy lessons use `gemini-3.1-flash-lite`; Live Coach remains `gemini-3.8-live`.

Use Retry finalization for saved verified recordings. A finished local upload that failed can be retried from the Teach setup page's recovery button. Keep a paired phone page open until its upload completes. Browser crashes before the recorder emits its final chunk cannot be described as a complete recording. Hosted Free ephemeral storage is not durable; deployment remains suspended.

Validation: synthetic media covers chunk idempotency, missing/corrupt data rejection, ownership and scoped phone tokens, full-video finalization and timestamp extraction, and preview backlog behavior. Browser persistence tests cover the final media chunk, duplicate Finish calls and upload retry. A real synthetic narrated-video request to 3.8 returned model_busy; successful live whole-video quality validation remains outstanding. No user footage was used for that probe.

Lesson deletion: owners can delete a lesson from its library card, draft review or published view after confirmation. The endpoint removes the draft, all published versions, instructor source session, recording chunks and screenshots. Active recording/practice, pending generation and AI processing block deletion. Historical student sessions and independent coaching conversations are retained.
