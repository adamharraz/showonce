import { lazy, Suspense, useEffect, useState } from "react";
import { Box, ScanLine } from "lucide-react";
import { api } from "./api";
import type {
  Catalogue,
  ComponentScene,
  PartId,
  ScenePart,
} from "./components-api";
const Viewer = lazy(() => import("./ComponentViewer"));

export default function ComponentPanel({
  scene,
  sessionId,
  ready,
  inspecting,
  notice,
  inspect,
  onChange,
}: {
  scene: ComponentScene;
  sessionId: string | null;
  ready: boolean;
  inspecting: boolean;
  notice: string;
  inspect: () => void;
  onChange: (scene: ComponentScene) => void;
}) {
  const [catalogue, setCatalogue] = useState<Catalogue | null>(null);
  const [selected, setSelected] = useState<string>("");
  const [preview, setPreview] = useState<PartId>("esp32");
  const [error, setError] = useState("");
  const [pin, setPin] = useState<string>("");
  useEffect(() => {
    void api<Catalogue>("/components/catalogue")
      .then(setCatalogue)
      .catch((e) => setError(e.message));
  }, []);
  useEffect(() => {
    setSelected(scene.components[0]?.id || "");
  }, [scene.frame_id, sessionId]);
  const detected = scene.components.find((p) => p.id === selected);
  const partId = detected?.part_id || preview;
  const part = catalogue?.parts.find((p) => p.id === partId);
  const variant = part?.variants.find(
    (v) => v.id === detected?.variant_id && detected.confirmed,
  );
  useEffect(() => setPin(""), [selected, scene.revision, preview]);
  return (
    <section className="panel component-panel" aria-label="Component library">
      <div className="component-heading">
        <div>
          <span className="eyebrow">COMPONENT LIBRARY</span>
          <h3>
            <Box size={18} /> Your parts, in 3D.
          </h3>
        </div>
        <button
          className="button secondary"
          disabled={!ready || inspecting}
          onClick={inspect}
        >
          <ScanLine size={16} />
          {inspecting ? "Identifying…" : "Identify visible parts"}
        </button>
      </div>
      <p className="fine">
        Gemini identifies visible components; ShowOnce loads prepared reference
        models. Confirm the identity and board variant before using details.
        Placement and wiring are illustrative.
      </p>
      {notice && (
        <p className="component-notice" role="status">
          {notice}
        </p>
      )}
      {error && (
        <p role="alert" className="component-notice">
          {error}
        </p>
      )}
      {catalogue && (
        <>
          {scene.components.length > 0 && (
            <div
              className="component-tabs"
              role="group"
              aria-label="Recognised components"
            >
              {scene.components.map((p) => (
                <button
                  key={p.id}
                  className={detected?.id === p.id ? "selected" : ""}
                  onClick={() => setSelected(p.id)}
                >
                  {catalogue.parts.find((c) => c.id === p.part_id)?.name ||
                    "Unknown"}{" "}
                  <span>{p.id}</span>
                </button>
              ))}
            </div>
          )}
          <div className="component-catalogue">
            <p className="fine">
              Browse ESP32, breadboard, LED, resistor and wire references at any
              time. Browsing uses no AI calls or GPU generation.
              {!scene.components.length &&
                " Start live coaching to identify your visible parts."}
            </p>
            <div
              className="component-tabs"
              role="group"
              aria-label="Browse reference models"
            >
              {catalogue.parts
                .filter((p) => p.id !== "unknown")
                .map((p) => (
                  <button
                    key={p.id}
                    className={!detected && preview === p.id ? "selected" : ""}
                    onClick={() => {
                      setSelected("");
                      setPreview(p.id);
                    }}
                  >
                    {p.name}
                  </button>
                ))}
            </div>
          </div>
          {part && (
            <>
              <Suspense
                fallback={
                  <div className="component-viewer">
                    Loading the local 3D viewer…
                  </div>
                }
              >
                <Viewer part={part} variant={variant} pinId={pin} />
              </Suspense>
              <div className="component-details">
                <strong>{part.name}</strong>
                <span
                  className={"badge " + (detected?.confirmed ? "green" : "")}
                >
                  {detected
                    ? detected.confirmed
                      ? "User confirmed"
                      : detected.uncertain
                        ? "Uncertain match"
                        : "AI suggestion"
                    : "Catalogue preview"}
                </span>
                <p>{detected?.evidence || part.description}</p>
                <p className="fine">{part.limitations}</p>
                {detected && (
                  <p className="fine">
                    Value: {detected.value_text || "Unknown"}
                    {detected.value_source
                      ? ` · ${detected.value_source}`
                      : ""}{" "}
                    · Snapshot {scene.frame_id} at{" "}
                    {((scene.timestamp_ms || 0) / 1000).toFixed(1)}s. Snapshot
                    pixels are not retained in conversation history.
                  </p>
                )}
                {variant && (
                  <>
                    <label>
                      Highlight a reference pin
                      <select
                        aria-label="Highlight a reference pin"
                        value={pin}
                        onChange={(e) => setPin(e.target.value)}
                      >
                        <option value="">Select a pin</option>
                        {variant.pins.map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.label}
                          </option>
                        ))}
                      </select>
                    </label>
                    <a href={variant.source} target="_blank" rel="noreferrer">
                      Pin layout source
                    </a>
                  </>
                )}
                {detected && sessionId && (
                  <PartReview
                    key={`${detected.id}-${scene.revision}`}
                    detected={detected}
                    catalogue={catalogue}
                    revision={scene.revision}
                    sessionId={sessionId}
                    onChange={onChange}
                  />
                )}
              </div>
            </>
          )}
          {scene.questions.length > 0 && (
            <div className="component-questions">
              <strong>Questions from this inspection</strong>
              <p className="fine">
                Check these against your saved confirmations.
              </p>
              <ul>
                {scene.questions.map((q, i) => (
                  <li key={i}>{q}</li>
                ))}
              </ul>
            </div>
          )}
          {scene.revision > 0 && (
            <p className="fine">
              A new inspection replaces this inventory and requires fresh
              confirmation. Reference matches do not complete lesson
              checkpoints.
            </p>
          )}
        </>
      )}
    </section>
  );
}

function PartReview({
  detected,
  catalogue,
  revision,
  sessionId,
  onChange,
}: {
  detected: ScenePart;
  catalogue: Catalogue;
  revision: number;
  sessionId: string;
  onChange: (s: ComponentScene) => void;
}) {
  const [partId, setPartId] = useState<PartId>(detected.part_id);
  const [variantId, setVariantId] = useState(detected.variant_id || "");
  const [value, setValue] = useState(detected.value_text || "");
  const [note, setNote] = useState(detected.confirmation_note || "");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const part = catalogue.parts.find((p) => p.id === partId)!;
  async function save() {
    setSaving(true);
    setError("");
    try {
      onChange(
        await api<ComponentScene>(
          `/coaching/sessions/${sessionId}/components`,
          "PATCH",
          {
            revision,
            component_id: detected.id,
            part_id: partId,
            variant_id: variantId || null,
            value_text: value || null,
            note,
          },
        ),
      );
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  }
  return (
    <details className="component-review">
      <summary>Correct or confirm this part</summary>
      <p className="fine">
        Confirm from your actual component. Leave the variant and value unknown
        when you cannot establish them.
      </p>
      <label>
        Component type
        <select
          value={partId}
          onChange={(e) => {
            setPartId(e.target.value as PartId);
            setVariantId("");
            setValue("");
          }}
        >
          {catalogue.parts.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
      </label>
      {part.variants.length > 0 && (
        <>
          <label>
            Board variant
            <select
              aria-label="Board variant"
              value={variantId}
              onChange={(e) => setVariantId(e.target.value)}
            >
              <option value="">Unknown / other board</option>
              {part.variants.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.name}
                </option>
              ))}
            </select>
          </label>
          {variantId && (
            <p className="fine">
              {part.variants.find((v) => v.id === variantId)?.description}
            </p>
          )}
        </>
      )}
      <label>
        Value or label <span className="muted">Optional</span>
        <input
          maxLength={120}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder="Leave blank if unreadable"
        />
      </label>
      <label>
        How did you confirm it?
        <input
          maxLength={500}
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="For example, I checked the printed labels"
        />
      </label>
      {error && <p role="alert">{error}</p>}
      <button
        className="button secondary"
        disabled={saving || !note.trim()}
        onClick={() => void save()}
      >
        {saving ? "Saving…" : "Save confirmation"}
      </button>
    </details>
  );
}
