# Implementation status

Date: 8 October 2026. This is an implementation record, not a competition validation result.

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
