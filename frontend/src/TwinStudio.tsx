import { lazy, Suspense, useEffect, useRef, useState } from "react";
import { Box, Camera, Download, Loader2 } from "lucide-react";
import { api, download, getToken, type Config } from "./api";
import type { components } from "./generated/api";
const Viewer = lazy(() => import("./TwinViewer"));
type Twin = Required<components["schemas"]["TwinRecord"]>;
const busy = (t: Twin | null) =>
  !!t && ["queued", "preparing", "generating"].includes(t.state);

export default function TwinStudio({
  config,
  grabPhoto,
  sessionId,
}: {
  config: Config;
  grabPhoto: () => string | null;
  sessionId: string | null;
}) {
  const [photo, setPhoto] = useState<string | null>(null);
  const [title, setTitle] = useState("My build");
  const [consent, setConsent] = useState(false);
  const [removeBg, setRemoveBg] = useState(true);
  const [twin, setTwin] = useState<Twin | null>(null);
  const [history, setHistory] = useState<Twin[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [url, setUrl] = useState<string | null>(null);
  const request = useRef("");
  const viewerUrl = useRef<string | null>(null);
  const refresh = () =>
    void api<Twin[]>("/twins")
      .then(setHistory)
      .catch((e) => setError(e.message));
  useEffect(() => {
    refresh();
  }, []);
  useEffect(() => {
    if (!busy(twin)) return;
    let alive = true;
    let timer: ReturnType<typeof setTimeout>;
    const poll = async () => {
      try {
        const next = await api<Twin>(`/twins/${twin!.id}`);
        if (!alive) return;
        setTwin(next);
        if (busy(next)) timer = setTimeout(poll, 2000);
        else refresh();
      } catch (e) {
        if (alive) setError((e as Error).message);
      }
    };
    timer = setTimeout(poll, 2000);
    return () => {
      alive = false;
      clearTimeout(timer);
    };
  }, [twin?.id, twin?.state]);
  useEffect(() => {
    setUrl(null);
    if (viewerUrl.current) {
      URL.revokeObjectURL(viewerUrl.current);
      viewerUrl.current = null;
    }
    if (twin?.state !== "ready") return;
    const abort = new AbortController();
    let alive = true;
    void fetch(`/api/twins/${twin.id}/model`, {
      headers: { Authorization: "Bearer " + getToken() },
      signal: abort.signal,
    })
      .then(async (response) => {
        if (!response.ok)
          throw new Error("The generated model could not be loaded");
        const blob = await response.blob();
        if (!alive) return;
        const object = URL.createObjectURL(blob);
        viewerUrl.current = object;
        setUrl(object);
      })
      .catch((e) => {
        if (alive && e.name !== "AbortError") setError(e.message);
      });
    return () => {
      alive = false;
      abort.abort();
      if (viewerUrl.current) {
        URL.revokeObjectURL(viewerUrl.current);
        viewerUrl.current = null;
      }
    };
  }, [twin?.id, twin?.state]);
  const capture = () => {
    const captured = grabPhoto();
    if (!captured) {
      setError("Start your camera or screen share before capturing the build.");
      return;
    }
    setPhoto(captured);
    request.current = crypto.randomUUID();
    setTwin(null);
    setError("");
    setConsent(false);
  };
  async function choosePhoto(file?: File) {
    if (!file) return;
    if (
      !["image/jpeg", "image/png"].includes(file.type) ||
      file.size > 2000000
    ) {
      setError("Choose a JPEG or PNG photo under 2 MB.");
      return;
    }
    try {
      const image = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result).split(",")[1]);
        reader.onerror = () => reject(new Error("The photo could not be read"));
        reader.readAsDataURL(file);
      });
      setPhoto(image);
      request.current = crypto.randomUUID();
      setTwin(null);
      setError("");
      setConsent(false);
    } catch (e) {
      setError((e as Error).message);
    }
  }
  async function generate() {
    if (!photo || !consent || submitting) return;
    setSubmitting(true);
    setError("");
    try {
      setTwin(
        await api<Twin>("/twins", "POST", {
          request_id: request.current,
          image: photo,
          title,
          session_id: sessionId,
          remove_background: removeBg,
          consent: true,
        }),
      );
      setPhoto(null);
      refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSubmitting(false);
    }
  }
  const status =
    twin?.state === "preparing"
      ? "Preparing the model weights on Modal…"
      : twin?.state === "generating"
        ? "Generating your textured 3D model…"
        : "Waiting for the worker…";
  async function retry() {
    if (!twin || submitting) return;
    setSubmitting(true);
    setError("");
    try {
      setTwin(await api<Twin>(`/twins/${twin.id}/retry`, "POST"));
      refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSubmitting(false);
    }
  }
  return (
    <section className="panel twin-studio" aria-label="Photo-to-3D studio">
      <div className="component-heading">
        <div>
          <span className="eyebrow">PHOTO TO 3D · MODAL</span>
          <h3>
            <Box size={18} /> Turn your build into a model.
          </h3>
        </div>
        <button
          className="button secondary"
          disabled={busy(twin) || submitting}
          onClick={capture}
        >
          <Camera size={16} />
          Capture build photo
        </button>
        <label className="button secondary twin-upload">
          Choose photo
          <input
            type="file"
            accept="image/jpeg,image/png"
            disabled={busy(twin) || submitting}
            onChange={(e) => {
              void choosePhoto(e.target.files?.[0]);
              e.target.value = "";
            }}
          />
        </label>
      </div>
      <p className="fine">
        Capture once, generate a textured GLB, then rotate or download it. Thin
        wires, hidden surfaces and pin labels may be reconstructed incorrectly;
        the model does not verify your circuit.
      </p>
      {(!config.twin_enabled || !config.twin_free_confirmed) && (
        <p className="component-notice" role="status">
          Modal generation is awaiting setup. You can preview a photo and view
          saved models; generation starts after model access and credit-only
          controls are verified.
        </p>
      )}
      {error && (
        <p className="banner error" role="alert">
          {error}
        </p>
      )}
      {photo && (
        <div className="twin-photo-review">
          <img
            src={"data:image/jpeg;base64," + photo}
            alt="Photo selected for 3D generation"
          />
          <label>
            Model title
            <input
              value={title}
              maxLength={200}
              onChange={(e) => setTitle(e.target.value)}
            />
          </label>
          <label className="check-label">
            <input
              type="checkbox"
              checked={removeBg}
              onChange={(e) => {
                setRemoveBg(e.target.checked);
                request.current = crypto.randomUUID();
              }}
            />
            Remove the background before reconstruction
          </label>
          <label className="check-label">
            <input
              type="checkbox"
              checked={consent}
              onChange={(e) => setConsent(e.target.checked)}
            />
            Everyone captured is 18+ and consents to this photo being processed
            on Modal and saved privately for seven days.
          </label>
          <div className="coach-source-buttons">
            <button
              className="button primary"
              disabled={
                !consent ||
                !title.trim() ||
                submitting ||
                !config.twin_enabled ||
                !config.twin_free_confirmed
              }
              onClick={() => void generate()}
            >
              {submitting ? "Submitting…" : "Generate 3D model"}
            </button>
            <button
              className="button secondary"
              disabled={submitting}
              onClick={() => setPhoto(null)}
            >
              Discard photo
            </button>
          </div>
          <p className="fine">
            This uses Modal compute credits. Default allowance:{" "}
            {config.twin_daily_limit} attempts/day, {config.twin_total_limit}{" "}
            total; failed attempts count. Identical successful photos are
            reused.
          </p>
        </div>
      )}
      {busy(twin) && (
        <div className="twin-status" role="status">
          <Loader2 size={24} className="twin-spinner" />
          <strong>{status}</strong>
          <p>
            Cold starts and first-time downloads can take several minutes. You
            can keep coaching or leave this page; the job is saved.
          </p>
        </div>
      )}
      {twin && (twin.state === "error" || twin.state === "interrupted") && (
        <div className="component-notice" role="alert">
          {twin.error || "Generation was interrupted."} A new capture starts a
          new attempt.
          {twin.state === "error" && (
            <button
              className="button secondary"
              disabled={
                submitting ||
                !config.twin_enabled ||
                !config.twin_free_confirmed
              }
              onClick={() => void retry()}
            >
              Retry generation · uses one attempt
            </button>
          )}
        </div>
      )}
      {twin?.state === "ready" && (
        <>
          <Suspense
            fallback={
              <div className="component-viewer">Loading the 3D viewer…</div>
            }
          >
            {url && <Viewer src={url} />}
          </Suspense>
          <div className="twin-result">
            <strong>{twin.title}</strong>
            <span className="badge green">Generated from your photo</span>
            <button
              className="button secondary"
              onClick={() =>
                void download(
                  `/twins/${twin.id}/model`,
                  `showonce-${twin.id}.glb`,
                ).catch((e) => setError(e.message))
              }
            >
              <Download size={16} />
              Download GLB
            </button>
          </div>
          <p className="fine">
            Stable Fast 3D on Modal ·{" "}
            {(twin.byte_size / 1024 / 1024).toFixed(1)} MB
            {twin.generation_seconds != null
              ? ` · ${twin.generation_seconds.toFixed(1)}s generation, excluding startup`
              : ""}
            {twin.reused ? " · Reused saved result" : ""}
          </p>
        </>
      )}
      {history.length > 0 && (
        <details className="coach-history twin-history">
          <summary>Saved 3D models and jobs</summary>
          {history.map((item) => (
            <button
              key={item.id}
              className="text-button"
              onClick={() => {
                setPhoto(null);
                setTwin(item);
                setError("");
              }}
            >
              {item.title} · {item.state} ·{" "}
              {new Date(item.created_at).toLocaleDateString()}
            </button>
          ))}
          <p className="fine">
            Private to your account. Opening a ready model does not generate it
            again.
          </p>
        </details>
      )}
    </section>
  );
}
