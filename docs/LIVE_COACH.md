# Live Coach

Implemented on 12 October 2026. This adds the Relay-style live camera and voice experience to ShowOnce. The original instructor demonstration, review, publishing and formal practice flows remain available.

## Use it

Open `http://localhost:8000/coach`, sign in, choose webcam or screen sharing, consent, and start live coaching. Show the workspace clearly, then speak or type a question. The assistant's spoken replies and transcript appear beside the live video. Use headphones if playback is picked up by the microphone.

The microphone can be muted; typed questions still work with the camera. “Look at this now” asks the model about the latest view. Pause closes the upstream Live connection and stops media transmission; resume opens the same model with session resumption when available. Finish or navigating away stops camera/microphone sharing and closes the upstream session.

From a published lesson, choose **Practice with live voice**. The assistant receives the approved lesson and current step. The learner explicitly selects Continue. Voice coaching does not create formal assessment results, mark steps passed, publish lessons or control hardware. Use the existing guided practice for evidence-backed checkpoint outcomes.

The coach supports webcam and screen sharing. It does not add a second phone-pairing protocol; a phone can open the hosted HTTPS coach directly. The original demonstration studio still supports paired-phone capture. Localhost remains suitable for laptop cameras.

## Models and cost

The coach uses `gemini-3.8-live`, Google's current default Live model, through the Gemini Developer API. Existing observation, tutorial generation, instructor clarification and formal assessments continue to use `gemini-3.5-flash-lite`. There are no Pro calls, Vertex AI deployment, paid fallback or alternative model fallback.

The owner confirmed the project has no paid billing. `FREE_TIER_CONFIRMED` remains a manual guard: the application cannot independently verify Google's billing status. A key alone does not enable AI. Both selected models list free input and output on the Developer API; usage must fit the account's actual quotas. Quota errors stop calls rather than enabling billing.

A paid planning scenario for ten minutes is approximately RM1–RM4, assuming 160,000–480,000 billable input tokens split roughly 60% image/video, 30% audio and 10% text, plus three minutes of generated speech and a small transcript. This assumes USD1 = RM4.10 and Google's standard rates of USD1/M image/video input, USD3/M audio input, USD0.75/M text input, USD12/M speech output and USD4.50/M text output. It is an illustrative scenario, not a measured session bill or a cost ceiling. Repeated context, proactive audio and additional turns change token consumption. No paid tier was enabled.

Controls: one active AI session across coaching/demonstration/practice; one fixed Live model; ten-minute wall-clock limit including pauses; maximum 40 replies counted when they start; bounded Live context (16,000 trigger / 8,000 sliding target); one automatic upstream reconnect; daily application guard shared with existing lesson processing. At the owner's request, the 200,000-token session cap was removed on 12 October. Tokens are still recorded, but do not end a session. Missing usage is explicitly marked unavailable in metrics; a zero stored token subtotal for an unfinished turn does not establish zero token consumption. The daily guard counts Live connections and replies as application operations; this does not equal Google's RPM, TPM or RPD accounting. Camera/audio streaming itself consumes upstream quota.

`LIVE_COACH_ENABLED=false` disables coaching. `LIVE_COACH_SECONDS` is capped at 600. `LIVE_COACH_TOKEN_LIMIT` is no longer used. The UI shows the configured limits. Stopping a session never triggers another model.

## Media and storage

The browser streams JPEG frames every 2.5 seconds, scaled to at most 768 pixels on the longest edge. An explicit snapshot is rate-limited to keep the upstream feed at no more than one frame per second. The microphone sends approximately 40ms chunks of mono, 16kHz, signed little-endian PCM. Responses are played as 24kHz PCM with a short playback queue. Native interruption clears queued audio. Browser capture requests echo cancellation and noise suppression.

The backend validates origin, authentication, explicit consent, message sizes, media format and active-session ownership. API keys stay on the backend. Audio is not logged or stored; camera frames are held in memory only for the live session. Muting the microphone sends an audio-stream-end signal and stops PCM transmission. The transcript is saved privately, available under Recent conversations and removed after seven days during hourly cleanup. Session metadata and token/turn metrics are kept separately; expiry is also enforced when viewing history. A restart marks unfinished conversations interrupted. Reopening history is labelled as saved content and does not run inference.

## Verification and limitations

Two small real access tests used a synthetic image and the owner's confirmed Free-tier key. The first confirmed audio generation but did not see the image yet. After sequencing continuous frames before the request, the second identified the single blue square and returned native audio plus an output transcript in approximately 5.5 seconds. This verifies one short real vision/output-audio exchange; it does not establish ESP32 accuracy, sustained real microphone conversations or ten-minute quota availability.

Two real end-to-end browser runs then used the production app, a synthetic camera and a locally synthesized spoken question. Gemini transcribed “Can you tell me what you can see on my camera?”, described the moving green shape, and returned native voice. The final run also tested microphone mute/end: 29 audio chunks arrived and 27 were scheduled before Finish interrupted the remaining response; one reply and both transcript messages were saved without errors. The whole run took approximately 10.8 seconds including camera startup, synthetic speech and reply delivery, not inference latency alone. Screenshot/report: ignored `artifacts/ui/live-coach-real-synthetic.png` and `live-coach-real-synthetic-report.json`. This is actual Gemini inference with synthetic media, not physical-circuit validation.

Automated verification: all 44 existing backend cases passed with the integration; all 13 Live Coach cases passed after the final changes; 5 frontend tests passed and the production build succeeded. Browser fixture checks passed for desktop/mobile layout, voice transport, camera, chat, pause/resume, finish and private history. No paid billing or cloud services were enabled.

Offline backend tests cover origin/auth/consent, fixed model configuration, video/audio relay, pause/resume, private transcript history, single-session exclusion, malformed audio, quota shutdown, usage caps, disconnect cleanup, one reconnect and approved lesson step selection. Frontend tests verify PCM resampling, clipping, endianness and native audio decoding. The browser regression uses a synthetic camera and a test-only model; its images must not be presented as real AI inference.

Run the UI fixture only with `SHOWONCE_UI_FIXTURE=true`:

```powershell
$env:SHOWONCE_UI_FIXTURE='true'
.\.venv\Scripts\python.exe -m uvicorn tests.ui_coach_server:app --app-dir backend --host 127.0.0.1 --port 8002
```

In another terminal, run `node scripts/browser-coach-test.cjs`. It uses the same Playwright runtime convention as the existing browser regression scripts. Never deploy the fixture. The production image excludes backend tests.

The live assistant can still misread small labels, occluded connections and component values. It asks for a clearer view and cannot confirm continuity, safety or electrical operation visually. Coaching is conversational guidance; no new physical-task accuracy or TRL4 claim is made.

Official references: [Live capabilities](https://ai.google.dev/gemini-api/docs/live-api/capabilities), [Gemini 3.8 Live](https://ai.google.dev/gemini-api/docs/models/gemini-3.8-live), [pricing](https://ai.google.dev/gemini-api/docs/pricing), [Live session management](https://ai.google.dev/gemini-api/docs/live-api/session-management), [quota rules](https://ai.google.dev/gemini-api/docs/rate-limits).
