# ShowOnce main review and release fixes

> **For agentic workers:** Use Superpowers systematic debugging and test-driven development. The user authorized fixing, merging into main, and pushing; no deployment is requested.

**Goal:** Merge the deployed-version branch after correcting its five reviewed defects and any verified important main-branch defects.

**Architecture:** Keep the existing FastAPI/React app and isolated Proto Lab. Validate imported projects before replacing state; preserve electrical signal paths and match exported rule semantics to the simulator.

**Tech stack:** Python/FastAPI/pytest, React/Vite/Vitest, JavaScript/Three.js, Playwright browser regression scripts.

**Spec:** User instruction: review main, fix and push; fix and merge reviewed commit `c7ec41b`. Known review findings are recorded in the conversation.

## Constraints

- No RAEA, Codex illustrations, Extended Thinking, or local-only experiments.
- Preserve all 65 parts, 8 boards, starter layouts, saved-project compatibility and opaque iframe isolation.
- No paid services, billing changes or deployment.
- Work on the existing dedicated review branch; retain the local-experiment backup branch.
- Tests precede fixes; preserve evidence of failures and successful reruns.

## Review focus

- A rejected project must preserve the current build and Undo history.
- Auto-wire must preserve existing manual and translated connections.
- Unpowered, ungrounded or reversed level shifters must not validate unsafe signals.
- Multiple output rules must behave identically in simulation and firmware.
- Main-branch private endpoints and recording jobs must retain ownership and truthful status.

## Tasks

### 1. Review main independently

- [x] Audit `origin/main` at `36ccc3f`, using read-only history or a scratch snapshot.
- [x] Reproduce actionable findings against the combined release before fixing.
- [x] Add regressions and fix verified important defects.

### 2. Fix project import

- [x] Add a browser regression importing an unknown component over an existing build; verify failure on the current release.
- [x] Add pure project-validation tests for malformed structure and saved example compatibility.
- [x] Validate and analyze the candidate before replacing document/history; retain rollback for render failures.
- [x] Verify rejection preserves the original document and Undo; verify valid save/open.

### 3. Fix circuit behavior and generated firmware

- [x] Add failing real-analysis regressions for repeated Auto-wire and translated sensor signals.
- [x] Preserve existing pins; resolve powered HV/LV channels with voltage and ground checks.
- [x] Add a failing regression comparing multiple-rule firmware behavior with simulation.
- [x] Generate destination-grouped rules with last-matching priority and default off only when none match.
- [x] Verify all shipped examples and invalid shifter cases.

### 4. Restore regression tooling

- [x] Run Node syntax checks, observe the missing-regex failure, then fix it.
- [x] Update removed Circuit Basics selectors to Workbench/Course checks.
- [x] Run the browser Lab and import regressions against the production bundle.

### 5. Integrate and push

- [x] Run full backend/frontend suites, production build and schema consistency checks.
- [x] Review the fix diff and any remaining main-audit findings.
- [ ] Commit fixes; merge the review branch into main without rewriting main history.
- [ ] Push main and the fixed review branch; verify remote hashes and clean checkout.

## Evidence ledger

- Baseline: `c7ec41b` previously passed 115 backend and 18 frontend tests. Its five defects were independently reproduced during review.
- Main baseline: `36ccc3f`; no remote main changes at initial fetch.

- Main review: three verified defects (late media acquisition, stale step snapshot, gap-question overflow); no separate confirmed auth/access-control defect.
- Import RED: browser rejected-file test lost the original ESP32/LED design. GREEN: browser retains design and Undo, then saves/reopens JSON. Pure validator accepts all seven stock examples.
- Circuit RED: 12 initial failures plus 3 safety failures. GREEN: 23 circuit regressions, all 65 parts and 8 boards retained. One powered level-shifter channel is modeled; cascaded translators remain unsupported.
- Script RED: Node syntax check reports missing regex delimiter. GREEN: browser script parse guard passes; updated Lab browser checks verify real course interaction, workbench state, isolation, desktop/mobile and fallback.
- Main RED: full-question draft returned HTTP500; full-capacity job incorrectly completed; pending step resurrected finished practice. GREEN: regressions preserve required questions, reject invalid completion and retain finished state.
- Additional race RED→GREEN: Finish now serializes with a pending step even without a runtime after restart.
- Media RED: granting permission after leaving kept camera/microphone live. GREEN: browser checks permission, session-response, recording-start and phone-permission cancellation.
- Environment: forced software GL stalled course setup; normal Chrome GPU path loads successfully. No production renderer changes or weakened iframe permissions were required.

- Final verification: 119 backend tests and 45 frontend tests passed; production build and API-schema consistency checks passed. Browser import/Undo/JSON, four capture-cancellation phases, and complete Lab desktop/mobile/course/workbench/fallback checks passed.
