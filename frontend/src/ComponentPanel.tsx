import { lazy, Suspense, useEffect, useState } from "react";
import { api } from "./api";
import type {
  Catalogue,
  ComponentScene,
  PartId,
  ScenePart,
} from "./components-api";
const Viewer = lazy(() => import("./ComponentViewer"));

function useCatalogue() {
  const [catalogue, setCatalogue] = useState<Catalogue | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    api<Catalogue>("/components/catalogue")
      .then(setCatalogue)
      .catch((e) => setError(e.message));
  }, []);
  return { catalogue, error };
}

export function ComponentLibrary() {
  const { catalogue, error } = useCatalogue();
  const [partId, setPart] = useState<PartId | "">("");
  const [variantId, setVariant] = useState("");
  const [pin, setPin] = useState("");
  const part = catalogue?.parts.find((p) => p.id === partId);
  const variant = part?.variants.find((v) => v.id === variantId);
  return (
    <section aria-label="Component library">
      {error && <p role="alert">{error}</p>}
      <label>
        Component
        <select
          aria-label="Component"
          value={partId}
          onChange={(e) => {
            setPart(e.target.value as PartId);
            setVariant("");
            setPin("");
          }}
        >
          <option value="">Select a component</option>
          {catalogue?.parts
            .filter((p) => p.id !== "unknown")
            .map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
        </select>
      </label>
      {part && (
        <>
          <p>{part.description}</p>
          {part.variants.length > 0 && (
            <label>
              Reference board variant
              <select
                aria-label="Reference board variant"
                value={variantId}
                onChange={(e) => {
                  setVariant(e.target.value);
                  setPin("");
                }}
              >
                <option value="">Select a reference variant</option>
                {part.variants.map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.name}
                  </option>
                ))}
              </select>
            </label>
          )}
          {variant && (
            <label>
              Highlight a reference pin
              <select aria-label="Highlight a reference pin" value={pin} onChange={(e) => setPin(e.target.value)}>
                <option value="">Select a pin</option>
                {variant.pins.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.label}
                  </option>
                ))}
              </select>
            </label>
          )}
          <Suspense fallback={<p>Loading model...</p>}>
            <Viewer part={part} variant={variant} pinId={pin} />
          </Suspense>
          {variant && (
            <a href={variant.source} target="_blank" rel="noreferrer">
              Pin layout source
            </a>
          )}
        </>
      )}
    </section>
  );
}

export function InspectionResults({
  scene,
  sessionId,
  onChange,
}: {
  scene: ComponentScene;
  sessionId: string;
  onChange: (scene: ComponentScene) => void;
}) {
  const { catalogue, error } = useCatalogue();
  return (
    <section aria-label="Identified parts">
      {error && <p role="alert">{error}</p>}
      {scene.components.map((p) => (
        <details key={p.id}>
          <summary>
            {catalogue?.parts.find((c) => c.id === p.part_id)?.name ||
              p.part_id}{" "}
            ·{" "}
            {p.confirmed
              ? "Confirmed"
              : p.uncertain
                ? "Uncertain match"
                : "AI suggestion"}
          </summary>
          <p>{p.evidence}</p>
          <p>Value: {p.value_text || "Unknown"}</p>
          {catalogue && (
            <PartReview
              key={scene.revision}
              detected={p}
              catalogue={catalogue}
              revision={scene.revision}
              sessionId={sessionId}
              onChange={onChange}
            />
          )}
        </details>
      ))}
      {scene.questions.map((question, index) => (
        <p key={index}>{question}</p>
      ))}
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
