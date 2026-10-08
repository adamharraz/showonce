# ShowOnce validation and delivery

No result below has been claimed as achieved. Use real sessions and consenting adult participants. Keep this human checklist out of model prompts. Save test inputs before publishing because unused frames are discarded.

## Access and sustained-capture gate

Run `scripts/probe_models.py` with the verified Free-tier key. Record the actual dashboard quotas for ER2 Live, ER2 standard, Flash 3.8 and the fallback; include date and screenshots with keys/account identifiers redacted. Preview access is not guaranteed. A model listing alone is insufficient.

Then use one five-minute narrated ESP32 demonstration. Record session ID, chosen and actual model IDs, frame gaps, narration losses, provisional-step cadence, context failures, reconnects, finalization latency, usage and remaining quotas. Export the owner-only evidence bundle through the authenticated app/API. Check continuous narration and a pause/resume. Do not claim real-time AI if only capture transport succeeds.

Fail ER2 if essential observations are lost; switch physical observation to the Flash window adapter and repeat one live session. Test 2.5 Flash only if 3.8 is unavailable. If none fits free quotas, record a feasibility failure. Do not show replayed model responses as new inference.

## Human extraction evaluation

Independently record three ESP32 demos, two Sheets demos only once the primary flow works, and one deliberately obscured demo. Each lesson must arise from exactly one live session. Save its raw generated draft before review and its approved version after review.

Human-only expected actions: for ESP32, inspect assembly, demonstrated component placement and visible endpoints, teacher-stated values/pins, disconnected power and supervisor power review. Firmware is preloaded. For Sheets, inspect table creation, sample entries, demonstrated SUM range and result, currency formatting. Judge only what was actually shown/narrated, not an assumed ideal lesson.

For every demo, record:

| Field | Record |
|---|---|
| Session/task/model/date | Actual identifiers |
| Essential observable actions | Human list with timestamps |
| Covered actions | Evidence and generated step matching each action |
| Coverage | Covered / observable essential actions |
| Ordering errors | Exact before/after pairs |
| Unsupported critical claims | Pin, value, formula or prerequisite without support |
| Ambiguous details | Clarification question raised? Required? |
| Instructor effort | Review seconds, edits, additions, deletions |
| Finalization | Actual latency and errors |

Targets: ≥90% coverage, correct ordering, zero unsupported critical claims. Required ambiguous details must block publication. Repeat with a teacher undoing a mistake and verify the corrected ledger/tutorial. If the targets fail, narrow the supported task/checkpoint scope and report failures.

## Checkpoint datasets and comparison

Development set: 12 new physical examples, four correct, four incorrect and four unclear. Include diverse camera positions and avoid near-duplicate frames across sets. A supervisor supplies labels without seeing model predictions. Derive the step/criteria from an approved lesson, not a hidden system checklist.

Create a JSONL file next to the images. One line has this shape (example is generic and is never preloaded into the app):

```json
{"id":"dev-01","label":"unclear","checkpoint_class":"visible-placement","step":{"id":"approved-step-id","title":"Approved step","instruction":"Copy from approved lesson","expected_outcome":"Copy from approved lesson","evidence_ids":[],"provenance":"instructor-confirmed","criteria":[{"id":"approved-criterion-id","description":"Copy approved visual criterion","mode":"visual"}]},"references":["teacher.jpg"],"student":["student.jpg"]}
```

Use actual exported step JSON and relevant teacher reference images. Keep `correct`, `incorrect`, `unclear` labels outside the `step` object. The evaluation script sends only approved criteria and images; it never sends labels or case-class names.

```powershell
.\.venv\Scripts\python.exe scripts\evaluate_checkpoints.py evaluation\dev.jsonl --output artifacts\development.json
```

It uses real requests, counts them against the shared application limit, saves every accepted result/error, latency and usage, and compares false passes first, accuracy second, choosing Flash for a tie. A recommendation is withheld if errors or unequal evaluated totals make the comparison incomplete. Decide which classes remain automatic; change failing criteria to manual before publication. Repeat the selected model on a completely separate 30-example holdout:

```powershell
.\.venv\Scripts\python.exe scripts\evaluate_checkpoints.py evaluation\holdout.jsonl --models gemini-3.8-flash --output artifacts\holdout.json
```

Use ten correct, ten incorrect, ten unclear. Targets: ≥90% classification accuracy and zero `met` predictions for incorrect/unclear examples. `Unable to assess` counts as a classification miss against these labelled classes; report abstention separately. Analyze each checkpoint class rather than relying only on pooled accuracy. Remove unsupported classes. Do not tune on the holdout and keep calling it a holdout.

## Responsiveness and reliability

Using a warmed hosted service and real student practice, measure from a stable visible outcome to rendered feedback, including the 10s capture window/queue. Store at least 20 timestamps and calculate p50/p90; target 90% ≤15s. Backend `latency_ms` measures request processing only and must not be reported as this end-to-end measure. Record cold-start results separately.

Exercise denied camera/microphone/screen permissions, phone expiration/reuse/disconnect, controller reconnect, backend restart mid-session and mid-finalization, invalid JSON/evidence, quota exhaustion, wrong account/role, stale step responses, revision conflicts and edits after publication. Received evidence must survive errors; missing intervals must be marked. Never retry paid capacity.

## Three-person adult beginner pilot

Use three consenting university adults who have not assembled this exact circuit. Explain Google processing and screenshot retention; avoid faces, credentials and personal screen content. The supervisor checks before powering circuits. Record participant IDs rather than names.

For each participant, record completion, time, supported corrections, incorrect AI feedback, clearer-view requests, manual help, confusing wording, step advances and the final hardware check. Separately record instructor review effort. No claims about children or universal activities follow from this pilot.

## TRL evidence and submission

Keep a dated manifest containing source/build revision, configuration/model IDs, access/quota evidence, six extraction cases, development/holdout inputs and results, timing samples, failure tests, three pilot records, limitations, supported checkpoints and supervisor assessment. Use screenshots and actual MVP recordings. Automated software tests alone do not establish TRL4.

Suggested English submission sequence, ≤8min:

| Time | Actual operation |
|---|---|
| 0:00–0:40 | Teaching problem and narrowly supported scope |
| 0:40–3:00 | Teacher starts with no written lesson; one short live demo; provisional steps appear |
| 3:00–4:15 | Reference screenshots, targeted uncertainty, review and publication |
| 4:15–6:15 | Student makes a validated visible mistake; feedback; explicit Continue |
| 6:15–7:15 | Actual extraction/holdout/timing results and manual limitations |
| 7:15–7:45 | Saved lesson reuse, RM0 approach, architecture and limitations |

Use recorded actual MVP operation. Label any old inference as a historical result. Keep local webcam capture and saved tutorials available as recovery. Add Sheets only after its own extraction/checkpoint validation; omit it otherwise.

## Schedule and ownership

| Date | Developer A | Developer B / third member | Gate |
|---|---|---|---|
| 8 Oct | Access probe, adapters, storage | Hardware, hosted capture/account setup | Actual free quota + five-minute capture |
| 9 Oct | Ledger/recovery integration | Webcam, phone, permission checks | One continuous demo gives persistent observations |
| 10 Oct | Finalization/version isolation | Review, clarifications, exports | Approved reusable lesson |
| 11 Oct | Assessment comparison | Label 12 examples; Sheets only if primary passes | Supported visible checkpoints selected |
| 12 Oct | Holdout and timing collection | Label 30 holdout cases + three adult pilots | Report targets and narrow failures |
| 13 Oct | Fix failures, freeze build | Export manifest and rehearse | Evidence reproducible |
| 14 Oct | Deployment/local backup check | Record/verify English video | Accessible link + ≤8min actual demo |
| 15 Oct | Final review | Supervisor and submission | Submit approved entry |

Software spending target RM0; maximum RM10 for missing physical supplies. Record actual receipts. No team member should attach billing to bypass a failed quota gate.

