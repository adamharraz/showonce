import { lazy, Suspense, useState } from "react";
import PartQuestion from "./PartQuestion";
import { type Step, type Version } from "./api";
import { LAB_PARTS, type LabPart } from "./ElectronicsLab";

const Circuit = lazy(() => import("./LabCircuit"));

export default function StepCircuit({
  step,
  version,
  navigate,
}: {
  step: Step;
  version: Version;
  navigate?: (path: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [part, setPart] = useState<LabPart>(step.circuit_part || "board");
  const [highlight, setHighlight] = useState<LabPart | null>(null);
  if (!step.circuit_part) return null;

  return (
    <section
      aria-label="Circuit reference for this step"
      className="step-circuit"
    >
      <button
        className="button secondary"
        aria-expanded={open}
        onClick={() => setOpen(!open)}
      >
        {open
          ? "Back to this step"
          : `Show me · ${LAB_PARTS[step.circuit_part].name}`}
      </button>
      {open && (
        <div className="panel">
          <Suspense fallback={<p>Loading circuit…</p>}>
            <Circuit
              stage={2}
              running={false}
              reset={0}
              selected={highlight || part}
              onSelect={(next) => {
                setPart(next);
                setHighlight(null);
              }}
            />
          </Suspense>
          <label>
            Selected part{" "}
            <select
              value={part}
              onChange={(e) => {
                setPart(e.target.value as LabPart);
                setHighlight(null);
              }}
            >
              {Object.entries(LAB_PARTS).map(([id, item]) => (
                <option key={id} value={id}>
                  {item.name}
                </option>
              ))}
            </select>
          </label>
          <p>{LAB_PARTS[part].text}</p>
          <PartQuestion
            key={part}
            part={part}
            endpoint={`/lessons/${version.lesson_id}/versions/${version.version}/steps/${encodeURIComponent(step.id)}/part-question`}
            onHighlight={setHighlight}
          />
          {navigate && (
            <button
              className="text-button"
              onClick={() => {
                const query = new URLSearchParams({ step: step.id, part });
                navigate(
                  `/coach/${version.lesson_id}/${version.version}?${query}`,
                );
              }}
            >
              Open Live Coach for this step
            </button>
          )}
        </div>
      )}
    </section>
  );
}
