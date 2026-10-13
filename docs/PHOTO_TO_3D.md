# Relay-style photo-to-3D on Modal — 13 October 2026

**Historical experiment:** the main UI now uses the prepared component catalogue in `COMPONENT_LIBRARY.md`; `TWIN_ENABLED=false` in the local environment. A real photo of an ESP32 held in front of hands/people produced a mesh of those surrounding subjects with the board omitted. A successful chair-sample test establishes transport/rendering, not electronics reconstruction accuracy. The worker, source and saved private models remain available for deliberate future experiments; using the current catalogue does not start a GPU.

The experimental 3D interface used **capture → review → generate → save → rotate/download** before the catalogue was restored. It followed Relay's later photo-to-mesh feature at revision `e432291ea0dea02db71c030f569b1f7e0975aa8b`, not the original March preset circuit sandbox. Relay calls Stability's paid Stable Fast 3D API; ShowOnce ran the same public model family on a private Modal A10 worker. Outputs are not claimed to be identical to the hosted Stability API.

Sources: [Relay provider](https://github.com/faith-ogun/Relay/blob/e432291ea0dea02db71c030f569b1f7e0975aa8b/backend/reporter/app/providers.py), [Relay photo workflow](https://github.com/faith-ogun/Relay/blob/e432291ea0dea02db71c030f569b1f7e0975aa8b/frontend/components/ohmlet/twin/TwinStudio.tsx).

## Current deployment

Private app: [showonce-sf3d](https://modal.com/apps/adamtch142/main/deployed/showonce-sf3d), environment `main`. Its CUDA image built, both upstream C++/CUDA extensions compiled and the SF3D imports passed. Hugging Face access is attached through `showonce-huggingface`; CPU weight preparation passed. Generation was enabled for the tests and is now disabled in the local app. **One real GPU reconstruction passed on the upstream official chair sample; the subsequent ESP32-photo result failed to retain the board.** Physical electronics reconstruction quality is unsuitable to claim from these results.

Activation exposed a Modal dependency mismatch: the module was imported remotely without the local environment variable that conditionally attached the Secret. The worker now declares the same named Secret unconditionally in both environments. The failed deployment was stopped before redeployment; no GPU inference ran during that failed preparation.

The genuine app-level test completed in **174.489 seconds**, including CPU preparation and GPU cold startup. The method reported **2.936 seconds** for image processing, reconstruction and GLB export after model loading. Its 748,092-byte GLB contained one mesh, one material and two embedded textures. Authenticated fetch/download passed; unauthenticated access returned HTTP 401. Chrome loaded the real textures, rotation changed the rendered view, the downloaded bytes matched the saved GLB, and desktop/mobile checks passed with no browser errors or additional inference calls. These are single-sample results, not typical latency or electronics accuracy measurements. Reports, source photo, GLB and screenshots are in ignored `artifacts/sf3d-live/`; the sample job also appears in the instructor's saved-model history.

The installed host Modal CLI (1.2.2) was preserved. ShowOnce's project environment now pins Modal 1.6.1 for private function invocation and deployment. The existing active account/profile was reused; no credentials were printed or copied into source.

Source code: `modal_app/sf3d_worker.py`. SF3D source is pinned to `ff21fc491b4dc5314bf6734c7c0dabd86b5f5bb2`, weights to `f0c9a8ffd62cb1bbc8a7a53c9f87a0be1b6be778`. A CPU function downloads the gated weights and background model into a private Modal Volume before the GPU starts. GPU containers load cached weights, produce a textured GLB at 1024px and scale to zero when idle. One GPU container, no warm pool, five-second idle timeout, three-minute inference and startup timeouts, no automatic inference retries. The worker does not use Gemini, execute generated code or create an electrical netlist.

## Finish model access

1. Sign in to Hugging Face and accept/request access on [Stable Fast 3D](https://huggingface.co/stabilityai/stable-fast-3d). Its README documents this gated access requirement. Confirm the licence is appropriate for the team.
2. Create a read token in [Hugging Face token settings](https://huggingface.co/settings/tokens), preferably restricted to this model.
3. In Modal's Secrets page, create **`showonce-huggingface`** with key **`HF_TOKEN`** and that token as the value. Do not put the token in chat, Git, frontend code or a command argument.
4. With Modal credits and a **US$0 spend limit** verified, run from the repository root:

   ```powershell
   .\.venv\Scripts\python.exe scripts\activate_twins.py --zero-spend-confirmed
   ```

   This redeploys with the named Secret, prepares weights on a CPU, then updates the ignored backend environment file. It does not enable generation if preparation fails. Restart the local ShowOnce server afterward.
5. Run one real image → GLB test through the app, confirm that it loads and downloads, and inspect the Modal usage report. The official chair sample passed on 13 October; actual ESP32/breadboard mesh quality must still be tested separately.

Model access source: [SF3D official README](https://github.com/Stability-AI/stable-fast-3d#requesting-access-and-login).

## App flow and privacy

In Live Coach, point the camera at the completed build and select **Capture build photo**. Alternatively, **Choose photo** accepts an existing JPEG/PNG under 2 MB, so generation does not depend on a Gemini Live connection being available. Review the still, enter a title, choose background removal and consent to Modal processing. **Generate 3D model** submits exactly one still, not the video stream or narration. A neutral background, clear lighting and one coherent foreground object give the model a better input.

The backend normalizes the still to JPEG with a maximum 1024px edge, strips metadata and stores it privately. A persisted job first records the CPU preparation call, then the GPU call. The UI polls progress. Ready models are fetched through an authenticated owner-only endpoint, displayed by a lazy-loaded Three.js GLTF viewer and downloadable as a self-contained GLB. No third-party asset URL is loaded from a model.

Jobs, source photos and GLBs are private to their owner and retained by ShowOnce for seven days, with startup/hourly cleanup. Download a model to keep it longer. Modal's processing/storage policies apply independently to its infrastructure. Viewing a saved model does not run inference. Identical successful photos with matching settings/model revision are reused. Duplicate request IDs do not submit a second job. Restart recovery polls the recorded remote call; an unacknowledged submission is marked interrupted and requires checking Modal before another attempt. Failures preserve the photo and require an explicit retry.

The standalone model is not automatically included in an immutable published lesson version. Lesson extraction/review/publishing and approved checkpoint assessment continue through their existing pipeline. A generated mesh cannot establish hidden wiring, electrical continuity, readable pin labels, exact scale, polarity or safety. It can invent geometry on unseen surfaces and lose thin wires. Do not use it as a checkpoint pass.

## Cost controls

The owner reported **US$221 remaining credits**, a **US$200 usage limit** and **US$0 spend limit** on 13 October. Modal's spend limit caps net charges after credits; the usage limit caps gross workspace usage. The application relies on that account guard plus a manual confirmation flag—it does not independently read the dashboard's credit balance or spend-limit values. The billing summary read through the SDK reported zero billed cost at setup; it is not proof of an unlimited free plan.

Local defaults: three generation attempts per UTC day and ten total. Failed attempts count; cached views do not. The successful activation test used one application attempt. One job runs at a time, no automatic paid fallback, no public GPU endpoint and no automatic retries. CPU/image builds, cold starts, active GPU time and idle timeout consume Modal credits. The user's existing unrelated Modal apps remain untouched.

After the live test, Modal's monthly workspace summary reported **US$0 billed** and US$0.94160851 metered cost before allowances/credits. This is a workspace-wide snapshot, including other activity, not a per-model charge. The hourly report attributed US$0.05012079 of A10 GPU usage to ShowOnce on 13 October; CPU, memory, network and storage are additional. Reporting may lag. Both report commands were read-only; no billing settings were changed.

Modal lists A10 at US$0.000306/sec before CPU/memory. For example, sixty seconds of GPU time alone is about US$0.0184; actual total includes CPU, memory, load time and idle timeout. This is a planning calculation, not a measured per-model cost. [Modal pricing](https://modal.com/pricing), [budget/spend-limit semantics](https://modal.com/docs/guide/budgets).

## Validation and remaining gate

Tests cover consent, bad photos, ownership, private model/photo access, idempotency, cache reuse, active-job exclusion, persistent budget reservation, secret-safe errors, explicit retry, recovery without resubmission, corrupt GLB data and external resource rejection. Browser checks use an explicitly isolated fixture with a synthetic camera and a valid triangle GLB to verify capture, consent, polling, loading, downloading, saved history and desktop/mobile layout. These fixture results are not presented as SF3D output.

The microphone uploader now paces current audio, drops stale backlog with an explicit repeat request, and handles oversized delivery bursts without closing the camera session. Tests exercise both paced transport and the backend burst guard. Disconnect cleanup is protected from cancellation so a departed browser releases its upstream connection and session slot.

Eleven existing photo-to-3D regression tests passed after the activation fix, alongside the genuine GPU/browser check described above. Still required: foreground/background quality checks, thin-wire and circuit examples, representative cold/warm costs and supervisor review. No hardware accuracy, physical digital-twin, TRL4 or submission readiness claim follows from the software or single-sample generation checks.
