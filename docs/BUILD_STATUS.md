# Implementation status

Date: 8 October 2026. This is an implementation record, not a competition validation result.

| Capability | State |
|---|---|
| React/TypeScript + FastAPI app and production build | Implemented; local build checked |
| Webcam transport, pause/finish and responsive interface | Passed browser checks with synthetic camera; no JavaScript errors/overflow |
| Paired-phone protocol and pause propagation | Passed browser checks with two simulated browser devices |
| Screen capture and actual phone capture | Implemented; actual devices/hosted HTTPS still needed |
| Generic observation extraction and finalization | Real adapters implemented; live API access not verified |
| Instructor review, clarification blocking, immutable publishing | Checked with test-only model results |
| Student assessment guards and private evidence | Automated tests; accuracy unmeasured |
| Persisted jobs/ledger and interruption recovery | Automated tests using local storage |
| Render/Supabase deployment and accounts | Configuration/scripts prepared; not deployed |
| Free tier and RM0 guard | Application guard checked; actual account quotas unknown |
| ESP32/Sheets extraction and checkpoint evaluation | Tools/protocol provided; not run |
| Adult beginner pilot, TRL4, submission video | Not performed |
| ESP32 blink firmware | Prepared; not compiled/flashed on hardware |
| Python 3.12 GitHub CI | Backend/frontend tests and production build passed on the initial GitHub commit |
| Docker deployment image | Prepared; deployment integration still needs verification |

No Gemini or Supabase secret credentials were present. The implementation therefore makes no live-model, hosting, 90% accuracy, 15s latency or TRL4 claim. No software/service money was spent.

Automated tests use clearly isolated `FakeAI` in `backend/tests`; production creates only real Gemini adapters. The browser smoke test uses a synthetic camera and records that limitation. Runtime fallback never fabricates a lesson.

Checked locally: 21 backend tests, 2 frontend tests, generated API contracts and production build. A second browser integration run passed clarification, review, publishing, ZIP export and practice feedback with an explicitly marked test-only model server. This tests software integration, not Gemini performance. Browser artifacts are kept in ignored `artifacts/ui`; test data stays in `.tmp`, separate from the normal app's `.data`.

See `README.md` for setup and `VALIDATION.md` for the remaining evidence gates.
