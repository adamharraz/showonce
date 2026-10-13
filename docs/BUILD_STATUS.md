# Implementation status

Latest 13 October: Hugging Face access is attached, weights are prepared and the private Modal A10 photo-to-3D worker is enabled locally. A real reconstruction of the official SF3D chair sample passed in 174.489s including cold startup (2.936s inside the generation method). Chrome displayed the textured GLB, rotated it and downloaded identical saved bytes; desktop/mobile checks passed without additional inference. Eleven photo-to-3D regression tests passed after fixing conditional Secret hydration. The billing snapshot reported US$0 billed. Actual ESP32/thin-wire mesh quality remains unvalidated. See `PHOTO_TO_3D.md` for evidence, controls and limits. No paid billing/payment method was enabled; the owner confirmed US$0 net spend and sufficient credits.

Current regression validation: 80 backend tests, seven frontend tests, generated contracts and production build passed. New isolated browser checks passed photo capture/consent, asynchronous GLB jobs, loading/download, saved models and desktop/mobile layout. The test GLB is explicitly synthetic. Microphone pacing plus a nonfatal burst guard prevents normal audio backlog from closing camera sharing; async disconnect cleanup releases its session slot.

13 October: implemented the local five-family 3D component catalogue with Gemini Live snapshot/tool recognition, owner-only versioned corrections, explicit unknown values/variants and reference pin highlighting after board confirmation. Real Live integration on a synthetic drawing returned an LED and uncertain resistor with no invented value. Physical recognition remains unvalidated; details are in `COMPONENT_LIBRARY.md`.

Current automated validation: **67 backend tests**, **5 frontend tests**, regenerated API contracts and production build passed. Component UI checks passed with a synthetic camera and isolated fixture, including 3D rendering, pinout withholding, manual corrections and mobile layout. The real Live snapshot gate passed with one completed reply reporting 2,100 tokens. Services remain free-tier guarded; no new hosting or billing was configured.

Latest 12 October update: the requested Relay-style Live Coach uses `gemini-3.8-live` for camera and voice, with video beside the assistant, typing, microphone/voice controls, pause/resume, usage caps and private conversation history. Lesson processing still uses Flash-Lite. This supersedes the earlier single-model policy for the new coaching feature only. Details and limitations are in `LIVE_COACH.md`.

Live Coach validation: existing backend regressions and 13 coaching tests passed; 5 frontend tests and the production build passed. The real app received a locally synthesized spoken question, observed a synthetic camera, transcribed the question and streamed native Gemini speech with no browser errors. The final run counted one reply and saved the conversation after microphone mute/Finish. Actual ESP32 accuracy, an adult pilot and sustained ten-minute quota capacity remain unverified. The main local server is running; the isolated test-only UI server was stopped.

Historical validation record: 8 October 2026. This is an implementation record, not a competition validation result.

Model policy updated on 12 October 2026: all observation, finalization, clarification and assessment calls use `gemini-3.5-flash-lite` only. ER2 streaming and all model fallbacks were removed. Legacy environment overrides cannot change the model, and access/evaluation tools reject other identifiers. The earlier model checks below are historical; Flash-Lite physical-task accuracy still requires validation.

Verification on 12 October: 44 backend tests and 2 frontend tests passed; API contracts regenerated and production build passed. Offline transport tests covered every AI role, rejected other model identifiers before transport, and verified that unavailable/quota/capacity errors make no fallback request. Both CLI tools rejected forbidden model arguments before inference. The local server was restarted and `/api/config` reported Flash-Lite for both physical and general processing. These checks made no Gemini API requests.

| Capability | State |
|---|---|
| React/TypeScript + FastAPI app and production build | Implemented; local build checked |
| Webcam transport, pause/finish and responsive interface | Passed browser checks with synthetic camera; no JavaScript errors/overflow |
| Paired-phone protocol and pause propagation | Passed browser checks with two simulated browser devices |
| Screen capture and actual phone capture | Implemented; actual devices/hosted HTTPS still needed |
| Generic observation extraction and finalization | Real ER2 Live/standard ER2 and Flash Lite calls passed; synthetic tutorial pipeline completed |
| Instructor review, clarification blocking, immutable publishing | Checked with test-only model results |
| Student assessment guards and private evidence | Automated tests; accuracy unmeasured |
| Persisted jobs/ledger and interruption recovery | Automated tests using local storage |
| Render/Supabase deployment and accounts | Configuration/scripts prepared; not deployed |
| Free tier and RM0 guard | Owner confirmed no paid billing; guard enabled locally; actual account quotas unknown |
| ESP32/Sheets extraction and checkpoint evaluation | Tools/protocol provided; not run |
| Adult beginner pilot, TRL4, submission video | Not performed |
| ESP32 blink firmware | Prepared; not compiled/flashed on hardware |
| Python 3.12 GitHub CI | Backend/frontend tests and production build passed on the initial GitHub commit |
| Docker deployment image | Prepared; deployment integration still needs verification |

A Gemini key is configured in the ignored backend environment file. The owner confirmed no paid billing, so the manual Free-tier guard is enabled. No Supabase credentials are configured. The implementation makes no hosting, 90% accuracy, 15s end-to-end latency or TRL4 claim. No billing or paid service was enabled.

Automated tests use clearly isolated `FakeAI` in `backend/tests`; production creates only real Gemini adapters. The browser smoke test uses a synthetic camera and records that limitation. Runtime fallback never fabricates a lesson.

Checked locally: 29 backend tests, 2 frontend tests, generated API contracts and production build. The eight new backend tests cover current SDK wire formats, nested responses, local rejection of invalid output, and single-request quota/capacity failures. A second browser integration run passed clarification, review, publishing, ZIP export and practice feedback with an explicitly marked test-only model server. Browser artifacts are kept in ignored `artifacts/ui`; test data stays in `.tmp`, separate from the normal app's `.data`.

Real API checks on 8 October used synthetic images: ER2 streaming returned a validated observation tool call, standard ER2 returned structured observations, and Flash Lite completed observation → tutorial → assessment. The synthetic drawing test measured individual inference times of 13.9s, 10.4s and 3.0s respectively, and identified the missing circle as a correction. These exclude capture intervals and do not establish real-session latency or accuracy. Reports are in ignored `artifacts/model-access-complete.json` and `artifacts/live-ai-synthetic/report.json`. Flash 3.8 returned HTTP 503 capacity errors; the local general model is Flash Lite. Flash 2.5 returned HTTP 404 for this project. A five-minute narrated session and ESP32 holdout tests are still required.

See `README.md` for setup and `VALIDATION.md` for the remaining evidence gates.
