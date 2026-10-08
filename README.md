# ShowOnce

One live demonstration becomes a reviewed, reusable lesson. Students then practice against its approved visible checkpoints.

## Current delivery

Implemented: React/TypeScript capture and review app, FastAPI backend, webcam/screen/phone capture, temporary narration, ER2 Live and windowed Gemini adapters, persistent observation ledger, clarification and editing, immutable published versions, practice feedback guards, private evidence, exports, failure recovery, free-tier controls, deployment configuration and evaluation tools.

**Real Gemini access, actual free quotas, hosted deployment, ESP32/Sheets accuracy, beginner pilots and TRL4 evidence have not been verified.** No credentials were available during implementation. The app never substitutes canned responses for live AI. Synthetic input and fake model results exist only in automated tests.

The local app works without cloud credentials, but cannot generate a tutorial or AI feedback until a real Gemini key is configured. Use it to check capture and connection handling first.

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

For frontend development, run the backend and `npm run dev --prefix frontend` in separate terminals. Vite proxies `/api`, including WebSockets, to port 8000. The production build is served by FastAPI on one origin.

Dependencies are already installed in this workspace. Its host Python is 3.13; automated checks have run on that host. The Python 3.12 Docker image still needs a build and integration check on the deployment host.

## Enable real AI, spending RM0

1. Create/use a **Free-tier** Google AI Studio project. Check its billing state and actual model quotas in the dashboard. Do not attach paid billing or enable upgrades.
2. Put `GEMINI_API_KEY` in `backend/.env`, never the frontend or chat. Apply the Gemini API key restrictions required by AI Studio. Set `FREE_TIER_CONFIRMED=true` only after checking the account. This flag is a manual budget guard; the application cannot inspect Google's billing state.
3. Run `.\.venv\Scripts\python.exe scripts\probe_models.py`. It performs up to four small real requests and saves access, errors, usage and latency. It does not verify daily quotas. API calls share the application's persistent daily call guard.
4. Run one narrated five-minute session in the app. Export its evidence before publication discards unselected frames. Check lost narration, readability, ordering, updates, context and quota use against `docs/VALIDATION.md`.
5. If ER2 Live fails the gate, set `PHYSICAL_OBSERVER=flash`. If Flash 3.8 is unavailable, set `GENERAL_MODEL=gemini-2.5-flash`. Restart after changing settings. Quota exhaustion always stops calls; it never triggers a paid fallback.

Default models:

| Operation | Model |
|---|---|
| Physical instructor observation | `gemini-robotics-er-2-streaming-preview` |
| Screen/window observation and final lesson | `gemini-3.8-flash` |
| Physical learner checking, pending comparison | `gemini-robotics-er-2-preview` |
| Screen learner checking | `gemini-3.8-flash` |
| Unavailable general endpoint fallback | `gemini-2.5-flash` |

Physical assessment must be narrowed and its model chosen from real labelled examples before claiming validation. Set `PHYSICAL_ASSESSOR=gemini-3.8-flash` if Flash wins. Neither robotics actions nor generated code are executed.

Only model-unavailable errors allow an automatic general-model fallback. Invalid outputs pause analysis, and quota errors lock the session's checking. Other connection failures reconnect once and preserve the affected frames; Flash may recover that observation window. Retry finalization explicitly after a failed job or backend restart. If no model produces a usable lesson within free quotas, record the gate as failed.

The daily analysis-operation limit defaults to 120 and allows one active session. It is an extra application limit, **not the account's actual quota and not a token/cost guarantee**. An operation can include an unavailable-endpoint attempt before its fallback. The Free-tier account restriction is what keeps API cash spending at zero. Failed operations count. Streaming input also consumes upstream quota. A quota error blocks subsequent requests for the current UTC day, including after a restart; the next day's guard reset does not guarantee that Google's quota has reset.

## Using the MVP

- Instructor: choose webcam, phone or screen; consent; start; demonstrate once with natural narration. Provisional observations appear as windows finish. Pause stops media transmission. Finish flushes received evidence and requests a structured tutorial.
- Review: edit title, materials, steps, ordering, references, checkpoints and clarification answers. Optionally apply those clarifications with AI, then review the revised draft. Required unanswered questions block publication and cannot be removed by AI revision. Hidden/functional properties stay manual. Publish only after review.
- Student: open a published version, choose a capture source, then practice. Select/continue steps explicitly. Feedback can establish only visible criteria. Manual criteria are shown as unverified. Late feedback for earlier steps is discarded.
- Library: reopen a draft, published lesson or recent session. Published versions never change when their drafts are edited.
- Export: published lessons offer JSON, Markdown and screenshot ZIPs. Session evidence export is owner-only at `/api/sessions/{id}/evidence/export` and includes observations, accepted assessments, metrics and retained screenshots. It never contains raw audio.

Instructor sessions last at most five minutes from creation; practice lasts ten minutes, including pauses. Capture is 1 FPS, JPEG up to 1600px; optional mono 16kHz PCM stays in memory. Analysis is requested about every ten seconds after the preceding request. **10–15 seconds is a target, not a measured promise.** Slow inference, cold starts or quotas can exceed it. A backlog pauses capture with an explicit gap.

Phone pairing uses a single-use ticket expiring in two minutes. Camera access needs hosted HTTPS; a phone cannot use the laptop's localhost URL. No tunnelling dependency is assumed. Use laptop webcam/screen capture for the local backup. A disconnected phone requires a fresh QR ticket; the main controller reconnects once. The phone ticket grants capture only, not lesson access or session control.

## Deploy to Render Free + Supabase Free

Prepared configuration is provided; deployment has **not** been performed.

1. Create a Supabase Free project. Run `supabase/schema.sql` in its SQL editor. It creates backend-only records with RLS and a private `showonce` screenshot bucket.
2. In Supabase Auth, disable **Allow new users to sign up**. This dashboard setting is required; SQL does not disable registration. Use team-provisioned adult accounts only.
3. Set Supabase URL, anon/publishable key and service-role key in a private local `backend/.env`, with `STORAGE_MODE=supabase` and `ALLOW_LOCAL_LOGIN=false`. The service-role key bypasses RLS and must stay on the backend.
4. Provision each approved account with `scripts/provision_account.py --email person@example.com --role instructor` (or student). It prompts securely for the password. Roles come from backend-managed profile records, not editable user metadata. Provide credentials to participants yourself.
5. Put the project in your repository and create a Render **Free** Docker web service using `render.yaml`/`Dockerfile`. Keep one worker. Set all required secret environment values, `APP_ORIGIN=https://your-service.onrender.com`, and only then the verified free-tier flag. Do not configure paid disks, paid plans or automatic upgrades.
6. Verify health, account sign-in, permission isolation, private images, phone HTTPS capture and persistence across a restart. Test the actual Python 3.12 image. The same-origin frontend is built in Docker.

Hosted mode fails startup if configured to use the ephemeral local filesystem or developer login. Supabase stores lessons, observations, assessments, jobs and screenshots. Sessions interrupted by a restart are flagged; interrupted jobs require an explicit retry. Pairing tickets are deliberately memory-only and expire on restart. Free hosting cold starts and capacity limits are material demo risks.

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

Real evaluation instructions, deadlines, responsibilities, checkpoint dataset format and pilot forms are in `docs/VALIDATION.md`. The model comparison tool never puts labels into prompts. `docs/BUILD_STATUS.md` separates implementation evidence from uncompleted validation. Do not call this TRL4 until the integrated prototype is validated in the lab and its evidence is reviewed.

## Architecture

`frontend/src` contains capture, instructor review, library, practice and phone screens. `backend/app` contains strict schemas, authenticated APIs/WebSockets, a storage adapter, serialized runtime processing and real model adapters. `scripts` contains account setup, access gates and evaluation. `supabase` and the Docker/Render configuration contain hosted setup.

Capture → saved screenshots + in-memory audio → generic observation extractor → persistent ledger → structured tutorial → instructor review → immutable version → checkpoint assessment. There is no ESP32 or Sheets checklist in generation prompts. Human evaluation checklists are separate documents. Captured screen text and narration are evidence, not commands to the app/model tools.

The API is documented at `/docs`. Run `backend/export_schema.py` and `npm run types --prefix frontend` after schema changes. The records table stores typed payloads as JSONB to keep this prototype small; this is not intended for large multi-school workloads.

## Competition and operating limits

Use consenting participants aged 18+, English instructions and text feedback. The planned track is AI for Education & Society. Submission preparation targets 15 October 2026 and an English video at most eight minutes. Hardware assembly and power-up require the supervisor's review. The software does not establish electrical safety or continuity.

No hardware has been purchased, no billing enabled and no cloud service provisioned during this implementation. Software development expenditure: **RM0**. Reserve at most RM10 for missing physical supplies. Universal activity understanding, automatic power/robot control, reliable unreadable-label recognition and children-directed use are outside the validated scope.

The preloaded blink sketch is in `hardware/esp32_blink/esp32_blink.ino`. It has not been compiled/flashed on the user's board. Task-specific firmware constants are kept outside the AI prompts. Phone narration uses short PCM chunks; leave a brief pause after the final sentence and check end-of-capture losses during the real-device gate.

Official integration references: [ER2 capabilities](https://ai.google.dev/gemini-api/docs/robotics-overview), [ER2 streaming](https://ai.google.dev/gemini-api/docs/robotics-streaming), [Flash](https://ai.google.dev/gemini-api/docs/models/gemini-3.8-flash), [pricing](https://ai.google.dev/gemini-api/docs/pricing), [actual quotas](https://ai.google.dev/gemini-api/docs/rate-limits), [API terms](https://ai.google.dev/gemini-api/terms), [Render Free](https://render.com/docs/free), [Supabase Free](https://supabase.com/pricing), [browser capture](https://developer.mozilla.org/en-US/docs/Web/API/MediaDevices/getUserMedia).

